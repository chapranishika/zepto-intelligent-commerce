"""
SQLAlchemy ORM models — Products, Orders, Events

User identity lives in Supabase Auth's `auth.users` table, not here — see
app/api/auth.py. `user_id` columns below are Postgres `uuid` (stored as
plain strings on SQLite for tests) referencing `auth.users.id`; that
foreign key is created in the Alembic migration, not the ORM, since
`auth.users` is a table SQLAlchemy doesn't manage.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float,
    ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def SupabaseUserId(**kwargs):
    """UUID column referencing auth.users.id (Postgres) / String(36) on SQLite tests."""
    return Column(UUID(as_uuid=False).with_variant(String(36), "sqlite"), **kwargs)


class Department(Base):
    __tablename__ = "departments"

    id   = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)

    products = relationship("Product", back_populates="department_rel")


class Product(Base):
    __tablename__ = "products"

    # No `description`/`created_at` columns: the live Supabase table (see
    # backend/generate_large_catalog.py / seed_db.py) never had them, and
    # nothing in the API reads them — an ORM model claiming columns that
    # don't exist would 500 on any `select(Product)`, since SQLAlchemy
    # selects every mapped column by default.
    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(300), nullable=False, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"))
    aisle         = Column(String(100))
    price         = Column(Float, nullable=False)
    mrp           = Column(Float)
    image_url     = Column(String(500))
    quantity_label = Column(String(50))          # "500g", "1 litre", "6 pack"
    is_available  = Column(Boolean, default=True)
    stock_count   = Column(Integer, default=100)
    rating        = Column(Float, default=4.0)
    rating_count  = Column(Integer, default=0)
    delivery_time_mins = Column(Integer, default=10)

    department_rel   = relationship("Department", back_populates="products")
    order_items      = relationship("OrderItem", back_populates="product")
    wishlist_items   = relationship("WishlistItem", back_populates="product")


class Order(Base):
    __tablename__ = "orders"

    # Column names here match the live Supabase table (which the frontend's
    # supabase-js client already agreed with, in lib/supabase.ts's DBOrder)
    # rather than an earlier draft schema that used `discount`/`created_at`
    # and didn't exist — see the fix plan's Phase 1 notes on this drift.
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = SupabaseUserId(nullable=False, index=True)
    status      = Column(String(50), default="placed")  # placed|confirmed|delivered|cancelled
    total_amount = Column(Float, nullable=False)
    delivery_address = Column(Text)
    payment_method = Column(String(50))
    promo_code  = Column(String(50))
    discount_amount = Column(Float, default=0.0)
    eta_minutes = Column(Integer, default=10)
    placed_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    delivered_at = Column(DateTime)

    items = relationship("OrderItem", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id         = Column(Integer, primary_key=True)
    order_id   = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity   = Column(Integer, default=1)
    unit_price = Column(Float, nullable=False)

    order   = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")


class UserEvent(Base):
    """
    Behavioural events — the raw signal that feeds the recommendation engine.
    Every click, view, search, add-to-cart gets logged here.

    user_id is NULLABLE: anonymous sessions (no login) still generate events
    and are tracked via session_id. This is the typical production pattern —
    events are logged first, then attributed to a user account if they sign up.
    """
    __tablename__ = "user_events"

    id         = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    user_id    = SupabaseUserId(nullable=True, index=True)  # nullable: anonymous OK
    product_id = Column(Integer, nullable=True, index=True)
    event_type = Column(String(50), nullable=False)   # view|click|add_to_cart|purchase|search
    query      = Column(String(300))                  # for search events
    page       = Column(String(100))                  # home|category|product|cart|search
    session_id = Column(String(100), index=True)      # anonymous session tracking
    ab_variant = Column(String(50))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)

    id         = Column(Integer, primary_key=True)
    user_id    = SupabaseUserId(nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    product = relationship("Product", back_populates="wishlist_items")


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id              = Column(Integer, primary_key=True)
    code            = Column(String(50), unique=True, nullable=False, index=True)
    description     = Column(String(255))              # human-readable label
    discount_type   = Column(String(20))               # percentage|flat|free_delivery
    discount_value  = Column(Float)
    min_order_value = Column(Float, default=0.0)
    max_discount    = Column(Float, nullable=True)
    usage_limit     = Column(Integer)
    usage_count     = Column(Integer, default=0)
    valid_until     = Column(DateTime)
    is_active       = Column(Boolean, default=True)
