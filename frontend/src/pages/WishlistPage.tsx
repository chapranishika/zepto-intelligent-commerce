/**
 * WishlistPage — pre-existing bug fix: HomePage's ♡ icon has always linked
 * to /wishlist (see HomePage.tsx), and useWishlistStore (store/index.ts)
 * has always fully existed and been wired into ProductCard's heart toggle —
 * but this page/route never did, so that link was a silent dead end.
 * Found while properly testing the wishlist flow, not introduced by it.
 */
import { useNavigate } from "react-router-dom";
import { useWishlistStore } from "../store";
import ProductCard from "../components/ui/ProductCard";

export default function WishlistPage() {
  const navigate = useNavigate();
  const products = useWishlistStore((s) => s.products());

  return (
    <div className="page wishlist-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>‹</button>
        <h1>Wishlist ({products.length})</h1>
      </header>

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">♡</div>
          <h2>Your wishlist is empty</h2>
          <p>Tap the heart on any product to save it here</p>
          <button className="btn-primary" onClick={() => navigate("/home")}>
            Start browsing
          </button>
        </div>
      ) : (
        <div className="cat-product-grid wishlist-grid" style={{ padding: 14 }}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} page="wishlist" wide />
          ))}
        </div>
      )}
    </div>
  );
}
