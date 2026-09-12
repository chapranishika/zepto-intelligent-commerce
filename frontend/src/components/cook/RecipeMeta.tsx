/**
 * RecipeMeta — the rating/reviews/time/difficulty/servings/cuisine grid on
 * the recipe detail page (Screen 3).
 */
import type { Recipe } from "../../lib/recipes";

interface Props {
  recipe: Pick<Recipe, "rating" | "reviews" | "timeMins" | "difficulty" | "servings" | "cuisine">;
}

export default function RecipeMeta({ recipe }: Props) {
  return (
    <div className="rd-meta-grid">
      <div className="rd-meta-item"><span className="star">★</span> {recipe.rating.toFixed(1)}</div>
      <div className="rd-meta-item">💬 {recipe.reviews.toLocaleString()}</div>
      <div className="rd-meta-item">⏱ {recipe.timeMins} min</div>
      <div className="rd-meta-item">📶 {recipe.difficulty}</div>
      <div className="rd-meta-item">🍽 Serves {recipe.servings}</div>
      <div className="rd-meta-item">🌍 {recipe.cuisine}</div>
    </div>
  );
}
