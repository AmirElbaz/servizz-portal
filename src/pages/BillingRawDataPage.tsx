import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import ReportProjectSwitcher from "../components/reports/ReportProjectSwitcher";
import Paginator from "../components/ui/Paginator";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartment,
  fetchCatalogReport,
  type CatalogDepartmentSummary,
  type CatalogReport,
} from "../services/catalog";
import { adaptProject } from "../utils/adaptProject";
import { pushRecentItem } from "../hooks/useRecentItems";
import ErrorBanner from "../components/admin/ErrorBanner";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
} from "../components/reports/ReportPageHeader";
import { getLogoPlate } from "../utils/logoPlate";
import {
  fetchBillingRawData,
  fetchBillingProjects,
  downloadBillingRawDataExport,
  type BillingRawRow,
  type BillingView,
} from "../services/billingRawData";
import { fmt } from "../utils/fmt";
import { REPORT_MIN_DATE } from "../utils/reportDateRange";

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 30, 40, 50, 100, 200, 300, 400, 500];

// The locked eight-column contract (Amir 2026-05-25), in this exact order. The
// counts are right-aligned numerics; PCA/GOS/AHT are rate/duration numerics;
// Call Time + Queue are identifier text. A column the policy hides simply isn't
// in the response, so it drops out of `activeColumns` below.
const COLUMNS: { key: string; label: string; numeric: boolean; width?: string }[] = [
  { key: "CallTime",  label: "Call Time",        numeric: false, width: "190px" },
  { key: "Skillset",  label: "Queue (Skillset)", numeric: false, width: "200px" },
  { key: "Offered",   label: "Offered",          numeric: true,  width: "100px" },
  { key: "Answered",  label: "Answered",         numeric: true,  width: "100px" },
  { key: "Abandoned", label: "Abandoned",        numeric: true,  width: "110px" },
  { key: "PCA",       label: "PCA",              numeric: true,  width: "90px" },
  { key: "GOS",       label: "GOS",              numeric: true,  width: "90px" },
  { key: "AHT",       label: "AHT",              numeric: true,  width: "90px" },
];

const COUNT_KEYS = new Set(["Offered", "Answered", "Abandoned"]);

function renderCell(key: string, val: string | number | null): string {
  if (val == null) return "";
  if (COUNT_KEYS.has(key)) return fmt.int(Number(val));
  return String(val); // PCA/GOS/AHT numeric as-is; Call Time / Queue as text
}

export default function BillingRawDataPage() {
  // Dedicated route — the report segment is the literal `billing-raw-data`, so
  // there is no reportCode param; only dept / project are dynamic.
  //   /department/:deptCode/project/:projectCode/report/billing-raw-data
  //   /department/:deptCode/report/billing-raw-data
  const { deptCode, projectCode } = useParams<{ deptCode?: string; projectCode?: string }>();
  const reportCode = "billing-raw-data";
  const departmentCode = deptCode;

  const [selectedProject, setSelectedProject] = useState<string>("all");
  const projectId = projectCode ?? (selectedProject === "all" ? undefined : selectedProject);

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
      Promise.all([fetchCatalogDepartment(departmentCode), fetchCatalogReport(reportCode)])
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
        setProject(adaptProject(p));
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
  const monthStart = `${today.slice(0, 7)}-01`;
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [view, setView] = useState<BillingView>("call");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Start loading so the first paint is the skeleton, not a full-column flash.
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const [rows, setRows] = useState<BillingRawRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const handlePageChange = useCallback((page: number) => setCurrentPage(page), []);
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchBillingRawData({ dateFrom, dateTo, view, project: projectId, page: currentPage, pageSize });
        if (!cancelled) {
          setRows(res.rows);
          setTotalItems(res.total);
          setActionError(null);
        }
      } catch (err) {
        console.error("Failed to fetch billing raw data:", err);
        if (!cancelled) setActionError(`Couldn't load report rows: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, view, currentPage, pageSize, projectId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, view, projectId]);

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

  const activeColumns = rows.length === 0
    ? COLUMNS
    : COLUMNS.filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c.key));

  async function handleExport(format: "excel" | "pdf") {
    if (exporting) return;
    setExporting(format);
    try {
      const plate = format === "pdf"
        ? await getLogoPlate(project?.logo, project?.logoPlateMode)
        : null;
      await downloadBillingRawDataExport({
        format,
        view,
        dateFrom,
        dateTo,
        project: projectId,
        projectName: accent.displayName,
        projectLogo: accent.logoFilename,
        projectAccent: plate?.bg,
      });
    } catch (err) {
      setActionError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(null);
    }
  }

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
              <BreadcrumbLink to={`/department/${departmentCode}`}>{dept.name}</BreadcrumbLink>
              {project && projectCode && (
                <>
                  <BreadcrumbChevron />
                  <BreadcrumbLink to={`/department/${departmentCode}/project/${projectCode}`}>
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
              {(["excel", "pdf"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => handleExport(f)}
                  disabled={totalItems === 0 || exporting !== null}
                  className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                  style={{ boxShadow: `0 4px 20px ${accent.color}25` }}
                >
                  {exporting === f ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">{f === "excel" ? "table_view" : "picture_as_pdf"}</span>
                  )}
                  {exporting === f ? "Exporting…" : f === "excel" ? "Excel" : "PDF"}
                </button>
              ))}
            </div>
          }
        />

        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

        {/* ── Filters ── */}
        <div className="mb-8 prism-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            {!projectCode && departmentCode && (
              <ReportProjectSwitcher
                deptCode={departmentCode}
                value={selectedProject}
                fetchProjects={fetchBillingProjects}
                onChange={(v, proj) => {
                  setSelectedProject(v);
                  setProject(proj ? adaptProject(proj) : null);
                }}
              />
            )}
            <div className="flex-1 min-w-[110px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">From</label>
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
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">To</label>
              <input
                type="date"
                min={REPORT_MIN_DATE}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-xs sm:text-sm focus:outline-none focus:border-accent transition-all"
                style={{ colorScheme: "light" }}
              />
            </div>
            <div className="w-full sm:w-auto sm:min-w-[260px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">View</label>
              <div className="flex rounded-xl overflow-hidden border border-on-surface-variant/8">
                {([["call", "Per call"], ["skillset", "Per skillset"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setView(val)}
                    className={`flex-1 h-[38px] px-3 text-[11px] sm:text-xs font-semibold transition-colors ${
                      view === val
                        ? "bg-accent text-white"
                        : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Data Table ── */}
        <div className="flex justify-start">
          <div className="prism-surface rounded-2xl overflow-hidden w-fit max-w-full">
            <div className="px-6 py-4 border-b border-on-surface-variant/6 flex items-center justify-between gap-8">
              <h3 className="text-sm font-bold text-on-surface font-headline whitespace-nowrap">
                {view === "call" ? "Per call" : "Per skillset (monthly)"}
              </h3>
              <span className="text-[11px] text-on-surface-variant/50 whitespace-nowrap">
                {loading ? "Loading..." : `${fmt.int(totalItems)} ${view === "call" ? "calls" : "rows"}`}
              </span>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-6 space-y-3" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 rounded-lg bg-surface-container-high/50 animate-pulse" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-16 text-center text-on-surface-variant/50 text-sm">
                  No data found for the selected date range.
                </div>
              ) : (
                <table
                  className="tbl"
                  data-cols={activeColumns.length}
                  style={{ tableLayout: "auto", width: "max-content", maxWidth: "100%" }}
                >
                  <thead>
                    <tr className="bg-surface-container-high/30">
                      {activeColumns.map((col) => (
                        <th
                          key={col.key}
                          className={`tbl-th ${col.numeric ? "text-right" : ""}`}
                          style={{ minWidth: col.width ?? "100px", maxWidth: col.numeric ? "160px" : "260px" }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="tbl-tr">
                        {activeColumns.map((col) => (
                          <td key={col.key} className={col.numeric ? "tbl-td-num" : "tbl-td-strong"}>
                            {renderCell(col.key, row[col.key] ?? null)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
