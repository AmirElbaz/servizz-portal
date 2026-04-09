import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import Paginator from "../components/ui/Paginator";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartments,
  fetchCatalogReport,
  getLogoUrl,
  type CatalogDepartment,
  type CatalogReport,
} from "../services/catalog";
import {
  fetchRawData,
  fetchGroupedData,
  fetchChartData,
  fetchSummary,
  downloadExport,
  type GroupedRow,
  type GroupMode,
  type ChartPoint,
  type SummaryData,
} from "../services/api";

const PIE_COLORS = ["#1d5fa8", "#9f403d"];

type ViewMode = "raw" | "interval" | "daily" | "weekly" | "monthly";

type GroupedColumnKey = keyof GroupedRow | "ServiceLevel";

function getGroupedColumns(viewMode: ViewMode, groupBySkillset: boolean) {
  const cols: { key: GroupedColumnKey; label: string; width?: string }[] = [];

  if (groupBySkillset) {
    cols.push({ key: "SkillsetName", label: "Skillset Name", width: "160px" });
  }

  if (viewMode === "interval") {
    cols.push({ key: "Date", label: "Date", width: "120px" });
    cols.push({ key: "Interval", label: "Interval", width: "80px" });
  } else {
    cols.push({ key: "Period", label: "Period", width: "150px" });
  }

  cols.push(
    { key: "ServiceLevel", label: "Service Level", width: "100px" },
    { key: "Offered", label: "Offered", width: "80px" },
    { key: "Answered", label: "Answered", width: "80px" },
    { key: "Abandoned", label: "Abandoned", width: "90px" },
    { key: "WaitTime", label: "Wait Time", width: "90px" },
    { key: "PCPTime", label: "PCP Time", width: "80px" },
    { key: "PresentingTime", label: "Presenting", width: "90px" },
    { key: "NumberOfTimesOnHold", label: "# On Hold", width: "80px" },
    { key: "HoldTime", label: "Hold Time", width: "80px" },
    { key: "ConsultTime", label: "Consult Time", width: "100px" },
    { key: "HandlingTime", label: "Handling Time", width: "100px" },
    { key: "SksAbandonDelay", label: "Sks Abandon", width: "100px" },
    { key: "SksAcceptedDelay", label: "Sks Accepted", width: "100px" },
    { key: "RecordCount", label: "Records", width: "70px" },
  );

  return cols;
}

function formatCellValue(_key: string, val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  return String(val);
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 30, 40, 50, 100, 200, 300, 400, 500];

export default function ReportViewPage() {
  const { projectCode, departmentCode, reportCode } = useParams<{
    projectCode: string;
    departmentCode: string;
    reportCode: string;
  }>();

  // For the existing data-fetching code that still expects "projectId"
  const projectId = projectCode;

  const [project, setProject] = useState<Project | null>(null);
  const [dept, setDept] = useState<CatalogDepartment | null>(null);
  const [report, setReport] = useState<CatalogReport | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogNotFound, setCatalogNotFound] = useState(false);

  useEffect(() => {
    if (!projectCode || !departmentCode || !reportCode) return;
    setCatalogLoading(true);
    setCatalogNotFound(false);
    Promise.all([
      fetchCatalogProject(projectCode),
      fetchCatalogDepartments(projectCode),
      fetchCatalogReport(reportCode),
    ])
      .then(([p, depts, r]) => {
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
        setDept(depts.find((d) => d.code === departmentCode) ?? null);
        setReport(r);
      })
      .catch(() => setCatalogNotFound(true))
      .finally(() => setCatalogLoading(false));
  }, [projectCode, departmentCode, reportCode]);

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(yesterday);
  const [dateTo, setDateTo] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>("raw");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [groupBySkillset, setGroupBySkillset] = useState(true);
  const [intervalWidth, setIntervalWidth] = useState<15 | 30>(30);

  // Table data
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  const [groupedRows, setGroupedRows] = useState<GroupedRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);

  // Chart & summary
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [summary, setSummary] = useState<SummaryData>({ offered: 0, answered: 0, abandoned: 0, serviceLevel: 0 });
  const [chartMetric, setChartMetric] = useState<"Answered" | "Abandoned">("Answered");

  const handlePageChange = useCallback((page: number) => setCurrentPage(page), []);
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // Fetch table data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (viewMode === "raw") {
          const res = await fetchRawData(dateFrom, dateTo, currentPage, pageSize, projectId);
          if (!cancelled) {
            setRawRows(res.rows);
            setTotalItems(res.total);
            setGroupedRows([]);
            if (res.rows.length > 0) {
              setRawColumns(Object.keys(res.rows[0]));
            }
          }
        } else {
          const mode: GroupMode = viewMode as GroupMode;
          const res = await fetchGroupedData(dateFrom, dateTo, mode, currentPage, pageSize, projectId, groupBySkillset, intervalWidth);
          if (!cancelled) {
            setGroupedRows(res.rows);
            setTotalItems(res.total);
            setRawRows([]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch report data:", err);
        if (!cancelled) { setRawRows([]); setGroupedRows([]); setTotalItems(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, viewMode, currentPage, pageSize, projectId, groupBySkillset, intervalWidth]);

  // Fetch chart + summary (independent of view mode)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [chart, sum] = await Promise.all([
          fetchChartData(dateFrom, dateTo, projectId),
          fetchSummary(dateFrom, dateTo, projectId),
        ]);
        if (!cancelled) {
          setChartData(chart);
          setSummary(sum);
        }
      } catch (err) {
        console.error("Failed to fetch chart/summary:", err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, projectId]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, viewMode, groupBySkillset, intervalWidth]);

  if (catalogLoading) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant/60 text-sm">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (catalogNotFound || !project || !dept || !report) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Report not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  const isRaw = viewMode === "raw";
  const activeGroupedColumns = getGroupedColumns(viewMode, groupBySkillset);

  const pieData = [
    { name: "Answered", value: summary.answered },
    { name: "Abandoned", value: summary.abandoned },
  ];

  const areaChartData = chartData.map((p) => ({
    label: p.Date,
    offered: p.Answered + p.Abandoned,
    value: p[chartMetric],
  }));

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": project.color } as React.CSSProperties}>
        {/* ── Header ── */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
            <Link to="/dashboard" className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50">
              Servizz.gov
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <Link to={`/project/${projectCode}`} className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50">
              {project.name}
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <Link to={`/project/${projectCode}/department/${departmentCode}`} className="hover:text-on-surface transition-colors no-underline text-on-surface-variant/50">
              {dept.name}
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-accent">{report.name}</span>
          </nav>

          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tighter font-headline text-on-surface">
                {report.name}
              </h1>
              <p className="text-on-surface-variant/60 text-sm mt-1">
                {dept.name}
              </p>
            </div>
            <div className={`flex items-center gap-2 shrink-0 transition-opacity ${totalItems === 0 ? "opacity-30 pointer-events-none" : ""}`} title={totalItems === 0 ? "No data to export" : undefined}>
              <button
                onClick={() => downloadExport(dateFrom, dateTo, viewMode, projectId, groupBySkillset, intervalWidth, "excel", project.name, project.logo.split("/").pop())}
                disabled={totalItems === 0}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${project.color}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">table_view</span>
                Excel
              </button>
              <button
                onClick={() => downloadExport(dateFrom, dateTo, viewMode, projectId, groupBySkillset, intervalWidth, "pdf", project.name, project.logo.split("/").pop())}
                disabled={totalItems === 0}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${project.color}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                PDF
              </button>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mb-8 bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {/* Row 1: Date range + View mode */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full py-2.5 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent transition-all"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2.5 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent transition-all"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div className="min-w-[340px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                View
              </label>
              <div className="flex rounded-xl overflow-hidden border border-on-surface-variant/8">
                {(["raw", "interval", "daily", "weekly", "monthly"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setViewMode(opt)}
                    className={`flex-1 py-2.5 px-3 text-xs font-semibold capitalize transition-colors ${
                      viewMode === opt
                        ? "bg-accent text-white"
                        : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {opt === "raw" ? "Raw Data" : opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Toggles + record count */}
          <div className="flex items-center gap-6 pt-2 border-t border-on-surface-variant/6">
            {/* Toggle: Group by Skillset */}
            <div className={`flex items-center gap-2.5 transition-opacity ${isRaw ? "opacity-30 pointer-events-none" : ""}`}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 whitespace-nowrap">
                By Skillset
              </label>
              <button
                onClick={() => setGroupBySkillset(!groupBySkillset)}
                disabled={isRaw}
                className={`relative w-10 h-[22px] rounded-full transition-colors ${groupBySkillset ? "" : "bg-on-surface-variant/20"}`}
                style={groupBySkillset && !isRaw ? { backgroundColor: project.color } : undefined}
              >
                <span className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${groupBySkillset ? "translate-x-[18px]" : ""}`} />
              </button>
            </div>

            <div className="w-px h-5 bg-on-surface-variant/10" />

            {/* Toggle: Interval Width */}
            <div className={`flex items-center gap-2.5 transition-opacity ${viewMode !== "interval" ? "opacity-30 pointer-events-none" : ""}`}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 whitespace-nowrap">
                Interval
              </label>
              <div className="flex rounded-lg overflow-hidden border border-on-surface-variant/8">
                {([15, 30] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setIntervalWidth(w)}
                    disabled={viewMode !== "interval"}
                    className={`py-1.5 px-3 text-[10px] font-semibold transition-colors ${
                      intervalWidth === w
                        ? "bg-accent text-white"
                        : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                    style={intervalWidth === w && viewMode === "interval" ? { backgroundColor: project.color } : undefined}
                  >
                    {w}m
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-on-surface-variant/50 ml-auto">
              <span className="font-bold text-on-surface">{totalItems}</span> records
            </div>
          </div>
        </div>

        {/* ── Widgets ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div
            className="bg-white rounded-2xl p-6 flex items-center gap-5"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${project.color}10`, color: project.color }}
            >
              <span className="material-symbols-outlined text-2xl">call</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-1">
                Offered Calls
              </p>
              <p className="text-2xl font-black text-on-surface tracking-tight">
                {summary.offered.toLocaleString()}
              </p>
            </div>
          </div>
          <div
            className="bg-white rounded-2xl p-6 flex items-center gap-5"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${project.color}10`, color: project.color }}
            >
              <span className="material-symbols-outlined text-2xl">speed</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-1">
                Service Level
              </p>
              <p className="text-2xl font-black text-on-surface tracking-tight">
                {summary.serviceLevel}%
              </p>
            </div>
          </div>
        </div>

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          {/* Area Chart */}
          <div
            className="lg:col-span-3 bg-white rounded-2xl p-6"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
                  {chartMetric === "Answered" ? "Answered" : "Abandoned"} Calls by Day
                </h3>
                <p className="text-[11px] text-on-surface-variant/50">
                  Offered shown as area, {chartMetric.toLowerCase()} as line
                </p>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-on-surface-variant/8 shrink-0">
                {(["Answered", "Abandoned"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setChartMetric(opt)}
                    className={`py-1.5 px-3 text-[10px] font-semibold transition-colors ${
                      chartMetric === opt
                        ? "bg-accent text-white"
                        : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                    style={chartMetric === opt ? { backgroundColor: project.color } : undefined}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            {areaChartData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-on-surface-variant/40">
                <div className="text-center">
                  <span className="material-symbols-outlined text-4xl mb-2 block">show_chart</span>
                  <p className="text-sm">No data available for this period</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={areaChartData}>
                  <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={project.color} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={project.color} stopOpacity={0} />
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
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    formatter={(value, name) => [
                      Number(value).toLocaleString("en"),
                      name === "offered" ? "Offered" : chartMetric,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="offered"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    fill="url(#areaFill)"
                    strokeDasharray="4 2"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={project.color}
                    strokeWidth={2.5}
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pie Chart */}
          <div
            className="lg:col-span-2 bg-white rounded-2xl p-6"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
          >
            <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
              Offered Breakdown
            </h3>
            <p className="text-[11px] text-on-surface-variant/50 mb-4">
              Answered vs Abandoned
            </p>
            {summary.offered === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-on-surface-variant/40">
                <div className="text-center">
                  <span className="material-symbols-outlined text-4xl mb-2 block">pie_chart</span>
                  <p className="text-sm">No data available for this period</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [Number(value).toLocaleString("en")]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span style={{ fontSize: "11px", color: "#566166" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Data Table ── */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div className="px-6 py-4 border-b border-on-surface-variant/6 flex items-center justify-between">
            <h3 className="text-sm font-bold text-on-surface font-headline">
              {isRaw ? "Raw Data" : `Grouped by ${viewMode}`}
            </h3>
            <span className="text-[11px] text-on-surface-variant/50">
              {loading ? "Loading..." : `${totalItems} records`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-high/30">
                  {isRaw
                    ? rawColumns.map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))
                    : activeGroupedColumns.map((col) => (
                        <th
                          key={col.key}
                          className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 whitespace-nowrap"
                          style={{ minWidth: col.width }}
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
                      colSpan={isRaw ? rawColumns.length || 1 : activeGroupedColumns.length}
                      className="px-4 py-12 text-center text-on-surface-variant/50 text-sm"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : isRaw ? (
                  rawRows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-on-surface-variant/4 hover:bg-surface-container-low/50 transition-colors"
                    >
                      {rawColumns.map((col) => {
                        const val = row[col];
                        const isNumber = typeof val === "number";
                        return (
                          <td
                            key={col}
                            className={`px-4 py-3 text-[12px] whitespace-nowrap ${
                              isNumber
                                ? "text-on-surface font-medium tabular-nums"
                                : "text-on-surface-variant/80"
                            }`}
                          >
                            {formatCellValue(col, val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  groupedRows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-on-surface-variant/4 hover:bg-surface-container-low/50 transition-colors"
                    >
                      {activeGroupedColumns.map((col) => {
                        const val = col.key === "ServiceLevel"
                          ? (row.Offered > 0 ? `${Math.round((row.Answered / row.Offered) * 1000) / 10}%` : "—")
                          : row[col.key as keyof GroupedRow];
                        const isNumber = typeof val === "number" || col.key === "ServiceLevel";
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-3 text-[12px] whitespace-nowrap ${
                              isNumber
                                ? "text-on-surface font-medium tabular-nums"
                                : "text-on-surface-variant/80"
                            }`}
                          >
                            {val ?? ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
                {!loading && rawRows.length === 0 && groupedRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={isRaw ? rawColumns.length || 1 : activeGroupedColumns.length}
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
              accentColor={project.color}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
