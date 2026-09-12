"""
FastAPI route definitions
All endpoints for the Zepto clone backend.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import CurrentUser, get_current_user, get_current_user_optional
from app.api.rate_limit import rate_limit
from app.db.database import cache_get, cache_set, get_db
from app.ml.collaborative.cf_engine import get_cf_engine
from app.ml.content.cbf_engine import get_cbf_engine
from app.ml.llm.gopi_bahu import get_assistant
from app.ml.ranker.hybrid_ranker import get_ranker
from app.models.db_models import Department, Product, UserEvent, WishlistItem

logger = logging.getLogger(__name__)
router = APIRouter()


# ═══════════════════════════════════════════════════════════════════
# Pydantic schemas
# ═══════════════════════════════════════════════════════════════════

class ProductOut(BaseModel):
    id: int
    name: str
    price: float
    mrp: Optional[float]
    image_url: Optional[str]
    department: Optional[str] = None
    quantity_label: Optional[str]
    rating: float
    delivery_time_mins: int
    is_available: bool

    model_config = {"from_attributes": True}


class RecommendationOut(BaseModel):
    products: List[ProductOut]
    source: str
    ab_variant: str


class EventIn(BaseModel):
    user_id: Optional[str] = None    # None = anonymous session (tracked via session_id)
    product_id: Optional[int] = None
    event_type: str   # view|click|add_to_cart|purchase|search
    query: Optional[str] = None
    page: Optional[str] = None
    session_id: Optional[str] = None


class ChatMessage(BaseModel):
    role: str   # user|assistant
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    user_id: Optional[str] = None
    stream: bool = False


class RecipeRequest(BaseModel):
    ingredients: List[str]
    cuisine: Optional[str] = None


class CartItemIn(BaseModel):
    product_id: int
    quantity: int


class SearchOut(BaseModel):
    products: List[ProductOut]
    query_expanded: List[str]
    total: int


# ═══════════════════════════════════════════════════════════════════
# Helper — fetch products from DB by IDs, preserving order
# ═══════════════════════════════════════════════════════════════════

async def fetch_products_by_ids(
    product_ids: List[int], db: AsyncSession
) -> List[ProductOut]:
    if not product_ids:
        return []
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.department_rel))
        .where(Product.id.in_(product_ids), Product.is_available == True)
    )
    products = result.scalars().all()
    prod_map = {p.id: p for p in products}

    out = []
    for pid in product_ids:
        p = prod_map.get(pid)
        if not p:
            continue
        dept = None
        if p.department_rel:
            dept = p.department_rel.name
        out.append(
            ProductOut(
                id=p.id, name=p.name, price=p.price, mrp=p.mrp,
                image_url=p.image_url, department=dept,
                quantity_label=p.quantity_label, rating=p.rating,
                delivery_time_mins=p.delivery_time_mins, is_available=p.is_available,
            )
        )
    return out


# ═══════════════════════════════════════════════════════════════════
# Auth — handled entirely by Supabase Auth on the frontend (supabase-js).
# This backend only verifies the resulting JWT (see app/api/auth.py) on
# endpoints that need to know who's calling; it never issues credentials.
# ═══════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════
# Products
# ═══════════════════════════════════════════════════════════════════

@router.get("/products", response_model=List[ProductOut], tags=["products"])
async def list_products(
    department: Optional[str] = None,
    limit: int = Query(20, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Product).where(Product.is_available == True)
    if department:
        dept_result = await db.execute(select(Department).where(Department.name == department))
        dept = dept_result.scalar_one_or_none()
        if dept:
            q = q.where(Product.department_id == dept.id)
    q = q.offset(offset).limit(limit)
    result = await db.execute(q)
    return [ProductOut.model_validate(p) for p in result.scalars().all()]


@router.get("/products/{product_id}", response_model=ProductOut, tags=["products"])
async def get_product(product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    return ProductOut.model_validate(p)


@router.get("/products/{product_id}/similar", tags=["products"])
async def similar_products(
    product_id: int,
    n: int = Query(10, le=30),
    db: AsyncSession = Depends(get_db),
):
    """Content-based similar products — shown on product detail page."""
    # Check the product exists first — return 404 rather than silently
    # returning FAISS results for a product ID that's not in our catalogue
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if product is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    cache_key = f"similar:{product_id}:{n}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    cbf = get_cbf_engine()
    similar = cbf.get_similar_products(product_id, n=n)
    ids = [s["product_id"] for s in similar]
    products = await fetch_products_by_ids(ids, db)

    result = {"products": [p.model_dump() for p in products], "source": "content_based"}
    await cache_set(cache_key, result, ttl=600)
    return result


# ═══════════════════════════════════════════════════════════════════
# Recommendations — the ML heart of the system
# ═══════════════════════════════════════════════════════════════════

async def _top_department_for(
    db: AsyncSession, current_user: Optional[CurrentUser], session_id: str
) -> Optional[str]:
    """
    Department the caller has engaged with most, from their own event
    history (by user_id when signed in, by session_id otherwise) — falling
    back to the single most-viewed department overall for a brand-new
    visitor with no history yet. Never a hardcoded guess: the CBF half of
    /recommend previously always queried a fixed "produce" category, which
    isn't even one of this app's real department names, so it silently
    returned nothing for every request.
    """
    from sqlalchemy import func

    base = (
        select(Department.name, func.count(UserEvent.id).label("cnt"))
        .join(Product, Product.id == UserEvent.product_id)
        .join(Department, Department.id == Product.department_id)
    )

    if current_user:
        q = base.where(UserEvent.user_id == current_user.id)
    else:
        q = base.where(UserEvent.session_id == session_id)
    q = q.group_by(Department.name).order_by(func.count(UserEvent.id).desc()).limit(1)

    row = (await db.execute(q)).first()
    if row:
        return row[0]

    # Cold start: no history for this caller — use the site-wide top
    # department rather than an arbitrary/invalid default.
    global_row = (
        await db.execute(
            base.group_by(Department.name).order_by(func.count(UserEvent.id).desc()).limit(1)
        )
    ).first()
    return global_row[0] if global_row else None

@router.get("/recommend/{user_id}", tags=["recommendations"])
async def recommend(
    user_id: str,       # str so anonymous session IDs (e.g. "abc-123") work too
    n: int = Query(20, le=50),
    exclude: Optional[str] = None,    # comma-separated product ids to exclude
    context: Optional[str] = None,    # json context string
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Main personalised recommendation endpoint.
    Runs CF + CBF → hybrid LightGBM ranker → returns ranked product list.
    Results are Redis-cached per user for 5 minutes.

    If the caller sends a valid Supabase auth token, user_id must match the
    token's subject — a signed-in user can only fetch their own
    recommendations. Anonymous (no token) calls still work with a
    client-generated session id, as before.
    """
    if current_user and user_id != current_user.id:
        raise HTTPException(403, "user_id does not match the authenticated user")

    cache_key = f"rec:{user_id}:{n}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    exclude_ids = [int(x) for x in exclude.split(",") if x.strip()] if exclude else []
    ctx = {}
    if context:
        import json
        try:
            ctx = json.loads(context)
        except Exception:
            pass
    ctx["hour_of_day"] = datetime.now(timezone.utc).replace(tzinfo=None).hour

    cf  = get_cf_engine()
    cbf = get_cbf_engine()
    ranker = get_ranker()

    # Run both retrieval towers
    cf_candidates = cf.get_user_recommendations(user_id, n=n * 2, exclude_product_ids=exclude_ids)

    top_dept = await _top_department_for(db, current_user, session_id=user_id)
    cbf_candidates = cbf.get_category_products(top_dept, n=n) if top_dept else []

    # Hybrid re-rank
    ranked = ranker.rank(user_id, cf_candidates, cbf_candidates, context=ctx)
    top_ids = [r["product_id"] for r in ranked[:n]]

    products = await fetch_products_by_ids(top_ids, db)
    variant  = ranker.get_ab_variant(user_id)

    result = {
        "products":   [p.model_dump() for p in products],
        "source":     "hybrid",
        "ab_variant": variant,
    }
    await cache_set(cache_key, result)
    return result


@router.get("/recommend/{user_id}/trending", tags=["recommendations"])
async def trending(
    user_id: str,
    n: int = Query(12, le=30),
    db: AsyncSession = Depends(get_db),
):
    """
    Popularity-weighted trending products (cold-start safe).

    user_id is a string so this endpoint also serves anonymous calls like
    /recommend/global/trending — the frontend's useTrending() hook calls
    this path without requiring a logged-in user.
    """
    cache_key = f"trending:{n}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(Product)
        .where(Product.is_available == True)
        .order_by(Product.rating_count.desc(), Product.rating.desc())
        .limit(n)
    )
    products = result.scalars().all()
    out = [ProductOut.model_validate(p).model_dump() for p in products]
    resp = {"products": out, "source": "trending"}
    await cache_set(cache_key, resp, ttl=900)
    return resp


@router.get("/recommend/{user_id}/upsell", tags=["recommendations"])
async def upsell(
    user_id: int,
    cart_product_ids: str,
    n: int = Query(6, le=15),
    db: AsyncSession = Depends(get_db),
):
    """
    Cart upsell — find products that complement what's already in cart.
    Uses CBF on each cart item and deduplicates.
    """
    ids = [int(x) for x in cart_product_ids.split(",") if x.strip()]
    if not ids:
        return {"products": [], "source": "upsell"}

    cbf = get_cbf_engine()
    seen = set(ids)
    candidates: dict = {}

    for pid in ids[:3]:   # limit to first 3 cart items for speed
        similar = cbf.get_similar_products(pid, n=10, exclude_ids=list(seen))
        for s in similar:
            spid = s["product_id"]
            if spid not in candidates:
                candidates[spid] = s["cbf_score"]
            else:
                candidates[spid] = max(candidates[spid], s["cbf_score"])
            seen.add(spid)

    top_ids = sorted(candidates, key=candidates.get, reverse=True)[:n]
    products = await fetch_products_by_ids(top_ids, db)
    return {"products": [p.model_dump() for p in products], "source": "upsell"}


# ═══════════════════════════════════════════════════════════════════
# Search
# ═══════════════════════════════════════════════════════════════════

@router.get("/search", tags=["search"], dependencies=[Depends(rate_limit("search", limit=30))])
async def search(
    q: str = Query(..., min_length=1),
    user_id: Optional[int] = None,
    n: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Semantic search: query expansion (LLM) → FAISS ANN → LLM re-rank.
    """
    if not q.strip():
        raise HTTPException(400, "Query cannot be empty")

    cache_key = f"search:{q.lower()}:{n}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    assistant = get_assistant()
    cbf = get_cbf_engine()

    # Step 1: LLM query expansion
    expanded = await assistant.expand_search_query(q)

    # Step 2: Semantic search across all expanded queries
    #
    # search_by_text is synchronous, CPU-bound work (FAISS + a lazy-loaded
    # sentence-transformer model whose first call also loads/downloads the
    # model). Calling it directly here would block this worker's *entire*
    # event loop for however long that takes — including unrelated requests
    # like /health — since nothing else can run on this thread meanwhile.
    # asyncio.to_thread hands it to a worker thread instead.
    all_results: dict = {}
    for term in expanded[:3]:
        candidates = await asyncio.to_thread(cbf.search_by_text, term, n)
        for c in candidates:
            pid = c["product_id"]
            if pid not in all_results or c["cbf_score"] > all_results[pid]["cbf_score"]:
                all_results[pid] = c

    # Step 3: LLM re-rank top results if we have them
    top_candidates = sorted(all_results.values(), key=lambda x: x["cbf_score"], reverse=True)[:n]

    # Fetch product details for re-ranking
    product_ids = [c["product_id"] for c in top_candidates]
    products = await fetch_products_by_ids(product_ids, db)

    # Prepare for LLM re-rank
    prod_dicts = [p.model_dump() for p in products]
    if len(prod_dicts) > 5:
        reranked = await assistant.rerank_with_intent(q, prod_dicts, top_k=n)
    else:
        reranked = prod_dicts

    result = SearchOut(products=reranked, query_expanded=expanded, total=len(reranked))
    resp = result.model_dump()
    await cache_set(cache_key, resp, ttl=300)
    return resp


# ═══════════════════════════════════════════════════════════════════
# Cart & Checkout
# ═══════════════════════════════════════════════════════════════════

@router.post("/cart/validate", tags=["cart"])
async def validate_cart(
    items: List[CartItemIn], db: AsyncSession = Depends(get_db)
):
    """Check availability and current prices for cart items."""
    ids = [i.product_id for i in items]
    result = await db.execute(select(Product).where(Product.id.in_(ids)))
    products = {p.id: p for p in result.scalars().all()}

    validated = []
    for item in items:
        p = products.get(item.product_id)
        if not p:
            validated.append({**item.model_dump(), "available": False, "message": "Not found"})
        elif not p.is_available or p.stock_count < item.quantity:
            validated.append({**item.model_dump(), "available": False,
                               "message": "Out of stock", "price": p.price})
        else:
            validated.append({**item.model_dump(), "available": True,
                               "price": p.price, "name": p.name, "image_url": p.image_url})
    return {"items": validated}


# Order placement lives entirely in Supabase now — see the `place_order`
# Postgres RPC (backend/alembic/versions/004_place_order_rpc.py), called
# directly by the frontend via supabase.rpc(). It's SECURITY DEFINER,
# re-validates prices/stock/promo server-side under row locks, and takes
# the user id from auth.uid() — none of which a second, parallel FastAPI
# implementation could do without duplicating (and inevitably drifting
# from) that logic. There is deliberately no /checkout route here anymore.


# ═══════════════════════════════════════════════════════════════════
# Event tracking — feeds the ML model
# ═══════════════════════════════════════════════════════════════════

@router.post("/events", tags=["events"])
async def track_event(
    event: EventIn,
    background_tasks: BackgroundTasks,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Log a user behavioural event.

    The event's user_id is never taken from the request body as-is — a
    client could otherwise log fake "purchase" events against someone
    else's account. If a valid auth token is present, its subject is used;
    otherwise the event is logged as anonymous (tracked via session_id),
    even if the body claims a user_id.
    """
    effective_user_id = current_user.id if current_user else None
    ranker = get_ranker()
    ab_variant = ranker.get_ab_variant(effective_user_id) if effective_user_id else "control"

    db_event = UserEvent(
        user_id=effective_user_id,   # nullable — OK for anonymous sessions
        product_id=event.product_id,
        event_type=event.event_type,
        query=event.query,
        page=event.page,
        session_id=event.session_id,
        ab_variant=ab_variant,
    )
    db.add(db_event)
    await db.commit()

    # Invalidate user recommendation cache only for logged-in users
    if effective_user_id and event.event_type in ("purchase", "add_to_cart"):
        from app.db.database import cache_delete
        background_tasks.add_task(cache_delete, f"rec:{effective_user_id}:20")

    return {"status": "logged"}


# ═══════════════════════════════════════════════════════════════════
# AI Assistant (Gopi Bahu)
# ═══════════════════════════════════════════════════════════════════

@router.post("/ai/chat", tags=["ai"], dependencies=[Depends(rate_limit("ai_chat", limit=10))])
async def ai_chat(body: ChatRequest):
    """Standard (non-streaming) AI chat."""
    assistant = get_assistant()
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    try:
        reply = await assistant.chat(messages)
    except httpx.HTTPError as exc:
        logger.warning(f"Gopi Bahu chat failed: {exc}")
        raise HTTPException(502, "AI assistant is temporarily unavailable")
    return {"reply": reply, "role": "assistant"}


@router.post("/ai/chat/stream", tags=["ai"], dependencies=[Depends(rate_limit("ai_chat", limit=10))])
async def ai_chat_stream(body: ChatRequest):
    """Streaming AI chat — returns Server-Sent Events."""
    assistant = get_assistant()
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def event_generator():
        try:
            async for chunk in assistant.chat_stream(messages):
                # SSE terminates an event on a blank line, so a chunk that
                # itself contains "\n\n" (e.g. a markdown paragraph break
                # from Claude) must be sent as multiple `data:` lines
                # within one event, per the SSE spec — not as one line
                # with raw embedded newlines.
                for part in chunk.split("\n"):
                    yield f"data: {part}\n"
                yield "\n"
        except httpx.HTTPError as exc:
            # A failure mid-stream (e.g. Anthropic API error) must not
            # just silently truncate the stream — the client would render
            # a half-finished message with no indication anything went
            # wrong. A distinct `event: error` block lets the frontend
            # detect this and show a real offline state instead.
            logger.warning(f"Gopi Bahu stream failed: {exc}")
            yield f"event: error\ndata: {exc}\n\n"
            return
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/ai/recipe", tags=["ai"], dependencies=[Depends(rate_limit("ai_chat", limit=10))])
async def recipe_assistant(
    body: RecipeRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a recipe from available ingredients.
    Then map required ingredients to Zepto products.

    Body: {"ingredients": ["tomato", "onion"], "cuisine": "italian"}
    """
    assistant = get_assistant()
    prompt = f"Give me a recipe using: {', '.join(body.ingredients)}"
    if body.cuisine:
        prompt += f" (cuisine: {body.cuisine})"
    prompt += "\n\nList the ingredients needed and which ones I can order from a grocery app."

    recipe_text = await assistant.chat([{"role": "user", "content": prompt}])

    # Semantic search for mentioned ingredients
    cbf = get_cbf_engine()
    product_suggestions = []
    for ingredient in body.ingredients[:5]:
        # See the /search route for why this needs to_thread — same
        # blocking-the-event-loop hazard applies here.
        results = await asyncio.to_thread(cbf.search_by_text, ingredient, n=3)
        ids = [r["product_id"] for r in results]
        products = await fetch_products_by_ids(ids, db)
        product_suggestions.extend([p.model_dump() for p in products])

    # Deduplicate
    seen = set()
    deduped = []
    for p in product_suggestions:
        if p["id"] not in seen:
            seen.add(p["id"])
            deduped.append(p)

    return {"recipe": recipe_text, "suggested_products": deduped[:10]}


# ═══════════════════════════════════════════════════════════════════
# Wishlist
# ═══════════════════════════════════════════════════════════════════

def _require_self(user_id: str, current_user: CurrentUser) -> None:
    if user_id != current_user.id:
        raise HTTPException(403, "user_id does not match the authenticated user")


@router.get("/wishlist/{user_id}", tags=["wishlist"])
async def get_wishlist(
    user_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_self(user_id, current_user)
    result = await db.execute(
        select(WishlistItem).where(WishlistItem.user_id == user_id)
    )
    items = result.scalars().all()
    ids = [i.product_id for i in items]
    products = await fetch_products_by_ids(ids, db)
    return {"products": [p.model_dump() for p in products]}


@router.post("/wishlist/{user_id}/{product_id}", tags=["wishlist"])
async def add_to_wishlist(
    user_id: str,
    product_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_self(user_id, current_user)
    existing = await db.execute(
        select(WishlistItem).where(
            WishlistItem.user_id == user_id,
            WishlistItem.product_id == product_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_in_wishlist"}
    db.add(WishlistItem(user_id=user_id, product_id=product_id))
    await db.commit()
    return {"status": "added"}


@router.delete("/wishlist/{user_id}/{product_id}", tags=["wishlist"])
async def remove_from_wishlist(
    user_id: str,
    product_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_self(user_id, current_user)
    result = await db.execute(
        select(WishlistItem).where(
            WishlistItem.user_id == user_id,
            WishlistItem.product_id == product_id,
        )
    )
    item = result.scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.commit()
    return {"status": "removed"}


# ═══════════════════════════════════════════════════════════════════
# Health check
# ═══════════════════════════════════════════════════════════════════

@router.get("/health", tags=["system"])
async def health():
    cf  = get_cf_engine()
    cbf = get_cbf_engine()
    return {
        "status": "ok",
        "cf_engine":  "loaded" if cf.loaded  else "degraded",
        "cbf_engine": "loaded" if cbf.loaded else "degraded",
        "timestamp":  datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
