import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn, signUp } from "../lib/supabase";
import { useUserStore, useUIStore } from "../store";

export default function LoginPage() {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const setUser  = useUserStore((s) => s.setUser);

  const [mode, setMode]         = useState<"signin" | "signup">("signin");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { data, error: authError } =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, name);

    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup" && !data.session) {
      // Email confirmation required — Supabase created the account but
      // there's no session yet.
      addToast("Check your email to confirm your account ✉️");
      setMode("signin");
      return;
    }

    const u = data.session?.user;
    if (u) {
      setUser({
        id: u.id,
        email: u.email ?? "",
        name: (u.user_metadata?.name as string | undefined) ?? u.email?.split("@")[0] ?? "User",
      });
      addToast(mode === "signin" ? "Signed in 👋" : "Account created 🎉");
      navigate("/profile", { replace: true });
    }
  }

  return (
    <div className="page auth-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
      </header>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "signup" && (
          <div className="auth-field">
            <label>Name</label>
            <input
              className="promo-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
        )}

        <div className="auth-field">
          <label>Email</label>
          <input
            className="promo-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="auth-field">
          <label>Password</label>
          <input
            className="promo-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
