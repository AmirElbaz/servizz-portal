import { Link, useNavigate } from "react-router-dom";
import { projects, type Project } from "../../data/projects";
import { useAuth } from "../../services/auth";
import type { DashboardSummaryData } from "../../services/api";

interface TopNavBarProps {
  onPortalsClick?: () => void;
  onServizzClick?: () => void;
  heroCollapsed?: boolean;
  featuredProject?: Project;
  /** When provided together with heroCollapsed, the nav bar absorbs the
   *  featured project info (logo + name + stats + CTA) into its middle section. */
  heroStats?: DashboardSummaryData | null;
  showCompactHero?: boolean;
  /** Fires when the user clicks the compact project info inside the nav. */
  onCompactClick?: () => void;
}

export default function TopNavBar({
  onPortalsClick,
  onServizzClick,
  heroCollapsed = false,
  featuredProject,
  heroStats,
  showCompactHero = false,
  onCompactClick,
}: TopNavBarProps) {
  const project = featuredProject ?? projects[0];
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  // Smooth interpolation for the button morph (Variant A)
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
    <header className="fixed top-2 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[96%] sm:w-[94%] max-w-6xl">
      <div className="glass-nav rounded-2xl px-3 sm:px-6 py-2.5 sm:py-3 flex justify-between items-center shadow-lg shadow-black/[0.04] gap-3">
        <Link
          to="/dashboard"
          className="text-lg font-extrabold tracking-tighter text-on-surface font-headline no-underline whitespace-nowrap shrink-0"
        >
          Centercom<span className="text-primary"> | </span>Servizz.gov
        </Link>

        {/* ─── Middle section ─── */}
        {showCompactHero && heroCollapsed ? (
          /* Compact hero absorbed into the nav (Variants B & C) */
          <div className="hidden md:flex items-center gap-4 min-w-0 flex-1 justify-center animate-fade-in">
            {/* Clickable project info → scroll back to hero */}
            <button
              onClick={onCompactClick}
              className="group flex items-center gap-3 min-w-0 rounded-xl px-2 py-1 -mx-2 hover:bg-surface-container-high/60 transition-colors cursor-pointer"
              title="Back to top"
            >
              <div
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center p-1.5 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${project.color}15, ${project.color}05)`, border: `1px solid ${project.color}20` }}
              >
                <img src={project.logo} alt={project.name} className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] leading-none" style={{ color: project.color }}>
                  {project.code}
                </p>
                <h3 className="text-sm font-black text-on-surface leading-tight truncate font-headline mt-0.5 flex items-center gap-1.5">
                  {project.name}
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-on-surface-variant/70 group-hover:-translate-y-0.5 transition-all">
                    keyboard_arrow_up
                  </span>
                </h3>
              </div>
            </button>
            <div className="h-8 w-px bg-on-surface-variant/10 shrink-0" />
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-sm font-black text-on-surface leading-none">
                  {heroStats ? heroStats.offered.toLocaleString() : "\u2014"}
                </p>
                <p className="text-[8px] font-bold text-on-surface-variant/40 uppercase tracking-wider mt-0.5">Offered</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black leading-none" style={{ color: project.color }}>
                  {heroStats ? `${heroStats.serviceLevel}%` : "\u2014"}
                </p>
                <p className="text-[8px] font-bold text-on-surface-variant/40 uppercase tracking-wider mt-0.5">SLA</p>
              </div>
              <div className="text-right hidden lg:block">
                <p className="text-sm font-black text-on-surface leading-none">
                  {heroStats ? heroStats.answered.toLocaleString() : "\u2014"}
                </p>
                <p className="text-[8px] font-bold text-on-surface-variant/40 uppercase tracking-wider mt-0.5">Answered</p>
              </div>
            </div>
            <Link
              to={`/project/${project.id}`}
              className="shrink-0 inline-flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-opacity no-underline hover:opacity-90 shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${project.color}, color-mix(in srgb, ${project.color} 75%, #000))`,
                boxShadow: `0 4px 14px ${project.color}30`,
              }}
            >
              View
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
        ) : (
          /* Default nav (Variant A and other pages) */
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
        )}

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
