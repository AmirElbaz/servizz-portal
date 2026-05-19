import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../services/auth";

interface TopNavBarProps {
  /** Kept for source-compat with the dashboard variants during transition.
   *  Previously controlled a "compact hero" middle section; no longer used. */
  heroCollapsed?: boolean;
}

export default function TopNavBar(_props: TopNavBarProps = {}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="fixed top-2 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[96%] max-w-[90rem]">
      <div className="glass-nav rounded-2xl px-4 sm:px-8 py-2.5 flex justify-between items-center shadow-lg shadow-black/[0.04] gap-3">
        <Link
          to="/dashboard"
          className="shrink-0 flex items-center gap-3 sm:gap-4 no-underline"
          aria-label="Centrecom | Servizz.gov"
        >
          <img src="/centrecom-logo.svg" alt="Centrecom" className="h-9 sm:h-10 w-auto" />
          <span className="hidden sm:inline-block w-px h-6 bg-on-surface-variant/20" aria-hidden />
          <img
            src="/servizz-logo.png"
            alt="Servizz.gov"
            className="hidden sm:inline-block h-7 sm:h-8 w-auto rounded-md"
          />
        </Link>

        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
          </button>
          <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors relative">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full"></span>
          </button>
          {user?.isAdmin && (
            <Link
              to="/admin"
              title="Admin panel"
              className="p-2 hover:bg-primary/10 rounded-xl transition-colors group"
            >
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-[20px]">
                admin_panel_settings
              </span>
            </Link>
          )}
          {user && (
            <span className="text-xs font-semibold text-on-surface-variant hidden lg:block">
              {user.fullName || user.username}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-error/10 rounded-xl transition-colors group"
            title="Logout"
          >
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-error text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
