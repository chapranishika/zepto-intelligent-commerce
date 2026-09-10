"""
Supabase JWT verification.

Identity lives in Supabase Auth, not in this backend. The frontend signs
users in via supabase-js and attaches the resulting access token as
`Authorization: Bearer <token>` on requests to this API. These dependencies
verify that token so endpoints can trust *who* is calling instead of a
client-supplied user_id (which is exactly the IDOR the old design had).

Two token schemes are supported, chosen per-token by the JWT header's `alg`:

  * HS256 — the legacy shared "JWT secret" (env `SUPABASE_JWT_SECRET`).
    Still what old, not-yet-expired tokens are signed with, and what the
    test suite mints.
  * ES256 / RS256 — Supabase's current asymmetric signing keys. Verified
    against the project's published JWKS
    (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`), selected by the
    token's `kid`. The JWKS is cached and refetched on a TTL or whenever a
    token presents an unknown `kid` (key rotation).
"""
import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import Header, HTTPException
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")

_JWKS_TTL = 3600          # seconds
_jwks_cache: dict = {}    # kid -> JWK dict
_jwks_fetched_at: float = 0.0
_jwks_lock = asyncio.Lock()


@dataclass
class CurrentUser:
    id: str
    email: Optional[str] = None


async def _refresh_jwks() -> None:
    global _jwks_fetched_at
    if not SUPABASE_URL:
        raise HTTPException(
            500, "SUPABASE_URL is not configured (needed to verify Supabase's asymmetric JWTs)"
        )
    url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    _jwks_cache.clear()
    for key in data.get("keys", []):
        if key.get("kid"):
            _jwks_cache[key["kid"]] = key
    _jwks_fetched_at = time.time()


async def _get_signing_jwk(kid: str) -> Optional[dict]:
    fresh = (time.time() - _jwks_fetched_at) < _JWKS_TTL
    if kid in _jwks_cache and fresh:
        return _jwks_cache[kid]
    async with _jwks_lock:
        if kid in _jwks_cache and (time.time() - _jwks_fetched_at) < _JWKS_TTL:
            return _jwks_cache[kid]
        try:
            await _refresh_jwks()
        except HTTPException:
            raise
        except Exception as exc:  # network / parse failure
            logger.warning(f"JWKS refresh failed: {exc}")
            raise HTTPException(401, "Could not verify token signing key")
    return _jwks_cache.get(kid)


async def _decode(token: str) -> CurrentUser:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(401, "Malformed token")

    alg = header.get("alg", "")
    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            raise HTTPException(500, "SUPABASE_JWT_SECRET is not configured on the server")
        key = SUPABASE_JWT_SECRET
    elif alg in ("ES256", "RS256"):
        kid = header.get("kid")
        if not kid:
            raise HTTPException(401, "Token missing key id")
        key = await _get_signing_jwk(kid)
        if key is None:
            raise HTTPException(401, "Unknown token signing key")
    else:
        raise HTTPException(401, f"Unsupported token algorithm: {alg or 'none'}")

    try:
        payload = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except JWTError as exc:
        raise HTTPException(401, f"Invalid or expired token: {exc}")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(401, "Token missing subject claim")
    return CurrentUser(id=sub, email=payload.get("email"))


async def get_current_user(authorization: Optional[str] = Header(None)) -> CurrentUser:
    """Require a valid Supabase-issued JWT. 401s if missing/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    return await _decode(authorization[len("Bearer "):])


async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
) -> Optional[CurrentUser]:
    """
    For endpoints that also serve anonymous callers (e.g. recommendations
    keyed by an anonymous session id). Returns None instead of raising when
    no/invalid token is present, so the caller falls back to anonymous
    behaviour rather than being rejected outright.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await _decode(authorization[len("Bearer "):])
    except HTTPException:
        return None
