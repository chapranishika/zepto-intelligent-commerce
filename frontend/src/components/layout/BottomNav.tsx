import { useLocation, useNavigate } from "react-router-dom";
import { ChefHat, Grid2X2, Home, ShoppingBag, UserRound, type LucideIcon } from "lucide-react";
import { useCartStore } from "../../store";

const NAV = [
  { path: "/home",     icon: Home,        label: "Home"       },
  { path: "/category", icon: Grid2X2,     label: "Categories"  },
  { path: "/cart",     icon: ShoppingBag, label: "Cart",  badge: true },
  { path: "/cook",     icon: ChefHat,     label: "Cook"        },
  { path: "/profile",  icon: UserRound,   label: "Profile"     },
];

export default function BottomNav() {
  const navigate   = useNavigate();
  const { pathname } = useLocation();
  const totalItems = useCartStore((s) => s.totalItems());

  return (
    <nav className="bottom-nav">
      {NAV.map(({ path, icon: Icon, label, badge }: { path: string; icon: LucideIcon; label: string; badge?: boolean }) => {
        const active = path === "/cook"
          ? pathname.startsWith("/cook") || pathname.startsWith("/ai")
          : pathname.startsWith(path);
        return (
          <button
            key={path}
            className={`nav-item${active ? " active" : ""}`}
            onClick={() => navigate(path)}
            aria-label={label}
          >
            <span className="nav-icon">
              <Icon aria-hidden="true" strokeWidth={active ? 2.4 : 1.9} />
              {badge && totalItems > 0 && (
                <span className="nav-badge">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </span>
            <span className="nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
