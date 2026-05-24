import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import BackLink from "../ui/BackLink";
import DepartmentIcon from "../DepartmentIcon";
import { onProjectLogoError } from "../../services/catalog";
import { useLogoPlate } from "../../utils/logoPlate";

// Shared header for every report-style page (ReportViewPage, IVR previews,
// Hourly distribution, future report pages). Renders the BackLink, the
// breadcrumb the caller composes, and a title row with an identity tile —
// project logo when project-scoped, department icon as fallback for
// dept-direct URLs.
//
// Tile placement is RESPONSIVE on purpose:
//   - Desktop (≥ sm): 96px square in the right-side cluster, between the
//     title block (which takes flex-1) and the action buttons. A thin
//     vertical divider sits between the tile and the buttons so the eye
//     reads "title  |  identity + actions" as two groups, not a stranded
//     middle tile.
//   - Mobile (< sm): the column stacks. A 56px tile renders inline-left of
//     the title (keeps the stack tight); the actions row drops below.
//
// Two tile elements are rendered (mobile hidden on desktop, desktop hidden
// on mobile) so the layout can pivot cleanly across breakpoints without
// flex-order acrobatics. Same image source either way — preloading is
// negligible.
//
// Keeping this in one component prevents drift across pages and gives every
// future report the same identity treatment for free.
//
// Usage:
//   <ReportPageHeader
//     backTo={`/department/${dept.code}`}
//     backLabel="Back to Department"
//     project={project ?? null}
//     dept={dept}
//     accentColor={accent.color}
//     breadcrumb={
//       <>
//         <BreadcrumbLink to="/dashboard">Dashboard</BreadcrumbLink>
//         <BreadcrumbChevron />
//         <BreadcrumbLink to={`/department/${dept.code}`}>{dept.name}</BreadcrumbLink>
//         <BreadcrumbChevron />
//         <BreadcrumbCurrent>IVR Funnel</BreadcrumbCurrent>
//       </>
//     }
//     title="IVR Funnel"
//     subtitle={<>{dept.name} · {label}</>}
//     actions={<>{exportButtons}</>}
//   />

type IdentityProject =
  | {
      name: string;
      logo: string;
      // Per-project DB override (avaya_projects.logo_plate_mode). Optional —
      // callers that don't pass it get the brightness auto-analysis.
      logoPlateMode?: "dark" | "light" | null;
    }
  | null
  | undefined;
type IdentityDept = { icon: string | null; name: string } | null | undefined;

interface ReportPageHeaderProps {
  // BackLink rendered above the header. Pass null to suppress.
  backTo: string | null;
  backLabel?: string;

  // Identity tile source. Project logo takes priority; falls back to dept
  // icon for dept-direct URLs. If neither is provided the tile is hidden.
  project?: IdentityProject;
  dept?: IdentityDept;

  // Drives the tile's accent shadow. Use the page's effective accent
  // (project color, IVR-bundle accent, etc).
  accentColor: string;

  // Breadcrumb composed by caller — typically a chain of <Link> + chevron
  // span + final highlighted span. The caller owns the routing decisions.
  breadcrumb: ReactNode;

  // Title text. Subtitle is a slot so callers can mix in inline status
  // ("Loading…", "Live data", etc.) without string interpolation.
  title: string;
  subtitle?: ReactNode;

  // Optional right-side actions (Excel / PDF export buttons, etc.). When
  // omitted the title gets the full width.
  actions?: ReactNode;
}

export default function ReportPageHeader({
  backTo,
  backLabel = "Back",
  project,
  dept,
  accentColor,
  breadcrumb,
  title,
  subtitle,
  actions,
}: ReportPageHeaderProps) {
  const hasIdentityTile = Boolean(project || dept);
  const identityName = project?.name ?? dept?.name ?? "";
  // Project tiles sit on a tile chosen from the logo's own brightness (dark
  // slate for light/white logos, white for dark ones) — never the accent,
  // so it can't blend into the mark. Dept tiles keep white: DepartmentIcon
  // is already accent-colored and reads fine there.
  const projectPlate = useLogoPlate(project?.logo, project?.logoPlateMode);
  const tileBg = project ? projectPlate.bg : "#ffffff";

  const tileInner = project ? (
    <img
      src={project.logo}
      onError={onProjectLogoError}
      alt={project.name}
      className="w-full h-full object-contain"
    />
  ) : dept ? (
    <DepartmentIcon
      icon={dept.icon}
      size={48}
      symbolStyle={{ color: accentColor }}
    />
  ) : null;

  return (
    <>
      {backTo && <BackLink to={backTo} label={backLabel} />}

      <div className="mb-8">
        <nav className="flex items-center gap-2 mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
          {breadcrumb}
        </nav>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* Mobile-only inline tile (56px). Hidden at sm+ where the
                bigger desktop tile renders on the right. */}
            {hasIdentityTile && (
              <div
                className="sm:hidden w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center p-2 border border-on-surface-variant/8"
                style={{ backgroundColor: tileBg, boxShadow: `0 4px 20px ${accentColor}25` }}
              >
                {tileInner}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tighter font-headline text-on-surface">
                {title}
              </h1>
              {subtitle && (
                <p className="text-on-surface-variant/60 text-sm mt-1">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Desktop-only right cluster: 80/96px identity tile + inline name
              label, divider, actions. Drops to mobile inline layout above
              when stacked. */}
          <div className="hidden sm:flex items-center gap-5 shrink-0">
            {hasIdentityTile && (
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="w-20 h-20 lg:w-24 lg:h-24 shrink-0 rounded-2xl flex items-center justify-center p-3 border border-on-surface-variant/10 ring-1 ring-white/60"
                  style={{ backgroundColor: tileBg, boxShadow: `0 8px 28px ${accentColor}33` }}
                >
                  {tileInner}
                </div>
                {identityName && (
                  <span className="text-sm font-bold uppercase tracking-wider text-on-surface-variant/80 whitespace-nowrap">
                    {identityName}
                  </span>
                )}
              </div>
            )}
            {hasIdentityTile && actions && (
              <div
                className="h-12 w-px shrink-0"
                style={{ backgroundColor: "rgb(0 0 0 / 0.08)" }}
                aria-hidden="true"
              />
            )}
            {actions && <div>{actions}</div>}
          </div>

          {/* Mobile-only actions row — appears below the title/logo block. */}
          {actions && (
            <div className="sm:hidden w-full">{actions}</div>
          )}
        </div>
      </div>
    </>
  );
}

// Small breadcrumb building blocks so callers don't repeat the styling.
// Exported alongside the header so they live in one mental place.

export function BreadcrumbLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50"
    >
      {children}
    </Link>
  );
}

export function BreadcrumbStatic({ children }: { children: ReactNode }) {
  return <span className="text-on-surface-variant/50">{children}</span>;
}

export function BreadcrumbChevron() {
  return (
    <span className="material-symbols-outlined text-xs">chevron_right</span>
  );
}

export function BreadcrumbCurrent({ children }: { children: ReactNode }) {
  return <span className="text-accent">{children}</span>;
}
