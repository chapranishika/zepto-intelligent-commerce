/**
 * RecipeCard — used on the Cook landing page, the homepage discovery rail,
 * "You may also like", and the Meal Planner. Mirrors ProductCard's visual
 * language (image, badge row, footer) so the Cook feature reads as part of
 * Zepto, not a bolted-on separate product.
 */
import { useNavigate } from "react-router-dom";
import type { Recipe } from "../../lib/recipes";

interface Props {
  recipe: Recipe;
  wide?: boolean;
  /** Compact horizontal layout used by the Meal Planner's day cards. */
  horizontal?: boolean;
}

export default function RecipeCard({ recipe, wide = false, horizontal = false }: Props) {
  const navigate = useNavigate();

  if (horizontal) {
    return (
      <button
        className="recipe-card recipe-card-h"
        onClick={() => navigate(`/cook/recipe/${recipe.id}`)}
      >
        <div className="rc-h-img">
          <img src={recipe.image} alt={recipe.title} loading="lazy" />
        </div>
        <div className="rc-h-body">
          <h4 className="rc-h-title">{recipe.title}</h4>
          <p className="rc-h-meta">⏱ {recipe.timeMins} min</p>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`recipe-card${wide ? " wide" : ""}`}
      onClick={() => navigate(`/cook/recipe/${recipe.id}`)}
      role="button"
      tabIndex={0}
    >
      <div className="rc-img-wrap">
        <img src={recipe.image} alt={recipe.title} loading="lazy" className="rc-img" />
        <div className="rc-time-badge">⏱ {recipe.timeMins} min</div>
      </div>
      <div className="rc-body">
        <h3 className="rc-title">{recipe.title}</h3>
        <p className="rc-desc">{recipe.description}</p>
        <div className="rc-meta-row">
          <span className="rc-difficulty">{recipe.difficulty}</span>
          <span className="rc-dot">·</span>
          <span className="rc-rating"><span className="star">★</span> {recipe.rating.toFixed(1)}</span>
        </div>
      </div>
      <span className="rc-arrow">›</span>
    </div>
  );
}
