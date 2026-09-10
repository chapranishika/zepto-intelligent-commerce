import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore, useUIStore, useUserStore } from "../store";
import { API_BASE, apiFetch, mapBackendProduct, type SearchResponse } from "../hooks";
import { getAccessToken } from "../lib/supabase";
import type { Product } from "../lib/products";

const GOPI = "/gopi_assistant.png";

type Msg = { id: string; role: "user" | "assistant"; content: string; products?: Product[] };

function renderContent(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

/**
 * Consumes the backend's real SSE stream (Claude via Gopi Bahu — see
 * backend/app/ml/llm/gopi_bahu.py). One SSE "event" is the text between
 * blank lines; a single Claude delta can itself contain a newline, so the
 * backend sends multi-line deltas as several `data:` lines within one
 * event (per the SSE spec) rather than raw embedded newlines — this
 * parser joins those back together before appending.
 */
async function streamChatReply(
  history: { role: string; content: string }[],
  onChunk: (fullTextSoFar: string) => void,
  signal: AbortSignal,
  token: string | null
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages: history, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Gopi Bahu backend returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const lines = rawEvent.split("\n");
      const dataLines = lines.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6));

      // Backend signals a mid-stream failure (e.g. Anthropic API error)
      // with an `event: error` block instead of silently truncating —
      // surface it as a real error rather than rendering a half-finished
      // message with no indication anything went wrong.
      if (lines.some((l) => l.trim() === "event: error")) {
        throw new Error(dataLines.join("\n") || "AI backend error");
      }
      if (dataLines.length === 0) continue;
      if (dataLines.length === 1 && dataLines[0] === "[DONE]") return;
      full += dataLines.join("\n");
      onChunk(full);
    }
  }
}

export default function AIPage() {
  const navigate  = useNavigate();
  const addItem   = useCartStore((s) => s.addItem);
  const addToast  = useUIStore((s) => s.addToast);
  const user      = useUserStore((s) => s.user);
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "intro",
      role: "assistant",
      content: "Hi! I'm **Gopi Bahu** 👩‍🍳, your Zepto AI assistant.\n\nAsk me for recipes, returns help, or anything grocery-related!",
    },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  function scrollDown() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function fetchSuggestedProducts(query: string): Promise<Product[]> {
    const token = user ? await getAccessToken() : null;
    const result = await apiFetch<SearchResponse>(
      `/search?q=${encodeURIComponent(query)}&n=5`,
      token
    );
    return result?.products?.map(mapBackendProduct) ?? [];
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: Msg = { id: Date.now().toString(), role: "user", content: text };
    const asstId = (Date.now() + 1).toString();
    const history = [...messages, userMsg]
      .filter((m) => m.id !== "intro")
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, { id: asstId, role: "assistant", content: "" }]);
    scrollDown();

    // Real content-based product suggestions for this turn — grounded in
    // the actual catalogue via the backend's FAISS/TF-IDF search, not
    // guessed or hardcoded. Runs independently of the chat reply so one
    // failing doesn't block the other.
    fetchSuggestedProducts(text)
      .then((products) => {
        if (products.length === 0) return;
        setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, products } : m)));
      })
      .catch(() => {/* suggestions are a nice-to-have — fail silently */});

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const token = user ? await getAccessToken() : null;
      await streamChatReply(
        history,
        (fullText) => {
          setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: fullText } : m)));
          scrollDown();
        },
        controller.signal,
        token
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? {
                ...m,
                content:
                  "⚠️ Gopi Bahu is offline right now — the AI backend isn't reachable. Please try again in a moment.",
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      scrollDown();
    }
  }

  const QUICK_PROMPTS = [
    { label: "🥘 Recipe ideas",      text: "suggest a recipe using potato, onion and tomato" },
    { label: "🔄 Return an item",    text: "how do I return a damaged or expired item" },
    { label: "🥬 What's fresh today", text: "show me what fresh produce is available today" },
    { label: "💰 Best deals now",     text: "what are the best deals available right now" },
  ];

  return (
    <div className="page ai-page">
      {/* Header */}
      <header className="ai-header">
        <button className="back-btn ai-back" onClick={() => navigate(-1)}>‹</button>
        <div className="ai-header-info">
          <div className="ai-header-avatar">
            <img
              src={GOPI}
              alt="Gopi Bahu"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div>
            <h1>Gopi Bahu</h1>
            <p className="ai-status">
              <span className="dot-green" /> AI Assistant · Claude-powered
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.role}`}>
            {msg.role === "assistant" && (
              <div className="msg-avatar">
                <img src={GOPI} alt="Gopi"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
            <div className={`msg-bubble ${msg.role}`}>
              <div
                className="msg-text"
                dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
              />

              {/* Suggested products — real FAISS/TF-IDF search results for this turn */}
              {msg.products && msg.products.length > 0 && (
                <div className="msg-products">
                  <p className="msg-products-label">🛒 Add to cart:</p>
                  {msg.products.slice(0, 5).map((p) => (
                    <div key={p.id} className="msg-product-chip">
                      <img src={p.src} alt={p.name} className="mpc-img"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="mpc-info">
                        <span className="mpc-name">{p.name}</span>
                        <span className="mpc-unit">{p.unit}</span>
                      </div>
                      <span className="mpc-price">₹{p.disc}</span>
                      <button
                        className="mpc-add"
                        onClick={() => {
                          addItem(p);
                          addToast(`${p.name} added 🛒`);
                        }}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg assistant">
            <div className="msg-avatar">
              <img src={GOPI} alt="Gopi"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <div className="msg-bubble assistant">
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 2 && (
        <div className="quick-prompts">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              className="quick-prompt-btn"
              onClick={() => sendMessage(q.text)}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          placeholder="Ask Gopi Bahu anything…"
          disabled={loading}
        />
        <button
          className={`chat-send-btn${loading ? " loading" : ""}`}
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
