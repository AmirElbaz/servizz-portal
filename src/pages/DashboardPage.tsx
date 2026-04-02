import { Link } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { projects } from "../data/projects";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      {/* Editorial Header */}
      <header className="mb-12">
        <nav className="flex items-center gap-2 mb-6 text-[10px] font-bold text-primary uppercase tracking-widest">
          <span>Institutional Hub</span>
          <span className="material-symbols-outlined text-xs">
            chevron_right
          </span>
          <span>Project Registry</span>
        </nav>
        <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tighter text-on-surface mb-6 leading-none font-headline">
          Unified Portal <br />
          <span className="text-primary">Registry.</span>
        </h1>
        <div className="max-w-2xl">
          <p className="text-lg text-on-surface-variant font-body leading-relaxed">
            Centralized access to governmental agency projects and digital
            services. Managed through secure, high-performance integration
            protocols.
          </p>
        </div>
      </header>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {projects.map((project) => (
          <Link
            key={project.id}
            to={`/project/${project.id}`}
            className={`p-6 rounded-xl bg-white border border-slate-200 ${project.hoverBorderColor} hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.05)] transition-all group cursor-pointer flex flex-col items-center text-center no-underline`}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors"
              style={{
                backgroundColor: `${project.color}0d`,
                color: project.color,
              }}
            >
              <span
                className="material-symbols-outlined group-hover:text-white transition-colors"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {project.icon}
              </span>
            </div>
            <div className="mb-1">
              <span
                className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: project.color }}
              >
                {project.code}
              </span>
              <h3 className="font-bold text-on-surface text-sm">
                {project.name}
              </h3>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-snug">
              {project.description}
            </p>
            {/* Hover state: fill icon background */}
            <style>{`
              .group:hover [style*="background-color: ${project.color}0d"] {
                background-color: ${project.color} !important;
              }
            `}</style>
          </Link>
        ))}
      </div>

      {/* Dashboard Highlights */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Analytics Status */}
        <div className="md:col-span-2 brand-gradient rounded-2xl p-10 text-white relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <span className="text-[10px] font-bold opacity-60 uppercase tracking-[0.2em]">
              Active System Status
            </span>
            <h2 className="text-3xl lg:text-4xl font-black mt-3 tracking-tight font-headline">
              Portal Ecosystem Performance
            </h2>
            <div className="flex flex-wrap gap-12 mt-10">
              <div>
                <p className="text-5xl font-black">99.8%</p>
                <p className="text-xs opacity-70 mt-2 uppercase font-bold tracking-widest">
                  Uptime Average
                </p>
              </div>
              <div className="hidden sm:block w-px h-16 bg-white/20"></div>
              <div>
                <p className="text-5xl font-black">1.2k</p>
                <p className="text-xs opacity-70 mt-2 uppercase font-bold tracking-widest">
                  Daily API Actions
                </p>
              </div>
            </div>
          </div>
          {/* Decorative */}
          <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute top-8 right-10">
            <span className="material-symbols-outlined text-8xl opacity-10">
              hub
            </span>
          </div>
        </div>

        {/* Support Console Card */}
        <div className="bg-surface-container-low p-8 rounded-2xl flex flex-col justify-between border border-slate-200/50 shadow-sm hover:shadow-lg transition-all">
          <div>
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined">support_agent</span>
            </div>
            <h3 className="text-xl font-bold text-on-surface font-headline">
              Servizz Support
            </h3>
            <p className="text-sm text-on-surface-variant mt-3 leading-relaxed">
              Need direct assistance with any registry entity? Our agents are
              available 24/7 for technical verification.
            </p>
          </div>
          <button className="mt-8 text-primary text-sm font-bold flex items-center gap-2 hover:gap-3 transition-all group">
            Open Support Console{" "}
            <span className="material-symbols-outlined text-xs group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
