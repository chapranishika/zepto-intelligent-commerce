import { useNavigate } from "react-router-dom";
import { useCartStore } from "../store";
import RecommendationRail from "../components/ui/RecommendationRail";
import { TRENDING_IDS, getById } from "../lib/products";

export default function CartPage() {
  const navigate   = useNavigate();
  const { items, updateQty, removeItem, clearCart, totalPrice, totalMRP, totalDiscount } = useCartStore();

  const sub   = totalPrice();
  const mrp   = totalMRP();
  const saved = totalDiscount();
  const del   = sub >= 199 ? 0 : 25;
  const total = sub + del;

  // Address + promo code are chosen on the checkout page (which is also
  // where the order is actually placed via the place_order RPC) — this is
  // just a bill preview before getting there.
  function handleCheckout() {
    navigate("/checkout");
  }

  const upsell = TRENDING_IDS
    .map(getById)
    .filter((p) => p && !items.find((e) => e.product.id === p!.id))
    .slice(0, 8) as ReturnType<typeof getById>[];

  if (!items.length) {
    return (
      <div className="page cart-page">
        <header className="page-header">
          <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
          <h1>My Cart</h1>
        </header>
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <h2>Your cart is empty</h2>
          <p>Add items to get started</p>
          <button className="btn-primary" onClick={() => navigate("/home")}>
            Start shopping
          </button>
        </div>
        {upsell.length > 0 && (
          <RecommendationRail
            title="You might like"
            emoji="💡"
            products={upsell as any[]}
            page="cart"
          />
        )}
      </div>
    );
  }

  return (
    <div className="page cart-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>My Cart</h1>
        <button className="clear-cart-btn" onClick={clearCart}>Clear</button>
      </header>

      {/* Delivery strip */}
      <div className="delivery-strip">
        <span>⚡</span>
        <span>Delivery in <strong>10 minutes</strong> to Andheri West</span>
      </div>

      <div className="cart-content">

        {/* Cart items with real Zepto CDN images */}
        <div className="cart-items">
          {items.map(({ product: p, quantity }) => (
            <div key={p.id} className="cart-item">
              <div className="ci-img">
                <img src={p.src} alt={p.name} loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
              <div className="ci-info">
                <p className="ci-name">{p.name}</p>
                <p className="ci-unit">{p.unit}</p>
                <div className="ci-prices">
                  <span className="ci-price">₹{p.disc}</span>
                  {p.price > p.disc && <span className="ci-mrp">₹{p.price}</span>}
                </div>
              </div>
              <div className="ci-controls">
                <div className="qty-ctrl">
                  <button onClick={() => updateQty(p.id, quantity - 1)}>−</button>
                  <span>{quantity}</span>
                  <button onClick={() => updateQty(p.id, quantity + 1)}>+</button>
                </div>
                <p className="ci-total">₹{p.disc * quantity}</p>
                <button className="ci-remove" onClick={() => removeItem(p.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Upsell rail */}
        {upsell.length > 0 && (
          <RecommendationRail
            title="Add more items"
            emoji="🛍️"
            products={upsell as any[]}
            page="cart"
          />
        )}

        {/* Bill summary — a preview; address and promo code are chosen on
            the next (checkout) screen, which is also where this total gets
            recomputed authoritatively by the place_order RPC. */}
        <div className="bill-summary">
          <h3>💳 Bill summary</h3>
          <div className="bill-row"><span>MRP total</span><span>₹{mrp}</span></div>
          <div className="bill-row green"><span>Product discount</span><span>−₹{saved}</span></div>
          <div className="bill-row"><span>Delivery fee</span>
            <span>{del === 0 ? <span className="free-text">FREE ✓</span> : `₹${del}`}</span>
          </div>
          {del > 0 && (
            <p className="free-delivery-hint">Add ₹{199 - sub} more for free delivery</p>
          )}
          <div className="bill-row total"><span>Total</span><span>₹{total}</span></div>
        </div>

      </div>

      {/* Checkout bar */}
      <div className="checkout-bar">
        <div className="checkout-info">
          <span className="checkout-total">₹{total}</span>
          <span className="checkout-saved">
            {saved > 0 ? `Saved ₹${saved}` : `${items.length} item${items.length > 1 ? "s" : ""}`}
          </span>
        </div>
        <button className="checkout-btn" onClick={handleCheckout}>
          Continue →
        </button>
      </div>
    </div>
  );
}
