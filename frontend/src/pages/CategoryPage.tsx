import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PRODUCTS, CATEGORIES, type Product } from "../lib/products";
import ProductCard from "../components/ui/ProductCard";
import { fetchProducts, mapDBProduct } from "../lib/supabase";

export default function CategoryPage() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const [selType, setSelType] = useState(params.get("type") ?? "");

  const activeCat = CATEGORIES.find((c) => c.type === selType);

  // Real Supabase data when reachable and seeded; falls back to the local
  // bundled catalogue otherwise — same pattern used for the backend-backed
  // rails elsewhere in the app. (The live products table may still be
  // empty until the catalog is seeded — see backend/seed_db.py — in which
  // case this silently uses the local fallback, not a broken empty page.)
  //
  // The unfiltered "All Categories" view used to fall back to the FULL
  // 5,060-item catalogue while the live fetch (which caps at 60) was in
  // flight — mounting 5,060 ProductCards, even briefly, blocked the main
  // thread for 10+ seconds on every visit. Capped to the same 60-item
  // limit as the live fetch so the fallback is actually a fallback, not a
  // guaranteed multi-second freeze. Category-filtered views were already
  // fine (largest department is ~460 items) and are untouched.
  const localProducts = selType ? PRODUCTS.filter((p) => p.type === selType) : PRODUCTS.slice(0, 60);
  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLiveProducts(null);
    fetchProducts(selType || undefined, 60).then(({ data }) => {
      if (cancelled) return;
      setLiveProducts(data && data.length > 0 ? data.map(mapDBProduct) : null);
    });
    return () => { cancelled = true; };
  }, [selType]);

  const products = liveProducts ?? localProducts;

  return (
    <div className="page category-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>{activeCat?.type ?? "All Categories"}</h1>
      </header>

      <div className="cat-page-body">
        {/* ── Sidebar with real product thumbnails ── */}
        <div className="cat-sidebar">
          <button
            className={`sidebar-item${selType === "" ? " active" : ""}`}
            onClick={() => setSelType("")}
          >
            <div className="sidebar-thumb">
              <img src={PRODUCTS[0].src} alt="All" loading="lazy" />
            </div>
            <span>All</span>
          </button>

          {CATEGORIES.map(({ type, emoji }) => {
            const sample = PRODUCTS.find((p) => p.type === type);
            return (
              <button
                key={type}
                className={`sidebar-item${selType === type ? " active" : ""}`}
                onClick={() => setSelType(type)}
              >
                <div className="sidebar-thumb">
                  {sample ? (
                    <img src={sample.src} alt={type} loading="lazy" />
                  ) : (
                    <span style={{ fontSize: 22 }}>{emoji}</span>
                  )}
                </div>
                <span>{type.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* ── Product grid ── */}
        <div className="cat-product-area">
          {activeCat && (
            <div
              className="cat-dept-banner"
              style={{ background: `linear-gradient(135deg, ${activeCat.color ?? "#8025FB"}, ${activeCat.color ?? "#4C1D95"}88)` }}
            >
              <h2>{activeCat.emoji} {activeCat.type}</h2>
              <p>{products.length} products available</p>
            </div>
          )}

          {products.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: "1/-1", marginTop: 40 }}>
              <div className="empty-icon">📦</div>
              <h2>No products yet</h2>
              <p>Check back soon!</p>
            </div>
          ) : (
            <div className="cat-product-grid">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} page="category" wide />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
