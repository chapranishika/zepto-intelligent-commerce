"""
Supabase JWT verification.

Identity lives in Supabase Auth, not in this backend. The frontend signs
users in via supabase-js and attaches the resulting access token as
`Authorization: Bearer <token>` on requests to this API. These dependencies
verify that token so endpoints can trust *who* is calling instead of a
client-supplied user_id (which is exactly the IDOR the old design had).
"""
import logging
import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import Header, HTTPException
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


@dataclass
class CurrentUser:
    id: str
    email: Optional[str] = None


def _decode(token: str) -> CurrentUser:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(500, "SUPABASE_JWT_SECRET is not configured on the server")
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
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
    return _decode(authorization[len("Bearer "):])


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
        return _decode(authorization[len("Bearer "):])
    except HTTPException:
        return None
