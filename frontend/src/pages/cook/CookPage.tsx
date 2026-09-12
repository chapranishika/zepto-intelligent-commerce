/**
 * CookPage — Screen 2: recipe search / category (route: /cook)
 *
 * The "Products" and "Categories" tabs deliberately don't reimplement
 * search/category browsing — they hand off to the existing /search and
 * /category pages so there's exactly one search implementation and one
 * category implementation in the app.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RecipeCard from "../../components/ui/RecipeCard";
import { ALL_RECIPE_TAGS, searchRecipes, type Recipe } from "../../lib/recipes";

const GOPI = "/gopi_assistant.png";
type Tab = "all" | "recipes" | "products" | "categories";

export default function CookPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const recipes: Recipe[] = useMemo(() => {
    let r = searchRecipes(query);
    if (activeTags.length > 0) {
      r = r.filter((rec) => activeTags.every((t) => rec.tags.includes(t)));
    }
    return r;
  }, [query, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleTabClick(next: Tab) {
    setTab(next);
    if (next === "products") navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (next === "categories") navigate("/category");
  }

  return (
    <div className="page cook-page">
      <header className="page-header cook-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <div className="cook-header-title">
          <img
            src={GOPI}
            alt=""
            className="cook-header-avatar"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1>Gopi Bahu · Cook with Zepto</h1>
        </div>
        <button className="icon-btn dark" onClick={() => navigate("/cook/meal-planner")} aria-label="Meal planner">
          📅
        </button>
      </header>

      <div className="cook-content">
        {/* ── Search ── */}
        <div className="cook-search-wrap">
          <div className="cook-search-bar">
            <span>🔍</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes, cuisines, or ingredients"
            />
            {query && (
              <button className="cook-search-clear" onClick={() => setQuery("")}>✕</button>
            )}
          </div>
          <div className="cook-search-examples">
            {["Paneer Butter Masala", "Dal Tadka", "Aloo Paratha", "Vegetable Biryani", "Chole"].map((ex) => (
              <button key={ex} className="cook-example-chip" onClick={() => setQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="cook-tabs">
          {(["all", "recipes", "products", "categories"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`cook-tab${tab === t ? " active" : ""}`}
              onClick={() => handleTabClick(t)}
            >
              {t === "all" ? "All" : t === "recipes" ? "Recipes" : t === "products" ? "Products" : "Categories"}
            </button>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="cook-filters">
          {ALL_RECIPE_TAGS.map((tag) => (
            <button
              key={tag}
              className={`cook-filter-chip${activeTags.includes(tag) ? " active" : ""}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* ── Recipe list ── */}
        <div className="cook-recipes-header">
          <h2>Recipes ({recipes.length})</h2>
          {(activeTags.length > 0 || query) && (
            <button
              className="cook-clear-filters"
              onClick={() => { setActiveTags([]); setQuery(""); }}
            >
              Clear all
            </button>
          )}
        </div>

        {recipes.length === 0 ? (
          <div className="cook-empty">
            <p>No recipes match that search yet.</p>
            <button className="btn-secondary" onClick={() => navigate("/cook/from-ingredients")}>
              Try "Got ingredients at home?" instead →
            </button>
          </div>
        ) : (
          <div className="cook-recipe-grid">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} wide />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
