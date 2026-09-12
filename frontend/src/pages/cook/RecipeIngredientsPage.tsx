/**
 * RecipeIngredientsPage — Screen 4 (route: /cook/recipe/:id/ingredients).
 * Orchestrates selection/quantity/substitution/"already have" state and
 * hands rendering off to IngredientList, SubstitutionOffer, and
 * RecipeCartSummary; Screen 5 renders via RecipeSuccessState.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import IngredientList from "../../components/cook/IngredientList";
import SubstitutionOffer from "../../components/cook/SubstitutionOffer";
import RecipeCartSummary from "../../components/cook/RecipeCartSummary";
import RecipeSuccessState from "../../components/cook/RecipeSuccessState";
import {
  getRecipeById, resolveIngredientProduct, resolveSubstituteProduct,
} from "../../lib/recipes";
import { useCartStore } from "../../store";
import type { Product } from "../../lib/products";

export default function RecipeIngredientsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const recipe = id ? getRecipeById(id) : undefined;
  const addRecipeIngredients = useCartStore((s) => s.addRecipeIngredients);

  const available = useMemo(
    () => recipe?.ingredients.filter((i) => i.productId != null) ?? [],
    [recipe]
  );
  const unavailable = useMemo(
    () => recipe?.ingredients.filter((i) => i.productId == null) ?? [],
    [recipe]
  );

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(available.map((i) => i.id))
  );
  const [qty, setQty] = useState<Record<string, number>>(
    () => Object.fromEntries(available.map((i) => [i.id, 1]))
  );
  // Available ingredients the user says they already have — excluded from
  // the cart/total without deleting them from the list, so it's still
  // obvious the recipe needs them.
  const [haveAlready, setHaveAlready] = useState<Set<string>>(new Set());
  // Unavailable ingredients the user chose to swap for their real
  // substitute (e.g. Fresh Cream -> Butter). Selected + priced exactly
  // like a normal available ingredient once activated.
  const [replaced, setReplaced] = useState<Set<string>>(new Set());
  const [addedOpen, setAddedOpen] = useState(false);

  if (!recipe) {
    return (
      <div className="page cook-page">
        <header className="page-header">
          <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
          <h1>Recipe not found</h1>
        </header>
      </div>
    );
  }

  function toggleSelected(ingId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ingId)) next.delete(ingId);
      else next.add(ingId);
      return next;
    });
  }

  function toggleHaveAlready(ingId: string) {
    setHaveAlready((prev) => {
      const next = new Set(prev);
      if (next.has(ingId)) {
        // Undo: you do need to buy it after all — restore it to selected,
        // otherwise it'd be silently excluded from the total forever
        // (neither "have already" nor selected).
        next.delete(ingId);
        setSelected((s) => new Set(s).add(ingId));
      } else {
        next.add(ingId);
        // Having it already implies you don't need to buy it — deselect,
        // but leave the row visible so it's clear the recipe still needs it.
        setSelected((s) => { const n = new Set(s); n.delete(ingId); return n; });
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(available.map((i) => i.id)));
    setHaveAlready(new Set());
  }
  function deselectAll() {
    setSelected(new Set());
  }

  function changeQty(ingId: string, delta: number) {
    setQty((prev) => ({ ...prev, [ingId]: Math.max(1, Math.min(9, (prev[ingId] ?? 1) + delta)) }));
  }

  function activateSubstitute(ingId: string) {
    setReplaced((prev) => new Set(prev).add(ingId));
    setQty((prev) => ({ ...prev, [ingId]: prev[ingId] ?? 1 }));
  }
  function undoSubstitute(ingId: string) {
    setReplaced((prev) => {
      const next = new Set(prev);
      next.delete(ingId);
      return next;
    });
  }

  const selectedAvailable = available.filter((i) => selected.has(i.id) && !haveAlready.has(i.id));
  const selectedReplaced = unavailable.filter((i) => replaced.has(i.id));
  const allSelected = [...selectedAvailable, ...selectedReplaced];

  function effectiveProduct(ingId: string, isAvailable: boolean): Product | undefined {
    if (isAvailable) {
      const ing = available.find((i) => i.id === ingId);
      return ing ? resolveIngredientProduct(ing) : undefined;
    }
    const ing = unavailable.find((i) => i.id === ingId);
    return ing ? resolveSubstituteProduct(ing) : undefined;
  }

  const total = allSelected.reduce((sum, ing) => {
    const isAvail = ing.productId != null;
    const p = effectiveProduct(ing.id, isAvail);
    return p ? sum + p.disc * (qty[ing.id] ?? 1) : sum;
  }, 0);

  function handleAddToCart() {
    const entries = allSelected
      .map((ing) => {
        const isAvail = ing.productId != null;
        const product = effectiveProduct(ing.id, isAvail);
        return product ? { product, qty: qty[ing.id] ?? 1 } : null;
      })
      .filter((e): e is { product: Product; qty: number } => e != null);

    if (entries.length === 0) return;
    addRecipeIngredients(entries, { id: recipe!.id, title: recipe!.title });
    setAddedOpen(true);
  }

  return (
    <div className="page cook-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>Ingredients ({recipe.ingredients.length})</h1>
      </header>

      <div className="ing-content">
        <p className="ing-subtitle">Select the ingredients you need.</p>

        <div className="ing-select-actions">
          <button onClick={selectAll}>Select all</button>
          <span>·</span>
          <button onClick={deselectAll}>Deselect all</button>
        </div>

        {unavailable.length > 0 && (
          <div className="ing-unavailable-banner">
            <span className="ing-unavailable-icon">⚠️</span>
            <div>
              <strong>{unavailable.length} ingredient{unavailable.length > 1 ? "s aren't" : " isn't"} available</strong>
              <p>These aren't in our catalogue yet — see substitutes/notes below. Everything else can still be added to your cart.</p>
            </div>
          </div>
        )}

        <IngredientList
          ingredients={available}
          selected={selected}
          haveAlready={haveAlready}
          qty={qty}
          onToggleSelected={toggleSelected}
          onToggleHaveAlready={toggleHaveAlready}
          onChangeQty={changeQty}
        />

        {unavailable.length > 0 && (
          <div className="ing-unavailable-section">
            <h3>Not available</h3>
            <ul className="ing-list">
              {unavailable.map((ing) => (
                <SubstitutionOffer
                  key={ing.id}
                  ingredient={ing}
                  substitute={resolveSubstituteProduct(ing)}
                  active={replaced.has(ing.id)}
                  qty={qty[ing.id] ?? 1}
                  onActivate={() => activateSubstitute(ing.id)}
                  onUndo={() => undoSubstitute(ing.id)}
                  onChangeQty={(delta) => changeQty(ing.id, delta)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <RecipeCartSummary count={allSelected.length} total={total} onAddToCart={handleAddToCart} />

      {addedOpen && (
        <RecipeSuccessState
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          recipeImage={recipe.image}
          timeMins={recipe.timeMins}
          difficulty={recipe.difficulty}
          itemCount={allSelected.length}
          onClose={() => setAddedOpen(false)}
        />
      )}
    </div>
  );
}
