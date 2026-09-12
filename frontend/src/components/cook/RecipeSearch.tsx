/**
 * RecipeSearch — search bar + example chips + tabs + filter chips on the
 * Cook landing page (Screen 2). Purely controlled: CookPage owns the
 * query/tab/filter state and passes it down.
 */
import { ALL_RECIPE_TAGS } from "../../lib/recipes";

export type CookTab = "all" | "recipes" | "products" | "categories";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  tab: CookTab;
  onTabChange: (t: CookTab) => void;
  activeTags: string[];
  onToggleTag: (tag: string) => void;
}

const EXAMPLES = ["Paneer Butter Masala", "Dal Tadka", "Aloo Paratha", "Vegetable Biryani", "Chole"];
const TABS: CookTab[] = ["all", "recipes", "products", "categories"];
const TAB_LABEL: Record<CookTab, string> = { all: "All", recipes: "Recipes", products: "Products", categories: "Categories" };

export default function RecipeSearch({ query, onQueryChange, tab, onTabChange, activeTags, onToggleTag }: Props) {
  return (
    <>
      <div className="cook-search-wrap">
        <div className="cook-search-bar">
          <span>🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search dishes, cuisines, or ingredients"
          />
          {query && (
            <button className="cook-search-clear" onClick={() => onQueryChange("")}>✕</button>
          )}
        </div>
        <div className="cook-search-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="cook-example-chip" onClick={() => onQueryChange(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="cook-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`cook-tab${tab === t ? " active" : ""}`}
            onClick={() => onTabChange(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="cook-filters">
        {ALL_RECIPE_TAGS.map((tag) => (
          <button
            key={tag}
            className={`cook-filter-chip${activeTags.includes(tag) ? " active" : ""}`}
            onClick={() => onToggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
    </>
  );
}
