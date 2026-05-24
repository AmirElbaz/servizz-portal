import { useEffect, useMemo, useState } from "react";
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
import DashboardLayout from "../components/layout/DashboardLayout";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
  BreadcrumbStatic,
} from "../components/reports/ReportPageHeader";
import ChartCardBrandStrip, { type BrandScope } from "../components/reports/ChartCardBrandStrip";
import {
  fetchIvrTrendComparison,
  downloadIvrTrendExport,
  type IvrLaneData,
  type IvrTrendComparisonResponse,
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
import { REPORT_MIN_YEAR } from "../utils/reportDateRange";

const ACCENT = "#2EB2FF";
const AUTO_COLOR = "#9F7AEA";

type ChartFilter = "offered" | "auto" | "all";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatMaybeNumber(val: number | null): string {
  return fmt.int(val);
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
  const [project, setProject] = useState<string>(projectCode ?? "all");
  const [chartFilter, setChartFilter] = useState<ChartFilter>("offered");
  const [year, setYear] = useState<number>(today.getFullYear());
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    setProject(projectCode ?? "all");
  }, [projectCode]);

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

  // Always fetch the dept's projects: the dropdown needs the list when
  // unlocked, and the header tile needs to resolve `projectCode` to a
  // CatalogProject (with logoFilename) when locked. Previously this effect
  // early-returned on `projectLocked` and the logo silently fell back to
  // the dept icon — see the bug Amir flagged on the project-scoped URL.
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIvrTrendComparison({
      project: project === "all" ? null : project,
      year,
      granularity: "year",
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
    return () => { cancelled = true; };
  }, [project, year]);

  async function handleExport(format: "excel" | "pdf") {
    if (downloading) return;
    setDownloading(format);
    try {
      const cp = project === "all"
        ? null
        : catalogProjects?.find((p) => p.code === project) ?? null;
      const projectLabel = cp?.displayName ?? (project === "all" ? "All allowed projects" : project);
      // Mirror SkillsetReport: the backend resolves projectLogo onto the
      // PDF cover via Assets/projects/{filename}. Skip for "all" — the
      // shell falls back to centering Servizz.gov alone.
      const projectLogo = cp?.logoFilename ?? undefined;
      // Same tile the on-screen brand strip uses — chosen from the logo's
      // own brightness (cached by URL), so the PDF chip matches.
      const plate = await getLogoPlate(getLogoUrl(cp?.logoFilename), cp?.logoPlateMode);
      await downloadIvrTrendExport({
        format,
        project: project === "all" ? null : project,
        year,
        granularity: "year",
        projectName: projectLabel,
        projectLogo,
        projectAccent: plate.bg,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  // Only the "current" lane is requested. Server still returns it inside
  // a Lanes[] array — pull the first (and only) entry.
  const currentLane: IvrLaneData | null = useMemo(() => {
    if (!data) return null;
    return data.lanes.find((l) => l.code === "current") ?? data.lanes[0] ?? null;
  }, [data]);

  // Chart points — 12 monthly buckets for the selected year.
  const chartData = useMemo(() => {
    if (!currentLane) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const m = currentLane.monthly[i];
      const point: Record<string, string | number | null> = { label: MONTHS[i] };
      if (chartFilter === "offered" || chartFilter === "all") {
        point.Offered = m?.offered ?? null;
      }
      if (chartFilter === "auto" || chartFilter === "all") {
        point.Auto = m?.auto ?? null;
      }
      return point;
    });
  }, [currentLane, chartFilter]);

  const backTo =
    projectCode && deptCode ? `/department/${deptCode}/project/${projectCode}`
    : deptCode               ? `/department/${deptCode}`
    :                          "/dashboard";
  const backLabel = projectCode ? "Back to Project" : deptCode ? "Back to Department" : "Back to Dashboard";

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
              title="IVR Trend"
              subtitle={
                <>
                  {dept?.name ?? "Operation"} · {year} ·{" "}
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
                    <BreadcrumbStatic>
                      {dept?.name ?? "Operation"}
                    </BreadcrumbStatic>
                  )}
                  {projectCode && deptCode && (
                    <>
                      <BreadcrumbChevron />
                      <BreadcrumbLink
                        to={`/department/${deptCode}/project/${projectCode}`}
                      >
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
                  <button
                    type="button"
                    onClick={() => handleExport("excel")}
                    disabled={downloading !== null || loading || !data}
                    className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
                  >
                    {downloading === "excel" ? (
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">table_view</span>
                    )}
                    {downloading === "excel" ? "Exporting…" : "Excel"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("pdf")}
                    disabled={downloading !== null || loading || !data}
                    className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
                  >
                    {downloading === "pdf" ? (
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    )}
                    {downloading === "pdf" ? "Exporting…" : "PDF"}
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
                Year
              </label>
              <input
                type="number"
                min={REPORT_MIN_YEAR}
                max={today.getFullYear()}
                value={year}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  if (!Number.isNaN(y) && y >= REPORT_MIN_YEAR && y <= today.getFullYear()) {
                    setYear(y);
                  }
                }}
                className="w-[110px] py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent tabular-nums"
              />
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Project
              </label>
              {projectLocked ? (
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
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-8 rounded-2xl border border-rose-300/50 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <p className="font-bold mb-1">Couldn't load IVR trend data</p>
            <p className="text-[12px] text-rose-600/80">{error}</p>
          </div>
        )}

        {/* KPI strip — Offered + Auto */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {(["Offered", "Auto"] as const).map((metric) => {
            const key: "totalOffered" | "totalAuto" = metric === "Offered" ? "totalOffered" : "totalAuto";
            const current = currentLane?.[key] ?? null;
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
              </div>
            );
          })}
        </div>

        {/* Trend chart */}
        <div className="prism-surface rounded-2xl p-6 mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                Monthly trend — {chartFilter === "all" ? "Offered & Auto" : chartFilter === "auto" ? "Auto" : "Offered"}
              </h3>
              <p className="text-[11px] text-on-surface-variant/50">{year} · monthly buckets</p>
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
              <YAxis tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} tickFormatter={fmt.compact} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(value, name) => [fmt.int(Number(value)), String(name)]}
              />
              <Legend iconType="line" iconSize={10} />
              {(chartFilter === "offered" || chartFilter === "all") && (
                <Line
                  type="monotone"
                  dataKey="Offered"
                  stroke={ACCENT}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={true}
                />
              )}
              {(chartFilter === "auto" || chartFilter === "all") && (
                <Line
                  type="monotone"
                  dataKey="Auto"
                  stroke={AUTO_COLOR}
                  strokeWidth={2.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <ChartCardBrandStrip scope={brandScope} accentColor={ACCENT} />
        </div>

        {/* Monthly breakdown — Offered + Auto-handled, side-by-side.
            Unpivoted (months as rows, single value column) after the YoY
            comparison feature was removed on 2026-05-10 — a 1-row pivot
            wasted space and read awkwardly. Year lives in the card header
            now, not inside the table. If multi-year ever returns, the
            shape extends gracefully by adding more value columns
            (one per year) instead of re-pivoting back. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 mb-6">
          {(["Offered", "Auto"] as const).map((metric) => {
            const accentColor = metric === "Offered" ? ACCENT : AUTO_COLOR;
            const icon = metric === "Offered" ? "call" : "smart_toy";
            const title = metric === "Offered" ? "Offered" : "Auto-handled";
            const fieldKey: "offered" | "auto" = metric === "Offered" ? "offered" : "auto";

            // YTD sum across whatever months have real data. Renders in the
            // emphasised footer row at the bottom of each table.
            const ytd = currentLane?.monthly.reduce(
              (sum, e) => sum + (e[fieldKey] ?? 0),
              0,
            ) ?? null;

            return (
              <div key={metric} className="prism-surface rounded-2xl overflow-hidden">
                {/* Card header — eyebrow + year carry the differentiation
                    between the two side-by-side cards. */}
                <div className="px-5 py-4 border-b border-on-surface-variant/6">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                    >
                      <span className="material-symbols-outlined text-[18px]">{icon}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/55">
                        {title}
                      </p>
                      <p className="text-xl font-bold font-headline text-on-surface tracking-tight tabular-nums">
                        {currentLane?.year ?? year}
                      </p>
                    </div>
                  </div>
                </div>

                <table className="tbl">
                  <thead>
                    <tr className="bg-surface-container-high/30">
                      <th className="tbl-th">Month</th>
                      <th className="tbl-th text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!currentLane ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-12 text-center text-on-surface-variant/50 text-sm">
                          {loading ? "Loading…" : error ? "Couldn't load data — see banner above." : "No data."}
                        </td>
                      </tr>
                    ) : (
                      MONTHS.map((monthLabel, i) => {
                        const entry = currentLane.monthly.find((e) => e.month === i + 1);
                        const val = entry ? entry[fieldKey] : null;
                        return (
                          <tr key={monthLabel} className="tbl-tr">
                            <td className="tbl-td-strong">{monthLabel}</td>
                            <td className="tbl-td-num">
                              {val == null
                                ? <span className="text-on-surface-variant/30">—</span>
                                : fmt.int(val)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {currentLane && (
                    <tfoot>
                      <tr className="border-t-2" style={{ borderColor: `${accentColor}40` }}>
                        <td className="tbl-td-strong" style={{ color: accentColor }}>YTD</td>
                        <td className="tbl-td-num" style={{ color: accentColor }}>
                          {ytd == null || ytd === 0 ? "—" : fmt.int(ytd)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-on-surface-variant/50 text-center mb-6">
          Live data · <code className="font-mono text-on-surface-variant/70">/api/IvrTrends/comparison</code>
        </p>
      </div>
    </DashboardLayout>
  );
}
