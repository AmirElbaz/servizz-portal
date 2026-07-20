import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { toBlob as domToBlob } from "html-to-image";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import DashboardLayout from "../components/layout/DashboardLayout";
import ReportProjectSwitcher from "../components/reports/ReportProjectSwitcher";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartment,
  type CatalogDepartmentSummary,
} from "../services/catalog";
import { adaptProject } from "../utils/adaptProject";
import { pushRecentItem } from "../hooks/useRecentItems";
import ErrorBanner from "../components/admin/ErrorBanner";
import ReportPageHeader, {
  BreadcrumbChevron,
  BreadcrumbCurrent,
  BreadcrumbLink,
} from "../components/reports/ReportPageHeader";
import ChartCardBrandStrip from "../components/reports/ChartCardBrandStrip";
import { getLogoPlate } from "../utils/logoPlate";
import {
  fetchChannelReport,
  downloadChannelExport,
  type ChannelReport,
  type ChannelReportKind,
  type ChannelSection,
} from "../services/channelReports";
import { REPORT_MIN_YEAR } from "../utils/reportDateRange";
import { fmt } from "../utils/fmt";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const REPORT_META: Record<ChannelReportKind, { name: string; icon: string; subtitle: string }> = {
  email: {
    name: "Email Report",
    icon: "mail",
    subtitle: "Emails offered, handled and pending by month",
  },
  digital: {
    name: "Chats, Facebook & Walk-Ins",
    icon: "forum",
    subtitle: "Digital-channel volumes by month",
  },
};

// Case-type breakdown shown in the Top Products card. Order + colors match the
// printed sample (RFI blue, RFS green, SUG amber, COM red).
const PRODUCT_METRICS: {
  key: "rfi" | "rfs" | "sug" | "com";
  short: string;
  full: string;
  color: string;
}[] = [
  { key: "rfi", short: "RFI", full: "Requests for Information", color: "#2EB2FF" },
  { key: "rfs", short: "RFS", full: "Requests for Service", color: "#3BA776" },
  { key: "sug", short: "SUG", full: "Suggestions", color: "#E0A100" },
  { key: "com", short: "COM", full: "Complaints", color: "#9F403D" },
];

// Pick a representative Material Symbol for a KPI card from its label.
function kpiIcon(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("offer")) return "outgoing_mail";
  if (l.includes("handl") || l.includes("answer") || l.includes("resolved") || l.includes("closed"))
    return "mark_email_read";
  if (l.includes("pending") || l.includes("open") || l.includes("backlog") || l.includes("await"))
    return "hourglass_top";
  if (l.includes("chat")) return "chat";
  if (l.includes("facebook") || l.includes("social")) return "thumb_up";
  if (l.includes("walk")) return "directions_walk";
  if (l.includes("total") || l.includes("case") || l.includes("volume")) return "inbox";
  return "insights";
}

// Previous complete month (reports are for finished months), floored to 2026.
function defaultPeriod(): { year: number; month: number } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based = previous month in 1-based terms
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  if (year < REPORT_MIN_YEAR) {
    year = REPORT_MIN_YEAR;
    month = 1;
  }
  return { year, month };
}

export default function ChannelReportPage({ reportKind }: { reportKind: ChannelReportKind }) {
  // /department/:deptCode/project/:projectCode/report/(email|digital-channels)
  // /department/:deptCode/report/(email|digital-channels)
  const { deptCode, projectCode } = useParams<{ deptCode?: string; projectCode?: string }>();
  const departmentCode = deptCode;
  const meta = REPORT_META[reportKind];

  // In-page project selection for the dept-direct view; URL project wins.
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const projectId = projectCode ?? (selectedProject === "all" ? undefined : selectedProject);

  const [project, setProject] = useState<Project | null>(null);
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogNotFound, setCatalogNotFound] = useState(false);

  const initial = defaultPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  const [data, setData] = useState<ChannelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const chartRefs = useRef<Array<HTMLDivElement | null>>([]);

  // ── Catalog (project + dept) for the header. NOT a catalog report — the
  // title/icon come from REPORT_META. ──
  useEffect(() => {
    if (!departmentCode) return;
    setCatalogLoading(true);
    setCatalogNotFound(false);

    const deptP = fetchCatalogDepartment(departmentCode);
    const projP = projectCode ? fetchCatalogProject(projectCode) : Promise.resolve(null);

    Promise.all([projP, deptP])
      .then(([p, d]) => {
        setDept(d);
        setProject(p ? adaptProject(p) : null);
        pushRecentItem({
          kind: "report",
          id: p ? `${d.code}/${p.code}/${reportKind}` : `${d.code}/${reportKind}`,
          label: meta.name,
          sublabel: p ? `${p.displayName} · ${d.name}` : d.name,
          icon: meta.icon,
          href: p
            ? `/department/${d.code}/project/${p.code}/report/${reportKind === "digital" ? "digital-channels" : "email"}`
            : `/department/${d.code}/report/${reportKind === "digital" ? "digital-channels" : "email"}`,
        });
      })
      .catch(() => setCatalogNotFound(true))
      .finally(() => setCatalogLoading(false));
  }, [projectCode, departmentCode, reportKind, meta.name, meta.icon]);

  // ── Report data ──
  useEffect(() => {
    if (!projectId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchChannelReport(projectId, year, month, reportKind)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setActionError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setActionError(`Couldn't load report: ${msg}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, year, month, reportKind]);

  async function handleExcelExport() {
    if (exporting || !projectId) return;
    setExporting("excel");
    try {
      await downloadChannelExport(reportKind, projectId, year, month, "excel", displayName, logoFilename);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  async function handlePdfExport() {
    if (exporting || !projectId) return;
    setExporting("pdf");
    try {
      const blobs: Blob[] = [];
      for (const node of chartRefs.current) {
        if (!node) continue;
        try {
          const blob = await domToBlob(node, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
          if (blob) blobs.push(blob);
        } catch (err) {
          console.error("[pdf-export] chart capture failed", err);
        }
      }
      const plate = await getLogoPlate(project?.logo, project?.logoPlateMode);
      await downloadChannelExport(reportKind, projectId, year, month, "pdf", displayName, logoFilename, blobs, plate.bg);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  if (catalogLoading) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant/60 text-sm">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (catalogNotFound || !dept) {
    return (
      <DashboardLayout wide>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Report not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  const accentColor = project?.color ?? "#2eb2ff";
  const displayName = project?.name ?? dept.name;
  const logoFilename = project?.logo ? project.logo.split("/").pop() : undefined;
  const hasData = !!data && data.sections.length > 0;
  // Only offer export when a section carries real rows (a not-yet-wired digital
  // report returns pending stubs with empty tables).
  const hasContent = !!data && data.sections.some((s) => s.tableRows.length > 0);
  const canExport = !!projectId && hasContent && !loading;

  chartRefs.current = [];

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": accentColor } as React.CSSProperties}>
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
          accentColor={accentColor}
          title={meta.name}
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
              <BreadcrumbCurrent>{meta.name}</BreadcrumbCurrent>
            </>
          }
          actions={
            <div
              className={`flex items-center gap-2 transition-opacity ${canExport ? "" : "opacity-30 pointer-events-none"}`}
              title={canExport ? undefined : "No data to export"}
            >
              <button
                onClick={handleExcelExport}
                disabled={!canExport || exporting !== null}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${accentColor}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {exporting === "excel" ? "progress_activity" : "table_view"}
                </span>
                {exporting === "excel" ? "Exporting…" : "Excel"}
              </button>
              <button
                onClick={handlePdfExport}
                disabled={!canExport || exporting !== null}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${accentColor}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {exporting === "pdf" ? "progress_activity" : "picture_as_pdf"}
                </span>
                {exporting === "pdf" ? "Exporting…" : "PDF"}
              </button>
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
                onChange={(v, proj) => {
                  setSelectedProject(v);
                  setProject(proj ? adaptProject(proj) : null);
                }}
              />
            )}
            <div className="min-w-[130px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full py-2.5 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent transition-all"
              >
                {Array.from({ length: new Date().getFullYear() - REPORT_MIN_YEAR + 1 }, (_, i) => REPORT_MIN_YEAR + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full py-2.5 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent transition-all"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-on-surface-variant/50 ml-auto self-center max-w-[280px]">
              {meta.subtitle}. Trend &amp; table cover January – {MONTHS[month - 1]} {year}.
            </p>
          </div>
        </div>

        {/* ── Body ── */}
        {!projectId ? (
          <div className="prism-surface rounded-2xl px-4 py-16 text-center text-on-surface-variant/60 text-sm">
            Select a project to view its {meta.name.toLowerCase()}.
          </div>
        ) : loading ? (
          <div className="prism-surface rounded-2xl p-6 space-y-3" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-surface-container-high/50 animate-pulse" />
            ))}
          </div>
        ) : !hasData ? (
          <div className="prism-surface rounded-2xl px-4 py-16 text-center text-on-surface-variant/50 text-sm">
            No data found for the selected period.
          </div>
        ) : (
          <div className="space-y-10">
            {data!.sections.map((section) => (
              <SectionBlock
                key={section.channel}
                section={section}
                accentColor={accentColor}
                project={project}
                multi={data!.sections.length > 1}
                registerChart={(el) => {
                  if (el) chartRefs.current.push(el);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ── One channel section: KPI cards + trend chart + table ─────────────────────
function SectionBlock({
  section,
  accentColor,
  project,
  multi,
  registerChart,
}: {
  section: ChannelSection;
  accentColor: string;
  project: Project | null;
  multi: boolean;
  registerChart: (el: HTMLDivElement | null) => void;
}) {
  const pending = !!section.note && section.tableHeaders.length === 0;

  return (
    <section>
      {multi && (
        <div className="flex items-center gap-2.5 mb-5">
          <span
            className="w-1 h-5 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
          <h2 className="text-lg font-bold font-headline text-on-surface tracking-tight">
            {section.title}
          </h2>
        </div>
      )}

      {pending ? (
        <div className="prism-surface rounded-2xl px-4 py-12 text-center text-on-surface-variant/50 text-sm">
          <span className="material-symbols-outlined text-3xl mb-2 block opacity-60">hourglass_empty</span>
          {section.note}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          {section.kpis.length > 0 && (
            <div
              className="grid gap-4 mb-8"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))` }}
            >
              {section.kpis.map((k) => {
                const tint = k.accentHex ?? accentColor;
                return (
                  <div key={k.label} className="prism-surface rounded-2xl p-5 flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${tint}14`, color: tint }}
                    >
                      <span className="material-symbols-outlined text-[22px]">{kpiIcon(k.label)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="eyebrow-sm text-on-surface-variant/50 mb-1.5 truncate">{k.label}</p>
                      <p
                        className="text-[26px] leading-none font-black tracking-tight"
                        style={{ color: k.accentHex ?? "#1a2024" }}
                      >
                        {k.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Trend chart */}
          {section.series.length > 0 && (
            <div className="mb-8">
              <div ref={registerChart} className="prism-surface rounded-2xl p-6 sm:p-7">
                <div className="mb-5">
                  <h3 className="text-base font-bold text-on-surface font-headline tracking-tight mb-1">
                    {section.title} — Monthly Trend
                  </h3>
                  <p className="text-xs text-on-surface-variant/50">
                    {section.series.map((s) => s.label).join(" · ")} per month
                  </p>
                </div>
                {section.trend.length === 0 ? (
                  <div className="flex items-center justify-center h-[320px] text-on-surface-variant/40">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-4xl mb-2 block">bar_chart</span>
                      <p className="text-sm">No data available for this period</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={330}>
                    <BarChart data={section.trend} barGap={6} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#566166" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e8eff3" }}
                        dy={4}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#566166" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={fmt.compact}
                        width={44}
                      />
                      <Tooltip
                        cursor={{ fill: `${accentColor}0d` }}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "none",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                          fontSize: "12px",
                        }}
                        formatter={(value) => fmt.int(Number(value))}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                      {section.series.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          name={s.label}
                          fill={s.colorHex ?? (i === 0 ? accentColor : "#3BA776")}
                          radius={[5, 5, 0, 0]}
                          maxBarSize={52}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {project && (
                  <ChartCardBrandStrip
                    scope={{
                      kind: "project",
                      project: { name: project.name, logo: project.logo, logoPlateMode: project.logoPlateMode },
                    }}
                    accentColor={accentColor}
                  />
                )}
              </div>
            </div>
          )}

          {/* Non-monthly breakdown (e.g. Workflow's Pending-Centrecom split) →
              prominent cards: col0 = channel/label, col1 = number. */}
          {section.tableTitle && section.tableHeaders.length >= 2 && section.tableRows.length > 0 && (
            <div className="mb-6">
              <h3 className="text-base font-bold text-on-surface font-headline mb-4">
                {section.tableTitle}
              </h3>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
              >
                {section.tableRows.map((row, ri) => (
                  <div key={ri} className="prism-surface rounded-2xl p-6">
                    <p className="eyebrow-sm text-on-surface-variant/50 mb-1.5">
                      {String(row[section.tableHeaders[0]] ?? "")}
                    </p>
                    <p
                      className="text-3xl font-black tracking-tight"
                      style={{ color: accentColor }}
                    >
                      {fmt.auto(row[section.tableHeaders[1]])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly breakdown table (channel volume by month) */}
          {!section.tableTitle && section.tableHeaders.length > 0 && (
            <div className="flex justify-start">
              <div className="prism-surface rounded-2xl overflow-hidden w-fit max-w-full">
                <div className="px-6 py-4 border-b border-on-surface-variant/6 flex items-center justify-between gap-8">
                  <h3 className="text-sm font-bold text-on-surface font-headline whitespace-nowrap">
                    {section.title} — Monthly Breakdown
                  </h3>
                  <span className="text-[11px] text-on-surface-variant/50 whitespace-nowrap">
                    {section.tableRows.length} {section.tableRows.length === 1 ? "month" : "months"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table
                    className="tbl
                      [&[data-cols='2']_.tbl-td-num]:py-3 [&[data-cols='2']_.tbl-td-num]:text-[14px]
                      [&[data-cols='3']_.tbl-td-num]:py-3 [&[data-cols='3']_.tbl-td-num]:text-[13.5px]
                      [&[data-cols='4']_.tbl-td-num]:py-2.5"
                    data-cols={section.tableHeaders.length}
                    style={{ tableLayout: "auto", width: "max-content", maxWidth: "100%" }}
                  >
                    <thead>
                      <tr className="bg-surface-container-high/30">
                        {section.tableHeaders.map((h, ci) => (
                          <th
                            key={h}
                            className="tbl-th"
                            style={{
                              minWidth: ci === 0 ? "140px" : "110px",
                              maxWidth: "260px",
                              textAlign: ci === 0 ? "left" : "center",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.tableRows.map((row, ri) => (
                        <tr key={ri} className="tbl-tr">
                          {section.tableHeaders.map((h, ci) => {
                            const val = row[h];
                            const cellClass = ci === 0 ? "tbl-td-strong" : "tbl-td-num";
                            return (
                              <td
                                key={h}
                                className={cellClass}
                                style={ci === 0 ? undefined : { textAlign: "center" }}
                              >
                                {val == null ? "" : ci === 0 ? String(val) : fmt.auto(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Walk-ins per Site — physical-branch breakdown for the selected
              month. Sourced from crm_walkins.site (100% populated, unlike
              queue_name); diacritic/casing variants folded server-side. Only
              the walk-ins section carries `sites`. */}
          {section.sites && section.sites.length > 0 && (
            <div className="mt-8 flex justify-start">
              <div className="prism-surface rounded-2xl overflow-hidden w-fit max-w-full">
                <div className="px-6 py-4 border-b border-on-surface-variant/6 flex items-center justify-between gap-8">
                  <h3 className="text-sm font-bold text-on-surface font-headline whitespace-nowrap">
                    {section.title} — Walk-ins per Site
                  </h3>
                  <span className="text-[11px] text-on-surface-variant/50 whitespace-nowrap">
                    {section.sites.length} {section.sites.length === 1 ? "site" : "sites"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table
                    className="tbl"
                    data-cols={2}
                    style={{ tableLayout: "auto", width: "max-content", maxWidth: "100%" }}
                  >
                    <thead>
                      <tr className="bg-surface-container-high/30">
                        <th className="tbl-th" style={{ minWidth: "220px", maxWidth: "360px", textAlign: "left" }}>
                          Site
                        </th>
                        <th className="tbl-th" style={{ minWidth: "120px", textAlign: "center" }}>
                          Walk-Ins
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.sites.map((s, ri) => (
                        <tr key={ri} className="tbl-tr">
                          <td className="tbl-td-strong">{s.site}</td>
                          <td className="tbl-td-num" style={{ textAlign: "center" }}>
                            {fmt.int(s.count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Top Products — full product name on the left, colored volume bars
              on the right (echoes the printed sample). Long product names are
              never truncated; a custom bar list gives us full control over
              label wrapping, bar thickness and font size that a vertical
              Recharts BarChart can't. */}
          {section.products && section.products.length > 0 && (() => {
            const products = section.products;
            const maxVal = Math.max(
              1,
              ...products.flatMap((p) => [p.rfi, p.rfs, p.sug, p.com]),
            );
            return (
              <div className="mt-8">
                <div ref={registerChart} className="prism-surface rounded-2xl p-6 sm:p-8">
                  {/* Heading + legend */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${accentColor}14`, color: accentColor }}
                      >
                        <span className="material-symbols-outlined text-[22px]">leaderboard</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-on-surface font-headline tracking-tight">
                          Top Products
                        </h3>
                        <p className="text-xs text-on-surface-variant/50 mt-0.5">
                          Cases by type for the selected month, highest volume first
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {PRODUCT_METRICS.map((m) => (
                        <div key={m.key} className="flex items-center gap-1.5" title={m.full}>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: m.color }}
                          />
                          <span className="text-[11px] font-bold text-on-surface">{m.short}</span>
                          <span className="text-[11px] text-on-surface-variant/45 hidden md:inline">
                            {m.full}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* One row per product */}
                  <div className="space-y-3">
                    {products.map((p, i) => {
                      const total = p.rfi + p.rfs + p.sug + p.com;
                      return (
                        <div
                          key={`${p.product}-${i}`}
                          className="rounded-xl border border-on-surface-variant/8 bg-surface-container-high/20 p-4 sm:p-5"
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr] gap-4 lg:gap-7 lg:items-center">
                            {/* Full product name — never truncated, wraps freely */}
                            <div className="flex items-start gap-3 min-w-0">
                              <span
                                className="mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                                style={{ backgroundColor: `${accentColor}14`, color: accentColor }}
                              >
                                {i + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-semibold text-on-surface leading-snug break-words">
                                  {p.product}
                                </p>
                                <p className="eyebrow-sm text-on-surface-variant/45 mt-1.5">
                                  {fmt.int(total)} total cases
                                </p>
                              </div>
                            </div>
                            {/* Volume bars */}
                            <div className="space-y-2.5">
                              {PRODUCT_METRICS.map((m) => {
                                const v = p[m.key];
                                const pct = v > 0 ? Math.max(4, (v / maxVal) * 100) : 0;
                                return (
                                  <div key={m.key} className="flex items-center gap-3">
                                    <span
                                      className="w-9 text-[10px] font-bold tracking-wide shrink-0"
                                      style={{ color: m.color }}
                                    >
                                      {m.short}
                                    </span>
                                    <div className="flex-1 h-3 rounded-full bg-surface-container-high/60 overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${pct}%`, backgroundColor: m.color }}
                                      />
                                    </div>
                                    <span className="w-12 text-right text-[13px] font-bold tabular-nums text-on-surface shrink-0">
                                      {fmt.int(v)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {project && (
                    <ChartCardBrandStrip
                      scope={{
                        kind: "project",
                        project: { name: project.name, logo: project.logo, logoPlateMode: project.logoPlateMode },
                      }}
                      accentColor={accentColor}
                    />
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </section>
  );
}
