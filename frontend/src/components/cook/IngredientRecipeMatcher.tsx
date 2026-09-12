/**
 * IngredientRecipeMatcher — Screen 9's core interaction: free-text +
 * ingredient chips in, ranked recipe matches out (via
 * lib/recipes.ts's matchRecipesToPantry), each one linking back into the
 * real recipe detail / ingredient-selection flow.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COMMON_PANTRY_INGREDIENTS, matchRecipesToPantry, type RecipeCoverage } from "../../lib/recipes";

export default function IngredientRecipeMatcher() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [results, setResults] = useState<RecipeCoverage[] | null>(null);

  const haveList = useMemo(() => {
    const fromText = text.split(",").map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set([...chips, ...fromText]));
  }, [text, chips]);

  function toggleChip(ingredient: string) {
    setChips((prev) =>
      prev.includes(ingredient) ? prev.filter((c) => c !== ingredient) : [...prev, ingredient]
    );
  }

  function handleFind() {
    setResults(matchRecipesToPantry(haveList));
  }

  return (
    <>
      <textarea
        className="from-ing-textarea"
        placeholder="I have potatoes, onions, tomatoes…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
      />

      <div className="from-ing-chips">
        {COMMON_PANTRY_INGREDIENTS.map((ing) => (
          <button
            key={ing}
            className={`from-ing-chip${chips.includes(ing) ? " active" : ""}`}
            onClick={() => toggleChip(ing)}
          >
            {ing}
          </button>
        ))}
      </div>

      <button className="btn-primary full" disabled={haveList.length === 0} onClick={handleFind}>
        Find recipes
      </button>

      {results !== null && (
        <div className="from-ing-results">
          <h3>Suggested for you</h3>
          {results.length === 0 ? (
            <p className="from-ing-no-results">
              No recipes match those ingredients yet — try adding a few more, like onion or tomato.
            </p>
          ) : (
            <div className="from-ing-result-grid">
              {results.map(({ recipe, haveCount, totalCount, missing }) => (
                <div key={recipe.id} className="from-ing-result-card">
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    onClick={() => navigate(`/cook/recipe/${recipe.id}`)}
                  />
                  <div className="from-ing-result-body">
                    <h4 onClick={() => navigate(`/cook/recipe/${recipe.id}`)}>{recipe.title}</h4>
                    <p className="from-ing-result-meta">⏱ {recipe.timeMins} min · {recipe.difficulty}</p>
                    <p className="from-ing-coverage">
                      You have {haveCount}/{totalCount} ingredients
                    </p>
                    {missing.length > 0 ? (
                      <button
                        className="btn-secondary small"
                        onClick={() => navigate(`/cook/recipe/${recipe.id}/ingredients`)}
                      >
                        Add {missing.length} missing ingredient{missing.length === 1 ? "" : "s"}
                      </button>
                    ) : (
                      <button
                        className="btn-secondary small"
                        onClick={() => navigate(`/cook/recipe/${recipe.id}`)}
                      >
                        View recipe
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
