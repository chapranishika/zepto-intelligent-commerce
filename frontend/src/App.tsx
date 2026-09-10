import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ChefHat, Grid2X2, Heart, Home, ShoppingBag, UserRound } from "lucide-react";
import BottomNav         from "./components/layout/BottomNav";
import HomePage          from "./pages/HomePage";
import CategoryPage      from "./pages/CategoryPage";
import ProductPage       from "./pages/ProductPage";
import CartPage          from "./pages/CartPage";
import CheckoutPage      from "./pages/CheckoutPage";
import OrderSuccessPage  from "./pages/OrderSuccessPage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import AIPage            from "./pages/AIPage";
import SearchPage        from "./pages/SearchPage";
import ProfilePage       from "./pages/ProfilePage";
import LoginPage         from "./pages/LoginPage";
import { useUIStore }    from "./store";
import { useCartStore }   from "./store";
import "./styles.css";

function ToastStack() {
  const { toasts, removeToast } = useUIStore();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function SignatureFooter() {
  return (
    <footer className="signature-footer" aria-label="Project credit">
      <span className="signature-mark" aria-hidden="true">♥</span>
      <span>Built with care by <strong>Nishika Chapra</strong></span>
      <span className="signature-dot" aria-hidden="true">·</span>
      <span>Thoughtful food, faster</span>
    </footer>
  );
}

function DesktopHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const totalItems = useCartStore((state) => state.totalItems());
  const links = [
    ["/home", "Home", Home], ["/category", "Categories", Grid2X2],
    ["/cook", "Cook", ChefHat], ["/profile", "Profile", UserRound],
  ] as const;

  return (
    <header className="desktop-header">
      <div className="desktop-header-inner">
        <button className="desktop-brand" onClick={() => navigate("/home")} aria-label="Zepto home">
          <span className="desktop-brand-mark">zepto</span>
          <span className="desktop-brand-caption">good food, faster</span>
        </button>
        <button className="desktop-location" aria-label="Change delivery location">
          <span className="dot-green" /> Delivering to Mumbai <span>⌄</span>
        </button>
        <button className="desktop-search" onClick={() => navigate("/search")}>
          <span>⌕</span> Search groceries, recipes, dishes &amp; more…
          <kbd>⌘ K</kbd>
        </button>
        <nav className="desktop-links" aria-label="Primary navigation">
          {links.map(([path, label, Icon]) => (
            <button key={path} className={pathname.startsWith(path) || (path === "/cook" && pathname.startsWith("/ai")) ? "active" : ""} onClick={() => navigate(path)}>
              <Icon size={16} strokeWidth={2} /> {label}
            </button>
          ))}
        </nav>
        <button className="desktop-icon-action" onClick={() => navigate("/profile")} aria-label="Saved products"><Heart size={17} /></button>
        <button className="desktop-cart-action" onClick={() => navigate("/cart")} aria-label="Open cart">
          <ShoppingBag size={17} /> Cart {totalItems > 0 && <b>{totalItems}</b>}
        </button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <DesktopHeader />
        <div className="app-content">
          <Routes>
            <Route path="/"              element={<Navigate to="/home" replace />} />
            <Route path="/home"          element={<HomePage />}          />
            <Route path="/category"      element={<CategoryPage />}      />
            <Route path="/product/:id"   element={<ProductPage />}       />
            <Route path="/cart"          element={<CartPage />}          />
            <Route path="/checkout"      element={<CheckoutPage />}      />
            <Route path="/success"       element={<OrderSuccessPage />}  />
            <Route path="/track"         element={<OrderTrackingPage />} />
            <Route path="/ai"            element={<AIPage />}            />
            <Route path="/cook"          element={<AIPage />}            />
            <Route path="/search"        element={<SearchPage />}        />
            <Route path="/profile"       element={<ProfilePage />}       />
            <Route path="/login"         element={<LoginPage />}         />
          </Routes>
        </div>
        <SignatureFooter />
        <BottomNav />
        <ToastStack />
      </div>
    </BrowserRouter>
  );
}
