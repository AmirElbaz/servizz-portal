import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import DashboardLayout from "../components/layout/DashboardLayout";
import BackLink from "../components/ui/BackLink";
import {
  fetchIvrTrendComparison,
  downloadIvrTrendExport,
  type IvrComparison,
  type IvrGranularity,
  type IvrLaneCode,
  type IvrLaneData,
  type IvrTrendComparisonResponse,
} from "../services/ivrTrends";
import {
  fetchCatalogDepartment,
  fetchCatalogDepartmentProjects,
  type CatalogDepartmentSummary,
  type CatalogProject,
} from "../services/catalog";

const ACCENT = "#2EB2FF";
const AUTO_COLOR = "#9F7AEA";

type Lane = IvrLaneCode;
type ChartFilter = "offered" | "auto" | "all";

const ALL_LANES: IvrComparison[] = ["yoy1", "yoy2", "yoy3"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const LANE_META: Record<Lane, { color: string; dash: string; width: number }> = {
  current: { color: ACCENT,    dash: "0",   width: 2.5 },
  yoy1:    { color: "#7CC8E8", dash: "4 2", width: 2   },
  yoy2:    { color: "#A6D5E8", dash: "2 2", width: 1.8 },
  yoy3:    { color: "#C9E1EC", dash: "1 3", width: 1.5 },
};

function pctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function formatMaybeNumber(val: number | null): string {
  return val == null ? "—" : val.toLocaleString();
}

export default function IvrTrendComparisonPreviewPage() {
  // Three URL shapes resolve to this component (see App.tsx):
  //   1. /preview/ivr-trend-comparison           → both params undefined
  //   2. /department/:deptCode/report/ivr-...    → deptCode set, no project
  //   3. /department/:deptCode/project/:projectCode/report/ivr-...
  //                                              → both set, project locked
  // When projectCode is present we hide the project dropdown and pin the
  // filter to the URL value — same behavior as ReportViewPage.
  const { deptCode, projectCode } = useParams<{ deptCode?: string; projectCode?: string }>();
  const projectLocked = !!projectCode;

  const today = new Date();
  const [comparisons, setComparisons] = useState<Set<IvrComparison>>(new Set(["yoy1"]));
  const [project, setProject] = useState<string>(projectCode ?? "all");
  const [chartFilter, setChartFilter] = useState<ChartFilter>("offered");
  // View mode controls both the anchor picker and the pivot/chart shape:
  //   "month" → month picker; pivot is days × N years; chart shows daily.
  //   "year"  → year picker; pivot is months × N years; chart shows monthly.
  const [viewMode, setViewMode] = useState<IvrGranularity>("month");
  // Download state — disables the buttons while a request is in-flight so
  // double-clicks don't pile up parallel exports.
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

  // Sync the local project state when the URL changes (back/forward
  // navigation between project-scoped and dept-direct shapes).
  useEffect(() => {
    setProject(projectCode ?? "all");
  }, [projectCode]);

  // Catalog state — for the project dropdown (when not URL-locked) and the
  // breadcrumb dept-name. The page lives under OPS by design; if the URL
  // doesn't carry a deptCode (legacy /preview path) we fall back to "OPS".
  // Department codes are stored UPPERCASE in the catalog (per CLAUDE.md),
  // so we normalize to upper rather than lower — passing lowercase made
  // the catalog query miss and returned an empty project list.
  const effectiveDeptCode = (deptCode ?? "OPS").toUpperCase();
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [catalogProjects, setCatalogProjects] = useState<CatalogProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogDepartment(effectiveDeptCode)
      .then((d) => { if (!cancelled) setDept(d); })
      .catch(() => { /* breadcrumb falls back to deptCode.toUpperCase() */ });
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  useEffect(() => {
    // No need to fetch the project list when the URL has already locked
    // the report to one project — the dropdown is hidden in that case.
    if (projectLocked) return;
    let cancelled = false;
    setCatalogProjects(null);
    fetchCatalogDepartmentProjects(effectiveDeptCode)
      .then((ps) => { if (!cancelled) setCatalogProjects(ps); })
      .catch(() => { if (!cancelled) setCatalogProjects([]); });
    return () => { cancelled = true; };
  }, [effectiveDeptCode, projectLocked]);
  // Anchor month/year drive every backend query. Default to today; the
  // <input type="month"> keeps year and month in sync via a single ISO
  // string ("YYYY-MM"). The backend re-derives the comparison-year ranges
  // from these — no extra plumbing needed.
  const [anchorYear, setAnchorYear] = useState<number>(today.getFullYear());
  const [anchorMonth, setAnchorMonth] = useState<number>(today.getMonth() + 1); // 1-12

  const [data, setData] = useState<IvrTrendComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active comparisons preserve fixed yoy1 → yoy2 → yoy3 order regardless
  // of click order, so the legend / chart series colors stay consistent.
  const activeComparisons: IvrComparison[] = useMemo(
    () => ALL_LANES.filter((l) => comparisons.has(l)),
    [comparisons],
  );

  // Memoize the request key so the effect doesn't re-fire when the Set
  // identity changes but the payload doesn't.
  const requestKey = useMemo(
    () => `${project}|${anchorYear}-${anchorMonth}|${viewMode}|${activeComparisons.join(",")}`,
    [project, anchorYear, anchorMonth, viewMode, activeComparisons],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIvrTrendComparison({
      project: project === "all" ? null : project,
      year: anchorYear,
      month: anchorMonth,
      comparisons: activeComparisons,
      granularity: viewMode,
    })
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load IVR trend data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // requestKey captures the payload identity; eslint can't see that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  async function handleExport(format: "excel" | "pdf") {
    if (downloading) return;
    setDownloading(format);
    try {
      const projectLabel =
        project === "all"
          ? "All allowed projects"
          : catalogProjects?.find((p) => p.code === project)?.displayName ?? project;
      await downloadIvrTrendExport({
        format,
        project: project === "all" ? null : project,
        year: anchorYear,
        month: anchorMonth,
        comparisons: activeComparisons,
        granularity: viewMode,
        projectName: projectLabel,
      });
    } catch (err) {
      // Surface in the same banner the comparison fetch uses, since the
      // export shares the same auth + policy gates.
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  const lanesByCode = useMemo(() => {
    if (!data) return null;
    const m: Partial<Record<Lane, IvrLaneData>> = {};
    for (const ld of data.lanes) m[ld.code] = ld;
    return m as Record<Lane, IvrLaneData>;
  }, [data]);

  // Render order — current first, then comparisons (only those the API
  // actually returned, in the canonical order).
  const activeLanes: Lane[] = useMemo(() => {
    if (!lanesByCode) return [];
    const lanes: Lane[] = lanesByCode.current ? ["current"] : [];
    for (const c of activeComparisons) {
      if (lanesByCode[c]) lanes.push(c);
    }
    return lanes;
  }, [lanesByCode, activeComparisons]);

  // Build chart data — one row per bucket (day in month-mode, month in
  // year-mode), columns per (lane × metric). Take the longest array as
  // the x-axis length so a partial current period doesn't truncate the
  // comparison years' lines.
  const chartData = useMemo(() => {
    if (!lanesByCode || activeLanes.length === 0) return [];
    if (viewMode === "year") {
      // 12 monthly buckets per lane.
      return Array.from({ length: 12 }, (_, i) => {
        const point: Record<string, string | number | null> = { label: MONTHS[i] };
        for (const lane of activeLanes) {
          const m = lanesByCode[lane].monthly[i];
          if (!m) continue;
          if (chartFilter === "offered" || chartFilter === "all") {
            point[`${lane}__Offered`] = m.offered;
          }
          if (chartFilter === "auto" || chartFilter === "all") {
            point[`${lane}__Auto`] = m.auto;
          }
        }
        return point;
      });
    }
    const maxDays = Math.max(...activeLanes.map((l) => lanesByCode[l].daily.length));
    return Array.from({ length: maxDays }, (_, i) => {
      const point: Record<string, string | number | null> = { label: `D${i + 1}` };
      for (const lane of activeLanes) {
        const day = lanesByCode[lane].daily[i];
        if (!day) continue;
        if (chartFilter === "offered" || chartFilter === "all") {
          point[`${lane}__Offered`] = day.offered;
        }
        if (chartFilter === "auto" || chartFilter === "all") {
          point[`${lane}__Auto`] = day.auto;
        }
      }
      return point;
    });
  }, [lanesByCode, activeLanes, chartFilter, viewMode]);

  const hasComparison = activeLanes.length > 1;

  const toggleComparison = (l: IvrComparison) => {
    const next = new Set(comparisons);
    if (next.has(l)) next.delete(l);
    else next.add(l);
    setComparisons(next);
  };

  const deltaBarData = useMemo(() => {
    if (!hasComparison || !lanesByCode) return [];
    const metrics: { key: "totalOffered" | "totalAuto"; label: string }[] = [
      { key: "totalOffered", label: "Offered" },
      { key: "totalAuto", label: "Auto" },
    ];
    return metrics.map(({ key, label }) => {
      const point: Record<string, string | number | null> = { name: label };
      const current = lanesByCode.current?.[key] ?? null;
      for (const lane of activeLanes) {
        if (lane === "current") continue;
        const prior = lanesByCode[lane]?.[key] ?? null;
        const pct = pctChange(current, prior);
        // Recharts can't render a missing bar with nice empty styling, so
        // 0 is the visual stand-in. The tooltip surfaces "—" for null.
        point[lane] = pct ?? 0;
        point[`${lane}__raw`] = pct;
      }
      return point;
    });
  }, [activeLanes, hasComparison, lanesByCode]);

  const chartSeries = useMemo(() => {
    const series: { lane: Lane; metric: "Offered" | "Auto"; key: string }[] = [];
    for (const lane of activeLanes) {
      if (chartFilter === "offered" || chartFilter === "all") {
        series.push({ lane, metric: "Offered", key: `${lane}__Offered` });
      }
      if (chartFilter === "auto" || chartFilter === "all") {
        series.push({ lane, metric: "Auto", key: `${lane}__Auto` });
      }
    }
    return series;
  }, [activeLanes, chartFilter]);

  function strokeFor(lane: Lane, metric: "Offered" | "Auto"): string {
    if (metric === "Auto") {
      if (lane === "current") return AUTO_COLOR;
      if (lane === "yoy1")    return "#B49AE0";
      if (lane === "yoy2")    return "#CDBAEC";
      return "#E0D2F4";
    }
    return LANE_META[lane].color;
  }

  function laneYearLabel(lane: Lane): string {
    return lanesByCode?.[lane]?.year.toString() ?? "—";
  }

  const currentMonthIndex = data ? data.currentMonth - 1 : 3; // fallback April for the loading-state header

  // Back-link / breadcrumb destinations differ per URL shape.
  const backTo =
    projectCode && deptCode ? `/department/${deptCode}/project/${projectCode}`
    : deptCode               ? `/department/${deptCode}`
    :                          "/dashboard";
  const backLabel = projectCode ? "Back to Project" : deptCode ? "Back to Department" : "Back to Dashboard";

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": ACCENT } as React.CSSProperties}>
        <BackLink to={backTo} label={backLabel} />

        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
            <Link to="/dashboard" className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50">
              Dashboard
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            {deptCode ? (
              <Link
                to={`/department/${deptCode}`}
                className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50"
              >
                {dept?.name ?? deptCode.toUpperCase()}
              </Link>
            ) : (
              <span className="text-on-surface-variant/50">{dept?.name ?? "Operation"}</span>
            )}
            {projectCode && deptCode && (() => {
              const proj = catalogProjects?.find((p) => p.code === projectCode);
              const projLabel = proj?.displayName ?? projectCode.toUpperCase();
              return (
                <>
                  <span className="material-symbols-outlined text-xs">chevron_right</span>
                  <Link
                    to={`/department/${deptCode}/project/${projectCode}`}
                    className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50"
                  >
                    {projLabel}
                  </Link>
                </>
              );
            })()}
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-accent">IVR Trend &amp; Comparison</span>
          </nav>

          <div className="flex flex-col sm:flex-row items-start justify-between gap-4 sm:gap-6">
            <div>
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tighter font-headline text-on-surface">
                IVR Trend &amp; Comparison
              </h1>
              <p className="text-on-surface-variant/60 text-sm mt-1">
                {dept?.name ?? "Operation"} ·{" "}
                {viewMode === "year" ? `${anchorYear}` : `${MONTHS[anchorMonth - 1]} ${anchorYear}`} ·{" "}
                {loading ? "Loading…" : data ? "Live data" : error ? "Error" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleExport("excel")}
                disabled={downloading !== null || loading || !data}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {downloading === "excel" ? "hourglass_top" : "table_view"}
                </span>
                {downloading === "excel" ? "Exporting…" : "Excel"}
              </button>
              <button
                type="button"
                onClick={() => handleExport("pdf")}
                disabled={downloading !== null || loading || !data}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {downloading === "pdf" ? "hourglass_top" : "picture_as_pdf"}
                </span>
                {downloading === "pdf" ? "Exporting…" : "PDF"}
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-8 prism-surface rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                View
              </label>
              <div className="flex rounded-xl overflow-hidden border border-on-surface-variant/8">
                {(["month", "year"] as IvrGranularity[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setViewMode(m)}
                    className={`py-2 px-4 text-xs font-semibold capitalize transition-colors ${
                      viewMode === m ? "bg-accent text-white" : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                {viewMode === "year" ? "Year" : "Month"}
              </label>
              {viewMode === "month" ? (
                <input
                  type="month"
                  value={`${anchorYear}-${String(anchorMonth).padStart(2, "0")}`}
                  max={`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`}
                  onChange={(e) => {
                    const v = e.target.value; // "YYYY-MM"
                    if (!v) return;
                    const [yStr, mStr] = v.split("-");
                    const y = parseInt(yStr, 10);
                    const mm = parseInt(mStr, 10);
                    if (!Number.isNaN(y) && !Number.isNaN(mm) && mm >= 1 && mm <= 12) {
                      setAnchorYear(y);
                      setAnchorMonth(mm);
                    }
                  }}
                  className="py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent"
                  style={{ colorScheme: "light" }}
                />
              ) : (
                // Free-input year (per Amir's pick) — typed as a number,
                // clamped to a sane range so accidental typos don't fire
                // a query for year 22026.
                <input
                  type="number"
                  min={2000}
                  max={today.getFullYear()}
                  value={anchorYear}
                  onChange={(e) => {
                    const y = parseInt(e.target.value, 10);
                    if (!Number.isNaN(y) && y >= 2000 && y <= today.getFullYear()) {
                      setAnchorYear(y);
                    }
                  }}
                  className="w-[110px] py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent tabular-nums"
                />
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Compare against
              </label>
              <div className="flex gap-2">
                {ALL_LANES.map((l, i) => {
                  const checked = comparisons.has(l);
                  return (
                    <button
                      key={l}
                      onClick={() => toggleComparison(l)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        checked
                          ? "bg-accent text-white border-transparent"
                          : "bg-surface-container-high/50 text-on-surface-variant border-on-surface-variant/8 hover:bg-surface-container-high"
                      }`}
                    >
                      {i + 1}y ago
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Project
              </label>
              {projectLocked ? (
                // Locked badge — same surface treatment as the dropdown
                // so it doesn't shift the row's vertical rhythm. Indicates
                // visually that the project came from the URL rather than
                // the user's choice.
                <div
                  className="w-full py-2 px-3 bg-surface-container-high/30 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm flex items-center gap-2"
                  title="Project is fixed by the URL — open the report from the department to switch projects."
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">
                    lock
                  </span>
                  <span className="font-bold tabular-nums uppercase tracking-wide">
                    {projectCode}
                  </span>
                </div>
              ) : (
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  disabled={catalogProjects === null}
                  className="w-full py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value="all">
                    {catalogProjects === null
                      ? "Loading projects…"
                      : `All allowed projects${catalogProjects.length > 0 ? ` (${catalogProjects.length})` : ""}`}
                  </option>
                  {(() => {
                    if (!catalogProjects || catalogProjects.length === 0) return null;
                    // Group by project_groups.name. Projects without a group
                    // collect under "Ungrouped". Named groups sort by their
                    // group_sort_order; "Ungrouped" is pinned last.
                    type Bucket = { name: string; sortOrder: number; items: typeof catalogProjects };
                    const buckets = new Map<string, Bucket>();
                    for (const p of catalogProjects) {
                      const key = p.groupName ?? "__ungrouped__";
                      let b = buckets.get(key);
                      if (!b) {
                        b = {
                          name: p.groupName ?? "Ungrouped",
                          sortOrder: p.groupSortOrder ?? Number.MAX_SAFE_INTEGER,
                          items: [],
                        };
                        buckets.set(key, b);
                      }
                      b.items.push(p);
                    }
                    const sorted = [...buckets.values()].sort(
                      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
                    );
                    return sorted.map((bucket) => (
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-on-surface-variant/6 text-[11px]">
            <span className="text-on-surface-variant/50 font-bold uppercase tracking-widest">Resolved:</span>
            {activeLanes.length === 0 ? (
              <span className="text-on-surface-variant/40 italic">{loading ? "Fetching…" : "No data"}</span>
            ) : (
              activeLanes.map((lane) => (
                <span
                  key={lane}
                  className={`px-2 py-0.5 rounded-md font-medium ${
                    lane === "current" ? "text-accent" : "bg-surface-container-high text-on-surface-variant/80"
                  }`}
                  style={lane === "current" ? { backgroundColor: `${ACCENT}15` } : undefined}
                >
                  {!data
                    ? "—"
                    : viewMode === "year"
                    ? laneYearLabel(lane)
                    : `${MONTHS[data.currentMonth - 1]} ${laneYearLabel(lane)}`}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-8 rounded-2xl border border-rose-300/50 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <p className="font-bold mb-1">Couldn't load IVR trend data</p>
            <p className="text-[12px] text-rose-600/80">{error}</p>
            <p className="text-[11px] text-rose-600/60 mt-2">
              Make sure migration <code>018_reports_category_column.sql</code> has been applied
              and the API has been restarted.
            </p>
          </div>
        )}

        {/* KPI strip — Offered + Auto, both always shown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {(["Offered", "Auto"] as const).map((metric) => {
            const key: "totalOffered" | "totalAuto" = metric === "Offered" ? "totalOffered" : "totalAuto";
            const current = lanesByCode?.current?.[key] ?? null;
            const color = metric === "Offered" ? ACCENT : AUTO_COLOR;
            const icon = metric === "Offered" ? "call" : "smart_toy";
            return (
              <div key={metric} className="prism-surface rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}15`, color }}
                  >
                    <span className="material-symbols-outlined text-xl">{icon}</span>
                  </div>
                  <p className="eyebrow-sm text-on-surface-variant/50">
                    {metric === "Auto" ? "Auto-handled" : "Offered"}
                  </p>
                </div>
                <p className="text-2xl font-black text-on-surface tracking-tight tabular-nums">
                  {loading && current == null ? "—" : formatMaybeNumber(current)}
                </p>
                {hasComparison && (
                  <div className="mt-3 flex flex-col gap-1">
                    {activeLanes.filter((l) => l !== "current").map((lane) => {
                      const prior = lanesByCode?.[lane]?.[key] ?? null;
                      const pct = pctChange(current, prior);
                      const tone = pct == null ? "flat" : pct > 0.1 ? "good" : pct < -0.1 ? "bad" : "flat";
                      const colorClass =
                        tone === "good" ? "text-emerald-600" :
                        tone === "bad"  ? "text-rose-600"    :
                                          "text-on-surface-variant/60";
                      const arrow =
                        tone === "good" ? "trending_up" :
                        tone === "bad"  ? "trending_down" :
                                          "trending_flat";
                      const text = pct == null ? "—" : pct === 0 ? "±0%" : `${pct > 0 ? "+" : ""}${pct}%`;
                      return (
                        <div key={lane} className="flex items-center gap-1.5 text-[11px]">
                          <span className={`material-symbols-outlined text-sm ${colorClass}`}>{arrow}</span>
                          <span className={`font-bold ${colorClass}`}>{text}</span>
                          <span className="text-on-surface-variant/50">vs {laneYearLabel(lane)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          <div className="lg:col-span-3 prism-surface rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                  {viewMode === "year" ? "Monthly" : "Daily"} trend — {chartFilter === "all" ? "Offered & Auto" : chartFilter === "auto" ? "Auto" : "Offered"}
                </h3>
                <p className="text-[11px] text-on-surface-variant/50">
                  {hasComparison
                    ? `Current ${viewMode === "year" ? "year" : "month"} vs ${activeLanes.length - 1} comparison${activeLanes.length - 1 > 1 ? "s" : ""}`
                    : `Current ${viewMode === "year" ? "year" : "month"} only — pick a comparison year above`}
                </p>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-on-surface-variant/8 shrink-0">
                {(["offered", "auto", "all"] as ChartFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setChartFilter(f)}
                    className={`py-1.5 px-3 text-[11px] font-semibold capitalize transition-colors ${
                      chartFilter === f ? "bg-accent text-white" : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} />
                <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => {
                    const k = name as string;
                    const [lane, metric] = k.split("__") as [Lane, "Offered" | "Auto"];
                    if (value == null) return ["—", `${metric} · ${laneYearLabel(lane)}`];
                    return [Number(value).toLocaleString("en"), `${metric} · ${laneYearLabel(lane)}`];
                  }}
                />
                <Legend
                  iconType="line"
                  iconSize={10}
                  formatter={(v: string) => {
                    const [lane, metric] = v.split("__") as [Lane, "Offered" | "Auto"];
                    return (
                      <span style={{ fontSize: 11, color: "#566166" }}>
                        {metric} · {laneYearLabel(lane)}
                      </span>
                    );
                  }}
                />
                {chartSeries.map(({ lane, metric, key }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    stroke={strokeFor(lane, metric)}
                    strokeWidth={LANE_META[lane].width}
                    strokeDasharray={metric === "Auto" ? "3 3" : LANE_META[lane].dash}
                    dot={false}
                    connectNulls={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-2 prism-surface rounded-2xl p-6">
            {hasComparison ? (
              <>
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                  % change vs comparison
                </h3>
                <p className="text-[11px] text-on-surface-variant/50 mb-4">
                  {viewMode === "year" ? "Year-to-date totals" : "Month-to-date totals"}
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={deltaBarData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                        fontSize: 12,
                      }}
                      formatter={(value, name, payload) => {
                        const lane = name as Lane;
                        const raw = (payload?.payload as Record<string, unknown> | undefined)?.[`${lane}__raw`];
                        const display = raw == null ? "—" : `${value}%`;
                        return [display, `vs ${laneYearLabel(lane)}`];
                      }}
                    />
                    {activeLanes.filter((l) => l !== "current").map((lane) => (
                      <Bar
                        key={lane}
                        dataKey={lane}
                        fill={LANE_META[lane].color}
                        name={lane}
                        radius={[0, 6, 6, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                  Auto share
                </h3>
                <p className="text-[11px] text-on-surface-variant/50 mb-4">
                  Auto-handled as a fraction of offered ({viewMode === "year" ? "year-to-date" : "current month so far"})
                </p>
                <div className="flex items-center justify-center h-[200px]">
                  <div className="text-center">
                    {(() => {
                      const off = lanesByCode?.current?.totalOffered ?? null;
                      const auto = lanesByCode?.current?.totalAuto ?? null;
                      if (off == null || auto == null || off === 0) {
                        return (
                          <p className="text-5xl font-black tabular-nums" style={{ color: AUTO_COLOR }}>—</p>
                        );
                      }
                      return (
                        <>
                          <p className="text-5xl font-black tabular-nums" style={{ color: AUTO_COLOR }}>
                            {Math.round((auto / off) * 1000) / 10}%
                          </p>
                          <p className="text-[11px] text-on-surface-variant/50 mt-3">
                            {auto.toLocaleString()} auto / {off.toLocaleString()} offered
                          </p>
                        </>
                      );
                    })()}
                    <p className="text-[11px] text-on-surface-variant/40 mt-2">
                      Pick a comparison year above to see deltas
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pivot tables — two stacked tables, always both visible. Chart filter does NOT control these.
            Column shape adapts to view mode:
              year-mode  → 12 month columns (Jan–Dec) × N year rows
              month-mode → daily columns (Day 1..N) × N year rows for the same month each year */}
        {(() => {
          // Compute the column set once per view mode so both tables share it.
          //   year-mode columns: { key, label, isHighlight }
          //     - 12 entries, one per month
          //     - highlight = the anchor month
          //   month-mode columns:
          //     - up to max(daysInMonth across active lanes) — usually 28–31
          //     - highlight = "today" if current lane's month is the present month
          const cols: { key: string; label: string; highlight: boolean }[] = [];
          if (viewMode === "year") {
            for (let i = 0; i < 12; i++) {
              cols.push({
                key: `m${i + 1}`,
                label: MONTHS[i],
                highlight: i === currentMonthIndex,
              });
            }
          } else if (lanesByCode) {
            const maxDays = Math.max(
              ...activeLanes.map((l) => lanesByCode[l].daily.length),
              0,
            );
            const todayDay = today.getDate();
            const isCurrentMonth =
              data?.currentYear === today.getFullYear() &&
              data?.currentMonth === today.getMonth() + 1;
            for (let i = 0; i < maxDays; i++) {
              cols.push({
                key: `d${i + 1}`,
                label: `${i + 1}`,
                highlight: isCurrentMonth && i + 1 === todayDay,
              });
            }
          }

          return (["Offered", "Auto"] as const).map((metric) => {
            const accentColor = metric === "Offered" ? ACCENT : AUTO_COLOR;
            const icon = metric === "Offered" ? "call" : "smart_toy";
            const title = metric === "Offered" ? "Offered" : "Auto-handled";
            const sourceLabel =
              metric === "Offered"
                ? "Source: Avaya_skillset_Historical · per-project skillsets"
                : "Source: avaya_routes_historical · SUM(RouteAccess) per project's routes";
            const fieldKey: "offered" | "auto" = metric === "Offered" ? "offered" : "auto";
            const headlineSuffix =
              viewMode === "year"
                ? "Year-over-year monthly comparison"
                : `Day-by-day comparison · ${MONTHS[anchorMonth - 1]}`;

            // Per-lane cell value lookup. In year-mode, look up by month
            // number; in month-mode, by day number. Both arrays are kept
            // aligned by their natural index, but we look up by the actual
            // field for safety against sparse responses.
            const getCellValue = (lane: IvrLaneData, colIndex: number): number | null => {
              if (viewMode === "year") {
                const entry = lane.monthly.find((e) => e.month === colIndex + 1);
                return entry ? entry[fieldKey] : null;
              }
              const day = lane.daily.find((e) => e.day === colIndex + 1);
              return day ? day[fieldKey] : null;
            };

            return (
              <div key={metric} className="prism-surface rounded-2xl overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-on-surface-variant/6">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                    >
                      <span className="material-symbols-outlined text-base">{icon}</span>
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface font-headline">
                        {title} — {headlineSuffix}
                      </h3>
                      <p className="text-[10px] text-on-surface-variant/50 mt-0.5 uppercase tracking-widest">
                        {sourceLabel}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-container-high/30">
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 sticky left-0 bg-surface-container-high/80 backdrop-blur-sm">
                          Year
                        </th>
                        {cols.map((col) => (
                          <th
                            key={col.key}
                            className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-right ${
                              col.highlight ? "text-accent" : "text-on-surface-variant/60"
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeLanes.length === 0 || cols.length === 0 ? (
                        <tr>
                          <td colSpan={cols.length + 1} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">
                            {loading ? "Loading…" : error ? "Couldn't load data — see banner above." : "No data."}
                          </td>
                        </tr>
                      ) : (
                        activeLanes.map((lane) => {
                          const ld = lanesByCode![lane];
                          const isCurrent = lane === "current";
                          return (
                            <tr
                              key={lane}
                              className={`border-t border-on-surface-variant/4 hover:bg-surface-container-low/40 transition-colors ${
                                isCurrent ? "bg-accent/5" : ""
                              }`}
                            >
                              <td
                                className={`px-4 py-2.5 text-[12px] font-bold whitespace-nowrap sticky left-0 backdrop-blur-sm ${
                                  isCurrent ? "bg-accent/10 text-accent" : "bg-surface text-on-surface"
                                }`}
                              >
                                <div>{ld.year}</div>
                                <div className="text-[10px] font-normal text-on-surface-variant/50 mt-0.5">
                                  {isCurrent ? "Current" : `${ALL_LANES.indexOf(lane as IvrComparison) + 1}y ago`}
                                </div>
                              </td>
                              {cols.map((col, i) => {
                                const val = getCellValue(ld, i);
                                return (
                                  <td
                                    key={col.key}
                                    className={`px-3 py-2.5 text-[12px] tabular-nums text-right whitespace-nowrap text-on-surface ${
                                      col.highlight ? "font-bold" : "font-medium"
                                    }`}
                                  >
                                    {val == null
                                      ? <span className="text-on-surface-variant/30">—</span>
                                      : val.toLocaleString()}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          });
        })()}

        <p className="text-[11px] text-on-surface-variant/50 text-center mb-6">
          Live data · <code className="font-mono text-on-surface-variant/70">/api/IvrTrends/comparison</code>
        </p>
      </div>
    </DashboardLayout>
  );
}
