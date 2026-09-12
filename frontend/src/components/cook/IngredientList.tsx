/**
 * IngredientList — the list of available (in-catalogue) ingredients on
 * Screen 4. Unavailable ingredients render separately via SubstitutionOffer
 * (they need very different UI — no checkbox, an optional Replace action).
 */
import { resolveIngredientProduct, type RecipeIngredient } from "../../lib/recipes";
import IngredientRow from "./IngredientRow";

interface Props {
  ingredients: RecipeIngredient[];
  selected: Set<string>;
  haveAlready: Set<string>;
  qty: Record<string, number>;
  onToggleSelected: (id: string) => void;
  onToggleHaveAlready: (id: string) => void;
  onChangeQty: (id: string, delta: number) => void;
}

export default function IngredientList({
  ingredients, selected, haveAlready, qty,
  onToggleSelected, onToggleHaveAlready, onChangeQty,
}: Props) {
  return (
    <ul className="ing-list">
      {ingredients.map((ing) => {
        const product = resolveIngredientProduct(ing);
        if (!product) return null;
        return (
          <IngredientRow
            key={ing.id}
            ingredient={ing}
            product={product}
            selected={selected.has(ing.id)}
            haveAlready={haveAlready.has(ing.id)}
            qty={qty[ing.id] ?? 1}
            onToggleSelected={() => onToggleSelected(ing.id)}
            onToggleHaveAlready={() => onToggleHaveAlready(ing.id)}
            onChangeQty={(delta) => onChangeQty(ing.id, delta)}
          />
        );
      })}
    </ul>
  );
}
