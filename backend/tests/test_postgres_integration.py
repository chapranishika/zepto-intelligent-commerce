"""
Integration tests against a real Postgres.

The main suite in test_api.py runs against SQLite (see conftest.py) and
mocks the ML engines — fast, but structurally unable to test anything that
depends on real Postgres semantics: whether the Alembic migration chain
actually applies cleanly from scratch, whether the `place_order` RPC's
PL/pgSQL logic (stock locking, promo enforcement, price integrity) does
what it claims, and whether Row Level Security actually isolates one
user's rows from another's. This file exists to close that gap.

Skipped automatically unless DATABASE_URL points at a real Postgres this
process can freely tear down and recreate schemas in — never point this at
a real Supabase project, it drops and recreates the public/auth schemas.
CI provides a throwaway `postgres:16` service for exactly this (see
.github/workflows/ci.yml); locally, point DATABASE_URL at any disposable
local/Docker Postgres.

Each test opens its own fresh connection (never a pooled/reused one)
specifically so that session-scoped state — `SET ROLE authenticated` and
the `app.current_user_id` GUC that the fake `auth.uid()` reads — can never
leak between tests via a recycled pooled connection.

Honesty note: this file was written but not executed against a real
Postgres in the session that authored it — Docker image pulls were
blocked by that session's sandboxed network, so this could not be run
end to end before being handed off. The underlying SQL (the Alembic
migrations, the RLS policies, `place_order` itself) was separately
verified by applying it directly to the real zepto-clone Supabase project
(Postgres 17), which is strong evidence it's correct — but this specific
test file/fixture combination has not itself been executed. Treat its
first real run (local or CI) as the actual first execution, and fix
forward if something here doesn't hold up.
"""
import json
import os
import subprocess
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import pytest
import pytest_asyncio

try:
    import asyncpg
except ImportError:
    asyncpg = None

BACKEND_DIR = Path(__file__).parent.parent
FAKE_AUTH_SQL = (Path(__file__).parent / "fixtures" / "fake_supabase_auth.sql").read_text()

RAW_DATABASE_URL = os.environ.get("DATABASE_URL", "")
IS_POSTGRES = RAW_DATABASE_URL.startswith("postgresql") and "sqlite" not in RAW_DATABASE_URL

pytestmark = pytest.mark.skipif(
    not (IS_POSTGRES and asyncpg is not None),
    reason="requires DATABASE_URL pointed at a real, disposable Postgres — see module docstring",
)


def _asyncpg_url(url: str) -> str:
    """asyncpg.connect() takes a plain postgresql:// URL, not SQLAlchemy's +asyncpg dialect suffix."""
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


@asynccontextmanager
async def _connect():
    """
    A dedicated, never-reused connection with the jsonb codec registered
    (place_order returns jsonb; without this, asyncpg hands back the raw
    JSON text instead of a dict, and `result["status"]` would TypeError on
    a string). Always opening a fresh connection — never pool.acquire() —
    is what guarantees `SET ROLE` / session GUCs from one test can't leak
    into the next via a recycled connection.
    """
    conn = await asyncpg.connect(_asyncpg_url(RAW_DATABASE_URL))
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text"
    )
    try:
        yield conn
    finally:
        await conn.close()


@asynccontextmanager
async def _connect_as(user_id: Optional[str]):
    """A connection simulating a supabase-js call authenticated as user_id (or anonymous if None)."""
    async with _connect() as conn:
        await conn.execute("SET ROLE authenticated")
        await conn.execute("SELECT set_config('app.current_user_id', $1, false)", user_id or "")
        yield conn


@pytest_asyncio.fixture(scope="module")
async def migrated_db():
    """
    Resets the database to a clean slate, applies the fake-Supabase auth
    stub (must exist before migration 002's FK to auth.users), then runs
    the real Alembic chain (001 -> head) via subprocess — the same command
    a real deployment runs. Runs once per test module.
    """
    async with _connect() as conn:
        await conn.execute("DROP SCHEMA IF EXISTS auth CASCADE")
        await conn.execute("DROP SCHEMA public CASCADE")
        await conn.execute("CREATE SCHEMA public")
        await conn.execute(FAKE_AUTH_SQL)

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR),
        env={**os.environ, "DATABASE_URL": RAW_DATABASE_URL},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"alembic upgrade head failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


@pytest_asyncio.fixture
async def seeded(migrated_db):
    """
    One department, two products, one maxed-out promo code, two auth.users —
    fresh per test. `migrated_db` is module-scoped (the schema persists
    across tests in this module), so every seeded row here needs a unique
    identifier per test invocation, not just per module, or the second
    test to run collides with the first's leftover data (departments.name
    and promo_codes.code are both unique).
    """
    tag = uuid.uuid4().hex[:8]
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    async with _connect() as conn:
        await conn.execute("INSERT INTO auth.users (id) VALUES ($1), ($2)", user_a, user_b)
        dept_id = await conn.fetchval(
            "INSERT INTO departments (name) VALUES ($1) RETURNING id", f"Test Dept {tag}"
        )
        product_id = await conn.fetchval(
            """INSERT INTO products (name, price, department_id, stock_count, is_available)
               VALUES ('Widget', 100, $1, 3, true) RETURNING id""",
            dept_id,
        )
        scarce_id = await conn.fetchval(
            """INSERT INTO products (name, price, department_id, stock_count, is_available)
               VALUES ('Scarce Widget', 50, $1, 1, true) RETURNING id""",
            dept_id,
        )
        promo_code = f"MAXEDOUT{tag}".upper()  # place_order normalizes lookups to upper(code)
        await conn.execute(
            """INSERT INTO promo_codes (code, discount_type, discount_value, min_order_value,
                                         usage_limit, usage_count, is_active)
               VALUES ($1, 'flat', 10, 0, 1, 1, true)""",
            promo_code,
        )
    return {
        "user_a": user_a,
        "user_b": user_b,
        "product_id": product_id,
        "scarce_id": scarce_id,
        "promo_code": promo_code,
    }


@pytest.mark.asyncio
async def test_place_order_requires_authentication(seeded):
    async with _connect_as(None) as conn:
        with pytest.raises(asyncpg.PostgresError, match="Not authenticated"):
            await conn.fetchval(
                "SELECT place_order($1::jsonb, NULL, 'test address')",
                [{"product_id": seeded["product_id"], "quantity": 1}],
            )


@pytest.mark.asyncio
async def test_place_order_creates_order_and_decrements_stock(seeded):
    async with _connect_as(seeded["user_a"]) as conn:
        result = await conn.fetchval(
            "SELECT place_order($1::jsonb, NULL, 'test address')",
            [{"product_id": seeded["product_id"], "quantity": 2}],
        )
        assert result["status"] == "confirmed"
        assert result["total"] == 200  # 2 x price 100, no discount

        # Stock must be decremented under the same call, not just returned.
        stock = await conn.fetchval(
            "SELECT stock_count FROM products WHERE id = $1", seeded["product_id"]
        )
        assert stock == 1  # started at 3, minus 2

        order_id = result["order_id"]
        owner = await conn.fetchval("SELECT user_id FROM orders WHERE id = $1", order_id)
        assert str(owner) == seeded["user_a"]


@pytest.mark.asyncio
async def test_place_order_rejects_insufficient_stock(seeded):
    async with _connect_as(seeded["user_a"]) as conn:
        with pytest.raises(asyncpg.PostgresError, match="out of stock"):
            await conn.fetchval(
                "SELECT place_order($1::jsonb, NULL, 'test address')",
                [{"product_id": seeded["scarce_id"], "quantity": 5}],  # only 1 in stock
            )


@pytest.mark.asyncio
async def test_place_order_enforces_promo_usage_limit(seeded):
    """
    The old FastAPI /checkout endpoint incremented usage_count but never
    checked it against usage_limit — a promo could be used unlimited times.
    This is the regression test for that fix, now enforced in place_order.
    """
    async with _connect_as(seeded["user_a"]) as conn:
        with pytest.raises(asyncpg.PostgresError, match="usage limit"):
            await conn.fetchval(
                "SELECT place_order($1::jsonb, $2, 'test address')",
                [{"product_id": seeded["product_id"], "quantity": 1}],
                seeded["promo_code"],
            )


@pytest.mark.asyncio
async def test_place_order_ignores_client_supplied_price(seeded):
    """
    p_cart only carries product_id/quantity — there is no field for a
    client to supply a price at all, so a tampered total is structurally
    impossible, not just validated away. This test pins that down: the
    order total always equals live price x quantity, full stop.
    """
    async with _connect_as(seeded["user_a"]) as conn:
        result = await conn.fetchval(
            "SELECT place_order($1::jsonb, NULL, 'test address')",
            [{"product_id": seeded["product_id"], "quantity": 1, "unit_price": 1}],
        )
        assert result["total"] == 100  # live price, the injected "unit_price": 1 is ignored


@pytest.mark.asyncio
async def test_rls_hides_other_users_orders(seeded):
    """The concrete IDOR check: user B must not be able to see user A's order."""
    async with _connect_as(seeded["user_a"]) as conn:
        result = await conn.fetchval(
            "SELECT place_order($1::jsonb, NULL, 'test address')",
            [{"product_id": seeded["product_id"], "quantity": 1}],
        )
        order_id = result["order_id"]

    async with _connect_as(seeded["user_b"]) as conn:
        rows = await conn.fetch("SELECT id FROM orders WHERE id = $1", order_id)
        assert rows == [], "RLS failed — user B can see user A's order"

    async with _connect_as(seeded["user_a"]) as conn:
        rows = await conn.fetch("SELECT id FROM orders WHERE id = $1", order_id)
        assert len(rows) == 1, "user A should still see their own order"
