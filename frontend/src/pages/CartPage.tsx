import { useNavigate } from "react-router-dom";
import { useCartStore } from "../store";
import RecommendationRail from "../components/ui/RecommendationRail";
import { TRENDING_IDS, getById, type Product } from "../lib/products";

function CartItemRow({
  product: p, quantity, updateQty, removeItem,
}: {
  product: Product;
  quantity: number;
  updateQty: (id: number, qty: number) => void;
  removeItem: (id: number) => void;
}) {
  return (
    <div className="cart-item">
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
  );
}

export default function CartPage() {
  const navigate   = useNavigate();
  const { items, updateQty, removeItem, clearCart, totalPrice, totalMRP, totalDiscount } = useCartStore();

  // Group cart entries by the recipe they were added for (Gopi Bahu / Cook)
  // — display-only grouping, every entry is still one normal cart item.
  const recipeGroups: [string, { title: string; entries: typeof items }][] = [];
  const groupIndex = new Map<string, number>();
  const ungrouped: typeof items = [];
  for (const entry of items) {
    if (entry.recipeId && entry.recipeTitle) {
      let idx = groupIndex.get(entry.recipeId);
      if (idx === undefined) {
        idx = recipeGroups.length;
        groupIndex.set(entry.recipeId, idx);
        recipeGroups.push([entry.recipeId, { title: entry.recipeTitle, entries: [] }]);
      }
      recipeGroups[idx][1].entries.push(entry);
    } else {
      ungrouped.push(entry);
    }
  }

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
        <h1>Your Cart ({items.length} item{items.length === 1 ? "" : "s"})</h1>
        <button className="clear-cart-btn" onClick={clearCart}>Clear</button>
      </header>

      {/* Delivery strip */}
      <div className="delivery-strip">
        <span>⚡</span>
        <span>Delivery in <strong>10 minutes</strong> to Andheri West</span>
      </div>

      <div className="cart-content">

        {/* Cart items with real Zepto CDN images — grouped by recipe where
            applicable (Gopi Bahu / Cook), everything else ungrouped below.
            These are all still completely normal cart entries: same
            updateQty/removeItem, same store, no separate cart. */}
        <div className="cart-items">
          {recipeGroups.map(([recipeId, group]) => (
            <div key={recipeId} className="cart-recipe-group">
              <div className="cart-recipe-group-header">
                <span>🍳 {group.title}</span>
                <span className="cart-recipe-group-sub">Recipe ingredients</span>
              </div>
              {group.entries.map(({ product: p, quantity }) => (
                <CartItemRow key={p.id} product={p} quantity={quantity} updateQty={updateQty} removeItem={removeItem} />
              ))}
            </div>
          ))}
          {ungrouped.map(({ product: p, quantity }) => (
            <CartItemRow key={p.id} product={p} quantity={quantity} updateQty={updateQty} removeItem={removeItem} />
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
