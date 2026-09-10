"""Move identity to Supabase Auth

Revision ID: 002
Revises: 001
Create Date: 2026-09-10

The old `users` table (SHA-256, unsalted passwords, no session/JWT
verification) is replaced by Supabase Auth's `auth.users`. This migration:

  - drops `users`
  - repoints `orders.user_id`, `user_events.user_id`, `wishlist_items.user_id`
    from an integer FK on `users.id` to a `uuid` FK on `auth.users.id`

This is destructive to any existing rows in those three tables (the integer
IDs have no correspondence to Supabase Auth UUIDs). That's acceptable here
because checkout was never functionally wired up before this fix (see the
project's fix plan) — there is no real order data to preserve. Run only
after confirming that's still true for your database.

Run: alembic upgrade head
"""
from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN user_id")
    op.execute("ALTER TABLE orders ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id)")
    op.create_index("ix_orders_user_id", "orders", ["user_id"])

    op.execute("ALTER TABLE user_events DROP COLUMN user_id")
    op.execute("ALTER TABLE user_events ADD COLUMN user_id uuid REFERENCES auth.users(id)")
    op.create_index("ix_user_events_user_id", "user_events", ["user_id"])

    op.execute("ALTER TABLE wishlist_items DROP COLUMN user_id")
    op.execute("ALTER TABLE wishlist_items ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id)")

    op.drop_table("users")


def downgrade() -> None:
    import sqlalchemy as sa

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(200)),
        sa.Column("phone", sa.String(20)),
        sa.Column("hashed_password", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.drop_index("ix_orders_user_id", table_name="orders")
    op.execute("ALTER TABLE orders DROP COLUMN user_id")
    op.execute("ALTER TABLE orders ADD COLUMN user_id integer REFERENCES users(id)")
    op.create_index("ix_orders_user_id", "orders", ["user_id"])

    op.drop_index("ix_user_events_user_id", table_name="user_events")
    op.execute("ALTER TABLE user_events DROP COLUMN user_id")
    op.execute("ALTER TABLE user_events ADD COLUMN user_id integer REFERENCES users(id)")
    op.create_index("ix_user_events_user_id", "user_events", ["user_id"])

    op.execute("ALTER TABLE wishlist_items DROP COLUMN user_id")
    op.execute("ALTER TABLE wishlist_items ADD COLUMN user_id integer REFERENCES users(id)")
