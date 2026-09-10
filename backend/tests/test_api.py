"""
Backend test suite — pytest + httpx AsyncClient + SQLite in-memory DB.

Run: cd backend && pytest tests/ -v
No PostgreSQL or Redis needed — the conftest mocks both.
"""
import pytest
from httpx import AsyncClient


# ── Health ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


# ── Products ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_products_empty(client: AsyncClient):
    """Products table is empty in test DB — should return empty list, not 500."""
    resp = await client.get("/api/v1/products")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_product_not_found(client: AsyncClient):
    resp = await client.get("/api/v1/products/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_product_similar_not_found(client: AsyncClient):
    """Similar products for non-existent product should 404, not 500."""
    resp = await client.get("/api/v1/products/99999/similar")
    assert resp.status_code == 404


# ── Events ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_track_event_anonymous(client: AsyncClient):
    """Anonymous session events (no user_id) should log successfully — not crash."""
    resp = await client.post("/api/v1/events", json={
        "event_type": "view",
        "product_id": 0,
        "session_id": "test-session-abc123",
        # user_id intentionally omitted — tests the anonymous session fix
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "logged"


@pytest.mark.asyncio
async def test_track_event_with_user(client: AsyncClient):
    """
    Events with a user_id in the body (but no auth token) should still
    succeed — the endpoint logs them as anonymous rather than trusting an
    unverified client-supplied user_id.
    """
    resp = await client.post("/api/v1/events", json={
        "user_id": "11111111-1111-1111-1111-111111111111",
        "event_type": "add_to_cart",
        "product_id": 5,
        "session_id": "test-session-xyz",
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_track_event_invalid_missing_type(client: AsyncClient):
    """event_type is required — should return 422, not 500."""
    resp = await client.post("/api/v1/events", json={
        "session_id": "test-session",
        "product_id": 1,
        # event_type missing
    })
    assert resp.status_code == 422


# ── Recommendations ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recommendations_anonymous(client: AsyncClient):
    """Recommendations for unknown user should return trending, not 500."""
    resp = await client.get("/api/v1/recommend/anonymous-session-id")
    assert resp.status_code == 200
    data = resp.json()
    assert "products" in data
    assert "source" in data


@pytest.mark.asyncio
async def test_trending_global(client: AsyncClient):
    """Global trending endpoint should work without user_id."""
    resp = await client.get("/api/v1/recommend/global/trending?n=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "products" in data


# ── Search ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_empty_db(client: AsyncClient):
    """Search with empty DB should return empty list, not 500."""
    resp = await client.get("/api/v1/search?q=tomato")
    assert resp.status_code == 200


# ── Rate limiting (Phase 2) ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limit_blocks_after_threshold():
    """
    Unit-tests the limiter dependency directly (fake Redis backing an
    in-memory counter) rather than driving dozens of real HTTP round-trips
    through the full ASGI/DB stack — same logic, much faster. No real
    Redis runs in the test suite; every other test above is implicitly
    relying on the dependency degrading open when get_redis() is None,
    which this test doesn't exercise — it specifically covers the path
    where Redis *is* available and the counting/threshold logic itself.
    """
    from types import SimpleNamespace
    from unittest.mock import patch

    from fastapi import HTTPException

    from app.api.rate_limit import rate_limit

    counters: dict[str, int] = {}

    class FakeRedis:
        async def incr(self, key):
            counters[key] = counters.get(key, 0) + 1
            return counters[key]

        async def expire(self, key, ttl):
            pass

    dep = rate_limit("test_endpoint", limit=5)
    fake_request = SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"))

    with patch("app.api.rate_limit.get_redis", return_value=FakeRedis()):
        for _ in range(5):
            await dep(fake_request, current_user=None)  # under the limit — must not raise

        with pytest.raises(HTTPException) as exc_info:
            await dep(fake_request, current_user=None)
        assert exc_info.value.status_code == 429


# ── AI chat streaming (Phase 1: real Gopi Bahu wiring) ──────────────────────────

@pytest.mark.asyncio
async def test_ai_chat_stream_frames_multiline_chunks(client: AsyncClient):
    """
    A single delta from Claude can contain "\\n\\n" (a markdown paragraph
    break). SSE terminates an *event* on a blank line, so that chunk must
    be sent as multiple `data:` lines within one event, not as one `data:`
    line with a raw embedded blank line — otherwise the client would see
    it as two separate (and truncated) events. Regression test for that.
    """
    from unittest.mock import patch

    async def fake_stream(messages):
        yield "first line\n\nsecond paragraph"

    fake_assistant = type("FakeAssistant", (), {"chat_stream": staticmethod(fake_stream)})()

    with patch("app.api.routes.get_assistant", return_value=fake_assistant):
        resp = await client.post("/api/v1/ai/chat/stream", json={
            "messages": [{"role": "user", "content": "hi"}],
        })

    assert resp.status_code == 200
    body = resp.text

    # The chunk's own blank line must NOT appear as a bare "\n\n" — it must
    # be escaped into two `data:` lines inside a single SSE event.
    assert "data: first line\ndata: \ndata: second paragraph\n\n" in body
    assert body.rstrip().endswith("data: [DONE]")


@pytest.mark.asyncio
async def test_ai_chat_returns_clean_error_on_upstream_failure(client: AsyncClient):
    """
    If the Claude API call fails (rate limited, bad key, network blip),
    /ai/chat must return a clean 502 — not let httpx's exception bubble up
    as an opaque, unhandled 500.
    """
    from unittest.mock import AsyncMock, patch

    import httpx

    fake_assistant = type("FakeAssistant", (), {
        "chat": AsyncMock(side_effect=httpx.HTTPStatusError(
            "rate limited", request=httpx.Request("POST", "https://api.anthropic.com"),
            response=httpx.Response(429, request=httpx.Request("POST", "https://api.anthropic.com")),
        )),
    })()

    with patch("app.api.routes.get_assistant", return_value=fake_assistant):
        resp = await client.post("/api/v1/ai/chat", json={
            "messages": [{"role": "user", "content": "hi"}],
        })

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_ai_chat_stream_sends_error_event_on_upstream_failure(client: AsyncClient):
    """
    A failure mid-stream must produce a distinct `event: error` SSE block,
    not just cut the stream off silently with no signal to the client.
    """
    from unittest.mock import patch

    import httpx

    async def failing_stream(messages):
        yield "partial reply before it breaks"
        raise httpx.HTTPStatusError(
            "boom", request=httpx.Request("POST", "https://api.anthropic.com"),
            response=httpx.Response(500, request=httpx.Request("POST", "https://api.anthropic.com")),
        )

    fake_assistant = type("FakeAssistant", (), {"chat_stream": staticmethod(failing_stream)})()

    with patch("app.api.routes.get_assistant", return_value=fake_assistant):
        resp = await client.post("/api/v1/ai/chat/stream", json={
            "messages": [{"role": "user", "content": "hi"}],
        })

    assert resp.status_code == 200  # headers already sent before the failure
    body = resp.text
    assert "event: error" in body
    assert "data: [DONE]" not in body  # must not claim success after failing


@pytest.mark.asyncio
async def test_ai_recipe_accepts_json_body(client: AsyncClient):
    """
    /ai/recipe takes a JSON object body {"ingredients": [...], "cuisine": ...}
    — the same shape as every other POST endpoint. It used to declare a bare
    `ingredients: List[str]` (raw-array body) plus `cuisine` as a *query* param,
    which no natural client would send.
    """
    from unittest.mock import AsyncMock, patch

    fake_assistant = type("FakeAssistant", (), {
        "chat": AsyncMock(return_value="1. Chop tomato. 2. Done."),
    })()
    fake_cbf = type("FakeCBF", (), {
        "search_by_text": staticmethod(lambda *a, **k: []),
    })()

    with patch("app.api.routes.get_assistant", return_value=fake_assistant), \
         patch("app.api.routes.get_cbf_engine", return_value=fake_cbf):
        resp = await client.post("/api/v1/ai/recipe", json={
            "ingredients": ["tomato", "onion"],
            "cuisine": "italian",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert "recipe" in data
    assert data["suggested_products"] == []


@pytest.mark.asyncio
async def test_ai_recipe_rejects_missing_ingredients(client: AsyncClient):
    resp = await client.post("/api/v1/ai/recipe", json={"cuisine": "thai"})
    assert resp.status_code == 422


# ── JWT verification internals (app/api/auth.py) ────────────────────────────────

@pytest.mark.asyncio
async def test_get_current_user_rejects_garbage_token():
    from app.api.auth import get_current_user
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(authorization="Bearer not-a-real-jwt")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_rejects_expired_token():
    from jose import jwt

    from app.api.auth import get_current_user
    from fastapi import HTTPException

    expired = jwt.encode(
        {"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "aud": "authenticated", "exp": 1},
        "test-supabase-jwt-secret",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(authorization=f"Bearer {expired}")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_rejects_wrong_signing_secret():
    from jose import jwt

    from app.api.auth import get_current_user
    from fastapi import HTTPException

    forged = jwt.encode(
        {"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "aud": "authenticated"},
        "not-the-real-secret",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(authorization=f"Bearer {forged}")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_optional_returns_none_instead_of_raising():
    """The optional variant must degrade to anonymous, not surface a 401."""
    from app.api.auth import get_current_user_optional

    assert await get_current_user_optional(authorization=None) is None
    assert await get_current_user_optional(authorization="Bearer garbage") is None


def _es256_keypair_and_jwk(kid: str):
    """(private PEM, public JWK dict) for signing/verifying an ES256 test token."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from jose import jwk

    priv = ec.generate_private_key(ec.SECP256R1())
    priv_pem = priv.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub_pem = priv.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    pub_jwk = jwk.construct(pub_pem, "ES256").to_dict()
    pub_jwk["kid"] = kid
    return priv_pem, pub_jwk


@pytest.mark.asyncio
async def test_get_current_user_accepts_es256_via_jwks(monkeypatch):
    """
    Supabase migrated this project to asymmetric (ES256) signing keys. An
    ES256 token whose `kid` resolves in the project's JWKS must verify.
    """
    import time

    from jose import jwt as jose_jwt

    from app.api import auth
    from app.api.auth import get_current_user

    priv_pem, pub_jwk = _es256_keypair_and_jwk("test-ec-kid")
    monkeypatch.setattr(auth, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(auth, "_jwks_cache", {"test-ec-kid": pub_jwk})
    monkeypatch.setattr(auth, "_jwks_fetched_at", time.time())

    token = jose_jwt.encode(
        {"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "aud": "authenticated",
         "email": "u@example.com"},
        priv_pem, algorithm="ES256", headers={"kid": "test-ec-kid"},
    )
    user = await get_current_user(authorization=f"Bearer {token}")
    assert user.id == "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    assert user.email == "u@example.com"


@pytest.mark.asyncio
async def test_get_current_user_rejects_es256_unknown_kid(monkeypatch):
    import time

    from jose import jwt as jose_jwt

    from app.api import auth
    from app.api.auth import get_current_user
    from fastapi import HTTPException

    priv_pem, _ = _es256_keypair_and_jwk("real-kid")
    monkeypatch.setattr(auth, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(auth, "_jwks_cache", {})  # kid won't be found
    monkeypatch.setattr(auth, "_jwks_fetched_at", time.time())

    async def _no_network():
        return None
    monkeypatch.setattr(auth, "_refresh_jwks", _no_network)

    token = jose_jwt.encode(
        {"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "aud": "authenticated"},
        priv_pem, algorithm="ES256", headers={"kid": "some-other-kid"},
    )
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(authorization=f"Bearer {token}")
    assert exc_info.value.status_code == 401


# ── Authorization (Phase 0: Supabase JWT verification) ─────────────────────────

@pytest.mark.asyncio
async def test_wishlist_requires_auth(client: AsyncClient):
    """No Authorization header at all should be rejected, not silently trusted."""
    resp = await client.get("/api/v1/wishlist/11111111-1111-1111-1111-111111111111")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_recommend_rejects_mismatched_token(client: AsyncClient):
    """
    A valid token for user A must not be usable to fetch user B's
    recommendations — this is the IDOR the old design had.
    """
    from jose import jwt

    token = jwt.encode(
        {"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "aud": "authenticated"},
        "test-supabase-jwt-secret",
        algorithm="HS256",
    )
    resp = await client.get(
        "/api/v1/recommend/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_recommend_allows_matching_token(client: AsyncClient):
    from jose import jwt

    user_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    token = jwt.encode(
        {"sub": user_id, "aud": "authenticated"},
        "test-supabase-jwt-secret",
        algorithm="HS256",
    )
    resp = await client.get(
        f"/api/v1/recommend/{user_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_recommend_anonymous_still_works_without_token(client: AsyncClient):
    """Anonymous session-id based calls must keep working with no token."""
    resp = await client.get("/api/v1/recommend/some-anonymous-session-id")
    assert resp.status_code == 200


# ── Promo codes ────────────────────────────────────────────────────────────────
#
# There's deliberately no FastAPI test here. Promo validation (including
# usage_limit and min_order_value enforcement) now lives entirely inside
# the `place_order` Postgres RPC (backend/alembic/versions/004_place_order_rpc.py),
# not in this API layer — there's no /promo/validate route, and there never
# was one; a test that used to hit it was passing vacuously on FastAPI's
# generic 404 for an unrecognised path, asserting nothing about promo logic
# at all. Testing the RPC itself needs a real Postgres instance with the
# migrations applied (it's PL/pgSQL using `auth.uid()` and row locks,
# neither of which SQLite can express) — this suite runs against SQLite
# and can't exercise it. That's a real gap, not a solved problem.
