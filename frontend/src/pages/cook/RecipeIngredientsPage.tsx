/**
 * RecipeIngredientsPage — Screen 4 (route: /cook/recipe/:id/ingredients),
 * with Screen 5 (success) and Screen 7 (unavailable ingredients) built in
 * as in-page states rather than separate routes — the app's own route list
 * (see App.tsx) doesn't carry dedicated routes for either, and a modal/
 * sheet was explicitly allowed as the alternative for the success state.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RecipeCard from "../../components/ui/RecipeCard";
import {
  getRecipeById, relatedRecipes, resolveIngredientProduct,
  type RecipeIngredient,
} from "../../lib/recipes";
import { useCartStore } from "../../store";

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

  function toggle(ingId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ingId)) next.delete(ingId);
      else next.add(ingId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(available.map((i) => i.id)));
  }
  function deselectAll() {
    setSelected(new Set());
  }

  function changeQty(ingId: string, delta: number) {
    setQty((prev) => ({ ...prev, [ingId]: Math.max(1, Math.min(9, (prev[ingId] ?? 1) + delta)) }));
  }

  const selectedIngredients = available.filter((i) => selected.has(i.id));
  const total = selectedIngredients.reduce((sum, ing) => {
    const p = resolveIngredientProduct(ing);
    return p ? sum + p.disc * (qty[ing.id] ?? 1) : sum;
  }, 0);

  function handleAddToCart() {
    const entries = selectedIngredients
      .map((ing) => {
        const product = resolveIngredientProduct(ing);
        return product ? { product, qty: qty[ing.id] ?? 1 } : null;
      })
      .filter((e): e is { product: NonNullable<ReturnType<typeof resolveIngredientProduct>>; qty: number } => e != null);

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
              <p>These aren't in our catalogue yet — see notes below. Everything else can still be added to your cart.</p>
            </div>
          </div>
        )}

        <ul className="ing-list">
          {available.map((ing) => {
            const product = resolveIngredientProduct(ing);
            if (!product) return null;
            const isSelected = selected.has(ing.id);
            const q = qty[ing.id] ?? 1;
            return (
              <li
                key={ing.id}
                className={`ing-row${isSelected ? "" : " dim"}`}
                onClick={() => toggle(ing.id)}
                role="checkbox"
                aria-checked={isSelected}
                aria-label={isSelected ? `Deselect ${ing.name}` : `Select ${ing.name}`}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(ing.id); } }}
              >
                {/* Purely visual — the whole row (not just this small square)
                    is the actual tap target, so it isn't its own <button>. */}
                <span className={`ing-checkbox${isSelected ? " checked" : ""}`} aria-hidden="true">
                  {isSelected && "✓"}
                </span>
                <div className="ing-img">
                  <img src={product.src} alt={product.name} loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
                </div>
                <div className="ing-info">
                  <p className="ing-name">{ing.name}</p>
                  <p className="ing-qty-label">{ing.quantityLabel}</p>
                  <p className="ing-product-name">{product.name}</p>
                  <div className="ing-price-row">
                    <span className="ing-price">₹{product.disc}</span>
                    <span className="ing-available">✓ Available</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="ing-qty-ctrl" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => changeQty(ing.id, -1)} disabled={q <= 1} aria-label={`Decrease ${ing.name} quantity`}>−</button>
                    <span>{q}</span>
                    <button onClick={() => changeQty(ing.id, 1)} disabled={q >= 9} aria-label={`Increase ${ing.name} quantity`}>+</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {unavailable.length > 0 && (
          <div className="ing-unavailable-section">
            <h3>Not available</h3>
            <ul className="ing-list">
              {unavailable.map((ing: RecipeIngredient) => (
                <li key={ing.id} className="ing-row unavailable">
                  <div className="ing-img placeholder">🚫</div>
                  <div className="ing-info">
                    <p className="ing-name">{ing.name}</p>
                    <p className="ing-qty-label">{ing.quantityLabel}</p>
                    <p className="ing-unavailable-note">{ing.note ?? "Not currently stocked"}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="ing-sticky-cta">
        <div className="ing-cta-summary">
          <span>{selectedIngredients.length} ingredient{selectedIngredients.length === 1 ? "" : "s"} selected</span>
          <strong>Total: ₹{total}</strong>
        </div>
        <button
          className="ing-cta-btn"
          disabled={selectedIngredients.length === 0}
          onClick={handleAddToCart}
        >
          Add {selectedIngredients.length} ingredient{selectedIngredients.length === 1 ? "" : "s"} to cart · ₹{total}
        </button>
      </div>

      {addedOpen && (
        <RecipeAddedSheet
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          recipeImage={recipe.image}
          timeMins={recipe.timeMins}
          difficulty={recipe.difficulty}
          itemCount={selectedIngredients.length}
          onClose={() => setAddedOpen(false)}
        />
      )}
    </div>
  );
}

// ── Screen 5 — success sheet ──────────────────────────────────────────────────

function RecipeAddedSheet({
  recipeId, recipeTitle, recipeImage, timeMins, difficulty, itemCount, onClose,
}: {
  recipeId: string;
  recipeTitle: string;
  recipeImage: string;
  timeMins: number;
  difficulty: string;
  itemCount: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const recipe = getRecipeById(recipeId);
  const related = recipe ? relatedRecipes(recipe, 3) : [];

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-panel added-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="added-check">✓</div>
        <h2 className="added-title">Ingredients added<br />to your cart!</h2>
        <p className="added-sub">
          {itemCount} item{itemCount === 1 ? "" : "s"} for {recipeTitle} {itemCount === 1 ? "has" : "have"} been added.
        </p>

        <div className="added-recipe-card">
          <img src={recipeImage} alt={recipeTitle} />
          <div>
            <strong>{recipeTitle}</strong>
            <p>⏱ {timeMins} min · {difficulty}</p>
          </div>
        </div>

        <button className="btn-primary full" onClick={() => navigate("/cart")}>
          Go to Cart
        </button>
        <button className="btn-text" onClick={() => { onClose(); navigate("/cook"); }}>
          Explore more recipes
        </button>

        {related.length > 0 && (
          <div className="added-related">
            <h3>You may also like</h3>
            <div className="added-related-grid">
              {related.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
