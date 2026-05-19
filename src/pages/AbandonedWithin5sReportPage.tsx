import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { toBlob as domToBlob } from "html-to-image";
import Paginator from "../components/ui/Paginator";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartment,
  fetchCatalogReport,
  getLogoUrl,
  type CatalogDepartmentSummary,
  type CatalogReport,
} from "../services/catalog";
import { pushRecentItem } from "../hooks/useRecentItems";
import ErrorBanner from "../components/admin/ErrorBanner";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
} from "../components/reports/ReportPageHeader";
import ChartCardBrandStrip from "../components/reports/ChartCardBrandStrip";
import {
  fetchAbandoned5sGrouped,
  fetchAbandoned5sChart,
  fetchAbandoned5sSummary,
  downloadAbandoned5sExport,
  type Abandoned5sRow,
  type Abandoned5sGroupMode,
  type Abandoned5sChartPoint,
} from "../services/api";
import { fmt } from "../utils/fmt";
import { REPORT_MIN_DATE } from "../utils/reportDateRange";

type ViewMode = Abandoned5sGroupMode; // "hourly" | "daily" | "monthly" | "yearly"

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 30, 40, 50, 100, 200, 300, 400, 500];

// 4-column contract locked with the report spec: Skillset Name, Date, Period,
// Abandoned Calls. SkillsetName drops out when "By Skillset" is off (the
// backend stops selecting it); the policy-filter pass below keeps only the
// columns the response actually carries.
function getColumns(groupBySkillset: boolean) {
  const cols: { key: keyof Abandoned5sRow; label: string; width?: string }[] = [];
  if (groupBySkillset)
    cols.push({ key: "SkillsetName", label: "Skillset Name", width: "200px" });
  cols.push({ key: "Date", label: "Date", width: "140px" });
  cols.push({ key: "Period", label: "Period", width: "140px" });
  cols.push({ key: "AbandonedCalls", label: "Abandoned Calls", width: "150px" });
  return cols;
}

export default function AbandonedWithin5sReportPage() {
  // Department-first URL. The report segment is the LITERAL
  // `abandoned-within-5s` (a dedicated route, not the generic
  // /report/:reportCode), so there is no reportCode param to read — the
  // code is fixed for this page. Only the dept / project are dynamic.
  //   /department/:deptCode/project/:projectCode/report/abandoned-within-5s
  //   /department/:deptCode/report/abandoned-within-5s
  const { deptCode, projectCode } = useParams<{
    deptCode?: string;
    projectCode?: string;
  }>();
  const reportCode = "abandoned-within-5s";
  const departmentCode = deptCode;
  const projectId = projectCode;

  const [project, setProject] = useState<Project | null>(null);
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [report, setReport] = useState<CatalogReport | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogNotFound, setCatalogNotFound] = useState(false);

  useEffect(() => {
    if (!departmentCode || !reportCode) return;
    setCatalogLoading(true);
    setCatalogNotFound(false);

    if (!projectCode) {
      Promise.all([
        fetchCatalogDepartment(departmentCode),
        fetchCatalogReport(reportCode),
      ])
        .then(([d, r]) => {
          setProject(null);
          setDept(d);
          setReport(r);
          pushRecentItem({
            kind: "report",
            id: `${d.code}/${r.code}`,
            label: r.name,
            sublabel: d.name,
            icon: r.icon || "description",
            href: `/department/${d.code}/report/${r.code}`,
          });
        })
        .catch(() => setCatalogNotFound(true))
        .finally(() => setCatalogLoading(false));
      return;
    }

    Promise.all([
      fetchCatalogProject(projectCode),
      fetchCatalogDepartment(departmentCode),
      fetchCatalogReport(reportCode),
    ])
      .then(([p, d, r]) => {
        setProject({
          id: p.code,
          code: p.shortLabel,
          name: p.displayName,
          description: p.description ?? "",
          fullDescription: p.fullDescription ?? "",
          icon: p.icon ?? "",
          logo: getLogoUrl(p.logoFilename),
          color: p.colorHex,
          hoverBorderColor: "",
        });
        setDept(d);
        setReport(r);
        pushRecentItem({
          kind: "report",
          id: `${d.code}/${p.code}/${r.code}`,
          label: r.name,
          sublabel: `${p.displayName} · ${d.name}`,
          icon: r.icon || "description",
          href: `/department/${d.code}/project/${p.code}/report/${r.code}`,
        });
      })
      .catch(() => setCatalogNotFound(true))
      .finally(() => setCatalogLoading(false));
  }, [projectCode, departmentCode, reportCode]);

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(yesterday);
  const [dateTo, setDateTo] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [groupBySkillset, setGroupBySkillset] = useState(true);
  // Entire Day — ON (default) counts every record across the whole day.
  // OFF restricts to the project's configured shift window. The backend
  // takes `workingHoursOnly`; we send the negation at every call site.
  const [entireDay, setEntireDay] = useState(true);

  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const [rows, setRows] = useState<Abandoned5sRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [chartData, setChartData] = useState<Abandoned5sChartPoint[]>([]);
  const [totalAbandoned, setTotalAbandoned] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const handlePageChange = useCallback((page: number) => setCurrentPage(page), []);
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  async function handleExcelExport() {
    if (exporting) return;
    setExporting("excel");
    try {
      await downloadAbandoned5sExport(
        dateFrom, dateTo, viewMode, projectId, groupBySkillset, "excel",
        accent.displayName, accent.logoFilename, !entireDay,
      );
    } finally {
      setExporting(null);
    }
  }

  async function handlePdfExport() {
    if (exporting) return;
    setExporting("pdf");
    try {
      const blobs: Blob[] = [];
      if (chartCardRef.current) {
        try {
          const blob = await domToBlob(chartCardRef.current, {
            backgroundColor: "#ffffff",
            pixelRatio: 2,
            cacheBust: true,
          });
          if (blob) blobs.push(blob);
        } catch (err) {
          console.error("[pdf-export] chart capture failed", err);
        }
      }
      if (blobs.length === 0) {
        console.warn("[pdf-export] no chart image captured — PDF will have no chart");
      }
      await downloadAbandoned5sExport(
        dateFrom, dateTo, viewMode, projectId, groupBySkillset, "pdf",
        accent.displayName, accent.logoFilename, !entireDay, blobs,
      );
    } finally {
      setExporting(null);
    }
  }

  // Table rows. Leave the previous rows in place on a transient failure so a
  // backend hiccup doesn't look like a permanent "no data" state.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchAbandoned5sGrouped(
          dateFrom, dateTo, viewMode, currentPage, pageSize, projectId, groupBySkillset, !entireDay,
        );
        if (!cancelled) {
          setRows(res.rows);
          setTotalItems(res.total);
          setActionError(null);
        }
      } catch (err) {
        console.error("Failed to fetch report data:", err);
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setActionError(`Couldn't load report rows: ${msg}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, viewMode, currentPage, pageSize, projectId, groupBySkillset, entireDay]);

  // Chart + summary.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [chart, sum] = await Promise.all([
          fetchAbandoned5sChart(dateFrom, dateTo, projectId, viewMode, !entireDay),
          fetchAbandoned5sSummary(dateFrom, dateTo, projectId, !entireDay),
        ]);
        if (!cancelled) {
          setChartData(chart);
          setTotalAbandoned(sum.abandoned);
        }
      } catch (err) {
        console.error("Failed to fetch chart/summary:", err);
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setActionError(`Couldn't load chart / summary: ${msg}`);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, projectId, viewMode, entireDay]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, viewMode, groupBySkillset, entireDay]);

  if (catalogLoading) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant/60 text-sm">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (catalogNotFound || !dept || !report) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Report not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  const accent = {
    color: project?.color ?? "#2eb2ff",
    displayName: project?.name ?? dept.name,
    logoFilename: project?.logo ? project.logo.split("/").pop() : undefined,
  };

  const allColumns = getColumns(groupBySkillset);
  const activeColumns = (() => {
    if (rows.length === 0) return allColumns;
    const available = new Set(Object.keys(rows[0] as object));
    return allColumns.filter((col) => available.has(col.key as string));
  })();

  const areaChartData = chartData.map((p) => ({
    label: p.Date,
    value: p.AbandonedCalls,
  }));

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": accent.color } as React.CSSProperties}>
        <ReportPageHeader
          backTo={
            projectCode && departmentCode
              ? `/department/${departmentCode}/project/${projectCode}`
              : departmentCode
              ? `/department/${departmentCode}`
              : "/dashboard"
          }
          backLabel={projectCode ? "Back to Project" : "Back to Department"}
          project={project}
          dept={dept}
          accentColor={accent.color}
          title={report.name}
          subtitle={project ? `${project.name} · ${dept.name}` : dept.name}
          breadcrumb={
            <>
              <BreadcrumbLink to="/dashboard">Dashboard</BreadcrumbLink>
              <BreadcrumbChevron />
              <BreadcrumbLink to={`/department/${departmentCode}`}>
                {dept.name}
              </BreadcrumbLink>
              {project && projectCode && (
                <>
                  <BreadcrumbChevron />
                  <BreadcrumbLink
                    to={`/department/${departmentCode}/project/${projectCode}`}
                  >
                    {project.name}
                  </BreadcrumbLink>
                </>
              )}
              <BreadcrumbChevron />
              <BreadcrumbCurrent>{report.name}</BreadcrumbCurrent>
            </>
          }
          actions={
            <div
              className={`flex items-center gap-2 transition-opacity ${totalItems === 0 ? "opacity-30 pointer-events-none" : ""}`}
              title={totalItems === 0 ? "No data to export" : undefined}
            >
              <button
                onClick={handleExcelExport}
                disabled={totalItems === 0 || exporting !== null}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${accent.color}25` }}
              >
                {exporting === "excel" ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">table_view</span>
                )}
                {exporting === "excel" ? "Exporting…" : "Excel"}
              </button>
              <button
                onClick={handlePdfExport}
                disabled={totalItems === 0 || exporting !== null}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${accent.color}25` }}
              >
                {exporting === "pdf" ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                )}
                {exporting === "pdf" ? "Exporting…" : "PDF"}
              </button>
            </div>
          }
        />

        <ErrorBanner
          message={actionError}
          onDismiss={() => setActionError(null)}
        />

        {/* ── Filters ── */}
        <div className="mb-8 prism-surface rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            <div className="flex-1 min-w-[110px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                From
              </label>
              <input
                type="date"
                min={REPORT_MIN_DATE}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-xs sm:text-sm focus:outline-none focus:border-accent transition-all"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div className="flex-1 min-w-[110px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                To
              </label>
              <input
                type="date"
                min={REPORT_MIN_DATE}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-xs sm:text-sm focus:outline-none focus:border-accent transition-all"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div className="w-full sm:w-auto sm:min-w-[340px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                View
              </label>
              <div className="flex rounded-xl overflow-hidden border border-on-surface-variant/8">
                {(["hourly", "daily", "monthly", "yearly"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setViewMode(opt)}
                    className={`flex-1 py-2 sm:py-2.5 px-1.5 sm:px-3 text-[10px] sm:text-xs font-semibold capitalize transition-colors ${
                      viewMode === opt
                        ? "bg-accent text-white"
                        : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2 border-t border-on-surface-variant/6">
            <div className="flex items-center gap-2.5">
              <label
                className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 whitespace-nowrap cursor-help"
                title="ON counts every call across the whole day. Turn OFF to restrict to each project's defined operating hours (normal / weekend / public holiday)."
              >
                Entire Day
              </label>
              <button
                onClick={() => setEntireDay(!entireDay)}
                className={`relative w-10 h-[22px] rounded-full transition-colors ${entireDay ? "" : "bg-on-surface-variant/20"}`}
                style={entireDay ? { backgroundColor: accent.color } : undefined}
              >
                <span className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${entireDay ? "translate-x-[18px]" : ""}`} />
              </button>
            </div>

            <div className="w-px h-5 bg-on-surface-variant/10" />

            <div className="flex items-center gap-2.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 whitespace-nowrap">
                By Skillset
              </label>
              <button
                onClick={() => setGroupBySkillset(!groupBySkillset)}
                className={`relative w-10 h-[22px] rounded-full transition-colors ${groupBySkillset ? "" : "bg-on-surface-variant/20"}`}
                style={groupBySkillset ? { backgroundColor: accent.color } : undefined}
              >
                <span className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${groupBySkillset ? "translate-x-[18px]" : ""}`} />
              </button>
            </div>

            <div className="text-xs text-on-surface-variant/50 ml-auto">
              <span className="font-bold text-on-surface">{fmt.int(totalItems)}</span> records
            </div>
          </div>
        </div>

        {/* ── Widgets ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="prism-surface rounded-2xl p-6 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${accent.color}10`, color: accent.color }}
            >
              <span className="material-symbols-outlined text-2xl">call_missed</span>
            </div>
            <div>
              <p className="eyebrow-sm text-on-surface-variant/50 mb-1">
                Abandoned Within 5s
              </p>
              <p className="text-2xl font-black text-on-surface tracking-tight">
                {fmt.int(totalAbandoned)}
              </p>
            </div>
          </div>
          <div className="prism-surface rounded-2xl p-6 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${accent.color}10`, color: accent.color }}
            >
              <span className="material-symbols-outlined text-2xl">table_rows</span>
            </div>
            <div>
              <p className="eyebrow-sm text-on-surface-variant/50 mb-1">
                Records
              </p>
              <p className="text-2xl font-black text-on-surface tracking-tight">
                {fmt.int(totalItems)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Chart ── */}
        <div className="mb-8">
          <div ref={chartCardRef} className="prism-surface rounded-2xl p-6">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                Abandoned Calls Within 5 Seconds Over Time
              </h3>
              <p className="text-[11px] text-on-surface-variant/50">
                Calls abandoned ≤ 5 seconds after reaching the queue, by {viewMode === "hourly" ? "hour" : viewMode.replace(/ly$/, "")}
              </p>
            </div>
            {areaChartData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-on-surface-variant/40">
                <div className="text-center">
                  <span className="material-symbols-outlined text-4xl mb-2 block">show_chart</span>
                  <p className="text-sm">No data available for this period</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={areaChartData}>
                  <defs>
                    <linearGradient id="abandon5sFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accent.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={accent.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#566166" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e8eff3" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#566166" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmt.compact}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [fmt.int(Number(value)), "Abandoned ≤ 5s"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={accent.color}
                    strokeWidth={2.5}
                    fill="url(#abandon5sFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {project && (
              <ChartCardBrandStrip
                scope={{ kind: "project", project: { name: project.name, logo: project.logo } }}
                accentColor={accent.color}
              />
            )}
          </div>
        </div>

        {/* ── Data Table ── */}
        <div className="flex justify-start">
          <div className="prism-surface rounded-2xl overflow-hidden w-fit max-w-full">
            <div className="px-6 py-4 border-b border-on-surface-variant/6 flex items-center justify-between gap-8">
              <h3 className="text-sm font-bold text-on-surface font-headline whitespace-nowrap">
                {viewMode === "hourly" ? "Hourly view" : `Grouped by ${viewMode}`}
              </h3>
              <span className="text-[11px] text-on-surface-variant/50 whitespace-nowrap">
                {loading ? "Loading..." : `${fmt.int(totalItems)} records`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table
                className="tbl
                  [&[data-cols='1']_.tbl-td-num]:py-4 [&[data-cols='1']_.tbl-td-num]:text-[14.5px]
                  [&[data-cols='1']_.tbl-td-strong]:py-4 [&[data-cols='1']_.tbl-td-strong]:text-[14.5px]
                  [&[data-cols='1']_.tbl-td]:py-4 [&[data-cols='1']_.tbl-td]:text-[14.5px]
                  [&[data-cols='2']_.tbl-td-num]:py-3 [&[data-cols='2']_.tbl-td-num]:text-[14px]
                  [&[data-cols='2']_.tbl-td-strong]:py-3 [&[data-cols='2']_.tbl-td-strong]:text-[14px]
                  [&[data-cols='2']_.tbl-td]:py-3 [&[data-cols='2']_.tbl-td]:text-[14px]
                  [&[data-cols='3']_.tbl-td-num]:py-3 [&[data-cols='3']_.tbl-td-num]:text-[13.5px]
                  [&[data-cols='3']_.tbl-td-strong]:py-3 [&[data-cols='3']_.tbl-td-strong]:text-[13.5px]
                  [&[data-cols='3']_.tbl-td]:py-3 [&[data-cols='3']_.tbl-td]:text-[13.5px]
                  [&[data-cols='4']_.tbl-td-num]:py-2.5
                  [&[data-cols='4']_.tbl-td-strong]:py-2.5
                  [&[data-cols='4']_.tbl-td]:py-2.5"
                data-cols={activeColumns.length}
                style={{
                  tableLayout: "auto",
                  width: "max-content",
                  maxWidth: "100%",
                }}
              >
                <thead>
                  <tr className="bg-surface-container-high/30">
                    {activeColumns.map((col) => (
                      <th
                        key={col.key}
                        className="tbl-th"
                        style={{
                          minWidth: col.width ?? "120px",
                          maxWidth: col.key === "SkillsetName" ? "280px" : "200px",
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={activeColumns.length}
                        className="px-4 py-12 text-center text-on-surface-variant/50 text-sm"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <tr key={i} className="tbl-tr">
                        {activeColumns.map((col) => {
                          const val = row[col.key];
                          const isNumber = col.key === "AbandonedCalls";
                          const cellClass = isNumber ? "tbl-td-num" : "tbl-td-strong";
                          const display =
                            val == null
                              ? ""
                              : isNumber
                              ? fmt.int(Number(val))
                              : String(val);
                          return (
                            <td key={col.key} className={cellClass}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={activeColumns.length}
                        className="px-4 py-12 text-center text-on-surface-variant/50 text-sm"
                      >
                        No data found for the selected date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-on-surface-variant/6">
              <Paginator
                totalItems={totalItems}
                currentPage={currentPage}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                accentColor={accent.color}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
