/**
 * RecipeCartSummary — the sticky "N ingredients selected / Total: ₹X / Add
 * to cart" bar at the bottom of Screen 4. The total is always computed by
 * the caller from live selection state — never hardcoded here.
 */
interface Props {
  count: number;
  total: number;
  onAddToCart: () => void;
}

export default function RecipeCartSummary({ count, total, onAddToCart }: Props) {
  return (
    <div className="ing-sticky-cta">
      <div className="ing-cta-summary">
        <span>{count} ingredient{count === 1 ? "" : "s"} selected</span>
        <strong>Total: ₹{total}</strong>
      </div>
      <button className="ing-cta-btn" disabled={count === 0} onClick={onAddToCart}>
        Add {count} ingredient{count === 1 ? "" : "s"} to cart · ₹{total}
      </button>
    </div>
  );
}
