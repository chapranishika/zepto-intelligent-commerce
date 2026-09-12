/**
 * GopiBahuHero — Screen 1's "Cook with Zepto" entry point on the homepage.
 * Primary CTA leads into the new recipe browsing flow (/cook); secondary
 * CTA keeps the existing Gopi Bahu chat assistant (/ai) reachable now that
 * it's no longer in the bottom nav (replaced there by Cook, per spec).
 */
import { useNavigate } from "react-router-dom";

const GOPI = "/gopi_assistant.png";

export default function GopiBahuHero() {
  const navigate = useNavigate();

  return (
    <section className="gopi-hero">
      <div className="gopi-hero-text">
        <div className="gopi-hero-label">
          <img
            src={GOPI}
            alt=""
            className="gopi-hero-avatar"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span>Gopi Bahu</span>
        </div>
        <h2 className="gopi-hero-title">Cook what you love.</h2>
        <p className="gopi-hero-sub">Add recipe ingredients to your cart in one click.</p>
        <div className="gopi-hero-ctas">
          <button className="btn-primary" onClick={() => navigate("/cook")}>
            Explore Recipes
          </button>
          <button className="btn-text" onClick={() => navigate("/ai")}>
            Tell Gopi Bahu what you want to cook →
          </button>
        </div>
      </div>
      <div className="gopi-hero-img-wrap">
        <img
          src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=500&q=80"
          alt="Cook what you love"
          loading="lazy"
        />
      </div>
    </section>
  );
}
