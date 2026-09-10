"""Row Level Security for user-owned tables

Revision ID: 003
Revises: 002
Create Date: 2026-09-10

Enables RLS so that when the frontend talks to Postgres directly via
supabase-js (using a signed-in user's JWT), it can only see/touch that
user's own rows. This backend's own FastAPI connection uses the Postgres
role in DATABASE_URL, which owns these tables and therefore bypasses RLS —
same as any table owner in Postgres — so ML/analytics reads across all
users are unaffected.

products/departments/promo_codes are given public read policies since the
app needs to browse them while signed out.

Note on the live zepto-clone Supabase project specifically: it already had
a hand-written policy set (same intent, these exact names) from an earlier
pass, comparing `auth.uid()::text = user_id::text` — but since `user_id`
was still `integer` at the time, those comparisons could never actually
match anything. Applying this against that project meant dropping and
recreating those policies (now with native uuid comparisons, since 002
converted the columns) rather than a plain CREATE — see the fix plan's
Phase 0 notes. This file reflects the clean, idempotent form for a fresh
database; policy names match what's live.

Run: alembic upgrade head
"""
from typing import Sequence, Union

from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY orders_own_select ON orders FOR SELECT "
        "USING (auth.uid() = user_id)"
    )
    op.execute(
        "CREATE POLICY orders_insert_auth ON orders FOR INSERT "
        "WITH CHECK (auth.uid() = user_id)"
    )
    # No UPDATE/DELETE policy: orders are placed once (via the place_order
    # RPC) and never mutated directly by a client.

    op.execute("ALTER TABLE order_items ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY order_items_own_select ON order_items FOR SELECT "
        "USING (order_id IN (SELECT id FROM orders WHERE auth.uid() = user_id))"
    )

    op.execute("ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY wishlist_own_select ON wishlist_items FOR SELECT "
        "USING (auth.uid() = user_id)"
    )
    op.execute(
        "CREATE POLICY wishlist_own_insert ON wishlist_items FOR INSERT "
        "WITH CHECK (auth.uid() = user_id)"
    )
    op.execute(
        "CREATE POLICY wishlist_own_delete ON wishlist_items FOR DELETE "
        "USING (auth.uid() = user_id)"
    )

    op.execute("ALTER TABLE user_events ENABLE ROW LEVEL SECURITY")
    # Anonymous events (user_id IS NULL) are allowed; a non-null user_id
    # must match the caller's own auth.uid() — a client can't log an event
    # claiming to be someone else.
    op.execute(
        "CREATE POLICY events_insert_anon ON user_events FOR INSERT "
        "WITH CHECK (user_id IS NULL OR auth.uid() = user_id)"
    )
    op.execute(
        "CREATE POLICY events_own_select ON user_events FOR SELECT "
        "USING (auth.uid() = user_id)"
    )

    op.execute("ALTER TABLE products ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY products_public_read ON products FOR SELECT USING (true)")

    op.execute("ALTER TABLE departments ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY departments_public_read ON departments FOR SELECT USING (true)")

    op.execute("ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY promos_public_read ON promo_codes FOR SELECT "
        "USING (is_active = true)"
    )


def downgrade() -> None:
    for table, policies in {
        "orders": ["orders_own_select", "orders_insert_auth"],
        "order_items": ["order_items_own_select"],
        "wishlist_items": ["wishlist_own_select", "wishlist_own_insert", "wishlist_own_delete"],
        "user_events": ["events_insert_anon", "events_own_select"],
        "products": ["products_public_read"],
        "departments": ["departments_public_read"],
        "promo_codes": ["promos_public_read"],
    }.items():
        for policy in policies:
            op.execute(f"DROP POLICY IF EXISTS {policy} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
