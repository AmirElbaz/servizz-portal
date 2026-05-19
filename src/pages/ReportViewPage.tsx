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
  PieChart,
  Pie,
  Cell,
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
import { formatSecondsAsMmSs } from "../utils/formatDuration";
import { fmt } from "../utils/fmt";
import { REPORT_MIN_DATE } from "../utils/reportDateRange";

const PIE_COLORS = ["#2eb2ff", "#9f403d"];

type ViewMode = "raw" | "hourly" | "daily" | "weekly" | "monthly";

type GroupedColumnKey = keyof GroupedRow;

// Column order locked with Amir 2026-04-29 (PCA renamed from "Service Level" 2026-04-30):
//   call time → skillset → offered → answered → abandoned → PCA →
//   GOS → ATT → AWT → AHT → remaining columns.
function getGroupedColumns(viewMode: ViewMode, groupBySkillset: boolean) {
  const cols: { key: GroupedColumnKey; label: string; width?: string }[] = [];

  // 1. Call-time columns first
  if (viewMode === "hourly") {
    cols.push({ key: "Date", label: "Date", width: "120px" });
    cols.push({ key: "Hour", label: "Hour", width: "80px" });
  } else {
    cols.push({ key: "Period", label: "Period", width: "150px" });
  }

  // 2. Skillset (when grouped)
  if (groupBySkillset) {
    cols.push({ key: "SkillsetName", label: "Skillset Name", width: "160px" });
  }

  // 3. Volume → service metrics
  cols.push(
    { key: "Offered", label: "Offered", width: "80px" },
    { key: "Answered", label: "Answered", width: "80px" },
    { key: "Abandoned", label: "Abandoned", width: "90px" },
    { key: "PCA", label: "PCA", width: "80px" },
    { key: "GOS", label: "GOS", width: "80px" },
    { key: "ATT", label: "ATT", width: "80px" },
    { key: "AWT", label: "AWT", width: "80px" },
    { key: "AHT", label: "AHT", width: "80px" },
    // 4. Remaining detail columns
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

// Display formatter for the 5 derived/computed metrics in the grouped table.
// Returns a string (formatted) or a number (for plain numeric columns).
// "—" indicates "no data" — Offered=0 for PCA/GOS, Answered=0 for ATT/AWT/AHT.
// Duration metrics (ATT/AWT/AHT) render as mm:ss — call-center industry standard.
function getDerivedDisplay(key: GroupedColumnKey, row: GroupedRow): string | number | null {
  if (key === "PCA") return row.PCA == null ? "—" : `${fmt.dec(row.PCA, 1)}%`;
  if (key === "GOS") return row.GOS == null ? "—" : `${fmt.dec(row.GOS, 1)}%`;
  if (key === "ATT") return formatSecondsAsMmSs(row.ATT);
  if (key === "AWT") return formatSecondsAsMmSs(row.AWT);
  if (key === "AHT") return formatSecondsAsMmSs(row.AHT);
  return row[key as keyof GroupedRow];
}

const DERIVED_KEYS: ReadonlySet<string> = new Set([
  "PCA", "GOS", "ATT", "AWT", "AHT",
]);

// Stacked legend rendered BELOW a chart — one row per series.
// Each row: [color dot] [label] ………… [value, right-aligned, tabular].
// Used by both the area chart and the donut so the two cards on the
// page read as a pair. Lives outside the recharts <ResponsiveContainer>
// (rather than via <Legend content={…}>) so it lays out reliably and
// captures cleanly into the PDF chart-card screenshots.
function StatLegend({
  items,
}: {
  items: { color: string; label: string; value: number }[];
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 px-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-[11px]">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: it.color }}
          />
          <span className="text-on-surface-variant/70 font-medium">
            {it.label}
          </span>
          <span className="ml-auto font-bold text-on-surface tabular-nums">
            {fmt.int(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
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
  if (typeof val === "number") {
    return Number.isInteger(val) ? fmt.int(val) : fmt.dec(val, 1);
  }
  return String(val);
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 30, 40, 50, 100, 200, 300, 400, 500];

export default function ReportViewPage() {
  // Department-first URL:
  //   /department/:deptCode/project/:projectCode/report/:reportCode  (project-scoped)
  //   /department/:deptCode/report/:reportCode                       (direct report)
  //
  // React Router infers both shapes into the same component because the
  // routes share the same element. projectCode is undefined in the direct-
  // report case; we branch on its presence below.
  const { deptCode, projectCode, reportCode } = useParams<{
    deptCode: string;
    projectCode?: string;
    reportCode: string;
  }>();
  const departmentCode = deptCode;

  // For the existing data-fetching code that still expects "projectId".
  // projectId stays undefined for direct reports — report endpoints
  // interpret that as "no project filter".
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

    // Direct-report URL (no project): fetch department + report only.
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

    // Project-scoped URL: fetch project + department + report.
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
  // "raw" temporarily hidden from the View segmented control below — default
  // is "hourly" until raw is re-enabled. Logic that branches on `viewMode === "raw"`
  // is kept intact so re-enabling is a one-line revert.
  const [viewMode, setViewMode] = useState<ViewMode>("hourly");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [groupBySkillset, setGroupBySkillset] = useState(true);
  // Entire Day toggle: ON (default) = show every row, regardless of the
  // project's working-hours window. OFF = restrict to working hours only.
  // The backend API still takes a `workingHoursOnly` boolean; we send the
  // negation at every call site so the UI semantics stay readable.
  const [entireDay, setEntireDay] = useState(true);

  // Refs on the two chart cards — captured to PNG via html2canvas on PDF
  // export so the PDF embeds exactly the chart the user sees. Kept null
  // for Excel exports.
  const areaChartCardRef = useRef<HTMLDivElement | null>(null);
  const pieChartCardRef = useRef<HTMLDivElement | null>(null);
  // null = idle; "pdf" / "excel" while that specific export is in flight.
  // Tracks per-format so we can spin only the active button and leave the
  // other one disabled-but-not-spinning. Matches the pattern used by the
  // HR + IVR export buttons.
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  // Excel path bypasses chart capture (Excel ignores chartImages anyway),
  // so it's just the download call wrapped in the loading flag.
  async function handleExcelExport() {
    if (exporting) return;
    setExporting("excel");
    try {
      await downloadExport(
        dateFrom, dateTo, viewMode, projectId, groupBySkillset, "excel",
        accent.displayName, accent.logoFilename, !entireDay,
      );
    } finally {
      setExporting(null);
    }
  }

  // Captures the visible chart cards to PNG blobs and hands them to the
  // backend export. The backend embeds them in the PDF; on capture failure
  // we fall back to a chartless export rather than blocking the download.
  async function handlePdfExport() {
    if (exporting) return;
    setExporting("pdf");
    try {
      const refs = [areaChartCardRef.current, pieChartCardRef.current].filter(
        (el): el is HTMLDivElement => el !== null,
      );
      const blobs: Blob[] = [];
      for (const node of refs) {
        try {
          // html-to-image handles Tailwind v4's `oklch()` colors and our
          // `color-mix()` utilities, which html2canvas v1 silently choked
          // on (the export went out with zero chart images and no error).
          const blob = await domToBlob(node, {
            backgroundColor: "#ffffff",
            pixelRatio: 2,
            cacheBust: true,
          });
          if (blob) blobs.push(blob);
        } catch (err) {
          // One chart failed — log loudly (so this isn't silent next time)
          // and keep going so the other charts still ship.
          console.error("[pdf-export] chart capture failed", err);
        }
      }
      if (blobs.length === 0) {
        console.warn("[pdf-export] no chart images captured — PDF will have no charts");
      }
      await downloadExport(
        dateFrom, dateTo, viewMode, projectId, groupBySkillset, "pdf",
        accent.displayName, accent.logoFilename, !entireDay, blobs,
      );
    } finally {
      setExporting(null);
    }
  }

  // Table data
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  const [groupedRows, setGroupedRows] = useState<GroupedRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);

  // Chart & summary
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [summary, setSummary] = useState<SummaryData>({ offered: 0, answered: 0, abandoned: 0, pca: 0 });
  const [chartMetric, setChartMetric] = useState<"Answered" | "Abandoned">("Answered");

  // Fetch-failure surface. Either effect populates this on throw so a 200-OK
  // response with a bad body (or any other silent failure) becomes visible
  // instead of leaving the user staring at empty charts / tables.
  const [actionError, setActionError] = useState<string | null>(null);

  const handlePageChange = useCallback((page: number) => setCurrentPage(page), []);
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // Fetch table data. On throw we surface the error and leave the previous
  // rows in place — wiping to [] on every catch makes a transient backend
  // hiccup look like a permanent "no data" state.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (viewMode === "raw") {
          const res = await fetchRawData(dateFrom, dateTo, currentPage, pageSize, projectId, !entireDay);
          if (!cancelled) {
            setRawRows(res.rows);
            setTotalItems(res.total);
            setGroupedRows([]);
            if (res.rows.length > 0) {
              setRawColumns(Object.keys(res.rows[0]));
            }
            setActionError(null);
          }
        } else {
          const mode: GroupMode = viewMode as GroupMode;
          const res = await fetchGroupedData(dateFrom, dateTo, mode, currentPage, pageSize, projectId, groupBySkillset, !entireDay);
          if (!cancelled) {
            setGroupedRows(res.rows);
            setTotalItems(res.total);
            setRawRows([]);
            setActionError(null);
          }
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

  // Fetch chart + summary (re-fetch when view mode / interval changes too).
  // Promise.all is all-or-nothing — if chart throws, summary doesn't update
  // either, which is exactly the silent-bug scenario we want to surface.
  useEffect(() => {
    let cancelled = false;
    const chartMode = viewMode === "raw" ? "daily" : viewMode;
    async function load() {
      try {
        const [chart, sum] = await Promise.all([
          fetchChartData(dateFrom, dateTo, projectId, chartMode, !entireDay),
          fetchSummary(dateFrom, dateTo, projectId, !entireDay),
        ]);
        if (!cancelled) {
          setChartData(chart);
          setSummary(sum);
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

  // Reset page when filters change
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

  // `project` is deliberately allowed to be null for direct-report URLs
  // (`/department/:deptCode/report/:reportCode`). The dept + report are
  // sufficient to render — we fall back to theme blue + department name
  // for any project-scoped styling below.
  if (catalogNotFound || !dept || !report) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Report not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Branding defaults so the render path doesn't need null checks everywhere.
  // For direct reports, we use Centrecom Blue as the accent and the dept
  // name as the export-filename context.
  const accent = {
    color: project?.color ?? "#2eb2ff",
    displayName: project?.name ?? dept.name,
    logoFilename: project?.logo ? project.logo.split("/").pop() : undefined,
  };

  const isRaw = viewMode === "raw";

  // The full canonical column list for the current mode — defines the display
  // order and labels. We filter it below against the actual response rows so
  // columns the caller's policy doesn't grant are hidden entirely rather than
  // rendered as empty cells.
  const allGroupedColumns = getGroupedColumns(viewMode, groupBySkillset);
  const activeGroupedColumns = (() => {
    // No rows yet (first load, empty state, or loading): keep the full set so
    // the empty-state row can span the correct colSpan and the table skeleton
    // renders a full header.
    if (groupedRows.length === 0) return allGroupedColumns;

    const available = new Set(Object.keys(groupedRows[0] as object));
    return allGroupedColumns.filter((col) => {
      return available.has(col.key as string);
    });
  })();

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

        {/* Fetch-failure surface. Either useEffect's catch lands here so the
            user sees what actually went wrong (typically a 200-OK with an
            unparseable body) instead of a silently empty chart / table. */}
        <ErrorBanner
          message={actionError}
          onDismiss={() => setActionError(null)}
        />

        {/* "Data inconsistent" warning. If the summary endpoint succeeded
            (offered > 0) but the chart or grouped rows came back empty, that's
            the silent-bug signature we've been chasing — surface it loudly
            instead of just rendering a "No data available" placeholder. */}
        {!loading &&
          !actionError &&
          summary.offered > 0 &&
          (chartData.length === 0 || groupedRows.length === 0) && (
            <ErrorBanner
              tone="info"
              message={`Summary returned ${fmt.int(summary.offered)} offered call${summary.offered === 1 ? "" : "s"}, but the ${chartData.length === 0 && groupedRows.length === 0 ? "chart and table both" : chartData.length === 0 ? "chart" : "table"} came back empty. Endpoints disagree — try toggling "Group by skillset" or check the Network response for /chart and /grouped.`}
            />
          )}

        {/* ── Filters ── */}
        <div className="mb-8 prism-surface rounded-2xl p-5 space-y-4">
          {/* Row 1: Date range + View mode */}
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
                {(["hourly", "daily", "weekly", "monthly"] as const).map((opt) => (
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

          {/* Row 2: Toggles + record count */}
          <div className="flex items-center gap-6 pt-2 border-t border-on-surface-variant/6">
            {/* Toggle: Entire Day — ON (default) shows every row regardless of
                the project's working window. OFF restricts every metric to
                rows inside the project's defined working hours (normal /
                weekend / public-holiday). */}
            <div className="flex items-center gap-2.5">
              <label
                className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 whitespace-nowrap cursor-help"
                title="ON shows every call across the whole day. Turn OFF to restrict to each project's defined operating hours (normal / weekend / public holiday)."
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

            {/* Toggle: Group by Skillset */}
            <div className={`flex items-center gap-2.5 transition-opacity ${isRaw ? "opacity-30 pointer-events-none" : ""}`}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 whitespace-nowrap">
                By Skillset
              </label>
              <button
                onClick={() => setGroupBySkillset(!groupBySkillset)}
                disabled={isRaw}
                className={`relative w-10 h-[22px] rounded-full transition-colors ${groupBySkillset ? "" : "bg-on-surface-variant/20"}`}
                style={groupBySkillset && !isRaw ? { backgroundColor: accent.color } : undefined}
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
              <span className="material-symbols-outlined text-2xl">call</span>
            </div>
            <div>
              <p className="eyebrow-sm text-on-surface-variant/50 mb-1">
                Offered Calls
              </p>
              <p className="text-2xl font-black text-on-surface tracking-tight">
                {fmt.int(summary.offered)}
              </p>
            </div>
          </div>
          <div className="prism-surface rounded-2xl p-6 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${accent.color}10`, color: accent.color }}
            >
              <span className="material-symbols-outlined text-2xl">speed</span>
            </div>
            <div>
              <p className="eyebrow-sm text-on-surface-variant/50 mb-1">
                PCA
              </p>
              <p className="text-2xl font-black text-on-surface tracking-tight">
                {fmt.dec(summary.pca, 1)}%
              </p>
            </div>
          </div>
        </div>

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          {/* Area Chart */}
          <div ref={areaChartCardRef} className="lg:col-span-3 prism-surface rounded-2xl p-6">
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
                    style={chartMetric === opt ? { backgroundColor: accent.color } : undefined}
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
                      <stop offset="5%" stopColor={accent.color} stopOpacity={0.2} />
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
                    formatter={(value, name) => [
                      fmt.int(Number(value)),
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
                    stroke={accent.color}
                    strokeWidth={2.5}
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {/* Stacked legend below the area chart — total Offered above,
                total of the active metric (Answered / Abandoned) below,
                each with its color indicator. Same shape as the pie
                chart's legend so the two cards read as a pair. */}
            {areaChartData.length > 0 && (
              <StatLegend
                items={[
                  { color: "#94a3b8", label: "Offered",   value: summary.offered },
                  {
                    color: accent.color,
                    label: chartMetric,
                    value: chartMetric === "Answered" ? summary.answered : summary.abandoned,
                  },
                ]}
              />
            )}
            {project && (
              <ChartCardBrandStrip
                scope={{ kind: "project", project: { name: project.name, logo: project.logo } }}
                accentColor={accent.color}
              />
            )}
          </div>

          {/* Pie Chart */}
          <div ref={pieChartCardRef} className="lg:col-span-2 prism-surface rounded-2xl p-6">
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
                    cy="50%"
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
                    formatter={(value) => [fmt.int(Number(value))]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {/* Stacked legend below the donut — one row per slice with the
                color dot, the label, and the slice's count right-aligned.
                Replaces both the on-slice labels (cluttered the chart) and
                the previous side-by-side Legend (no numbers). */}
            {summary.offered > 0 && (
              <StatLegend
                items={pieData.map((d, i) => ({
                  color: PIE_COLORS[i % PIE_COLORS.length],
                  label: d.name,
                  value: d.value,
                }))}
              />
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
        {/* Flex wrapper with `justify-start` anchors the card to the left
            regardless of what the parent layout does. Card itself shrinks
            to fit the table's natural width (`w-fit`) but never exceeds
            the parent (`max-w-full`). Few visible columns → narrow card
            flush left, with the page paper on the right; wide column set
            → card fills the page and the table horizontally scrolls. */}
        <div className="flex justify-start">
        <div className="prism-surface rounded-2xl overflow-hidden w-fit max-w-full">
          <div className="px-6 py-4 border-b border-on-surface-variant/6 flex items-center justify-between gap-8">
            <h3 className="text-sm font-bold text-on-surface font-headline whitespace-nowrap">
              {isRaw ? "Raw Data" : viewMode === "hourly" ? "Hourly view" : `Grouped by ${viewMode}`}
            </h3>
            <span className="text-[11px] text-on-surface-variant/50 whitespace-nowrap">
              {loading ? "Loading..." : `${fmt.int(totalItems)} records`}
            </span>
          </div>
          {/* Table renders at its natural width (sum of per-column min/max
              caps below). No artificial min-width and no auto-margin — the
              card itself shrinks to fit (see w-fit max-w-full above), so a
              3-column report is a tight left-anchored card with empty
              paper on the right, not an island of stretched columns.
              Adaptive density (font + padding) keys off `data-cols` for
              the 1–4 column cases. */}
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
              data-cols={isRaw ? rawColumns.length : activeGroupedColumns.length}
              style={{
                tableLayout: "auto",
                width: "max-content",
                maxWidth: "100%",
              }}
            >
              <thead>
                <tr className="bg-surface-container-high/30">
                  {isRaw
                    ? rawColumns.map((col) => (
                        <th
                          key={col}
                          className="tbl-th"
                          style={{ minWidth: "110px", maxWidth: "220px" }}
                        >
                          {col}
                        </th>
                      ))
                    : activeGroupedColumns.map((col) => (
                        <th
                          key={col.key}
                          className="tbl-th"
                          style={{
                            minWidth: col.width ?? "110px",
                            maxWidth: col.key === "SkillsetName" || col.key === "Period" ? "260px" : "180px",
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
                      colSpan={isRaw ? rawColumns.length || 1 : activeGroupedColumns.length}
                      className="px-4 py-12 text-center text-on-surface-variant/50 text-sm"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : isRaw ? (
                  rawRows.map((row, i) => (
                    <tr key={i} className="tbl-tr">
                      {rawColumns.map((col) => {
                        const val = row[col];
                        const isNumber = typeof val === "number";
                        return (
                          <td key={col} className={isNumber ? "tbl-td-num" : "tbl-td"}>
                            {formatCellValue(col, val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  groupedRows.map((row, i) => (
                    <tr key={i} className="tbl-tr">
                      {activeGroupedColumns.map((col) => {
                        const val = DERIVED_KEYS.has(col.key)
                          ? getDerivedDisplay(col.key, row)
                          : row[col.key as keyof GroupedRow];
                        const isNumber = typeof val === "number" || DERIVED_KEYS.has(col.key);
                        // Plain numbers (WaitTime, PCPTime, HoldTime, …) go
                        // through `fmt.auto` for thousand separators. Derived
                        // cells already arrive pre-formatted as strings
                        // ("95.2%", "mm:ss") so we render those untouched.
                        const display =
                          val == null
                            ? ""
                            : typeof val === "number"
                            ? fmt.auto(val)
                            : val;
                        // Period/Date/Hour/SkillsetName are the row anchors —
                        // give them strong styling so the eye fixes on the
                        // identifier before scanning across the numbers.
                        const isAnchor =
                          col.key === "Period" ||
                          col.key === "Date" ||
                          col.key === "Hour" ||
                          col.key === "SkillsetName";
                        const cellClass = isNumber
                          ? "tbl-td-num"
                          : isAnchor
                          ? "tbl-td-strong"
                          : "tbl-td";
                        return (
                          <td key={col.key} className={cellClass}>
                            {display}
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
              accentColor={accent.color}
            />
          </div>
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
