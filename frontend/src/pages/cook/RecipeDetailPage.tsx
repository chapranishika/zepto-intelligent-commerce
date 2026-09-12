/**
 * RecipeDetailPage — Screen 3 (route: /cook/recipe/:id)
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRecipeById } from "../../lib/recipes";
import { useSavedRecipesStore, useUIStore } from "../../store";

type Tab = "overview" | "ingredients" | "steps" | "nutrition";

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const recipe = id ? getRecipeById(id) : undefined;
  const [tab, setTab] = useState<Tab>("overview");
  const { toggle, has } = useSavedRecipesStore();
  const addToast = useUIStore((s) => s.addToast);

  if (!recipe) {
    return (
      <div className="page cook-page">
        <header className="page-header">
          <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
          <h1>Recipe not found</h1>
        </header>
        <div className="empty-state">
          <p>We couldn't find that recipe.</p>
          <button className="btn-primary" onClick={() => navigate("/cook")}>Browse recipes</button>
        </div>
      </div>
    );
  }

  const saved = has(recipe.id);
  const availableCount = recipe.ingredients.filter((i) => i.productId != null).length;

  function handleSave() {
    toggle(recipe!.id);
    addToast(saved ? "Removed from saved recipes" : "Recipe saved ♡");
  }

  function handleShare() {
    const url = `${window.location.origin}/cook/recipe/${recipe!.id}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: recipe!.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      addToast("Recipe link copied 🔗");
    }
  }

  return (
    <div className="page cook-page recipe-detail-page">
      <header className="page-header recipe-detail-header transparent">
        <button className="back-btn circle" onClick={() => navigate(-1)}>‹</button>
        <div className="rd-header-actions">
          <button className={`circle-btn${saved ? " active" : ""}`} onClick={handleSave} aria-label="Save recipe">
            {saved ? "❤️" : "♡"}
          </button>
          {(typeof navigator.share === "function" || navigator.clipboard) && (
            <button className="circle-btn" onClick={handleShare} aria-label="Share">↗</button>
          )}
        </div>
      </header>

      <div className="rd-hero">
        <img src={recipe.image} alt={recipe.title} className="rd-hero-img" />
      </div>

      <div className="rd-content">
        <h1 className="rd-title">{recipe.title}</h1>
        <p className="rd-desc">{recipe.description}</p>

        <div className="rd-meta-grid">
          <div className="rd-meta-item"><span className="star">★</span> {recipe.rating.toFixed(1)}</div>
          <div className="rd-meta-item">💬 {recipe.reviews.toLocaleString()}</div>
          <div className="rd-meta-item">⏱ {recipe.timeMins} min</div>
          <div className="rd-meta-item">📶 {recipe.difficulty}</div>
          <div className="rd-meta-item">🍽 Serves {recipe.servings}</div>
          <div className="rd-meta-item">🌍 {recipe.cuisine}</div>
        </div>

        <div className="rd-tabs">
          {(["overview", "ingredients", "steps", "nutrition"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`rd-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="rd-panel">
            <p className="rd-overview-text">{recipe.description}</p>
            <div className="rd-ingredients-preview" onClick={() => setTab("ingredients")}>
              <div>
                <strong>{recipe.ingredients.length} ingredients</strong>
                <p>{availableCount} available in your area · {recipe.ingredients.length - availableCount} you may already have</p>
              </div>
              <span className="rc-arrow">›</span>
            </div>
          </div>
        )}

        {tab === "ingredients" && (
          <div className="rd-panel">
            <ul className="rd-ingredients-list">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id}>
                  <span>{ing.name}</span>
                  <span className="rd-ing-qty">{ing.quantityLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "steps" && (
          <div className="rd-panel">
            <ol className="rd-steps-list">
              {recipe.steps.map((s) => (
                <li key={s.step}>
                  <span className="rd-step-num">{s.step}</span>
                  <span className="rd-step-text">{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === "nutrition" && (
          <div className="rd-panel">
            <p className="rd-nutrition-note">Approximate values per serving</p>
            <div className="rd-nutrition-grid">
              <div className="rd-nutri-card"><strong>{recipe.nutrition.calories}</strong><span>kcal</span></div>
              <div className="rd-nutri-card"><strong>{recipe.nutrition.protein}g</strong><span>Protein</span></div>
              <div className="rd-nutri-card"><strong>{recipe.nutrition.carbs}g</strong><span>Carbs</span></div>
              <div className="rd-nutri-card"><strong>{recipe.nutrition.fat}g</strong><span>Fat</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="rd-sticky-cta">
        <button className="rd-cta-btn" onClick={() => navigate(`/cook/recipe/${recipe.id}/ingredients`)}>
          View ingredients ({recipe.ingredients.length})
        </button>
      </div>
    </div>
  );
}
