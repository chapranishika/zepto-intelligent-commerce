"""
Redis-backed fixed-window rate limiter.

Protects endpoints that call a paid external API (Claude, via Gopi Bahu) or
do relatively expensive work (FAISS search) from being hammered by a single
client — anonymous or signed in. Degrades open if Redis is unavailable,
same as caching already does in app/db/database.py: a demo app should stay
usable rather than 500 because Redis is down, and a rate limiter that fails
closed would turn a Redis outage into a full outage.
"""
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request

from app.api.auth import CurrentUser, get_current_user_optional
from app.db.database import get_redis

logger = logging.getLogger(__name__)


def rate_limit(key_prefix: str, limit: int, window_seconds: int = 60):
    """
    FastAPI dependency factory. Keys by the authenticated user's id when a
    valid token is present, otherwise by client IP — same identity
    resolution as the rest of the app (app/api/auth.py), never a
    client-claimed id.

    Note: request.client.host reflects the real client IP only if the ASGI
    server is run with proxy headers trusted (e.g. `uvicorn --proxy-headers
    --forwarded-allow-ips=...`) behind Render's reverse proxy — otherwise
    every request may appear to come from the same address, which makes
    the limiter effectively per-deployment rather than per-client. Still
    strictly better than no limiting at all.
    """

    async def _dep(
        request: Request,
        current_user: Optional[CurrentUser] = Depends(get_current_user_optional),
    ) -> None:
        redis = get_redis()
        if redis is None:
            return  # degrade open — no Redis, no limiting

        client_id = current_user.id if current_user else (
            request.client.host if request.client else "unknown"
        )
        key = f"ratelimit:{key_prefix}:{client_id}"
        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, window_seconds)
        except Exception as exc:
            logger.warning(f"Rate limit check failed, allowing request: {exc}")
            return

        if count > limit:
            raise HTTPException(429, "Too many requests — please slow down and try again shortly")

    return _dep
