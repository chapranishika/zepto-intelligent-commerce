/**
 * RecipeSuccessState — Screen 5, shown as an in-page sheet after ingredients
 * are actually added to the (real) cart — see the spec's own "or a modal/
 * sheet if more appropriate" allowance for this screen. No dedicated route
 * exists for it in App.tsx's route list, which is why it's a sheet, not a
 * page navigation.
 */
import { useNavigate } from "react-router-dom";
import RecipeCard from "../ui/RecipeCard";
import { getRecipeById, relatedRecipes } from "../../lib/recipes";

interface Props {
  recipeId: string;
  recipeTitle: string;
  recipeImage: string;
  timeMins: number;
  difficulty: string;
  itemCount: number;
  onClose: () => void;
}

export default function RecipeSuccessState({
  recipeId, recipeTitle, recipeImage, timeMins, difficulty, itemCount, onClose,
}: Props) {
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
