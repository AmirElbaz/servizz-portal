import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toBlob as domToBlob } from "html-to-image";
import DashboardLayout from "../components/layout/DashboardLayout";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
  BreadcrumbStatic,
} from "../components/reports/ReportPageHeader";
import ChartCardBrandStrip, { type BrandScope } from "../components/reports/ChartCardBrandStrip";
import Segmented from "../components/ui/Segmented";
import {
  fetchIvrTrendComparison,
  downloadIvrTrendExport,
  type IvrComparison,
  type IvrGranularity,
  type IvrLaneData,
  type IvrTrendComparisonResponse,
  type FetchIvrTrendsParams,
} from "../services/ivrTrends";
import {
  fetchCatalogDepartment,
  fetchCatalogDepartmentProjects,
  getLogoUrl,
  type CatalogDepartmentSummary,
  type CatalogProject,
} from "../services/catalog";
import { fmt } from "../utils/fmt";
import { getLogoPlate } from "../utils/logoPlate";

// Metric accents — must agree with the backend export (OfferedHex /
// AnsweredHex / AutoHex in IvrTrendsExportService) so the PDF table column
// colours match the on-screen lines.
const ACCENT = "#2EB2FF";          // Offered
const ANSWERED_COLOR = "#1F7A4D";  // Answered (agent-handled)
const AUTO_COLOR = "#9F7AEA";      // Auto-handled

// Comparison line colours encode the PERIOD (A vs B), not the metric — each
// metric gets its own chart, so both periods read the same across all three.
// Kept in lockstep with the backend export (PeriodAHex / PeriodBHex).
const PERIOD_A_COLOR = "#2EB2FF";  // period A line (Centrecom blue)
const PERIOD_B_COLOR = "#F59E0B";  // period B line (amber — distinct from every metric hue)

// Date floor for THIS report only. The system-wide floor is 2026-01-01
// (REPORT_MIN_YEAR, see CLAUDE.md / reportDateRange.ts), but the IVR trend
// report is explicitly allowed back to 2025 — there IS 2025 IVR data and
// Amir wants year-over-year reach. Scoped here on purpose; do NOT lower the
// shared constant, which would un-floor every other report page.
const IVR_MIN_YEAR = 2025;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Mode = "trend" | "comparison";
type View = "monthly" | "weekly";
type MetricKey = "offered" | "answered" | "auto";

const METRICS: { key: MetricKey; label: string; color: string; icon: string }[] = [
  { key: "offered",  label: "Offered",      color: ACCENT,         icon: "call" },
  { key: "answered", label: "Answered",     color: ANSWERED_COLOR, icon: "call_received" },
  { key: "auto",     label: "Auto-handled", color: AUTO_COLOR,     icon: "smart_toy" },
];

// 53 ISO weeks when Jan 1 is Thursday, or a leap year whose Jan 1 is
// Wednesday; otherwise 52. Mirrors .NET ISOWeek.GetWeeksInYear on the backend.
function isoWeeksInYear(year: number): number {
  const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1Day === 4 || (isLeap && jan1Day === 3) ? 53 : 52;
}

// Canonical ISO 8601 week number for a date.
function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function fmtVal(v: number | null | undefined): string {
  return v == null ? "—" : fmt.int(v);
}

// % change of A relative to B. sign drives the up/down colour.
function deltaPct(a: number | null, b: number | null): { text: string; sign: number } {
  if (a == null || b == null || b === 0) return { text: "—", sign: 0 };
  const pct = ((a - b) / b) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, sign: a >= b ? 1 : -1 };
}

// Up/down delta colour, from the app's success/error tokens (not the metric
// hues). Neutral (sign 0) inherits the surrounding text colour.
function deltaTone(sign: number): string | undefined {
  return sign > 0 ? "var(--color-success)" : sign < 0 ? "var(--color-error)" : undefined;
}

// Only metrics where "higher = better" get the green-up / red-down value
// judgement: call volume (Offered) and successful handling (Answered). For
// Auto-handled (IVR deflection) a rise isn't unambiguously good or bad, so we
// keep its delta neutral — the arrow still shows direction, the colour just
// doesn't assert a verdict the data can't support.
const VOLUME_METRICS = new Set<MetricKey>(["offered", "answered"]);
function metricDeltaTone(key: MetricKey, sign: number): string | undefined {
  return VOLUME_METRICS.has(key) ? deltaTone(sign) : undefined;
}

export default function IvrTrendComparisonPreviewPage() {
  // Three URL shapes resolve to this component (see App.tsx):
  //   1. /preview/ivr-trend-comparison           → both params undefined
  //   2. /department/:deptCode/report/ivr-...    → deptCode set, no project
  //   3. /department/:deptCode/project/:projectCode/report/ivr-...
  //                                              → both set, project locked
  const { deptCode, projectCode } = useParams<{ deptCode?: string; projectCode?: string }>();
  const projectLocked = !!projectCode;

  const today = new Date();
  const curYear = Math.max(IVR_MIN_YEAR, today.getFullYear());
  const curMonth = today.getMonth() + 1;
  const curWeek = getIsoWeek(today);
  const prevYear = Math.max(IVR_MIN_YEAR, curYear - 1);

  const [project, setProject] = useState<string>(projectCode ?? "all");
  const [mode, setMode] = useState<Mode>("trend");
  const [view, setView] = useState<View>("monthly");
  const [trendYear, setTrendYear] = useState<number>(curYear);
  // Comparison periods. `unit` is a month (1-12) in monthly view, an ISO week
  // number in weekly view — reinterpreted whenever the view toggles.
  // Comparison = two periods (A vs B), each a from–to SPAN in the current
  // grain (months in Monthly view, ISO weeks in Weekly). Plotted as two
  // coloured lines per metric; KPIs/table sum each span. Units re-base when
  // the grain toggles (a month number is meaningless as a week number).
  const [aYear, setAYear] = useState<number>(curYear);
  const [aFrom, setAFrom] = useState<number>(1);
  const [aTo, setATo] = useState<number>(curMonth);
  const [bYear, setBYear] = useState<number>(prevYear);
  const [bFrom, setBFrom] = useState<number>(1);
  const [bTo, setBTo] = useState<number>(curMonth);
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

  // Chart cards captured into the PDF export. Trend shows two cards
  // (Offered+Answered, Auto); comparison shows one line card per metric.
  const chart1Ref = useRef<HTMLDivElement | null>(null);
  const chart2Ref = useRef<HTMLDivElement | null>(null);
  const cmpOfferedRef = useRef<HTMLDivElement | null>(null);
  const cmpAnsweredRef = useRef<HTMLDivElement | null>(null);
  const cmpAutoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setProject(projectCode ?? "all");
  }, [projectCode]);

  // Switching grain re-bases both comparison spans to "start-of-year → now"
  // in the new grain (a month number is meaningless as a week number).
  function changeView(v: View) {
    setView(v);
    const to = v === "weekly" ? curWeek : curMonth;
    setAFrom(1); setATo(to);
    setBFrom(1); setBTo(to);
  }

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = curYear; y >= IVR_MIN_YEAR; y--) out.push(y);
    return out;
  }, [curYear]);

  function unitOptions(year: number): { value: number; label: string }[] {
    if (view === "weekly") {
      return Array.from({ length: isoWeeksInYear(year) }, (_, i) => ({
        value: i + 1,
        label: `W${i + 1}`,
      }));
    }
    return MONTHS.map((m, i) => ({ value: i + 1, label: m }));
  }

  // Short bucket label in the current grain (axis ticks).
  const unitShort = (unit: number) => (view === "weekly" ? `W${unit}` : MONTHS[unit - 1]);

  // "Jan–May 2025" (monthly) or "W3–W20 2025" (weekly); collapses to one unit
  // when from === to.
  const rangeLabel = (from: number, to: number, year: number) => {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    return lo === hi ? `${unitShort(lo)} ${year}` : `${unitShort(lo)}–${unitShort(hi)} ${year}`;
  };

  // Department codes are stored UPPERCASE in the catalog (per CLAUDE.md);
  // legacy /preview path falls back to OPS.
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
    let cancelled = false;
    setCatalogProjects(null);
    fetchCatalogDepartmentProjects(effectiveDeptCode)
      .then((ps) => { if (!cancelled) setCatalogProjects(ps); })
      .catch(() => { if (!cancelled) setCatalogProjects([]); });
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  const [data, setData] = useState<IvrTrendComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Brand-strip data owner: a specific project when picked, otherwise the dept.
  const brandScope: BrandScope = useMemo(() => {
    if (project !== "all") {
      const cp = catalogProjects?.find((p) => p.code.toLowerCase() === project);
      if (cp) {
        return {
          kind: "project",
          project: { name: cp.displayName, logo: getLogoUrl(cp.logoFilename), logoPlateMode: cp.logoPlateMode },
        };
      }
      return { kind: "project", project: { name: project.toUpperCase() } };
    }
    return {
      kind: "dept",
      dept: { name: dept?.name ?? effectiveDeptCode, icon: dept?.icon ?? null },
    };
  }, [project, catalogProjects, dept, effectiveDeptCode]);

  // Fetch. Trend → one anchor year. Comparison → anchor (max of A/B) plus YoY
  // offset lanes so both calendar years come back in one round trip.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Grain follows the View toggle in both modes (comparison plots its
    // lines at the selected grain too).
    const granularity: IvrGranularity = view === "weekly" ? "week" : "year";
    let params: FetchIvrTrendsParams;
    if (mode === "comparison") {
      const anchor = Math.max(aYear, bYear);
      const comparisons = Array.from(new Set([aYear, bYear]))
        .filter((y) => y !== anchor)
        .map((y) => anchor - y)
        .filter((off) => off >= 1 && off <= 3)
        .map((off) => `yoy${off}` as IvrComparison);
      params = { project: project === "all" ? null : project, year: anchor, comparisons, granularity };
    } else {
      params = { project: project === "all" ? null : project, year: trendYear, granularity };
    }

    fetchIvrTrendComparison(params)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load IVR trend data");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project, mode, view, trendYear, aYear, bYear]);

  const currentLane: IvrLaneData | null = useMemo(() => {
    if (!data) return null;
    return data.lanes.find((l) => l.code === "current") ?? data.lanes[0] ?? null;
  }, [data]);

  const laneByYear = (year: number): IvrLaneData | null =>
    data?.lanes.find((l) => l.year === year) ?? null;

  // ── Trend-mode buckets (months or ISO weeks) ──
  const trendBuckets = useMemo(() => {
    if (!currentLane) return [] as { label: string; Offered: number | null; Answered: number | null; Auto: number | null }[];
    if (view === "weekly") {
      return currentLane.weekly.map((w) => ({
        label: `W${w.week}`, Offered: w.offered, Answered: w.answered, Auto: w.auto,
      }));
    }
    return currentLane.monthly.map((m) => ({
      label: MONTHS[m.month - 1], Offered: m.offered, Answered: m.answered, Auto: m.auto,
    }));
  }, [currentLane, view]);

  // Sum the *displayed* buckets so the KPI cards and the table footer always
  // equal the visible rows — and match the backend export, which also sums
  // buckets (monthly or weekly) rather than the lane's year total.
  const trendTotals = useMemo(() => {
    if (!currentLane) return { offered: null, answered: null, auto: null };
    return {
      offered: trendBuckets.reduce((s, b) => s + (b.Offered ?? 0), 0),
      answered: trendBuckets.reduce((s, b) => s + (b.Answered ?? 0), 0),
      auto: trendBuckets.reduce((s, b) => s + (b.Auto ?? 0), 0),
    };
  }, [currentLane, trendBuckets]);

  // ── Comparison-mode span aggregation ──
  // One bucket's value for a metric (month or ISO week), grain-aware.
  function bucketVal(lane: IvrLaneData | null, unit: number, k: MetricKey): number | null {
    if (!lane) return null;
    if (view === "weekly") return lane.weekly.find((x) => x.week === unit)?.[k] ?? null;
    return lane.monthly.find((x) => x.month === unit)?.[k] ?? null;
  }

  // Sum a from–to span (grain-aware) for each metric. All-null buckets → null;
  // otherwise missing buckets count as 0. Feeds the KPI cards + table.
  function sumSpan(lane: IvrLaneData | null, from: number, to: number): Record<MetricKey, number | null> {
    if (!lane) return { offered: null, answered: null, auto: null };
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const units: number[] = [];
    for (let u = lo; u <= hi; u++) units.push(u);
    const sum = (k: MetricKey) => {
      const vals = units.map((u) => bucketVal(lane, u, k));
      return vals.every((v) => v == null) ? null : vals.reduce((s: number, v) => s + (v ?? 0), 0);
    };
    return { offered: sum("offered"), answered: sum("answered"), auto: sum("auto") };
  }

  const A = useMemo(() => sumSpan(laneByYear(aYear), aFrom, aTo), [data, aYear, aFrom, aTo, view]);
  const B = useMemo(() => sumSpan(laneByYear(bYear), bFrom, bTo), [data, bYear, bFrom, bTo, view]);
  const aLabel = rangeLabel(aFrom, aTo, aYear);
  const bLabel = rangeLabel(bFrom, bTo, bYear);

  // Line-overlay series for one metric: Period A and Period B aligned by
  // relative position within each span, x-labelled by the longer span's
  // buckets (period A's where they exist). One chart per metric.
  function compareSeries(k: MetricKey): { label: string; A: number | null; B: number | null }[] {
    const laneA = laneByYear(aYear), laneB = laneByYear(bYear);
    const loA = Math.min(aFrom, aTo), hiA = Math.max(aFrom, aTo);
    const loB = Math.min(bFrom, bTo), hiB = Math.max(bFrom, bTo);
    const n = Math.max(hiA - loA + 1, hiB - loB + 1);
    const out: { label: string; A: number | null; B: number | null }[] = [];
    for (let i = 0; i < n; i++) {
      const uA = loA + i, uB = loB + i;
      out.push({
        label: uA <= hiA ? unitShort(uA) : unitShort(uB),
        A: uA <= hiA ? bucketVal(laneA, uA, k) : null,
        B: uB <= hiB ? bucketVal(laneB, uB, k) : null,
      });
    }
    return out;
  }

  const cmpSeries = useMemo(() => ({
    offered:  compareSeries("offered"),
    answered: compareSeries("answered"),
    auto:     compareSeries("auto"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, aYear, bYear, aFrom, aTo, bFrom, bTo, view]);

  async function handleExport(format: "excel" | "pdf") {
    if (downloading) return;
    setDownloading(format);
    try {
      const cp = project === "all"
        ? null
        : catalogProjects?.find((p) => p.code === project) ?? null;
      const projectLabel = cp?.displayName ?? (project === "all" ? "All allowed projects" : project);
      const projectLogo = cp?.logoFilename ?? undefined;
      const plate = await getLogoPlate(getLogoUrl(cp?.logoFilename), cp?.logoPlateMode);

      let chartImages: Blob[] | undefined;
      if (format === "pdf") {
        // Capture the cards the current mode actually renders: 2 in trend,
        // one line card per metric in comparison.
        const refs = mode === "comparison"
          ? [cmpOfferedRef, cmpAnsweredRef, cmpAutoRef]
          : [chart1Ref, chart2Ref];
        const nodes = refs.map((r) => r.current).filter(
          (el): el is HTMLDivElement => el !== null,
        );
        const blobs: Blob[] = [];
        for (const node of nodes) {
          try {
            // html-to-image (not html2canvas) — parses Tailwind v4 oklch()
            // and color-mix() the older lib choked on.
            const blob = await domToBlob(node, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
            if (blob) blobs.push(blob);
          } catch (err) {
            console.error("[ivr-pdf-export] chart capture failed", err);
          }
        }
        chartImages = blobs;
      }

      await downloadIvrTrendExport({
        format,
        project: project === "all" ? null : project,
        mode,
        view,
        year: trendYear,
        // Comparison is always a from–to span now (per-metric line overlay).
        rangeA: mode === "comparison" ? { year: aYear, from: aFrom, to: aTo } : undefined,
        rangeB: mode === "comparison" ? { year: bYear, from: bFrom, to: bTo } : undefined,
        projectName: projectLabel,
        projectLogo,
        projectAccent: plate.bg,
        chartImages,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  const backTo =
    projectCode && deptCode ? `/department/${deptCode}/project/${projectCode}`
    : deptCode               ? `/department/${deptCode}`
    :                          "/dashboard";
  const backLabel = projectCode ? "Back to Project" : deptCode ? "Back to Department" : "Back to Dashboard";

  const periodSummary = mode === "comparison" ? `${aLabel} vs ${bLabel}` : `${trendYear}`;
  const xInterval = view === "weekly" ? 3 : 0;

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": ACCENT } as React.CSSProperties}>
        {(() => {
          const proj = projectCode
            ? catalogProjects?.find((p) => p.code === projectCode)
            : null;
          const projLabel = proj?.displayName ?? projectCode?.toUpperCase();
          const headerProject =
            proj && proj.logoFilename
              ? { name: proj.displayName, logo: getLogoUrl(proj.logoFilename), logoPlateMode: proj.logoPlateMode }
              : null;

          return (
            <ReportPageHeader
              backTo={backTo}
              backLabel={backLabel}
              project={headerProject}
              dept={dept}
              accentColor={ACCENT}
              title="IVR Trend & Comparison"
              subtitle={
                <>
                  {dept?.name ?? "Operation"} · {periodSummary} ·{" "}
                  {loading ? "Loading…" : data ? "Live data" : error ? "Error" : ""}
                </>
              }
              breadcrumb={
                <>
                  <BreadcrumbLink to="/dashboard">Dashboard</BreadcrumbLink>
                  <BreadcrumbChevron />
                  {deptCode ? (
                    <BreadcrumbLink to={`/department/${deptCode}`}>
                      {dept?.name ?? deptCode.toUpperCase()}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbStatic>{dept?.name ?? "Operation"}</BreadcrumbStatic>
                  )}
                  {projectCode && deptCode && (
                    <>
                      <BreadcrumbChevron />
                      <BreadcrumbLink to={`/department/${deptCode}/project/${projectCode}`}>
                        {projLabel}
                      </BreadcrumbLink>
                    </>
                  )}
                  <BreadcrumbChevron />
                  <BreadcrumbCurrent>IVR Trend</BreadcrumbCurrent>
                </>
              }
              actions={
                <div className="flex items-center gap-2">
                  {(["excel", "pdf"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleExport(f)}
                      disabled={downloading !== null || loading || !data}
                      className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
                    >
                      {downloading === f ? (
                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-[18px]">
                          {f === "excel" ? "table_view" : "picture_as_pdf"}
                        </span>
                      )}
                      {downloading === f ? "Exporting…" : f === "excel" ? "Excel" : "PDF"}
                    </button>
                  ))}
                </div>
              }
            />
          );
        })()}

        {/* Filter bar — two stable rows: control toggles up top, period +
            project below. Keeping the period pickers on their own row stops
            the rest of the bar from shifting when the View control unmounts
            in range mode. */}
        <div className="mb-8 prism-surface rounded-2xl p-5">
          <div className="flex flex-col gap-4">
            {/* Row 1 — control toggles */}
            <div className="flex flex-wrap items-end gap-4">
            {/* Mode toggle */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Mode
              </label>
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                ariaLabel="Report mode"
                options={[{ value: "trend", label: "Trend" }, { value: "comparison", label: "Comparison" }]}
              />
            </div>

            {/* View toggle — sets the grain for both modes (trend buckets and
                the comparison line x-axis). */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                View
              </label>
              <Segmented<View>
                value={view}
                onChange={changeView}
                ariaLabel="Time granularity"
                options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }]}
              />
            </div>
            </div>

            {/* Row 2 — period + project */}
            <div className="flex flex-wrap items-end gap-4">
            {/* Period — trend year OR comparison Period A vs Period B (each a
                from–to span in the current grain). */}
            <div className="min-w-[280px]">
              {mode === "trend" ? (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                    Year
                  </label>
                  <select
                    value={trendYear}
                    onChange={(e) => setTrendYear(parseInt(e.target.value, 10))}
                    className="h-[38px] px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent tabular-nums"
                  >
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex items-end gap-2 flex-wrap">
                  <RangePicker
                    label="Period A" dotColor={PERIOD_A_COLOR} year={aYear} from={aFrom} to={aTo}
                    yearOptions={yearOptions} unitOptions={unitOptions(aYear)}
                    onYear={(y) => { setAYear(y); if (view === "weekly") { const w = isoWeeksInYear(y); setAFrom((u) => Math.min(u, w)); setATo((u) => Math.min(u, w)); } }}
                    onFrom={setAFrom} onTo={setATo}
                  />
                  <div className="flex flex-col">
                    <span aria-hidden className="text-[10px] mb-1.5 invisible select-none">vs</span>
                    <span className="h-[38px] flex items-center text-xs font-bold text-on-surface-variant/50">vs</span>
                  </div>
                  <RangePicker
                    label="Period B" dotColor={PERIOD_B_COLOR} year={bYear} from={bFrom} to={bTo}
                    yearOptions={yearOptions} unitOptions={unitOptions(bYear)}
                    onYear={(y) => { setBYear(y); if (view === "weekly") { const w = isoWeeksInYear(y); setBFrom((u) => Math.min(u, w)); setBTo((u) => Math.min(u, w)); } }}
                    onFrom={setBFrom} onTo={setBTo}
                  />
                </div>
              )}
            </div>

            {/* Project */}
            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Project
              </label>
              {projectLocked ? (
                <div
                  className="w-full h-[38px] px-3 bg-surface-container-high/30 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm flex items-center gap-2"
                  title="Project is fixed by the URL — open the report from the department to switch projects."
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">lock</span>
                  <span className="font-bold tabular-nums uppercase tracking-wide">{projectCode}</span>
                </div>
              ) : (
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  disabled={catalogProjects === null}
                  className="w-full h-[38px] px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value="all">
                    {catalogProjects === null
                      ? "Loading projects…"
                      : `All allowed projects${catalogProjects.length > 0 ? ` (${catalogProjects.length})` : ""}`}
                  </option>
                  {(() => {
                    if (!catalogProjects || catalogProjects.length === 0) return null;
                    type Bucket = { name: string; sortOrder: number; items: typeof catalogProjects };
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
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-8 rounded-2xl border border-error/20 bg-error/8 px-5 py-4 text-sm text-error">
            <p className="font-bold mb-1">Couldn't load IVR trend data</p>
            <p className="text-[12px] text-error/80">{error}</p>
          </div>
        )}

        {/* KPI strip — Offered / Answered / Auto */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {METRICS.map((m) => {
            if (mode === "comparison") {
              const av = A[m.key];
              const bv = B[m.key];
              const d = deltaPct(av, bv);
              const deltaColor = metricDeltaTone(m.key, d.sign);
              return (
                <div key={m.key} className="prism-surface rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${m.color}10`, color: m.color }}>
                      <span className="material-symbols-outlined text-2xl">{m.icon}</span>
                    </div>
                    <p className="eyebrow-sm text-on-surface-variant/50">{m.label}</p>
                  </div>
                  <p className="text-2xl font-black text-on-surface tracking-tight tabular-nums">
                    {loading && av == null ? "—" : fmtVal(av)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/45 mt-0.5">{aLabel}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] border-t border-on-surface-variant/8 pt-2">
                    <span className="text-on-surface-variant/55 tabular-nums">{bLabel}: {fmtVal(bv)}</span>
                    <span className="font-bold tabular-nums inline-flex items-center gap-0.5" style={{ color: deltaColor }}>
                      {d.sign !== 0 && (
                        <span className="material-symbols-outlined text-[14px]">
                          {d.sign > 0 ? "arrow_upward" : "arrow_downward"}
                        </span>
                      )}
                      {d.text}
                    </span>
                  </div>
                </div>
              );
            }
            return (
              <div key={m.key} className="prism-surface rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${m.color}10`, color: m.color }}>
                    <span className="material-symbols-outlined text-2xl">{m.icon}</span>
                  </div>
                  <p className="eyebrow-sm text-on-surface-variant/50">{m.label}</p>
                </div>
                <p className="text-2xl font-black text-on-surface tracking-tight tabular-nums">
                  {loading && trendTotals[m.key] == null ? "—" : fmtVal(trendTotals[m.key])}
                </p>
              </div>
            );
          })}
        </div>

        {mode === "comparison" ? (
          /* Comparison — one line card per metric; Period A vs Period B as two
             coloured lines across the selected weeks/months. Each card is its
             own export snapshot. */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {([
              { key: "offered"  as MetricKey, cref: cmpOfferedRef,  title: "Offered" },
              { key: "answered" as MetricKey, cref: cmpAnsweredRef, title: "Answered" },
              { key: "auto"     as MetricKey, cref: cmpAutoRef,     title: "Auto-handled" },
            ]).map((c) => (
              <div key={c.key} ref={c.cref} className="prism-surface rounded-2xl p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">{c.title}</h3>
                  <p className="text-[11px] text-on-surface-variant/50">
                    {aLabel} vs {bLabel} · {view === "weekly" ? "weekly" : "monthly"}
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={cmpSeries[c.key]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} interval={view === "weekly" ? 3 : 0} />
                    <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} tickFormatter={fmt.compact} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                      formatter={(value, name) => [value == null ? "—" : fmt.int(Number(value)), String(name)]}
                    />
                    <Legend iconType="line" iconSize={10} />
                    <Line type="monotone" dataKey="A" name={aLabel} stroke={PERIOD_A_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="B" name={bLabel} stroke={PERIOD_B_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <ChartCardBrandStrip scope={brandScope} accentColor={PERIOD_A_COLOR} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Chart 1 — Offered & Answered */}
            <div ref={chart1Ref} className="prism-surface rounded-2xl p-6 mb-6">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">Offered &amp; Answered</h3>
                <p className="text-[11px] text-on-surface-variant/50">{trendYear} · {view === "weekly" ? "weekly" : "monthly"} buckets</p>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} interval={xInterval} />
                  <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} tickFormatter={fmt.compact} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                    formatter={(value, name) => [value == null ? "—" : fmt.int(Number(value)), String(name)]}
                  />
                  <Legend iconType="line" iconSize={10} />
                  <Line type="monotone" dataKey="Offered" stroke={ACCENT} strokeWidth={2.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="Answered" stroke={ANSWERED_COLOR} strokeWidth={2.5} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <ChartCardBrandStrip scope={brandScope} accentColor={ACCENT} />
            </div>

            {/* Chart 2 — Auto-handled (alone) */}
            <div ref={chart2Ref} className="prism-surface rounded-2xl p-6 mb-8">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">Auto-handled</h3>
                <p className="text-[11px] text-on-surface-variant/50">{trendYear} · {view === "weekly" ? "weekly" : "monthly"} buckets</p>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} interval={xInterval} />
                  <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} tickFormatter={fmt.compact} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                    formatter={(value, name) => [value == null ? "—" : fmt.int(Number(value)), String(name)]}
                  />
                  <Legend iconType="line" iconSize={10} />
                  <Line type="monotone" dataKey="Auto" stroke={AUTO_COLOR} strokeWidth={2.5} strokeDasharray="3 3" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <ChartCardBrandStrip scope={brandScope} accentColor={AUTO_COLOR} />
            </div>
          </>
        )}

        {/* Breakdown table */}
        <div className="prism-surface rounded-2xl overflow-hidden mb-6">
          {mode === "comparison" ? (
            <table className="tbl">
              <thead>
                <tr className="bg-surface-container-high/30">
                  <th className="tbl-th">Metric</th>
                  <th className="tbl-th text-right">{aLabel}</th>
                  <th className="tbl-th text-right">{bLabel}</th>
                  <th className="tbl-th text-right">Δ</th>
                  <th className="tbl-th text-right">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="tbl-tr">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="tbl-td">
                          <div className={`h-4 rounded bg-surface-container-high/50 animate-pulse ${j === 0 ? "w-24" : "ml-auto w-16"}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !data ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">
                    {error ? "Couldn't load data — see banner above." : "No data."}
                  </td></tr>
                ) : (
                  METRICS.map((m) => {
                    const av = A[m.key];
                    const bv = B[m.key];
                    const diff = av != null && bv != null ? av - bv : null;
                    const d = deltaPct(av, bv);
                    const deltaColor = metricDeltaTone(m.key, d.sign);
                    return (
                      <tr key={m.key} className="tbl-tr">
                        <td className="tbl-td-strong" style={{ color: m.color }}>{m.label}</td>
                        <td className="tbl-td-num">{fmtVal(av)}</td>
                        <td className="tbl-td-num">{fmtVal(bv)}</td>
                        <td className="tbl-td-num" style={{ color: deltaColor }}>
                          {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${fmt.int(diff)}`}
                        </td>
                        <td className="tbl-td-num" style={{ color: deltaColor }}>{d.text}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="tbl">
              <thead>
                <tr className="bg-surface-container-high/30">
                  <th className="tbl-th">{view === "weekly" ? "Week" : "Month"}</th>
                  <th className="tbl-th text-right">Offered</th>
                  <th className="tbl-th text-right">Answered</th>
                  <th className="tbl-th text-right">Auto-handled</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="tbl-tr">
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="tbl-td">
                          <div className={`h-4 rounded bg-surface-container-high/50 animate-pulse ${j === 0 ? "w-16" : "ml-auto w-16"}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !currentLane ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">
                    {error ? "Couldn't load data — see banner above." : "No data."}
                  </td></tr>
                ) : (
                  trendBuckets.map((b) => (
                    <tr key={b.label} className="tbl-tr">
                      <td className="tbl-td-strong">{b.label}</td>
                      <td className="tbl-td-num">{fmtVal(b.Offered)}</td>
                      <td className="tbl-td-num">{fmtVal(b.Answered)}</td>
                      <td className="tbl-td-num">{fmtVal(b.Auto)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {currentLane && !loading && (
                <tfoot>
                  <tr className="border-t-2" style={{ borderColor: `${ACCENT}40` }}>
                    <td className="tbl-td-strong" style={{ color: ACCENT }}>Total</td>
                    <td className="tbl-td-num" style={{ color: ACCENT }}>{fmtVal(trendTotals.offered)}</td>
                    <td className="tbl-td-num" style={{ color: ANSWERED_COLOR }}>{fmtVal(trendTotals.answered)}</td>
                    <td className="tbl-td-num" style={{ color: AUTO_COLOR }}>{fmtVal(trendTotals.auto)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// Grain-aware span picker (From → To + Year) for a comparison period. The
// from/to options are whatever the current grain yields (months or ISO weeks),
// passed in via `unitOptions` so the picker stays agnostic.
function RangePicker({
  label, dotColor, year, from, to, yearOptions, unitOptions, onYear, onFrom, onTo,
}: {
  label: string;
  dotColor?: string;
  year: number;
  from: number;
  to: number;
  yearOptions: number[];
  unitOptions: { value: number; label: string }[];
  onYear: (y: number) => void;
  onFrom: (u: number) => void;
  onTo: (u: number) => void;
}) {
  const sel = "h-[38px] px-2.5 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent";
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-1.5 flex items-center gap-1.5">
        {dotColor && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />}
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <select value={from} onChange={(e) => onFrom(parseInt(e.target.value, 10))} className={sel} aria-label={`${label} from`}>
          {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-on-surface-variant/40 text-sm">→</span>
        <select value={to} onChange={(e) => onTo(parseInt(e.target.value, 10))} className={sel} aria-label={`${label} to`}>
          {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={year} onChange={(e) => onYear(parseInt(e.target.value, 10))} className={`${sel} tabular-nums`} aria-label={`${label} year`}>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}

