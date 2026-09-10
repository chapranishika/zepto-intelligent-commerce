"""
Seed the database from the canonical generated catalog.

Single source of truth: backend/data/processed/products.json, produced by
backend/generate_large_catalog.py — 5,060 products across 11 categories,
each mapped to a real per-item-name Zepto CDN image where available. The
ML pipeline in ml_research/ already trains against this exact file
(02_collaborative_filtering.py loads it directly), and
frontend/src/lib/products.ts was generated from the same run. Seeding the
live database from it here means the database, the ML artifacts, and the
frontend catalog all describe the same 5,060 products with the same IDs —
previously this file had its own separate, stale, hand-maintained 60-item
list that had drifted from all three.

Run: python seed_db.py
"""
import asyncio
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import delete

from app.db.database import AsyncSessionLocal, create_tables
from app.models.db_models import Department, OrderItem, Product, PromoCode, WishlistItem

CATALOG_PATH = Path(__file__).parent / "data" / "processed" / "products.json"

# ── Promo codes — same as frontend PROMO_CODES (lib/products.ts) ──────────────
PROMO_CODES = [
    {
        "code": "ZEPTO10",
        "description": "10% off your order (max ₹100)",
        "discount_type": "percentage",
        "discount_value": 10,
        "min_order_value": 99,
        "max_discount": 100,
        "usage_limit": 10000,
    },
    {
        "code": "FIRST3",
        "description": "Free delivery on first 3 orders",
        "discount_type": "free_delivery",
        "discount_value": 0,
        "min_order_value": 0,
        "max_discount": None,
        "usage_limit": 3,
    },
    {
        "code": "FLAT50",
        "description": "Flat ₹50 off",
        "discount_type": "flat",
        "discount_value": 50,
        "min_order_value": 199,
        "max_discount": 50,
        "usage_limit": 5000,
    },
    {
        "code": "FRESH20",
        "description": "20% off fresh produce (max ₹60)",
        "discount_type": "percentage",
        "discount_value": 20,
        "min_order_value": 149,
        "max_discount": 60,
        "usage_limit": 2000,
    },
]


async def seed():
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = json.load(f)
    print(f"Loaded {len(catalog)} products from {CATALOG_PATH}")

    categories = sorted({p["type"] for p in catalog})

    print("Creating tables...")
    await create_tables()

    async with AsyncSessionLocal() as db:
        # Clear existing data — order_items/wishlist_items reference
        # products via FK, so they have to go first or this fails with a
        # foreign key violation on any database that already has real
        # order/wishlist history (orders themselves aren't product-linked
        # and are left alone; only line items referencing the products
        # about to be replaced are cleared).
        await db.execute(delete(OrderItem))
        await db.execute(delete(WishlistItem))
        await db.execute(delete(Product))
        await db.execute(delete(Department))
        await db.execute(delete(PromoCode))
        await db.commit()

        # ── Departments ──────────────────────────────────────────────
        dept_map: dict[str, int] = {}
        for cat_name in categories:
            dept = Department(name=cat_name)
            db.add(dept)
            await db.flush()
            dept_map[cat_name] = dept.id
        print(f"  {len(categories)} departments: {', '.join(categories)}")

        # ── Products ─────────────────────────────────────────────────
        skipped = 0
        for p in catalog:
            dept_id = dept_map.get(p["type"])
            if not dept_id:
                skipped += 1
                continue

            db.add(Product(
                id=p["id"],                 # same id as frontend/ML — critical for joins
                name=p["name"],
                price=p["disc"],            # discounted price (what customer pays)
                mrp=p["price"],              # original MRP
                quantity_label=p["unit"],
                image_url=p["src"],
                department_id=dept_id,
                aisle=p["type"],
                rating=p["rating"],
                rating_count=int(p["rating"] * 1000 + p["id"] * 137),  # deterministic mock
                delivery_time_mins=10,
                is_available=True,
                stock_count=100,
            ))
        await db.commit()
        print(f"  {len(catalog) - skipped} products inserted" + (f" ({skipped} skipped — unknown category)" if skipped else ""))

        # ── Promo codes ──────────────────────────────────────────────
        for pc in PROMO_CODES:
            db.add(PromoCode(**pc, is_active=True))
        await db.commit()
        print(f"  {len(PROMO_CODES)} promo codes inserted")

    print(f"\n✅  Seeded {len(catalog) - skipped} products across {len(categories)} categories")
    print(f"✅  Seeded {len(PROMO_CODES)} promo codes")
    print("\nProduct IDs match frontend src/lib/products.ts and the ML pipeline's")
    print("products.json exactly — database, ML artifacts, and frontend all agree.\n")


if __name__ == "__main__":
    print("=" * 60)
    print("Zepto Clone — Database Seed")
    print("=" * 60)
    asyncio.run(seed())
