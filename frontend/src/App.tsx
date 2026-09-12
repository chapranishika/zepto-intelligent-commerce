import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav         from "./components/layout/BottomNav";
import TopNav            from "./components/layout/TopNav";
import HomePage          from "./pages/HomePage";
import CategoryPage      from "./pages/CategoryPage";
import ProductPage       from "./pages/ProductPage";
import CartPage          from "./pages/CartPage";
import WishlistPage      from "./pages/WishlistPage";
import CheckoutPage      from "./pages/CheckoutPage";
import OrderSuccessPage  from "./pages/OrderSuccessPage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import AIPage            from "./pages/AIPage";
import SearchPage        from "./pages/SearchPage";
import ProfilePage       from "./pages/ProfilePage";
import LoginPage         from "./pages/LoginPage";
import CookPage              from "./pages/cook/CookPage";
import RecipeDetailPage      from "./pages/cook/RecipeDetailPage";
import RecipeIngredientsPage from "./pages/cook/RecipeIngredientsPage";
import MealPlannerPage       from "./pages/cook/MealPlannerPage";
import FromIngredientsPage   from "./pages/cook/FromIngredientsPage";
import { useUIStore, useUserStore } from "./store";
import { getSession, onAuthChange } from "./lib/supabase";
import "./styles.css";

function sessionToAuthUser(session: Awaited<ReturnType<typeof getSession>>) {
  const u = session?.user;
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    name: (u.user_metadata?.name as string | undefined) ?? u.email?.split("@")[0] ?? "User",
  };
}

// Hydrates useUserStore from the real Supabase session on load, and keeps
// it in sync with sign-in/sign-out/token-refresh (including from another
// tab) — `user` is deliberately not persisted to localStorage, so this is
// the only source of truth for who's signed in.
function AuthBootstrap() {
  const setUser = useUserStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (!cancelled) setUser(sessionToAuthUser(session));
    });
    const unsubscribe = onAuthChange((session) => setUser(sessionToAuthUser(session)));
    return () => { cancelled = true; unsubscribe(); };
  }, [setUser]);

  return null;
}

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap />
      <div className="app-shell">
        <TopNav />
        <div className="app-content">
          <Routes>
            <Route path="/"              element={<Navigate to="/home" replace />} />
            <Route path="/home"          element={<HomePage />}          />
            <Route path="/category"      element={<CategoryPage />}      />
            <Route path="/product/:id"   element={<ProductPage />}       />
            <Route path="/cart"          element={<CartPage />}          />
            <Route path="/wishlist"      element={<WishlistPage />}      />
            <Route path="/checkout"      element={<CheckoutPage />}      />
            <Route path="/success"       element={<OrderSuccessPage />}  />
            <Route path="/track"         element={<OrderTrackingPage />} />
            <Route path="/ai"            element={<AIPage />}            />
            <Route path="/search"        element={<SearchPage />}        />
            <Route path="/profile"       element={<ProfilePage />}       />
            <Route path="/login"         element={<LoginPage />}         />

            {/* Gopi Bahu / Cook with Zepto */}
            <Route path="/cook"                              element={<CookPage />}              />
            <Route path="/cook/meal-planner"                 element={<MealPlannerPage />}       />
            <Route path="/cook/from-ingredients"              element={<FromIngredientsPage />}   />
            <Route path="/cook/recipe/:id"                    element={<RecipeDetailPage />}      />
            <Route path="/cook/recipe/:id/ingredients"        element={<RecipeIngredientsPage />} />
          </Routes>
        </div>
        <BottomNav />
        <ToastStack />
      </div>
    </BrowserRouter>
  );
}
