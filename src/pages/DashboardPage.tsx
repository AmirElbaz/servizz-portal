import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import TopNavBar from "../components/layout/TopNavBar";
import Footer from "../components/layout/Footer";
import { projects } from "../data/projects";

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [heroVisible, setHeroVisible] = useState(true);
  const projectsRef = useRef<HTMLDivElement>(null);
  const hasSnapped = useRef(false);
  const location = useLocation();

  const featuredProject = projects[0];

  // Restore scroll position when coming back
  useEffect(() => {
    const saved = sessionStorage.getItem("dashboard-scroll");
    if (saved && location.key !== "default") {
      const y = parseInt(saved, 10);
      if (y > 50) {
        setHeroVisible(false);
        hasSnapped.current = true;
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    }
  }, [location.key]);

  // On first scroll: snap-collapse hero and jump to projects
  useEffect(() => {
    function onScroll() {
      sessionStorage.setItem("dashboard-scroll", String(window.scrollY));

      if (!hasSnapped.current && window.scrollY > 10 && heroVisible) {
        hasSnapped.current = true;
        setHeroVisible(false);
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "auto" });
        }, 50);
      }

      // When user scrolls back to top, re-expand hero
      if (hasSnapped.current && window.scrollY === 0 && !heroVisible) {
        hasSnapped.current = false;
        setHeroVisible(true);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [heroVisible]);

  const scrollToHero = useCallback(() => {
    hasSnapped.current = false;
    setHeroVisible(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const scrollToProjects = useCallback(() => {
    if (heroVisible) {
      // Snap collapse first, then we're already at projects
      hasSnapped.current = true;
      setHeroVisible(false);
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      }, 50);
    } else {
      // Already collapsed - just scroll to top where projects are
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [heroVisible]);

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <TopNavBar
        onPortalsClick={scrollToHero}
        onServizzClick={scrollToProjects}
        heroCollapsed={!heroVisible}
        featuredProject={featuredProject}
      />

      {/* ── Hero ── */}
      <div
        className="overflow-hidden transition-all duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          maxHeight: heroVisible ? "100vh" : "0px",
        }}
      >
        <div
          className="px-6 lg:px-12 max-w-7xl mx-auto pt-28 pb-6 transition-all duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            minHeight: "calc(100vh - 2rem)",
            display: "flex",
            alignItems: "center",
            transform: heroVisible ? "scale(1) translateY(0px)" : "scale(0.15) translateY(-45vh)",
            opacity: heroVisible ? 1 : 0,
            transformOrigin: "top center",
          }}
        >
          <section
            className="relative overflow-hidden w-full transition-all duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              background: `linear-gradient(135deg, ${featuredProject.color} 0%, color-mix(in srgb, ${featuredProject.color} 65%, #000) 100%)`,
              boxShadow: `0 25px 80px -20px ${featuredProject.color}40, 0 10px 30px -10px rgba(0,0,0,0.15)`,
              borderRadius: heroVisible ? "1.5rem" : "0.75rem",
            }}
          >
            {/* Blobs */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-[30%] -right-[15%] w-[50%] h-[70%] rounded-full bg-white/[0.08] blur-[120px] animate-blob1" />
              <div className="absolute -bottom-[20%] -left-[10%] w-[40%] h-[50%] rounded-full bg-black/10 blur-[100px] animate-blob2" />
            </div>
            {/* Grid */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
                backgroundSize: "50px 50px",
              }}
            />

            <div className="relative z-10 w-full px-10 lg:px-16 py-14 lg:py-20">
              {/* Top row: text left, logo right */}
              <div className="flex items-start justify-between gap-10">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/30 mb-4">
                    {featuredProject.code} &middot; Featured Portal
                  </p>
                  <h1 className="text-5xl lg:text-7xl font-black tracking-tighter font-headline leading-[0.9] text-white mb-5">
                    {featuredProject.name}
                  </h1>
                  <p className="text-white/40 max-w-lg leading-relaxed text-base lg:text-lg">
                    {featuredProject.fullDescription}
                  </p>
                </div>
                <div className="shrink-0 bg-white/15 backdrop-blur-md rounded-2xl p-4">
                  <img
                    src={featuredProject.logo}
                    alt={featuredProject.name}
                    className="h-20 lg:h-28 object-contain drop-shadow-2xl"
                  />
                </div>
              </div>

              {/* Bottom row: stats left, button right */}
              <div className="flex items-end justify-between gap-8 mt-12">
                <div className="flex gap-10">
                  <div>
                    <p className="text-3xl lg:text-4xl font-black text-white tracking-tight">14</p>
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-1">Active Portals</p>
                  </div>
                  <div className="w-px h-12 bg-white/10" />
                  <div>
                    <p className="text-3xl lg:text-4xl font-black text-white tracking-tight">99.8%</p>
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-1">Uptime</p>
                  </div>
                  <div className="w-px h-12 bg-white/10 hidden sm:block" />
                  <div className="hidden sm:block">
                    <p className="text-3xl lg:text-4xl font-black text-white tracking-tight">1.2k</p>
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-1">Daily Calls</p>
                  </div>
                </div>
                <Link
                  to={`/project/${featuredProject.id}`}
                  className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all group no-underline border border-white/10 shrink-0 shadow-lg shadow-black/10"
                >
                  View Reports
                  <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </Link>
              </div>

              {/* Scroll hint */}
              <div className="flex justify-center mt-8 animate-bounce">
                <button onClick={scrollToProjects} className="text-white/20 hover:text-white/40 transition-colors">
                  <span className="material-symbols-outlined text-3xl">expand_more</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Projects Section ── */}
      <main className={`pb-16 px-6 lg:px-12 max-w-7xl mx-auto ${heroVisible ? "pt-6" : "pt-28"}`}>
        <section>
          <div ref={projectsRef} className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold font-headline text-on-surface tracking-tight">
              Servizz.gov
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
                  <div className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5" style={{ backgroundColor: project.color }} />
                  <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ backgroundColor: `${project.color}15` }} />
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-surface-container-high/50 backdrop-blur-sm flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110">
                      <img src={project.logo} alt={project.code} className="w-10 h-10 object-contain" />
                    </div>
                    <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] block mb-1" style={{ color: project.color }}>{project.code}</span>
                    <h3 className="font-bold text-on-surface text-[15px] mb-1.5">{project.name}</h3>
                    <p className="text-[12px] text-on-surface-variant/70 leading-relaxed">{project.description}</p>
                    <div className="mt-4 flex items-center gap-1.5 text-on-surface-variant/40 group-hover:text-on-surface transition-colors">
                      <span className="text-[11px] font-semibold">Select</span>
                      <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-1">arrow_forward</span>
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
                  <div className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 group-hover:w-1.5 rounded-l-2xl" style={{ backgroundColor: project.color }} />
                  <div className="w-12 h-12 rounded-xl bg-surface-container-high/50 backdrop-blur-sm flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110">
                    <img src={project.logo} alt={project.code} className="w-9 h-9 object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.15em]" style={{ color: project.color }}>{project.code}</span>
                      <span className="text-on-surface-variant/20">|</span>
                      <h3 className="font-bold text-on-surface text-[15px]">{project.name}</h3>
                    </div>
                    <p className="text-[12px] text-on-surface-variant/60 leading-relaxed truncate mt-0.5">{project.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-on-surface-variant/30 group-hover:text-on-surface transition-colors shrink-0">
                    <span className="text-[11px] font-semibold hidden sm:inline">Select</span>
                    <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-1">arrow_forward</span>
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
                <span className="material-symbols-outlined text-primary text-3xl">support_agent</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-on-surface font-headline">Servizz.gov Support</h3>
                <p className="text-sm text-on-surface-variant mt-1 max-w-md">
                  Need direct assistance with any registry entity? Our agents are available 24/7 for technical verification.
                </p>
              </div>
            </div>
            <button className="bg-gradient-to-r from-primary to-primary-dim text-white px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all shrink-0 shadow-lg shadow-primary/20 group">
              Open Console
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
