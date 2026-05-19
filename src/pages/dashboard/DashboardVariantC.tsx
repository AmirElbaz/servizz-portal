import { useMemo } from "react";
import { Link } from "react-router-dom";
import TopNavBar from "../../components/layout/TopNavBar";
import Footer from "../../components/layout/Footer";
import { useAuth } from "../../services/auth";
import type { FeaturedDepartment } from "../../hooks/useDashboardData";
import {
  useRecentItems,
  formatRecentAgo,
  type RecentItem,
} from "../../hooks/useRecentItems";

interface Props {
  projects: FeaturedDepartment[];
}

/**
 * Variant C — "Prism" (default)
 *
 * Glass-morphism landing. Editorial header with a personalized recent-items
 * rail, ambient brand-blue wash, glass department cards with 3D tilt and
 * icon parallax on hover. No hero, no scroll.
 */
export default function DashboardVariantC({ projects }: Props) {
  const { user } = useAuth();
  const recent = useRecentItems(4);

  const firstName = useMemo(() => {
    const src = user?.fullName ?? user?.username ?? "";
    return src.split(/[ @]/)[0] || "there";
  }, [user]);

  function handleTilt(e: React.MouseEvent<HTMLElement>) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    card.style.transform = `perspective(1000px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg) translateY(-4px)`;
    card.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    card.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    card.style.setProperty("--ix", `${-x * 6}px`);
    card.style.setProperty("--iy", `${-y * 6}px`);
  }
  function handleTiltReset(e: React.MouseEvent<HTMLElement>) {
    const card = e.currentTarget;
    card.style.transform = "";
    card.style.setProperty("--ix", "0px");
    card.style.setProperty("--iy", "0px");
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Ambient washes */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(46,178,255,0.22) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 18% 85%, rgba(45,58,72,0.10) 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-[8%] -right-[10%] w-[45%] h-[55%] rounded-full bg-primary/15 blur-[140px] animate-blob1 pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute top-[35%] -left-[10%] w-[40%] h-[50%] rounded-full bg-primary/8 blur-[130px] animate-blob2 pointer-events-none"
      />

      <TopNavBar />

      <main className="relative flex-1 flex items-center justify-center pt-24 pb-6 px-6 lg:px-12">
        <div className="w-full max-w-[90rem] mx-auto">
          {/* ─── Editorial header + Recent rail (collapses when empty) ─── */}
          <div className="flex items-stretch justify-between gap-10 mb-10">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-on-surface-variant/55 mb-3">
                Welcome back, {firstName}
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black font-headline tracking-tight text-on-surface leading-[0.95]">
                {" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, #2eb2ff 0%, #0b8dd6 100%)",
                  }}
                >
                  Departments
                </span>
              </h1>
              <p className="text-sm md:text-base text-on-surface-variant/75 mt-4 max-w-3xl leading-relaxed font-medium">
                Every department in the portal brings together its own reports,
                operational dashboards, teams, and connected services in one
                place — giving you a tailored view of the metrics, people, and
                workflows that drive that part of the business. Pick a
                department to dive into its full picture.
              </p>
            </div>

            {/* Recent-items rail — hidden entirely when there's no history
                so new users get a full-width header, not an empty placeholder. */}
            {recent.length > 0 && <RecentRail items={recent} />}
          </div>

          {/* ─── Department grid ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/department/${project.id}`}
                onMouseMove={handleTilt}
                onMouseLeave={handleTiltReset}
                className="glass-tilt group relative rounded-3xl p-7 no-underline overflow-hidden flex flex-col"
                style={{
                  background: "rgba(255,255,255,0.55)",
                  backdropFilter: "blur(28px) saturate(140%)",
                  WebkitBackdropFilter: "blur(28px) saturate(140%)",
                  border: "1px solid rgba(255,255,255,0.7)",
                  borderTop: "1px solid rgba(255,255,255,0.95)",
                  boxShadow:
                    "0 8px 32px rgba(45,58,72,0.10), 0 2px 6px rgba(45,58,72,0.06)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
                  style={{
                    background: `radial-gradient(circle 240px at var(--mx, 50%) var(--my, 50%), ${project.color}28 0%, transparent 70%)`,
                  }}
                />
                <div
                  aria-hidden
                  className="absolute top-0 left-0 right-0 h-[3px] rounded-t-3xl"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${project.color} 50%, transparent 100%)`,
                  }}
                />
                <div className="relative flex flex-col flex-1">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${project.color}18 0%, ${project.color}06 100%)`,
                      border: `1px solid ${project.color}20`,
                      transform:
                        "translate3d(var(--ix, 0px), var(--iy, 0px), 0)",
                    }}
                  >
                    {project.logo ? (
                      <img src={project.logo} alt={project.code} className="w-11 h-11 object-contain" />
                    ) : (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 32, color: project.color }}
                      >
                        {project.icon || "domain"}
                      </span>
                    )}
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

                  <ModuleCountRow dept={project} />

                  <div className="mt-auto pt-4 flex items-center gap-1.5 text-on-surface-variant/35 group-hover:text-on-surface transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Enter</span>
                    <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-1">arrow_forward</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-aware per-card count row.
 *
 * Renders a comma-separated chip for each module the department hosts, using
 * the right aggregate for that module. Falls back to nothing if the dept has
 * no enabled modules and no content yet.
 *
 * Generic for any future module: add a new `case` here and the card learns
 * to render that module's count without the caller having to change.
 */
function ModuleCountRow({ dept }: { dept: FeaturedDepartment }) {
  const chips: { icon: string; label: string }[] = [];

  const hasProjects = dept.enabledModules.includes("projects") || dept.projectCount > 0;
  const hasDirect = dept.enabledModules.includes("direct_reports") || dept.directReportCount > 0;
  const hasTemplates = dept.enabledModules.includes("templates");

  if (hasProjects) {
    chips.push({
      icon: "folder",
      label: `${dept.projectCount} ${dept.projectCount === 1 ? "project" : "projects"}`,
    });
  }
  // Prefer the distinct-across-direct+via-project total — that's the number
  // users actually want on a card. Falls back to directReportCount if the
  // backend hasn't redeployed yet (nullish coalescing handled upstream).
  if (hasDirect || hasProjects) {
    const count = dept.totalReportCount;
    if (count > 0) {
      chips.push({
        icon: "description",
        label: `${count} ${count === 1 ? "report" : "reports"}`,
      });
    }
  }
  // Templates is intentionally omitted until the backend surfaces a
  // templateCount — a count-less chip reads as a mislabeled project. When
  // the new count lands, add another `if (hasTemplates && templateCount > 0)`
  // branch here.
  void hasTemplates;

  if (chips.length === 0) return null;

  return (
    <div className="mt-4 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-on-surface-variant/55">
      {chips.map((c, i) => (
        <span key={c.icon} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-on-surface-variant/20 mr-2">·</span>}
          <span className="material-symbols-outlined text-[14px]">{c.icon}</span>
          {c.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Right-side glass rail showing the most recent module-instances the user
 * opened — reports, departments, projects, HR templates, any future module
 * kind. Hidden under `lg` to avoid crowding the header on narrow screens.
 */
function RecentRail({ items }: { items: RecentItem[] }) {
  // Caller guarantees non-empty list (we hide the rail entirely when empty),
  // so no empty-state branch here.
  return (
    <aside
      className="hidden lg:flex w-[22rem] xl:w-[26rem] shrink-0 flex-col rounded-2xl p-4 overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.7)",
        borderTop: "1px solid rgba(255,255,255,0.95)",
        boxShadow:
          "0 8px 32px rgba(45,58,72,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <div className="flex items-center justify-between mb-3 shrink-0 px-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]">history</span>
          <h3 className="eyebrow text-on-surface">Recent</h3>
        </div>
        <span className="text-[10px] font-semibold text-on-surface-variant/50">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <ul className="space-y-1 overflow-hidden">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <Link
              to={item.href}
              className="group relative flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all duration-300 no-underline hover:-translate-y-0.5"
            >
              {/* Hover wash — brand-blue tint on the row */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(46,178,255,0.10) 0%, rgba(46,178,255,0.02) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                }}
              />
              <span
                className="relative shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/15 transition-transform duration-300 group-hover:scale-110"
                aria-hidden
              >
                <span className="material-symbols-outlined text-primary text-[17px]">
                  {item.icon}
                </span>
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-on-surface truncate">
                  {item.label}
                </span>
                {item.sublabel && (
                  <span className="block text-[10px] text-on-surface-variant/50 truncate">
                    {item.sublabel}
                  </span>
                )}
              </span>
              <span className="relative shrink-0 text-[10px] font-semibold text-on-surface-variant/45 group-hover:text-on-surface-variant/80 transition-colors">
                {formatRecentAgo(item.visitedAt)}
              </span>
              <span className="relative material-symbols-outlined text-[14px] text-on-surface-variant/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
