import { Link, useNavigate } from "react-router-dom";
import { projects, type Project } from "../../data/projects";
import { useAuth } from "../../services/auth";

interface TopNavBarProps {
  onPortalsClick?: () => void;
  onServizzClick?: () => void;
  heroCollapsed?: boolean;
  featuredProject?: Project;
}

export default function TopNavBar({
  onPortalsClick,
  onServizzClick,
  heroCollapsed = false,
  featuredProject,
}: TopNavBarProps) {
  const project = featuredProject ?? projects[0];
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  // Smooth interpolation for the button morph
  const btnStyle = heroCollapsed
    ? {
        background: `linear-gradient(135deg, ${project.color}, color-mix(in srgb, ${project.color} 75%, #000))`,
        boxShadow: `0 4px 20px ${project.color}35`,
        color: "white",
        padding: "6px 16px",
      }
    : {
        background: "rgba(29, 95, 168, 0.08)",
        boxShadow: "none",
        color: "#1d5fa8",
        padding: "6px 16px",
      };

  return (
    <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-6xl">
      <div className="glass-nav rounded-2xl px-6 py-3 flex justify-between items-center shadow-lg shadow-black/[0.04]">
        <Link
          to="/dashboard"
          className="text-lg font-extrabold tracking-tighter text-on-surface font-headline no-underline"
        >
          Centercom<span className="text-primary"> | </span>Servizz.gov
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {onPortalsClick ? (
            <button
              onClick={onPortalsClick}
              className="flex items-center gap-2 rounded-lg font-semibold text-sm transition-all duration-[1200ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={btnStyle}
            >
              <img
                src={project.logo}
                alt=""
                className="object-contain transition-all duration-[1200ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{
                  height: heroCollapsed ? "18px" : "0px",
                  width: heroCollapsed ? "18px" : "0px",
                  opacity: heroCollapsed ? 1 : 0,
                  filter: heroCollapsed ? "brightness(0) invert(1)" : "none",
                }}
              />
              {project.name}
            </button>
          ) : (
            <Link
              to="/dashboard"
              className="px-4 py-1.5 text-sm font-semibold text-primary bg-primary/8 rounded-lg transition-colors no-underline"
            >
              {project.name}
            </Link>
          )}
          {onServizzClick ? (
            <button
              onClick={onServizzClick}
              className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
            >
              Servizz.gov
            </button>
          ) : (
            <Link
              to="/dashboard"
              className="px-4 py-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors no-underline"
            >
              Servizz.gov
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
          </button>
          <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors relative">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full"></span>
          </button>
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
