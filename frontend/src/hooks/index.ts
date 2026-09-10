/**
 * Custom hooks — event tracking, recommendations, trending, similar products.
 *
 * Previously these returned empty arrays unconditionally (the ML system was
 * invisible end-to-end). Now they call the real FastAPI backend with a 2s
 * timeout, map the backend's ProductOut shape onto the frontend's Product
 * type, and fall back to an explicit `fromAPI: false` flag (not silent
 * empty data) when the backend is not running.
 *
 * Backend ProductOut  → Frontend Product
 *   id              → id
 *   name            → name
 *   mrp             → price   (crossed-out MRP)
 *   price           → disc    (what customer pays)
 *   image_url       → src
 *   quantity_label  → unit
 *   department      → type
 *   rating          → rating
 *   (no backend field) → country: "India", description: "" (filled from local catalogue if id matches)
 */
import { useCallback, useEffect, useState } from "react";
import { useUserStore } from "../store";
import { getById, type Product } from "../lib/products";
import { getAccessToken } from "../lib/supabase";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";
const TIMEOUT_MS = 2000;

// ── Backend response shapes ───────────────────────────────────────────────────
export interface BackendProduct {
  id: number;
  name: string;
  price: number;          // discounted price customer pays
  mrp: number | null;
  image_url: string | null;
  department: string | null;
  quantity_label: string | null;
  rating: number;
  delivery_time_mins: number;
  is_available: boolean;
}

interface RecommendationResponse {
  products: BackendProduct[];
  source: string;
  ab_variant?: string;
}

export interface SearchResponse {
  products: BackendProduct[];
  query_expanded: string[];
  total: number;
}

// ── Map backend → frontend Product shape ──────────────────────────────────────
export function mapBackendProduct(bp: BackendProduct): Product {
  // If this product id exists in our local catalogue, use it as the base
  // (gives us description, country, etc. for free) and overlay live fields.
  const local = getById(bp.id);

  return {
    id:    bp.id,
    name:  bp.name,
    unit:  bp.quantity_label ?? local?.unit ?? "",
    type:  bp.department ?? local?.type ?? "",
    price: bp.mrp ?? local?.price ?? bp.price,
    disc:  bp.price,
    src:   bp.image_url ?? local?.src ?? "",
    quantity: 0,
    rating: bp.rating,
    country: local?.country ?? "India",
    description: local?.description ?? "",
  };
}

// ── Typed fetch with timeout ──────────────────────────────────────────────────
export async function apiFetch<T>(path: string, token?: string | null): Promise<T | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal, headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;   // timeout or network error — caller falls back
  } finally {
    clearTimeout(tid);
  }
}

// ── Event tracker ─────────────────────────────────────────────────────────────
export function useEventTracker() {
  const { user, sessionId } = useUserStore();

  const track = useCallback(
    async (
      eventType: "click" | "view" | "add_to_cart" | "purchase",
      productId: number,
      page?: string
    ) => {
      // Attach the auth token when signed in so the event is attributed to
      // a real user (and feeds their CF training data) instead of only the
      // anonymous session — the backend verifies this, it never trusts a
      // client-claimed user_id.
      const token = user ? await getAccessToken() : null;
      // Fire-and-forget — never blocks UI, errors are expected when backend is offline
      fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          event_type: eventType,
          product_id: productId,
          page,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {/* backend offline — acceptable for tracking */});
    },
    [sessionId, user]
  );

  return {
    trackClick:     (id: number, page?: string) => track("click", id, page),
    trackView:      (id: number, page?: string) => track("view", id, page),
    trackAddToCart: (id: number, page?: string) => track("add_to_cart", id, page),
    trackPurchase:  (id: number, page?: string) => track("purchase", id, page),
  };
}

// ── Shared result shape ─────────────────────────────────────────────────────────
interface UseRecsResult {
  data: Product[];
  loading: boolean;
  error: string | null;
  fromAPI: boolean;   // true = live ML results from backend, false = caller should use fallback
}

// ── Personalised recommendations ──────────────────────────────────────────────
export function useRecommendations(
  params: { n?: number; type?: string } = {}
): UseRecsResult {
  const { user, sessionId } = useUserStore();
  const [data, setData]       = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [fromAPI, setFromAPI] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Signed-in users are keyed by their real Supabase user id (matches the
    // JWT `sub` the backend verifies against); signed-out users fall back to
    // the anonymous session id.
    const userId = user ? user.id : sessionId;
    const qs = new URLSearchParams({ n: String(params.n ?? 20) });
    if (params.type) qs.set("type", params.type);

    (async () => {
      const token = user ? await getAccessToken() : null;
      const result = await apiFetch<RecommendationResponse>(`/recommend/${userId}?${qs}`, token);
      if (cancelled) return;
      if (result?.products?.length) {
        setData(result.products.map(mapBackendProduct));
        setFromAPI(true);
      } else {
        setFromAPI(false);
      }
      setError(null);
      setLoading(false);
    })().catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });

    return () => { cancelled = true; };
  }, [sessionId, user?.id, params.n, params.type]);

  return { data, loading, error, fromAPI };
}

// ── Trending (cold-start safe, no user required) ───────────────────────────────
export function useTrending(n = 12): UseRecsResult {
  const [data, setData]       = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [fromAPI, setFromAPI] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Backend route: /recommend/{user_id}/trending — "global" works as an
    // anonymous placeholder since user_id is typed as str on this endpoint.
    apiFetch<RecommendationResponse>(`/recommend/global/trending?n=${n}`)
      .then((result) => {
        if (cancelled) return;
        if (result?.products?.length) {
          setData(result.products.map(mapBackendProduct));
          setFromAPI(true);
        } else {
          setFromAPI(false);
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [n]);

  return { data, loading, error, fromAPI };
}

// ── Similar products (FAISS content-based, product detail page) ────────────────
export function useSimilarProducts(productId: number, n = 8): UseRecsResult {
  const [data, setData]       = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [fromAPI, setFromAPI] = useState(false);

  useEffect(() => {
    if (productId < 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    apiFetch<RecommendationResponse>(`/products/${productId}/similar?n=${n}`)
      .then((result) => {
        if (cancelled) return;
        if (result?.products?.length) {
          setData(result.products.map(mapBackendProduct));
          setFromAPI(true);
        } else {
          setFromAPI(false);
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId, n]);

  return { data, loading, error, fromAPI };
}
