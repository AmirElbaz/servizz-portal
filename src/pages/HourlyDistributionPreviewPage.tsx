import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardLayout from "../components/layout/DashboardLayout";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
  BreadcrumbStatic,
} from "../components/reports/ReportPageHeader";
import ChartCardBrandStrip, { type BrandScope } from "../components/reports/ChartCardBrandStrip";
import {
  fetchCatalogDepartment,
  fetchCatalogDepartmentProjects,
  getLogoUrl,
  type CatalogDepartmentSummary,
  type CatalogProject,
} from "../services/catalog";
import { fmt } from "../utils/fmt";
import { REPORT_MIN_DATE } from "../utils/reportDateRange";

const ACCENT = "#2EB2FF";

const MOCK_PROJECTS = [
  { value: "all",     label: "All allowed projects" },
  { value: "mtca",    label: "MTCA" },
  { value: "ctd",     label: "CTD" },
  { value: "customs", label: "Customs" },
  { value: "dss",     label: "DSS" },
  { value: "ird",     label: "IRD" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type FilterMode = "all" | "peak" | "off-peak";

// Working hours window — anything inside is "peak", outside is "off-peak".
// Configurable per-project in the real backend (per memory:
// `projects_info.working_window_*` columns); fixed here for the mock.
const PEAK_START_HOUR = 8;
const PEAK_END_HOUR = 18; // exclusive

function isPeakHour(hour: number, day: number): boolean {
  // Sat (5) / Sun (6) treated as off-peak regardless of hour for the mock.
  if (day === 5 || day === 6) return false;
  return hour >= PEAK_START_HOUR && hour < PEAK_END_HOUR;
}

// Deterministic synthetic call volume per (day, hour). Pattern shaped to
// look like a realistic contact-center: heavy weekday business-hour mass,
// a softer afternoon dip, and a thin overnight tail that carries the
// off-peak metric (#8 in the spec).
function buildHeatmapData(seed: number): number[][] {
  return DAYS.map((_, day) =>
    HOURS.map((hour) => {
      const isWeekend = day === 5 || day === 6;
      const peakBoost =
        hour >= 9 && hour <= 11 ? 1.6 :
        hour >= 13 && hour <= 16 ? 1.4 :
        hour >= 17 && hour < 20 ? 0.7 : 1.0;
      const wave =
        Math.sin((hour - 9) * 0.6) * 0.45 +
        Math.cos((hour + day + seed) * 0.3) * 0.15 +
        1.0;
      const base = isWeekend ? 28 : 220;
      const overnight = hour < 7 || hour >= 22 ? 0.18 : 1.0;
      return Math.max(0, Math.round(base * wave * peakBoost * overnight));
    }),
  );
}

type ProjectHourlyRow = {
  code: string;
  label: string;
  total: number;
  peakShare: number;
  offPeakShare: number;
  busiestHour: string;
  quietestHour: string;
};

function buildProjectRows(): ProjectHourlyRow[] {
  return [
    { code: "MTCA",    label: "MTCA",    total: 14_200, peakShare: 78, offPeakShare: 22, busiestHour: "10:00–11:00", quietestHour: "03:00–04:00" },
    { code: "CTD",     label: "CTD",     total: 8_900,  peakShare: 84, offPeakShare: 16, busiestHour: "09:00–10:00", quietestHour: "04:00–05:00" },
    { code: "Customs", label: "Customs", total: 11_500, peakShare: 71, offPeakShare: 29, busiestHour: "14:00–15:00", quietestHour: "02:00–03:00" },
    { code: "DSS",     label: "DSS",     total: 9_400,  peakShare: 68, offPeakShare: 32, busiestHour: "10:00–11:00", quietestHour: "05:00–06:00" },
    { code: "IRD",     label: "IRD",     total: 6_700,  peakShare: 80, offPeakShare: 20, busiestHour: "09:00–10:00", quietestHour: "01:00–02:00" },
  ];
}

export default function HourlyDistributionPreviewPage() {
  // Three URL shapes resolve here (mirrors trend-comparison / funnel):
  //   /preview/hourly-distribution                          → both undefined
  //   /department/:deptCode/report/hourly-distribution      → deptCode only
  //   /department/:deptCode/project/:projectCode/report/hourly-distribution
  // The project logo renders in the header tile when projectCode is set.
  const { deptCode, projectCode } = useParams<{
    deptCode?: string;
    projectCode?: string;
  }>();
  const today = new Date();

  const [project, setProject] = useState<string>(projectCode ?? "all");
  const [mode, setMode] = useState<FilterMode>("all");
  const dateFrom = useMemo(() => new Date(today.getFullYear(), today.getMonth() - 1, 1), [today]);
  const dateTo = today;
  const [from, setFrom] = useState<string>(dateFrom.toISOString().split("T")[0]);
  const [to, setTo]     = useState<string>(dateTo.toISOString().split("T")[0]);

  // Live dept name for the breadcrumb / subtitle.
  // Dept codes are uppercase in the catalog (per CLAUDE.md). Normalize so
  // the breadcrumb fetch resolves regardless of URL case.
  const effectiveDeptCode = (deptCode ?? "OPS").toUpperCase();
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCatalogDepartment(effectiveDeptCode)
      .then((d) => { if (!cancelled) setDept(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  // Resolve the URL projectCode to a real CatalogProject so we can render
  // its logo in the header tile. Skipped for the legacy /preview/* URL.
  const [catalogProjects, setCatalogProjects] = useState<CatalogProject[] | null>(null);
  useEffect(() => {
    if (!projectCode) {
      setCatalogProjects(null);
      return;
    }
    let cancelled = false;
    fetchCatalogDepartmentProjects(effectiveDeptCode)
      .then((ps) => { if (!cancelled) setCatalogProjects(ps); })
      .catch(() => { if (!cancelled) setCatalogProjects([]); });
    return () => { cancelled = true; };
  }, [effectiveDeptCode, projectCode]);

  const projectLabel = useMemo(() => {
    if (project === "all") return null;
    return MOCK_PROJECTS.find((p) => p.value === project)?.label ?? project.toUpperCase();
  }, [project]);

  // Brand-strip data owner: specific project when picked, else dept.
  const brandScope: BrandScope = useMemo(() => {
    if (project !== "all") {
      const cp = catalogProjects?.find((p) => p.code.toLowerCase() === project);
      if (cp) {
        return {
          kind: "project",
          project: { name: cp.displayName, logo: getLogoUrl(cp.logoFilename) },
        };
      }
      const label = MOCK_PROJECTS.find((p) => p.value === project)?.label ?? project.toUpperCase();
      return { kind: "project", project: { name: label } };
    }
    return {
      kind: "dept",
      dept: { name: dept?.name ?? effectiveDeptCode, icon: dept?.icon ?? null },
    };
  }, [project, catalogProjects, dept, effectiveDeptCode]);

  // Pretty date-range label like "Apr 3 – May 3, 2026".
  const dateRangeLabel = useMemo(() => {
    const parse = (iso: string) => {
      const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
      return new Date(y, (m ?? 1) - 1, d ?? 1);
    };
    const f = parse(from);
    const t = parse(to);
    const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
    const yearFmt = new Intl.DateTimeFormat("en-GB", { year: "numeric" });
    if (f.getFullYear() === t.getFullYear()) {
      return `${fmt.format(f)} – ${fmt.format(t)}, ${yearFmt.format(t)}`;
    }
    return `${fmt.format(f)} ${yearFmt.format(f)} – ${fmt.format(t)} ${yearFmt.format(t)}`;
  }, [from, to]);

  const heatmap = useMemo(() => buildHeatmapData(project.length), [project]);
  const projectRows = useMemo(() => buildProjectRows(), []);

  // Min/max for color-intensity scaling — recompute when filter mode dims
  // some cells, so the visible cells span the full color range.
  const { minVisible, maxVisible } = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = 0;
    heatmap.forEach((row, day) =>
      row.forEach((v, hour) => {
        if (mode === "peak" && !isPeakHour(hour, day)) return;
        if (mode === "off-peak" && isPeakHour(hour, day)) return;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }),
    );
    if (!Number.isFinite(lo)) lo = 0;
    return { minVisible: lo, maxVisible: hi };
  }, [heatmap, mode]);

  function cellColor(value: number, day: number, hour: number): string {
    const dimmed =
      (mode === "peak" && !isPeakHour(hour, day)) ||
      (mode === "off-peak" && isPeakHour(hour, day));
    if (dimmed) return "rgba(0,0,0,0.06)";
    if (maxVisible === 0) return "rgba(46,178,255,0.04)";
    const t = (value - minVisible) / Math.max(1, maxVisible - minVisible);
    const eased = Math.max(0.04, Math.min(1, t));
    return `rgba(46,178,255,${eased})`;
  }

  // Hourly aggregate (sum across all 7 days) → drives the bar chart below
  // the heatmap. Same dimming rule applied for visual consistency.
  const hourlyAggregate = useMemo(
    () =>
      HOURS.map((hour) => {
        let sum = 0;
        let dimmed = true;
        for (let day = 0; day < 7; day++) {
          const inMode =
            mode === "all" ||
            (mode === "peak" && isPeakHour(hour, day)) ||
            (mode === "off-peak" && !isPeakHour(hour, day));
          if (inMode) {
            sum += heatmap[day][hour];
            dimmed = false;
          }
        }
        return {
          hour: `${String(hour).padStart(2, "0")}:00`,
          calls: sum,
          dimmed,
        };
      }),
    [heatmap, mode],
  );

  const totals = useMemo(() => {
    let allTotal = 0;
    let peakTotal = 0;
    let offPeakTotal = 0;
    heatmap.forEach((row, day) =>
      row.forEach((v, hour) => {
        allTotal += v;
        if (isPeakHour(hour, day)) peakTotal += v;
        else offPeakTotal += v;
      }),
    );
    let busiestVal = 0;
    let busiestLabel = "—";
    heatmap.forEach((row, day) =>
      row.forEach((v, hour) => {
        if (v > busiestVal) {
          busiestVal = v;
          busiestLabel = `${DAYS[day]} ${String(hour).padStart(2, "0")}:00`;
        }
      }),
    );
    return { allTotal, peakTotal, offPeakTotal, busiestVal, busiestLabel };
  }, [heatmap]);

  const backTo =
    projectCode && deptCode ? `/department/${deptCode}/project/${projectCode}`
    : deptCode               ? `/department/${deptCode}`
    :                          "/dashboard";
  const backLabel = projectCode
    ? "Back to Project"
    : deptCode
    ? "Back to Department"
    : "Back to Dashboard";

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": ACCENT } as React.CSSProperties}>
        {(() => {
          const proj = projectCode
            ? catalogProjects?.find((p) => p.code === projectCode)
            : null;
          const headerProject =
            proj && proj.logoFilename
              ? { name: proj.displayName, logo: getLogoUrl(proj.logoFilename) }
              : null;
          const projDisplay = proj?.displayName ?? projectCode?.toUpperCase();
          return (
        <ReportPageHeader
          backTo={backTo}
          backLabel={backLabel}
          project={headerProject}
          dept={dept}
          accentColor={ACCENT}
          title="Hourly Distribution"
          subtitle={
            <>
              {dept?.name ?? "Operation"}
              {projectLabel ? ` · ${projectLabel}` : ""} · {dateRangeLabel} · Mock data (preview)
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
                  <BreadcrumbLink
                    to={`/department/${deptCode}/project/${projectCode}`}
                  >
                    {projDisplay}
                  </BreadcrumbLink>
                </>
              )}
              <BreadcrumbChevron />
              <BreadcrumbCurrent>Hourly Distribution</BreadcrumbCurrent>
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Backend not yet wired — exports will work once the Hourly Distribution data source lands."
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">table_view</span>
                Excel
              </button>
              <button
                type="button"
                disabled
                title="Backend not yet wired — exports will work once the Hourly Distribution data source lands."
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                PDF
              </button>
            </div>
          }
        />
          );
        })()}

        {/* Filter bar */}
        <div className="mb-8 prism-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                From
              </label>
              <input
                type="date"
                min={REPORT_MIN_DATE}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                To
              </label>
              <input
                type="date"
                min={REPORT_MIN_DATE}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent"
                style={{ colorScheme: "light" }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Hours
              </label>
              <div className="flex rounded-xl overflow-hidden border border-on-surface-variant/8">
                {(["all", "peak", "off-peak"] as FilterMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    title={m === "peak" ? "Peak: Mon–Fri 08:00–18:00" : m === "off-peak" ? "Off-peak: outside Mon–Fri 08:00–18:00" : undefined}
                    className={`py-2 px-4 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                      mode === m ? "bg-accent text-white" : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {m === "all" ? "All hours" : m === "peak" ? "Peak" : "Off-peak"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Project
              </label>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent"
              >
                {MOCK_PROJECTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: "call",            label: "Total calls",        value: fmt.int(totals.allTotal),                                    sub: "Across the selected range",                tone: ACCENT     },
            { icon: "schedule",        label: "Peak-hour share",    value: `${fmt.auto(Math.round((totals.peakTotal / Math.max(1, totals.allTotal)) * 100))}%`, sub: `${fmt.int(totals.peakTotal)} calls`,         tone: "#15803d"  },
            { icon: "nights_stay",     label: "Off-peak calls",     value: fmt.int(totals.offPeakTotal),                                sub: "Outside Mon–Fri 08:00–18:00",              tone: "#9F7AEA"  },
            { icon: "local_fire_department", label: "Busiest hour", value: totals.busiestLabel,                                         sub: `${fmt.int(totals.busiestVal)} calls in that window`, tone: "#b91c1c" },
          ].map((k) => (
            <div key={k.label} className="prism-surface rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${k.tone}15`, color: k.tone }}
                >
                  <span className="material-symbols-outlined text-xl">{k.icon}</span>
                </div>
                <p className="eyebrow-sm text-on-surface-variant/50">{k.label}</p>
              </div>
              <p className="text-2xl font-black text-on-surface tracking-tight tabular-nums">{k.value}</p>
              <p className="text-[11px] text-on-surface-variant/60 mt-1">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Heatmap */}
        <div className="prism-surface rounded-2xl p-6 mb-4">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                Call density — day × hour
              </h3>
              <p className="text-[11px] text-on-surface-variant/50">
                Cell intensity = call volume · hover for exact counts
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/60">
              <span>Less</span>
              <div className="flex">
                {[0.1, 0.25, 0.4, 0.6, 0.8, 1].map((a) => (
                  <span
                    key={a}
                    className="w-5 h-3"
                    style={{ backgroundColor: `rgba(46,178,255,${a})` }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Hour-axis header */}
              <div className="flex">
                <div className="w-12 shrink-0" />
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="flex-1 min-w-[28px] text-[9px] font-bold uppercase tracking-widest text-center text-on-surface-variant/50 tabular-nums pb-1"
                  >
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
              </div>
              {/* Day rows */}
              {DAYS.map((day, dIdx) => (
                <div key={day} className="flex items-stretch">
                  <div className="w-12 shrink-0 flex items-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                    {day}
                  </div>
                  {HOURS.map((h) => {
                    const v = heatmap[dIdx][h];
                    const peak = isPeakHour(h, dIdx);
                    return (
                      <div
                        key={h}
                        className="flex-1 min-w-[28px] h-8 m-[1px] rounded-[3px] transition-all hover:scale-110 hover:z-10 hover:shadow-md cursor-default"
                        style={{ backgroundColor: cellColor(v, dIdx, h) }}
                        title={`${day} ${String(h).padStart(2, "0")}:00 · ${fmt.int(v)} calls${peak ? " · peak" : ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <ChartCardBrandStrip scope={brandScope} accentColor={ACCENT} />
        </div>

        {/* Hourly aggregate bar chart */}
        <div className="prism-surface rounded-2xl p-6 mb-8">
          <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
            Total by hour of day
          </h3>
          <p className="text-[11px] text-on-surface-variant/50 mb-4">
            Sum across the selected date range · {mode === "all" ? "all hours" : mode === "peak" ? "peak hours only" : "off-peak hours only"}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyAggregate} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#566166" }} tickLine={false} axisLine={{ stroke: "#e8eff3" }} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} tickFormatter={fmt.compact} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(v) => [fmt.int(Number(v)), "Calls"]}
              />
              <Bar dataKey="calls" fill={ACCENT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ChartCardBrandStrip scope={brandScope} accentColor={ACCENT} />
        </div>

        {/* Per-project breakdown */}
        <div className="prism-surface rounded-2xl overflow-hidden mb-8">
          <div className="px-5 py-3 border-b border-on-surface-variant/6">
            <div className="flex items-center gap-3">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}
              >
                <span className="material-symbols-outlined text-base">leaderboard</span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-on-surface font-headline">
                  Per-project hourly breakdown
                </h3>
                <p className="text-[10px] text-on-surface-variant/50 mt-0.5 uppercase tracking-widest">
                  Peak vs off-peak share + busiest / quietest hour
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-high/30">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Project</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 text-right">Total</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 text-right">Peak %</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 text-right">Off-peak %</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Busiest hour</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Quietest hour</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row) => (
                  <tr key={row.code} className="border-t border-on-surface-variant/4 hover:bg-surface-container-low/40 transition-colors">
                    <td className="px-4 py-2.5 text-[12px] font-bold text-on-surface">{row.label}</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-on-surface font-medium">{fmt.int(row.total)}</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-emerald-700 font-medium">{fmt.auto(row.peakShare)}%</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-on-surface-variant/80 font-medium">{fmt.auto(row.offPeakShare)}%</td>
                    <td className="px-3 py-2.5 text-[12px] text-on-surface-variant/80">{row.busiestHour}</td>
                    <td className="px-3 py-2.5 text-[12px] text-on-surface-variant/80">{row.quietestHour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-on-surface-variant/50 text-center mb-6">
          Preview · mock data · backend not yet wired · planned data source: <code className="font-mono text-on-surface-variant/70">Avaya_skillset_Historical</code> bucketed by HOUR(ServiceInterval)
        </p>
      </div>
    </DashboardLayout>
  );
}
