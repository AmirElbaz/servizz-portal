import { useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { projects } from "../data/projects";

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <DashboardLayout>
      {/* ── Hero Section ── */}
      <section className="mb-16">
        <div className="relative overflow-hidden rounded-3xl bg-dark-bg px-10 lg:px-16 py-16 lg:py-20">
          {/* Blobs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-[30%] -right-[15%] w-[50%] h-[70%] rounded-full bg-primary/20 blur-[120px] animate-blob1" />
            <div className="absolute -bottom-[20%] -left-[10%] w-[40%] h-[50%] rounded-full bg-tertiary/15 blur-[100px] animate-blob2" />
          </div>
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
          />
          <div className="relative z-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/30 mb-6">
              Institutional Hub &middot; Project Registry
            </p>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter font-headline leading-[0.95] mb-6">
              <span className="text-white">Unified Portal</span>
              <br />
              <span className="gradient-text">Registry.</span>
            </h1>
            <p className="text-white/40 text-lg max-w-xl leading-relaxed">
              Centralized access to governmental agency projects and digital
              services. Managed through secure, high-performance integration
              protocols.
            </p>
            {/* Stats row */}
            <div className="flex gap-12 mt-12">
              <div>
                <p className="text-4xl font-black text-white tracking-tight">
                  14
                </p>
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-1">
                  Active Portals
                </p>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div>
                <p className="text-4xl font-black text-white tracking-tight">
                  99.8%
                </p>
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-1">
                  Uptime Average
                </p>
              </div>
              <div className="w-px h-12 bg-white/10 hidden sm:block" />
              <div className="hidden sm:block">
                <p className="text-4xl font-black text-white tracking-tight">
                  1.2k
                </p>
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-1">
                  Daily API Calls
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Projects Grid ── */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold font-headline text-on-surface tracking-tight">
            All Portals
          </h2>
          <div className="flex items-center gap-1 bg-surface-container-high/60 rounded-xl p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <span className="material-symbols-outlined text-[20px]">grid_view</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <span className="material-symbols-outlined text-[20px]">view_list</span>
            </button>
          </div>
        </div>

        {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/project/${project.id}`}
              className="group relative bg-white rounded-2xl p-6 no-underline card-lift overflow-hidden border border-transparent hover:border-on-surface-variant/10"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              {/* Accent strip at top */}
              <div
                className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5"
                style={{ backgroundColor: project.color }}
              />

              {/* Hover glow */}
              <div
                className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ backgroundColor: `${project.color}15` }}
              />

              <div className="relative">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110"
                  style={{
                    backgroundColor: `${project.color}10`,
                    color: project.color,
                  }}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {project.icon}
                  </span>
                </div>

                <span
                  className="text-[9px] font-extrabold uppercase tracking-[0.15em] block mb-1"
                  style={{ color: project.color }}
                >
                  {project.code}
                </span>
                <h3 className="font-bold text-on-surface text-[15px] mb-1.5">
                  {project.name}
                </h3>
                <p className="text-[12px] text-on-surface-variant/70 leading-relaxed">
                  {project.description}
                </p>

                {/* Arrow */}
                <div className="mt-4 flex items-center gap-1.5 text-on-surface-variant/40 group-hover:text-on-surface transition-colors">
                  <span className="text-[11px] font-semibold">Explore</span>
                  <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/project/${project.id}`}
              className="group relative bg-white rounded-2xl p-5 no-underline card-lift overflow-hidden border border-transparent hover:border-on-surface-variant/10 flex items-center gap-5"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              {/* Accent strip on left */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover:w-1.5 rounded-l-2xl"
                style={{ backgroundColor: project.color }}
              />

              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${project.color}10`,
                  color: project.color,
                }}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {project.icon}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-extrabold uppercase tracking-[0.15em]"
                    style={{ color: project.color }}
                  >
                    {project.code}
                  </span>
                  <span className="text-on-surface-variant/20">|</span>
                  <h3 className="font-bold text-on-surface text-[15px]">
                    {project.name}
                  </h3>
                </div>
                <p className="text-[12px] text-on-surface-variant/60 leading-relaxed truncate mt-0.5">
                  {project.description}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-on-surface-variant/30 group-hover:text-on-surface transition-colors shrink-0">
                <span className="text-[11px] font-semibold hidden sm:inline">Explore</span>
                <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </div>
            </Link>
          ))}
        </div>
        )}
      </section>

      {/* ── Support CTA ── */}
      <section className="mt-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-container-low to-surface-container-high p-10 lg:p-14 flex flex-col md:flex-row items-center justify-between gap-8 border border-on-surface-variant/5">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-3xl">
                support_agent
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-on-surface font-headline">
                Servizz Support
              </h3>
              <p className="text-sm text-on-surface-variant mt-1 max-w-md">
                Need direct assistance with any registry entity? Our agents are
                available 24/7 for technical verification.
              </p>
            </div>
          </div>
          <button className="bg-gradient-to-r from-primary to-primary-dim text-white px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all shrink-0 shadow-lg shadow-primary/20 group">
            Open Console
            <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </button>
        </div>
      </section>
    </DashboardLayout>
  );
}
