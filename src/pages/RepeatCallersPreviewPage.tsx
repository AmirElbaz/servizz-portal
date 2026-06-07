import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import DashboardLayout from "../components/layout/DashboardLayout";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
  BreadcrumbStatic,
} from "../components/reports/ReportPageHeader";
import ChartCardBrandStrip, { type BrandScope } from "../components/reports/ChartCardBrandStrip";
import Modal from "../components/admin/Modal";
import Paginator from "../components/ui/Paginator";
import {
  fetchCatalogDepartment,
  fetchCatalogDepartmentProjects,
  getLogoUrl,
  type CatalogDepartmentSummary,
  type CatalogProject,
} from "../services/catalog";
import { toBlob as domToBlob } from "html-to-image";
import {
  fetchRepeatCallers,
  fetchRepeatCallerCalls,
  fetchRepeatCallerContacts,
  downloadRepeatCallersExport,
  type RepeatCallerRow,
  type CallRecord,
  type ContactRecord,
  type ContactFilter,
} from "../services/repeatCallers";
import { fmt } from "../utils/fmt";
import { getLogoPlate } from "../utils/logoPlate";
import { REPORT_MIN_DATE } from "../utils/reportDateRange";

// ─────────────────────────────────────────────────────────────────────────
// Repeat-Caller Analytics — the "72-hour" report (IVR & Queue metrics 3-5).
//
// Reached ONLY from within a project (project-locked) or from the Report Index
// glossary (dept-direct → project dropdown). There is intentionally no entry
// from the department landing page.
//
// The report answers, per project, for a chosen month:
//   "Of the people who phoned us, how many were sorted on the first call, and
//    how many had to ring back within 3 days?"
//
// The 72-hour (3-day) window is the RULE that decides what counts as the same
// person "coming back" — NOT a way of slicing the month into 3-day blocks. The
// reporting period is the whole month; two calls from the same number count as
// a repeat only when the second lands within 72h of a previous one (pairwise /
// from-the-previous-call — pending senior sign-off).
//
// PROJECTS are real (policy-filtered, same source as every other report). The
// METRIC numbers are live — GET /api/RepeatCallers re-aggregates
// Avaya_skillset_Historical for the chosen month, grouping calls by caller
// number per project and applying the 72h pairwise repeat rule. Rows are keyed
// by canonical projectName; projects with no calls show zeros.
// ─────────────────────────────────────────────────────────────────────────

const ACCENT = "#2EB2FF"; // Centrecom blue — page default accent

// KPI palette. Green = good outcome (sorted first time), amber = watch
// (rang back). Total/unique stay neutral-informational.
const C_TOTAL = "#2EB2FF"; // total calls
const C_UNIQUE = "#6366F1"; // unique contacts (distinct phone numbers)
const C_ONCE = "#1F7A4D"; // one-time callers (good)
const C_REPEAT = "#F59E0B"; // repeat callers (watch)

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// <input type="month"> floor — share the system-wide report date floor.
const MIN_MONTH = REPORT_MIN_DATE.slice(0, 7); // "2026-01"

// Same options every other report's table uses (Paginator).
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 30, 40, 50, 100, 200, 300, 400, 500];

// The KPI cards double as drill-down filters. `null` = the default per-project
// summary table; otherwise the card's key selects a detail view.
type CardKey = "totalCalls" | "uniqueContacts" | "oneTime" | "repeat";

const DRILL_LABEL: Record<CardKey, string> = {
  totalCalls: "All calls",
  uniqueContacts: "Unique contacts",
  oneTime: "One-time callers",
  repeat: "Repeat callers",
};

function repeatRate(r: { uniqueContacts: number; repeat: number }): number | null {
  return r.uniqueContacts > 0 ? (r.repeat / r.uniqueContacts) * 100 : null;
}

// "2026-05-12T14:33:00" → "12 May 2026 14:33" (locale-independent).
function fmtCallTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function RepeatCallersPreviewPage() {
  // Two real URL shapes resolve here (plus a legacy /preview alias):
  //   /department/:deptCode/report/repeat-callers                   → dropdown
  //   /department/:deptCode/project/:projectCode/report/repeat-...  → locked
  const { deptCode, projectCode } = useParams<{ deptCode?: string; projectCode?: string }>();
  const projectLocked = !!projectCode;

  // Department codes are stored UPPERCASE (per CLAUDE.md); legacy /preview
  // path falls back to OPS, the operation department that owns these metrics.
  const effectiveDeptCode = (deptCode ?? "OPS").toUpperCase();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState<string>(defaultMonth >= MIN_MONTH ? defaultMonth : MIN_MONTH);

  // dept-direct in-page selection ("all" = every allowed project). When the URL
  // pins a project, projectCode wins and the dropdown is hidden.
  const [helpOpen, setHelpOpen] = useState(false);
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>(projectCode ?? "all");

  // Card-as-filter drill-down. null = the per-project summary table.
  const [activeCard, setActiveCard] = useState<CardKey | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
  useEffect(() => { setSelectedProject(projectCode ?? "all"); }, [projectCode]);
  const activeProjectCode = projectCode ?? (selectedProject === "all" ? null : selectedProject);

  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [catalogProjects, setCatalogProjects] = useState<CatalogProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogDepartment(effectiveDeptCode)
      .then((d) => { if (!cancelled) setDept(d); })
      .catch(() => { /* breadcrumb falls back to the code */ });
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  useEffect(() => {
    let cancelled = false;
    setCatalogProjects(null);
    fetchCatalogDepartmentProjects(effectiveDeptCode)
      .then((ps) => { if (!cancelled) setCatalogProjects(ps); })
      .catch(() => { if (!cancelled) setCatalogProjects([]); });
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  // Live metrics keyed by canonical projectName. Dept-direct fetches ALL
  // allowed projects once per month (the "all" payload) and filters client-
  // side when a project is picked; the locked URL fetches its one project.
  const [metricsByName, setMetricsByName] = useState<Map<string, RepeatCallerRow> | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMetricsByName(null);
    setDataError(null);
    const [yy, mm] = month.split("-").map((s) => parseInt(s, 10));
    fetchRepeatCallers({ project: projectCode ?? null, year: yy, month: mm })
      .then((res) => {
        if (cancelled) return;
        setMetricsByName(new Map(res.rows.map((r) => [r.projectName, r])));
      })
      .catch((err: unknown) => {
        if (!cancelled) setDataError(err instanceof Error ? err.message : "Failed to load report data");
      });
    return () => { cancelled = true; };
  }, [projectCode, month]);

  // ── Drill-down data (loaded only when a card is active) ──
  const [detailCalls, setDetailCalls] = useState<CallRecord[]>([]);
  const [detailContacts, setDetailContacts] = useState<ContactRecord[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  // Map the active card to its endpoint + (for contacts) the filter.
  const contactFilter: ContactFilter | null =
    activeCard === "uniqueContacts" ? "all"
    : activeCard === "oneTime" ? "once"
    : activeCard === "repeat" ? "repeat"
    : null;

  useEffect(() => {
    if (!activeCard) return;
    let cancelled = false;
    setDetailLoading(true);
    setDataError(null);
    const [yy, mm] = month.split("-").map((s) => parseInt(s, 10));
    const common = { project: activeProjectCode, year: yy, month: mm, page: detailPage, pageSize: detailPageSize };
    const req = activeCard === "totalCalls"
      ? fetchRepeatCallerCalls(common).then((res) => { if (!cancelled) { setDetailCalls(res.rows); setDetailTotal(res.total); } })
      : fetchRepeatCallerContacts({ ...common, filter: contactFilter ?? "all" }).then((res) => { if (!cancelled) { setDetailContacts(res.rows); setDetailTotal(res.total); } });
    req
      .catch((err: unknown) => { if (!cancelled) setDataError(err instanceof Error ? err.message : "Failed to load records"); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCard, activeProjectCode, month, detailPage, detailPageSize]);

  // Switch card / scope / month → back to page 1.
  function selectCard(key: CardKey) {
    setActiveCard((prev) => (prev === key ? null : key));
    setDetailPage(1);
  }

  const includeProjectCol = activeProjectCode === null; // show Project column only on the all-projects view
  const detailColCount = includeProjectCol ? 4 : 3;

  // The project objects in scope: the single active one, or every allowed one.
  const scopeProjects = useMemo<CatalogProject[]>(() => {
    if (!catalogProjects) return [];
    if (activeProjectCode) return catalogProjects.filter((p) => p.code === activeProjectCode);
    return catalogProjects;
  }, [catalogProjects, activeProjectCode]);

  const activeProject = useMemo<CatalogProject | null>(
    () => (activeProjectCode ? catalogProjects?.find((p) => p.code === activeProjectCode) ?? null : null),
    [catalogProjects, activeProjectCode],
  );

  // Per-project rows — live metrics joined on projectName; absent = no calls.
  const rows = useMemo(
    () =>
      scopeProjects.map((p) => {
        const m = metricsByName?.get(p.projectName);
        return {
          project: p,
          totalCalls: m?.totalCalls ?? 0,
          uniqueContacts: m?.uniqueContacts ?? 0,
          oneTime: m?.oneTime ?? 0,
          repeat: m?.repeat ?? 0,
        };
      }),
    [scopeProjects, metricsByName],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          totalCalls: a.totalCalls + r.totalCalls,
          uniqueContacts: a.uniqueContacts + r.uniqueContacts,
          oneTime: a.oneTime + r.oneTime,
          repeat: a.repeat + r.repeat,
        }),
        { totalCalls: 0, uniqueContacts: 0, oneTime: 0, repeat: 0 },
      ),
    [rows],
  );

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.project.shortLabel || r.project.displayName || r.project.code,
        "One-time": r.oneTime,
        Repeat: r.repeat,
      })),
    [rows],
  );

  // Effective accent follows the active project's brand colour (house style),
  // dept blue otherwise.
  const accent = activeProject?.colorHex || ACCENT;

  async function handleExport(format: "excel" | "pdf") {
    if (downloading) return;
    setDownloading(format);
    try {
      const [yy, mm] = month.split("-").map((s) => parseInt(s, 10));
      const projectLabel = activeProject?.displayName ?? "All allowed projects";

      // The export mirrors the active view: summary → calls → contacts(+filter).
      const view: "summary" | "calls" | "contacts" =
        activeCard === null ? "summary" : activeCard === "totalCalls" ? "calls" : "contacts";

      let chartImages: Blob[] | undefined;
      let projectAccentBg: string | undefined;
      if (format === "pdf") {
        // The chart only exists in the summary view — capture it there only
        // (html-to-image parses Tailwind v4 oklch()/color-mix()). PDF-only.
        if (view === "summary" && chartRef.current) {
          try {
            const blob = await domToBlob(chartRef.current, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
            if (blob) chartImages = [blob];
          } catch (err) {
            console.error("[repeat-callers-pdf] chart capture failed", err);
          }
        }
        // Logo-plate background matches the on-screen tile (utils/logoPlate).
        const plate = await getLogoPlate(getLogoUrl(activeProject?.logoFilename), activeProject?.logoPlateMode);
        projectAccentBg = plate.bg;
      }

      await downloadRepeatCallersExport({
        format,
        project: activeProjectCode,
        year: yy,
        month: mm,
        view,
        filter: contactFilter ?? undefined,
        projectName: projectLabel,
        projectLogo: activeProject?.logoFilename ?? undefined,
        projectAccent: projectAccentBg,
        chartImages,
      });
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const monthLabel = `${MONTHS[(m || 1) - 1]} ${y || ""}`;
  const deptName = dept?.name ?? effectiveDeptCode;

  const headerProject =
    activeProject && activeProject.logoFilename
      ? { name: activeProject.displayName, logo: getLogoUrl(activeProject.logoFilename), logoPlateMode: activeProject.logoPlateMode }
      : null;

  const brandScope: BrandScope = activeProject
    ? {
        kind: "project",
        project: {
          name: activeProject.displayName,
          logo: getLogoUrl(activeProject.logoFilename),
          logoPlateMode: activeProject.logoPlateMode,
        },
      }
    : { kind: "dept", dept: { name: deptName, icon: dept?.icon ?? null } };

  // "Loading" = catalog projects or metrics still in flight (and no error).
  const loading = (catalogProjects === null || metricsByName === null) && !dataError;

  const KPIS = [
    { key: "totalCalls",     label: "Total calls",      value: totals.totalCalls,     color: C_TOTAL,  icon: "call",         hint: "Answered calls (excl. anonymous)" },
    { key: "uniqueContacts", label: "Unique contacts",  value: totals.uniqueContacts, color: C_UNIQUE, icon: "group",        hint: "Different phone numbers that called" },
    { key: "oneTime",        label: "One-time callers", value: totals.oneTime,        color: C_ONCE,   icon: "check_circle", hint: "Called once, didn't ring back in 72h" },
    { key: "repeat",         label: "Repeat callers",   value: totals.repeat,         color: C_REPEAT, icon: "replay",       hint: "Rang back within 72h of a prior call" },
  ] as const;

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": accent } as React.CSSProperties}>
        <ReportPageHeader
          backTo={projectCode ? `/department/${deptCode}/project/${projectCode}` : "/reports"}
          backLabel={projectCode ? "Back to Project" : "Back to Report Index"}
          project={headerProject}
          dept={{ name: deptName, icon: dept?.icon ?? null }}
          accentColor={accent}
          title="Repeat-Caller Analytics"
          subtitle={<>{deptName} · {monthLabel} · 72-hour repeat window</>}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-surface-container-high/60 text-on-surface hover:bg-surface-container-high transition-colors border border-on-surface-variant/8"
                title="What each number means"
              >
                <span className="material-symbols-outlined text-[18px]" style={{ color: accent }}>info</span>
                How to read
              </button>
              {(["excel", "pdf"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleExport(f)}
                  disabled={downloading !== null || loading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: accent, boxShadow: `0 4px 20px ${accent}25` }}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {downloading === f ? "progress_activity" : f === "excel" ? "table_view" : "picture_as_pdf"}
                  </span>
                  {downloading === f ? "Exporting…" : f === "excel" ? "Excel" : "PDF"}
                </button>
              ))}
            </div>
          }
          breadcrumb={
            <>
              <BreadcrumbLink to="/dashboard">Dashboard</BreadcrumbLink>
              <BreadcrumbChevron />
              {deptCode ? (
                <BreadcrumbLink to={`/department/${deptCode}`}>{deptName}</BreadcrumbLink>
              ) : (
                <BreadcrumbStatic>{deptName}</BreadcrumbStatic>
              )}
              {projectCode && deptCode && (
                <>
                  <BreadcrumbChevron />
                  <BreadcrumbLink to={`/department/${deptCode}/project/${projectCode}`}>
                    {activeProject?.displayName ?? projectCode.toUpperCase()}
                  </BreadcrumbLink>
                </>
              )}
              <BreadcrumbChevron />
              <BreadcrumbCurrent>Repeat Callers</BreadcrumbCurrent>
            </>
          }
        />

        {/* Filter bar — month + project */}
        <div className="mb-8 prism-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Month
              </label>
              <input
                type="month"
                value={month}
                min={MIN_MONTH}
                onChange={(e) => { setMonth(e.target.value || month); setDetailPage(1); }}
                className="h-[38px] px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent tabular-nums"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Project
              </label>
              {projectLocked ? (
                <div
                  className="w-full h-[38px] px-3 bg-surface-container-high/30 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm flex items-center gap-2"
                  title="Project is fixed by the URL — open the report from the Report Index to switch projects."
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">lock</span>
                  <span className="font-bold uppercase tracking-wide">
                    {activeProject?.displayName ?? projectCode}
                  </span>
                </div>
              ) : (
                <select
                  value={selectedProject}
                  onChange={(e) => { setSelectedProject(e.target.value); setDetailPage(1); }}
                  disabled={catalogProjects === null}
                  className="w-full h-[38px] px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value="all">
                    {catalogProjects === null
                      ? "Loading projects…"
                      : `All allowed projects${catalogProjects && catalogProjects.length > 0 ? ` (${catalogProjects.length})` : ""}`}
                  </option>
                  {(() => {
                    if (!catalogProjects || catalogProjects.length === 0) return null;
                    type Bucket = { name: string; sortOrder: number; items: CatalogProject[] };
                    const buckets = new Map<string, Bucket>();
                    for (const p of catalogProjects) {
                      const key = p.groupName ?? "__ungrouped__";
                      let b = buckets.get(key);
                      if (!b) {
                        b = { name: p.groupName ?? "Ungrouped", sortOrder: p.groupSortOrder ?? Number.MAX_SAFE_INTEGER, items: [] };
                        buckets.set(key, b);
                      }
                      b.items.push(p);
                    }
                    return [...buckets.values()]
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                      .map((bucket) => (
                        <optgroup key={bucket.name} label={bucket.name}>
                          {bucket.items.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.displayName || p.shortLabel || p.code}
                            </option>
                          ))}
                        </optgroup>
                      ));
                  })()}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {dataError && (
          <div className="mb-8 rounded-2xl border border-error/20 bg-error/8 px-5 py-4 text-sm text-error">
            <p className="font-bold mb-1">Couldn't load report data</p>
            <p className="text-[12px] text-error/80">{dataError}</p>
          </div>
        )}

        {/* KPI strip — the four headline numbers, doubling as drill-down
            filters. Click a card to see the records behind it; click the lit
            card again (or "Back to summary") to return. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {KPIS.map((k) => {
            const isActive = activeCard === k.key;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => selectCard(k.key)}
                aria-pressed={isActive}
                className="prism-surface rounded-2xl p-6 text-left card-lift transition-all focus:outline-none"
                style={isActive ? { boxShadow: `0 0 0 2px ${k.color}, 0 8px 28px ${k.color}26` } : undefined}
                title={`Show the records behind ${k.label}`}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${k.color}10`, color: k.color }}
                    >
                      <span className="material-symbols-outlined text-2xl">{k.icon}</span>
                    </div>
                    <p className="eyebrow-sm text-on-surface-variant/50">{k.label}</p>
                  </div>
                  <span
                    className="material-symbols-outlined text-[18px] shrink-0"
                    style={{ color: isActive ? k.color : "rgb(86 97 102 / 0.35)" }}
                  >
                    {isActive ? "filter_alt" : "chevron_right"}
                  </span>
                </div>
                <p className="text-3xl font-black text-on-surface tracking-tight tabular-nums">
                  {loading ? "—" : fmt.int(k.value)}
                </p>
                <p className="text-[11px] text-on-surface-variant/50 mt-1">{k.hint}</p>
              </button>
            );
          })}
        </div>

        {/* ── Plain-language explainer — "where every number comes from" ──
            Lives in a modal opened from the "How to read" header action so it
            doesn't crowd the data on first load (Amir 2026-06-03). */}
        <Modal
          open={helpOpen}
          title="How to read this report"
          onClose={() => setHelpOpen(false)}
          width="lg"
        >
          <p className="text-[13px] text-on-surface-variant/80 leading-relaxed mb-5">
            For the chosen month, we look at every <strong>answered</strong> call (one the agent actually picked
            up) from any caller phone number or ID — everything except withheld/anonymous callers — and group
            those calls by the number that dialled in. If the same number calls again
            <strong> within 3 days (72 hours)</strong> of a previous call, we treat that as the
            <em> same person coming back</em>. That single rule is what separates the four numbers below.
          </p>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div className="flex gap-3">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: C_TOTAL }} />
              <div>
                <dt className="text-[13px] font-bold text-on-surface">Total calls</dt>
                <dd className="text-[12px] text-on-surface-variant/70 leading-relaxed">
                  Every answered call from an identified caller this month — counted one by one. If one person
                  called five times, that's five calls here. This is answered call volume.
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: C_UNIQUE }} />
              <div>
                <dt className="text-[13px] font-bold text-on-surface">Unique contacts</dt>
                <dd className="text-[12px] text-on-surface-variant/70 leading-relaxed">
                  How many <em>different</em> phone numbers called. That same person who called five times
                  counts only <strong>once</strong> here. This is "how many people", not "how many calls".
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: C_ONCE }} />
              <div>
                <dt className="text-[13px] font-bold text-on-surface">One-time callers</dt>
                <dd className="text-[12px] text-on-surface-variant/70 leading-relaxed">
                  People who called and <strong>did not</strong> need to ring back within 3 days. Usually the
                  good outcome — their matter was likely handled on the first call.
                </dd>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: C_REPEAT }} />
              <div>
                <dt className="text-[13px] font-bold text-on-surface">Repeat callers</dt>
                <dd className="text-[12px] text-on-surface-variant/70 leading-relaxed">
                  People who <strong>called again within 3 days</strong> of an earlier call. Worth watching —
                  ringing back so soon often means the first call didn't fully resolve their issue.
                </dd>
              </div>
            </div>
          </dl>

          <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mt-5 pt-4 border-t border-on-surface-variant/8">
            <strong>The maths ties together:</strong> One-time callers + Repeat callers = Unique contacts (every
            person is one or the other). Total calls is always equal to or larger than Unique contacts, because
            repeat callers contribute more than one call.
          </p>
        </Modal>

        {activeCard === null ? (
          <>
            {/* Chart — one-time vs repeat, per project (grouped). Captured into
                the PDF export via chartRef. Summary view only. */}
            <div ref={chartRef} className="prism-surface rounded-2xl p-6 mb-8">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">Who came back, by project</h3>
                <p className="text-[11px] text-on-surface-variant/50">
                  {monthLabel} · each bar is that project's unique contacts, split into one-time (green) and repeat (amber)
                </p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} tickFormatter={fmt.compact} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                    formatter={(value, name) => [fmt.int(Number(value)), String(name)]}
                  />
                  <Legend iconType="circle" iconSize={9} />
                  {/* Grouped (side-by-side) bars — one-time vs repeat read as two
                      distinct bars per project, not stacked. */}
                  <Bar dataKey="One-time" fill={C_ONCE} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="Repeat" fill={C_REPEAT} radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
              <ChartCardBrandStrip scope={brandScope} accentColor={accent} />
            </div>

            {/* Per-project breakdown table */}
            <div className="prism-surface rounded-2xl overflow-hidden mb-6">
              <table className="tbl">
                <thead>
                  <tr className="bg-surface-container-high/30">
                    <th className="tbl-th">Project</th>
                    <th className="tbl-th text-right">Total calls</th>
                    <th className="tbl-th text-right">Unique contacts</th>
                    <th className="tbl-th text-right">One-time</th>
                    <th className="tbl-th text-right">Repeat</th>
                    <th className="tbl-th text-right">Repeat rate</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="tbl-tr">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="tbl-td">
                            <div className={`h-4 rounded bg-surface-container-high/50 animate-pulse ${j === 0 ? "w-32" : "ml-auto w-16"}`} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">
                      No projects available for your access.
                    </td></tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.project.code} className="tbl-tr">
                        <td className="tbl-td-strong">{r.project.displayName || r.project.code}</td>
                        <td className="tbl-td-num">{fmt.int(r.totalCalls)}</td>
                        <td className="tbl-td-num">{fmt.int(r.uniqueContacts)}</td>
                        <td className="tbl-td-num" style={{ color: C_ONCE }}>{fmt.int(r.oneTime)}</td>
                        <td className="tbl-td-num" style={{ color: C_REPEAT }}>{fmt.int(r.repeat)}</td>
                        <td className="tbl-td-num">{fmt.pctFromPercent(repeatRate(r))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && rows.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2" style={{ borderColor: `${accent}40` }}>
                      <td className="tbl-td-strong" style={{ color: accent }}>All projects</td>
                      <td className="tbl-td-num" style={{ color: accent }}>{fmt.int(totals.totalCalls)}</td>
                      <td className="tbl-td-num" style={{ color: accent }}>{fmt.int(totals.uniqueContacts)}</td>
                      <td className="tbl-td-num" style={{ color: C_ONCE }}>{fmt.int(totals.oneTime)}</td>
                      <td className="tbl-td-num" style={{ color: C_REPEAT }}>{fmt.int(totals.repeat)}</td>
                      <td className="tbl-td-num">{fmt.pctFromPercent(repeatRate(totals))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Drill-down: back affordance + record count */}
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveCard(null)}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back to summary
              </button>
              <p className="text-[12px] text-on-surface-variant/60">
                {DRILL_LABEL[activeCard]} · {monthLabel}
                {detailLoading ? " · loading…" : ` · ${fmt.int(detailTotal)} records`}
              </p>
            </div>

            {/* Detail table */}
            <div className="prism-surface rounded-2xl overflow-hidden mb-4">
              <table className="tbl">
                {activeCard === "totalCalls" ? (
                  <>
                    <thead>
                      <tr className="bg-surface-container-high/30">
                        {includeProjectCol && <th className="tbl-th">Project</th>}
                        <th className="tbl-th">Caller phone number or ID</th>
                        <th className="tbl-th">Skillset</th>
                        <th className="tbl-th">Call time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLoading ? (
                        <tr><td colSpan={detailColCount} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">Loading…</td></tr>
                      ) : detailCalls.length === 0 ? (
                        <tr><td colSpan={detailColCount} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">No calls in this period.</td></tr>
                      ) : (
                        detailCalls.map((c, i) => (
                          <tr key={i} className="tbl-tr">
                            {includeProjectCol && <td className="tbl-td">{c.projectName}</td>}
                            <td className="tbl-td-strong tabular-nums">{c.caller}</td>
                            <td className="tbl-td">{c.skillset || "—"}</td>
                            <td className="tbl-td tabular-nums">{fmtCallTime(c.callTime)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr className="bg-surface-container-high/30">
                        {includeProjectCol && <th className="tbl-th">Project</th>}
                        <th className="tbl-th">Caller phone number or ID</th>
                        <th className="tbl-th text-right"># Calls</th>
                        <th className="tbl-th">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLoading ? (
                        <tr><td colSpan={detailColCount} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">Loading…</td></tr>
                      ) : detailContacts.length === 0 ? (
                        <tr><td colSpan={detailColCount} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">No contacts in this period.</td></tr>
                      ) : (
                        detailContacts.map((c, i) => (
                          <tr key={i} className="tbl-tr">
                            {includeProjectCol && <td className="tbl-td">{c.projectName}</td>}
                            <td className="tbl-td-strong tabular-nums">{c.caller}</td>
                            <td className="tbl-td-num">{fmt.int(c.callCount)}</td>
                            <td className="tbl-td">
                              <span
                                className="inline-flex items-center gap-1.5 text-[12px] font-bold"
                                style={{ color: c.isRepeat ? C_REPEAT : C_ONCE }}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.isRepeat ? C_REPEAT : C_ONCE }} />
                                {c.isRepeat ? "Repeat" : "One-time"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </>
                )}
              </table>
            </div>

            {detailTotal > 0 && (
              <div className="mb-8">
                <Paginator
                  totalItems={detailTotal}
                  currentPage={detailPage}
                  pageSize={detailPageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setDetailPage}
                  onPageSizeChange={setDetailPageSize}
                  accentColor={accent}
                />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
