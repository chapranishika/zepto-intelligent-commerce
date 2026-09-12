/**
 * IngredientRow — one selectable, available ingredient in the ingredients
 * list (Screen 4). Whole row is the tap target for select/deselect;
 * the qty stepper and "I already have this" toggle stop propagation so
 * they don't also toggle selection.
 */
import type { Product } from "../../lib/products";
import type { RecipeIngredient } from "../../lib/recipes";

interface Props {
  ingredient: RecipeIngredient;
  product: Product;
  selected: boolean;
  haveAlready: boolean;
  qty: number;
  onToggleSelected: () => void;
  onToggleHaveAlready: () => void;
  onChangeQty: (delta: number) => void;
}

export default function IngredientRow({
  ingredient: ing, product, selected, haveAlready, qty,
  onToggleSelected, onToggleHaveAlready, onChangeQty,
}: Props) {
  return (
    <li
      className={`ing-row${selected ? "" : " dim"}${haveAlready ? " have-already" : ""}`}
      onClick={onToggleSelected}
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? `Deselect ${ing.name}` : `Select ${ing.name}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSelected(); } }}
    >
      {/* Purely visual — the whole row (not just this small square) is the
          actual tap target, so it isn't its own <button>. */}
      <span className={`ing-checkbox${selected ? " checked" : ""}`} aria-hidden="true">
        {selected && "✓"}
      </span>
      <div className="ing-img">
        <img src={product.src} alt={product.name} loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
      </div>
      <div className="ing-info">
        <p className="ing-name">{ing.name}</p>
        <p className="ing-qty-label">{ing.quantityLabel}</p>
        {haveAlready ? (
          <p className="ing-have-already-tag">✓ You already have this</p>
        ) : (
          <>
            <p className="ing-product-name">{product.name}</p>
            <div className="ing-price-row">
              <span className="ing-price">₹{product.disc}</span>
              <span className="ing-available">✓ Available</span>
            </div>
          </>
        )}
        <button
          className="ing-have-toggle"
          onClick={(e) => { e.stopPropagation(); onToggleHaveAlready(); }}
        >
          {haveAlready ? "Undo" : "I already have this"}
        </button>
      </div>
      {selected && !haveAlready && (
        <div className="ing-qty-ctrl" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onChangeQty(-1)} disabled={qty <= 1} aria-label={`Decrease ${ing.name} quantity`}>−</button>
          <span>{qty}</span>
          <button onClick={() => onChangeQty(1)} disabled={qty >= 9} aria-label={`Increase ${ing.name} quantity`}>+</button>
        </div>
      )}
    </li>
  );
}
