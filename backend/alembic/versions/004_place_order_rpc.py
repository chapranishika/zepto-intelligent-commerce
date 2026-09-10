"""Real order placement — place_order RPC

Revision ID: 004
Revises: 003
Create Date: 2026-09-10

Replaces the fake client-side "place order" (a setTimeout with a random
order id — see the project's fix plan, Phase 1) with a real, atomic
Postgres function the frontend calls directly via `supabase.rpc()`.

Why a SQL function instead of doing this from the frontend with a few
separate supabase-js calls: a naive JS implementation would (a) trust the
client's computed subtotal/discount, (b) have no way to lock product rows
across a read-check-write without a database transaction, and (c) leave a
window for two concurrent checkouts to both pass a stock check before
either decrements stock. This function re-reads live prices from
`products` under `FOR UPDATE` (row locks), decrements stock, validates the
promo code's `usage_limit`/`min_order_value` server-side, and does the
whole thing as one transaction.

SECURITY DEFINER: this function needs to UPDATE `products.stock_count` and
`promo_codes.usage_count`, which regular authenticated users must not be
able to write directly (there's no UPDATE policy on those tables). Running
as the function owner (bypassing RLS for its own internal writes) is the
standard Supabase pattern for this; identity is still taken from
`auth.uid()` inside the function, never from a parameter, so a caller
cannot place an order as someone else.

Run: alembic upgrade head
"""
from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PLACE_ORDER_SQL = """
CREATE OR REPLACE FUNCTION place_order(
    p_cart jsonb,             -- [{"product_id": 5, "quantity": 2}, ...]
    p_promo_code text,
    p_delivery_address text,
    p_payment_method text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_order_id  integer;
    v_item      jsonb;
    v_product   products%ROWTYPE;
    v_promo     promo_codes%ROWTYPE;
    v_qty       integer;
    v_subtotal  numeric := 0;
    v_discount  numeric := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    IF p_cart IS NULL OR jsonb_array_length(p_cart) = 0 THEN
        RAISE EXCEPTION 'Cart is empty' USING ERRCODE = '22023';
    END IF;

    -- Pass 1: lock every product row being sold and validate stock/price
    -- against the live table — never the client's numbers.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart)
    LOOP
        v_qty := (v_item ->> 'quantity')::integer;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for product %', v_item ->> 'product_id'
                USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_product FROM products
            WHERE id = (v_item ->> 'product_id')::integer
            FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item ->> 'product_id'
                USING ERRCODE = '22023';
        END IF;
        IF NOT v_product.is_available OR v_product.stock_count < v_qty THEN
            RAISE EXCEPTION 'Product "%" is out of stock', v_product.name
                USING ERRCODE = '23514';
        END IF;

        v_subtotal := v_subtotal + v_product.price * v_qty;
    END LOOP;

    -- Promo code — server-validated, including usage_limit (never checked
    -- by the old FastAPI /checkout endpoint) and min_order_value.
    IF p_promo_code IS NOT NULL AND length(trim(p_promo_code)) > 0 THEN
        SELECT * INTO v_promo FROM promo_codes
            WHERE code = upper(p_promo_code) AND is_active = true
            FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid promo code' USING ERRCODE = '22023';
        END IF;
        IF v_promo.usage_limit IS NOT NULL AND v_promo.usage_count >= v_promo.usage_limit THEN
            RAISE EXCEPTION 'This promo code has reached its usage limit' USING ERRCODE = '22023';
        END IF;
        IF v_subtotal < v_promo.min_order_value THEN
            RAISE EXCEPTION 'Order does not meet the minimum for this promo code'
                USING ERRCODE = '22023';
        END IF;

        IF v_promo.discount_type = 'percentage' THEN
            v_discount := v_subtotal * v_promo.discount_value / 100;
        ELSIF v_promo.discount_type = 'flat' THEN
            v_discount := v_promo.discount_value;
        END IF;
        IF v_promo.max_discount IS NOT NULL THEN
            v_discount := LEAST(v_discount, v_promo.max_discount);
        END IF;

        UPDATE promo_codes SET usage_count = usage_count + 1 WHERE id = v_promo.id;
    END IF;

    INSERT INTO orders (user_id, status, total_amount, delivery_address, payment_method,
                         promo_code, discount_amount)
    VALUES (v_user_id, 'confirmed', GREATEST(v_subtotal - v_discount, 0), p_delivery_address,
            p_payment_method, p_promo_code, v_discount)
    RETURNING id INTO v_order_id;

    -- Pass 2: create order_items and decrement stock now that everything
    -- has been validated.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart)
    LOOP
        v_qty := (v_item ->> 'quantity')::integer;

        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        SELECT v_order_id, id, v_qty, price
        FROM products WHERE id = (v_item ->> 'product_id')::integer;

        UPDATE products SET stock_count = stock_count - v_qty
        WHERE id = (v_item ->> 'product_id')::integer;
    END LOOP;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'total', GREATEST(v_subtotal - v_discount, 0),
        'discount', v_discount,
        'status', 'confirmed'
    );
END;
$$;
"""

GRANT_SQL = "GRANT EXECUTE ON FUNCTION place_order(jsonb, text, text, text) TO authenticated;"


def upgrade() -> None:
    # Two separate op.execute() calls, not one string with both statements:
    # SQLAlchemy's asyncpg dialect prepares each execute() as a single
    # statement via Postgres's extended query protocol, which rejects
    # multiple commands in one prepared statement ("cannot insert multiple
    # commands into a prepared statement") — this only ever worked when
    # applying the combined SQL directly via a tool that used the simple
    # query protocol instead, e.g. Supabase's own SQL execution, which
    # masked this against `alembic upgrade head` until it was run here.
    op.execute(PLACE_ORDER_SQL)
    op.execute(GRANT_SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS place_order(jsonb, text, text, text)")
