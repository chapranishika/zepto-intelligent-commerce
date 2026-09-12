/**
 * TopNav — real desktop navigation (>=1024px), site-wide.
 *
 * BottomNav still renders (and still drives mobile/tablet nav, <1024px) —
 * CSS hides one or the other by breakpoint (see styles.css's
 * .top-nav/.bottom-nav media queries), so there is exactly one visible nav
 * at any given width, and neither component needs to know about the other.
 * Each page's own header (topbar / page-header) is unchanged and still
 * renders below this — that's the normal two-tier pattern real e-commerce
 * sites use (persistent global nav + a page-specific sub-header), not a
 * duplicate.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { useCartStore } from "../../store";

const LINKS = [
  { path: "/home",     label: "Home"       },
  { path: "/category", label: "Categories" },
  { path: "/cook",     label: "Cook"       },
  { path: "/profile",  label: "Profile"    },
];

export default function TopNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const totalItems = useCartStore((s) => s.totalItems());

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <button className="top-nav-logo" onClick={() => navigate("/home")}>
          <img
            src="https://www.zeptonow.com/images/logo.svg"
            alt="Zepto"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
          <span>zepto</span>
        </button>

        <nav className="top-nav-links">
          {LINKS.map(({ path, label }) => {
            const active = pathname.startsWith(path);
            return (
              <button
                key={path}
                className={`top-nav-link${active ? " active" : ""}`}
                onClick={() => navigate(path)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <button className="top-nav-cart" onClick={() => navigate("/cart")}>
          🛒 Cart
          {totalItems > 0 && <span className="top-nav-cart-badge">{totalItems > 99 ? "99+" : totalItems}</span>}
        </button>
      </div>
    </header>
  );
}
