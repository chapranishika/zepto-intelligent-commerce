/**
 * MealPlannerPage — Screen 8 (route: /cook/meal-planner)
 *
 * No backend persistence for meal plans exists (or is asked for) — this
 * uses local component state with a deterministic default plan, exactly as
 * instructed ("use local application state/mock data cleanly") rather than
 * inventing a fake API.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RECIPES, resolveIngredientProduct, type Recipe } from "../../lib/recipes";
import { useCartStore, useUIStore } from "../../store";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type PlannerTab = "This Week" | "Quick Meals" | "Healthy" | "Indian" | "Global";
const TABS: PlannerTab[] = ["This Week", "Quick Meals", "Healthy", "Indian", "Global"];

function poolForTab(tab: PlannerTab): Recipe[] {
  switch (tab) {
    case "Quick Meals": return RECIPES.filter((r) => r.timeMins <= 30);
    case "Healthy":     return RECIPES.filter((r) => r.tags.includes("High protein"));
    case "Indian":      return RECIPES.filter((r) => r.cuisine.includes("Indian"));
    case "Global":      return RECIPES; // catalogue is Indian-leaning today; show everything rather than an empty tab
    default:            return RECIPES;
  }
}

function buildPlan(tab: PlannerTab, seed: number): Recipe[] {
  const pool = poolForTab(tab);
  if (pool.length === 0) return DAYS.map(() => RECIPES[0]);
  return DAYS.map((_, i) => pool[(i + seed) % pool.length]);
}

export default function MealPlannerPage() {
  const navigate = useNavigate();
  const addRecipeIngredients = useCartStore((s) => s.addRecipeIngredients);
  const addToast = useUIStore((s) => s.addToast);
  const [tab, setTab] = useState<PlannerTab>("This Week");
  const [seed, setSeed] = useState(0);
  const [activeDay, setActiveDay] = useState(0);

  const plan = useMemo(() => buildPlan(tab, seed), [tab, seed]);

  function handlePlanMyWeek() {
    setSeed((s) => s + 1);
    addToast("Zepto AI planned your week 🎉");
  }

  function handleAddDay(recipe: Recipe) {
    const entries = recipe.ingredients
      .map((ing) => {
        const product = resolveIngredientProduct(ing);
        return product ? { product, qty: 1 } : null;
      })
      .filter((e): e is { product: NonNullable<ReturnType<typeof resolveIngredientProduct>>; qty: number } => e != null);
    if (entries.length === 0) return;
    addRecipeIngredients(entries, { id: recipe.id, title: recipe.title });
    addToast(`Added ingredients for ${recipe.title} 🛒`);
  }

  return (
    <div className="page cook-page meal-planner-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>Meal Planner</h1>
      </header>

      <div className="mp-content">
        <p className="mp-subtitle">Plan your week, we'll handle the ingredients.</p>

        <div className="mp-tabs">
          {TABS.map((t) => (
            <button key={t} className={`mp-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="mp-days">
          {DAYS.map((d, i) => (
            <button
              key={d}
              className={`mp-day${activeDay === i ? " active" : ""}`}
              onClick={() => setActiveDay(i)}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="mp-day-grid">
          {DAYS.map((d, i) => {
            const recipe = plan[i];
            return (
              <div key={d} className={`mp-meal-card${activeDay === i ? " active" : ""}`}>
                <div className="mp-meal-day-label">{d}</div>
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  onClick={() => navigate(`/cook/recipe/${recipe.id}`)}
                />
                <div className="mp-meal-body">
                  <h4 onClick={() => navigate(`/cook/recipe/${recipe.id}`)}>{recipe.title}</h4>
                  <p>⏱ {recipe.timeMins} min</p>
                  <button className="btn-secondary small full" onClick={() => handleAddDay(recipe)}>
                    + Add to cart
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn-primary full mp-plan-cta" onClick={handlePlanMyWeek}>
          ✨ Plan my week with Zepto AI
        </button>
      </div>
    </div>
  );
}
