/**
 * FromIngredientsPage — Screen 9, the reverse flow (route: /cook/from-ingredients)
 */
import { useNavigate } from "react-router-dom";
import IngredientRecipeMatcher from "../../components/cook/IngredientRecipeMatcher";

export default function FromIngredientsPage() {
  const navigate = useNavigate();

  return (
    <div className="page cook-page from-ing-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>Got ingredients at home?</h1>
      </header>

      <div className="from-ing-content">
        <div className="from-ing-hero">
          <span className="from-ing-emoji">🥘</span>
          <h2>Got ingredients at home?</h2>
          <p>Tell us what you have, and we'll suggest recipes.</p>
        </div>

        <IngredientRecipeMatcher />
      </div>
    </div>
  );
}
