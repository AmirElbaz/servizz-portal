import { Link } from "react-router-dom";

export default function TopNavBar() {
  return (
    <header className="bg-white/90 backdrop-blur-xl fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16 border-b border-slate-100">
      <div className="flex items-center gap-8">
        <Link
          to="/dashboard"
          className="text-xl font-bold tracking-tighter text-slate-900 font-headline"
        >
          Centercom | Servizz
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/dashboard"
            className="text-primary font-semibold border-b-2 border-primary py-5 transition-colors"
          >
            Portals
          </Link>
          <a
            href="#"
            className="text-slate-600 hover:text-slate-900 py-5 transition-colors"
          >
            Services
          </a>
          <a
            href="#"
            className="text-slate-600 hover:text-slate-900 py-5 transition-colors"
          >
            Directories
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
            search
          </span>
          <input
            className="bg-surface-container-high border-none rounded-full pl-10 pr-4 py-1.5 text-sm w-64 focus:ring-2 focus:ring-primary/20 focus:outline-none"
            placeholder="Search services..."
            type="text"
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors opacity-80">
            <span className="material-symbols-outlined text-on-surface-variant">
              notifications
            </span>
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-container overflow-hidden ml-2 ring-1 ring-outline-variant/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">
              account_circle
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
