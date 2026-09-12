/**
 * SubstitutionOffer — Screen 7, one unavailable ingredient. Three states:
 *  - no real substitute exists (garlic, ginger, cashew, spices, chickpeas —
 *    nothing in this catalogue is a sane stand-in) -> plain honest note,
 *    no button pretending otherwise.
 *  - a real substitute exists and hasn't been activated -> a real
 *    "Replace with X · ₹Y" action.
 *  - activated -> behaves like a normal selected/priced ingredient, using
 *    the substitute product, with an Undo.
 */
import type { Product } from "../../lib/products";
import type { RecipeIngredient } from "../../lib/recipes";

interface Props {
  ingredient: RecipeIngredient;
  substitute: Product | undefined;
  active: boolean;
  qty: number;
  onActivate: () => void;
  onUndo: () => void;
  onChangeQty: (delta: number) => void;
}

export default function SubstitutionOffer({
  ingredient: ing, substitute, active, qty, onActivate, onUndo, onChangeQty,
}: Props) {
  if (substitute && active) {
    return (
      <li className="ing-row">
        <span className="ing-checkbox checked" aria-hidden="true">✓</span>
        <div className="ing-img">
          <img src={substitute.src} alt={substitute.name} loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
        </div>
        <div className="ing-info">
          <p className="ing-name">{ing.name} <span className="ing-replaced-tag">→ {substitute.name}</span></p>
          <p className="ing-qty-label">{ing.substituteReason}</p>
          <div className="ing-price-row">
            <span className="ing-price">₹{substitute.disc}</span>
            <button className="ing-undo-btn" onClick={onUndo}>Undo</button>
          </div>
        </div>
        <div className="ing-qty-ctrl">
          <button onClick={() => onChangeQty(-1)} disabled={qty <= 1} aria-label={`Decrease ${ing.name} quantity`}>−</button>
          <span>{qty}</span>
          <button onClick={() => onChangeQty(1)} disabled={qty >= 9} aria-label={`Increase ${ing.name} quantity`}>+</button>
        </div>
      </li>
    );
  }

  return (
    <li className="ing-row unavailable">
      <div className="ing-img placeholder">🚫</div>
      <div className="ing-info">
        <p className="ing-name">{ing.name}</p>
        <p className="ing-qty-label">{ing.quantityLabel}</p>
        <p className="ing-unavailable-note">{ing.note ?? "Not currently stocked"}</p>
        {substitute && (
          <div className="ing-substitute-offer">
            <span>{ing.substituteReason}</span>
            <button className="ing-replace-btn" onClick={onActivate}>
              Replace with {substitute.name} · ₹{substitute.disc}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
