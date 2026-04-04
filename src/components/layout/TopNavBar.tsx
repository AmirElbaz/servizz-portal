import { Link } from "react-router-dom";
import { projects } from "../../data/projects";

interface TopNavBarProps {
  onPortalsClick?: () => void;
  onServizzClick?: () => void;
}

export default function TopNavBar({ onPortalsClick, onServizzClick }: TopNavBarProps) {
  const lastProject = projects[0];

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
              className="px-4 py-1.5 text-sm font-semibold text-primary bg-primary/8 rounded-lg transition-colors"
            >
              {lastProject.name}
            </button>
          ) : (
            <Link
              to="/dashboard"
              className="px-4 py-1.5 text-sm font-semibold text-primary bg-primary/8 rounded-lg transition-colors no-underline"
            >
              {lastProject.name}
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
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              search
            </span>
          </button>
          <button className="p-2 hover:bg-surface-container-high rounded-xl transition-colors relative">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              notifications
            </span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full"></span>
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center ml-1">
            <span className="material-symbols-outlined text-white text-[18px]">
              person
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
