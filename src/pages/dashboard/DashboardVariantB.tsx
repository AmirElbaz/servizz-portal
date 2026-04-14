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
 * Variant B — "Horizon"
 *
 * Scroll-driven parallax hero that smoothly morphs into a sticky compact bar
 * as you scroll. Cards enter with a wave stagger. Zero wheel hijacking —
 * all animation runs off native scroll position.
 */
export default function DashboardVariantB({ projects, featuredProject, heroStats }: Props) {
  const HERO_H = 700; // total hero collapse distance in px
  const progress = useScrollProgress(HERO_H);
  const gridRef = useRef<HTMLDivElement>(null);
  const projectsSectionRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToProjects = useCallback(() => {
    const el = projectsSectionRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: y, behavior: "smooth" });
  }, []);

  // Stagger reveal for project cards
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
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [projects]);

  // Scroll-driven interpolations
  const p = progress;
  const bgShift = p * 60;
  const titleShift = -p * 140;
  const subShift = -p * 180;
  const statsShift = -p * 100;
  const logoScale = 1 - p * 0.35;
  const logoShift = -p * 90;
  const heroOpacity = Math.max(0, 1 - p * 1.1);
  const heroScale = 1 - p * 0.08;

  const isCollapsed = p > 0.5;

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <TopNavBar
        featuredProject={featuredProject}
        heroCollapsed={isCollapsed}
        heroStats={heroStats}
        showCompactHero
        onCompactClick={scrollToTop}
        onPortalsClick={scrollToTop}
        onServizzClick={scrollToProjects}
      />

      {/* ─────────────── Full Hero ─────────────── */}
      <section
        className="relative w-full"
        style={{ height: "85vh", minHeight: 600 }}
      >
        {/* Background layer (parallax slow) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            transform: `translateY(${bgShift}px) scale(${heroScale})`,
            opacity: heroOpacity,
            transformOrigin: "top center",
            willChange: "transform, opacity",
          }}
        >
          <div
            className="absolute inset-x-4 sm:inset-x-8 lg:inset-x-12 top-28 sm:top-36 bottom-6 rounded-3xl overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${featuredProject.color} 0%, color-mix(in srgb, ${featuredProject.color} 55%, #000) 100%)`,
              boxShadow: `0 30px 80px -20px ${featuredProject.color}45, 0 10px 30px -10px rgba(0,0,0,0.15)`,
            }}
          >
            {/* Grid pattern */}
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
            {/* Animated blobs */}
            <div className="absolute -top-[25%] -right-[10%] w-[55%] h-[70%] rounded-full bg-white/[0.07] blur-[120px] animate-blob1" />
            <div className="absolute -bottom-[25%] -left-[10%] w-[45%] h-[55%] rounded-full bg-black/20 blur-[100px] animate-blob2" />
            <div className="absolute top-[30%] left-[25%] w-[30%] h-[40%] rounded-full bg-white/[0.04] blur-[90px] animate-blob3" />
          </div>
        </div>

        {/* Content layer — parallax fast */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 pt-36 sm:pt-48 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-6 sm:gap-12" style={{ opacity: heroOpacity }}>
            <div className="flex-1 min-w-0">
              <p
                className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.3em] text-white/40 mb-4 animate-hero-rise-1"
                style={{ transform: `translateY(${subShift}px)` }}
              >
                {featuredProject.code} &middot; Featured Portal
              </p>
              <h1
                className="text-4xl sm:text-6xl lg:text-8xl font-black tracking-tighter font-headline leading-[0.85] text-white mb-6 animate-hero-rise-2"
                style={{ transform: `translateY(${titleShift}px)` }}
              >
                {featuredProject.name}
              </h1>
              <p
                className="text-white/45 max-w-xl leading-relaxed text-sm sm:text-base lg:text-lg mb-10 hidden sm:block animate-hero-rise-3"
                style={{ transform: `translateY(${subShift}px)`, opacity: Math.max(0, 1 - p * 2) }}
              >
                {featuredProject.fullDescription}
              </p>

              {/* Stats — parallax medium */}
              <div
                className="flex items-end gap-6 sm:gap-10 animate-hero-rise-4"
                style={{ transform: `translateY(${statsShift}px)` }}
              >
                <div>
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-none">
                    {heroStats ? heroStats.offered.toLocaleString() : "\u2014"}
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] mt-2">Offered</p>
                </div>
                <div className="w-px h-10 sm:h-12 bg-white/10" />
                <div>
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-none">
                    {heroStats ? `${heroStats.serviceLevel}%` : "\u2014"}
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] mt-2">Service Level</p>
                </div>
                <div className="w-px h-10 sm:h-12 bg-white/10 hidden sm:block" />
                <div className="hidden sm:block">
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-none">
                    {heroStats ? heroStats.answered.toLocaleString() : "\u2014"}
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] mt-2">Answered</p>
                </div>

                <Link
                  to={`/project/${featuredProject.id}`}
                  className="ml-auto hidden md:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white px-7 py-3.5 rounded-xl font-bold text-sm transition-all group no-underline border border-white/10 shadow-lg shadow-black/10"
                >
                  View Reports
                  <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </Link>
              </div>
            </div>

            {/* Logo — parallax fastest + scale */}
            <div
              className="shrink-0 hidden md:block animate-hero-rise-5"
              style={{
                transform: `translateY(${logoShift}px) scale(${logoScale})`,
                transformOrigin: "top right",
              }}
            >
              <div className="bg-white rounded-3xl p-5 lg:p-6 shadow-2xl shadow-black/20 animate-soft-float">
                <img src={featuredProject.logo} alt={featuredProject.name} className="h-24 lg:h-36 object-contain" />
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div
            className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30"
            style={{ opacity: Math.max(0, 1 - p * 3) }}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.25em]">Scroll</p>
            <span className="material-symbols-outlined text-2xl animate-bounce">expand_more</span>
          </div>
        </div>
      </section>

      {/* ─────────────── Projects Grid ─────────────── */}
      <main ref={projectsSectionRef} className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 pb-16">
        <section className="pt-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/40 mb-2">
                Servizz.gov Portals
              </p>
              <h2 className="text-2xl sm:text-3xl font-black font-headline text-on-surface tracking-tight">
                All Government Agencies
              </h2>
            </div>
          </div>

          <div
            ref={gridRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          >
            {projects.map((project, i) => {
              // Calculate row/col for wave stagger (4 cols on xl)
              const cols = 4;
              const row = Math.floor(i / cols);
              const col = i % cols;
              const delay = row * 120 + col * 60;
              return (
                <Link
                  key={project.id}
                  to={`/project/${project.id}`}
                  data-scaffold
                  className="scaffold-card group relative bg-white rounded-3xl p-6 no-underline overflow-hidden border border-on-surface-variant/5 hover:border-on-surface-variant/15 transition-all duration-500 hover:-translate-y-1.5"
                  style={{
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                    transitionDelay: `${delay}ms`,
                  }}
                >
                  {/* Top color accent */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 transition-all duration-500 group-hover:h-1.5"
                    style={{ backgroundColor: project.color }}
                  />
                  {/* Hover glow */}
                  <div
                    className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[70px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                    style={{ backgroundColor: `${project.color}20` }}
                  />
                  {/* Content */}
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-surface-container-high/60 backdrop-blur-sm flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-[-3deg]">
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

        {/* Support CTA */}
        <section className="mt-20">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-container-low to-surface-container-high p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6 border border-on-surface-variant/5">
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
