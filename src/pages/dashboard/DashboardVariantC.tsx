import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import TopNavBar from "../../components/layout/TopNavBar";
import Footer from "../../components/layout/Footer";
import type { Project } from "../../data/projects";
import type { DashboardSummaryData } from "../../services/api";
import { useScrollProgress } from "../../hooks/useScrollProgress";

interface Props {
  projects: Project[];
  featuredProject: Project;
  heroStats: DashboardSummaryData | null;
}

/**
 * Variant C — "Prism"
 *
 * Glass-morphism aesthetic. Hero features huge gradient typography and
 * multiple frosted panels that blur the background. As you scroll, the hero
 * fades and scales while a translucent compact header slides in below the
 * nav. Project cards have 3D tilt-on-hover with cursor-tracking glow.
 */
export default function DashboardVariantC({ projects, featuredProject, heroStats }: Props) {
  const HERO_H = 650;
  const progress = useScrollProgress(HERO_H);
  const gridRef = useRef<HTMLDivElement>(null);
  const projectsSectionRef = useRef<HTMLElement>(null);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToProjects = useCallback(() => {
    const el = projectsSectionRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: y, behavior: "smooth" });
  }, []);

  // Stagger reveal for cards
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>("[data-scaffold]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [projects]);

  // Scroll interpolations
  const p = progress;
  const heroOpacity = Math.max(0, 1 - p * 1.2);
  const heroScale = 1 - p * 0.12;
  const heroBlur = p * 6;
  const bgShift = p * 40;

  const isCollapsed = p > 0.5;

  // 3D tilt hover handler
  function handleTilt(e: React.MouseEvent<HTMLElement>) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    card.style.transform = `perspective(1000px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg) translateY(-4px)`;
    card.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    card.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }
  function handleTiltReset(e: React.MouseEvent<HTMLElement>) {
    e.currentTarget.style.transform = "";
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen relative overflow-x-hidden">
      <TopNavBar
        featuredProject={featuredProject}
        heroCollapsed={isCollapsed}
        heroStats={heroStats}
        showCompactHero
        onCompactClick={scrollToTop}
        onPortalsClick={scrollToTop}
        onServizzClick={scrollToProjects}
      />

      {/* Ambient background — large gradient blob behind everything */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${featuredProject.color}22 0%, transparent 60%)`,
          opacity: Math.max(0.3, 1 - p * 0.6),
          transition: "opacity 200ms",
        }}
      />

      {/* ─────────────── Hero ─────────────── */}
      <section
        className="relative w-full flex items-center justify-center pt-28 sm:pt-32"
        style={{ height: "90vh", minHeight: 640 }}
      >
        {/* Decorative gradient blobs */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{
            opacity: heroOpacity,
            transform: `translateY(${bgShift}px)`,
            filter: heroBlur > 0 ? `blur(${heroBlur}px)` : undefined,
          }}
        >
          <div
            className="absolute top-[10%] -left-[10%] w-[60%] h-[70%] rounded-full opacity-50 blur-[120px] animate-blob1"
            style={{ background: `radial-gradient(circle, ${featuredProject.color} 0%, transparent 70%)` }}
          />
          <div
            className="absolute top-[30%] -right-[15%] w-[55%] h-[60%] rounded-full opacity-40 blur-[130px] animate-blob2"
            style={{ background: `radial-gradient(circle, color-mix(in srgb, ${featuredProject.color} 60%, #000) 0%, transparent 70%)` }}
          />
          <div className="absolute bottom-[5%] left-[30%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] animate-blob3" />
        </div>

        {/* Hero content */}
        <div
          className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 text-center w-full"
          style={{
            opacity: heroOpacity,
            transform: `scale(${heroScale})`,
            transformOrigin: "center center",
            willChange: "transform, opacity",
          }}
        >
          {/* Small code chip */}
          <div className="animate-hero-rise-1 inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-xl border border-white/40 shadow-lg shadow-black/5 mb-8"
            style={{ background: "rgba(255,255,255,0.6)" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: featuredProject.color, boxShadow: `0 0 12px ${featuredProject.color}` }}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/70">
              {featuredProject.code} &middot; Featured Portal
            </span>
          </div>

          {/* Giant title with gradient */}
          <h1
            className="animate-hero-rise-2 text-5xl sm:text-7xl lg:text-[8.5rem] font-black tracking-tighter font-headline leading-[0.85] mb-6"
            style={{
              backgroundImage: `linear-gradient(135deg, ${featuredProject.color} 0%, color-mix(in srgb, ${featuredProject.color} 45%, #000) 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {featuredProject.name}
          </h1>

          {/* Description */}
          <p className="animate-hero-rise-3 text-on-surface-variant/60 max-w-2xl mx-auto text-sm sm:text-base lg:text-lg leading-relaxed mb-12 hidden sm:block">
            {featuredProject.fullDescription}
          </p>

          {/* Glass stats panel */}
          <div
            className="animate-hero-rise-4 inline-flex items-center gap-3 sm:gap-5 rounded-3xl px-6 sm:px-8 py-5 backdrop-blur-2xl border border-white/50 shadow-2xl shadow-black/10 mb-10"
            style={{ background: "rgba(255,255,255,0.55)" }}
          >
            <div className="px-3 sm:px-5">
              <p className="text-2xl sm:text-4xl font-black text-on-surface tracking-tight leading-none">
                {heroStats ? heroStats.offered.toLocaleString() : "\u2014"}
              </p>
              <p className="text-[9px] sm:text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-[0.15em] mt-1.5">Offered</p>
            </div>
            <div className="w-px h-10 sm:h-12 bg-on-surface-variant/15" />
            <div className="px-3 sm:px-5">
              <p className="text-2xl sm:text-4xl font-black tracking-tight leading-none" style={{ color: featuredProject.color }}>
                {heroStats ? `${heroStats.serviceLevel}%` : "\u2014"}
              </p>
              <p className="text-[9px] sm:text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-[0.15em] mt-1.5">Service Level</p>
            </div>
            <div className="w-px h-10 sm:h-12 bg-on-surface-variant/15 hidden sm:block" />
            <div className="px-3 sm:px-5 hidden sm:block">
              <p className="text-2xl sm:text-4xl font-black text-on-surface tracking-tight leading-none">
                {heroStats ? heroStats.answered.toLocaleString() : "\u2014"}
              </p>
              <p className="text-[9px] sm:text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-[0.15em] mt-1.5">Answered</p>
            </div>
          </div>

          {/* CTA button */}
          <div className="animate-hero-rise-5">
            <Link
              to={`/project/${featuredProject.id}`}
              className="inline-flex items-center gap-2 text-white px-8 py-4 rounded-2xl font-bold text-sm transition-all group no-underline shadow-xl hover:scale-[1.03] hover:shadow-2xl"
              style={{
                background: `linear-gradient(135deg, ${featuredProject.color} 0%, color-mix(in srgb, ${featuredProject.color} 65%, #000) 100%)`,
                boxShadow: `0 12px 40px -10px ${featuredProject.color}60`,
              }}
            >
              <span className="tracking-wider uppercase text-xs">View Reports</span>
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-on-surface-variant/30"
          style={{ opacity: Math.max(0, 1 - p * 3) }}
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.25em]">Explore</p>
          <span className="material-symbols-outlined text-2xl animate-bounce">expand_more</span>
        </div>
      </section>

      {/* ─────────────── Projects Grid ─────────────── */}
      <main ref={projectsSectionRef} className="relative max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 pb-16">
        <section>
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/40 mb-2">
                Servizz.gov Portals
              </p>
              <h2 className="text-2xl sm:text-3xl font-black font-headline text-on-surface tracking-tight">
                Select a portal
              </h2>
            </div>
          </div>

          <div
            ref={gridRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          >
            {projects.map((project, i) => {
              const cols = 4;
              const row = Math.floor(i / cols);
              const col = i % cols;
              const delay = row * 120 + col * 60;
              return (
                <Link
                  key={project.id}
                  to={`/project/${project.id}`}
                  data-scaffold
                  onMouseMove={handleTilt}
                  onMouseLeave={handleTiltReset}
                  className="scaffold-card glass-tilt group relative rounded-3xl p-6 no-underline overflow-hidden border border-white/60"
                  style={{
                    transitionDelay: `${delay}ms`,
                    background: "rgba(255,255,255,0.75)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
                  }}
                >
                  {/* Cursor-tracking glow */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
                    style={{
                      background: `radial-gradient(circle 200px at var(--mx, 50%) var(--my, 50%), ${project.color}25 0%, transparent 70%)`,
                    }}
                  />
                  {/* Top gradient accent */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[3px] rounded-t-3xl"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${project.color} 50%, transparent 100%)`,
                    }}
                  />
                  <div className="relative">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, ${project.color}12 0%, ${project.color}04 100%)`,
                        border: `1px solid ${project.color}15`,
                      }}
                    >
                      <img src={project.logo} alt={project.code} className="w-11 h-11 object-contain" />
                    </div>
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-[0.2em] block mb-1.5"
                      style={{ color: project.color }}
                    >
                      {project.code}
                    </span>
                    <h3 className="font-black text-on-surface text-base mb-1.5 font-headline tracking-tight">
                      {project.name}
                    </h3>
                    <p className="text-xs text-on-surface-variant/60 leading-relaxed line-clamp-2">
                      {project.description}
                    </p>
                    <div className="mt-5 flex items-center gap-1.5 text-on-surface-variant/30 group-hover:text-on-surface transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Enter</span>
                      <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-1">arrow_forward</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Support CTA — glass */}
        <section className="mt-20">
          <div
            className="relative overflow-hidden rounded-3xl p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6 border border-white/60"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-2xl">support_agent</span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-on-surface font-headline">Need assistance?</h3>
                <p className="text-sm text-on-surface-variant/70 mt-1 max-w-md">
                  Our support team is available 24/7 to help with any portal.
                </p>
              </div>
            </div>
            <button className="bg-gradient-to-r from-primary to-primary-dim text-white px-7 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all shrink-0 shadow-lg shadow-primary/20 group">
              Open Console
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
