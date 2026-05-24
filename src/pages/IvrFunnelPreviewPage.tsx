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
  Cell,
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

const ACCENT = "#2EB2FF";
// Stage colors: a clean blue ramp for the IVR-side stages (lighter as
// you progress down the funnel), then purple for the "Chose to speak"
// human-handoff stage — matches the Auto/automation purple in the rest
// of the IVR bundle. The final two stages stay on the brand-blue ramp
// to read as "completed = good".
const STAGE_COLORS = ["#2EB2FF", "#5DBEF0", "#7CC8E8", "#9F7AEA", "#A6D5E8", "#2EB2FF"];

const MOCK_PROJECTS = [
  { value: "all",     label: "All allowed projects" },
  { value: "mtca",    label: "MTCA" },
  { value: "ctd",     label: "CTD" },
  { value: "customs", label: "Customs" },
  { value: "dss",     label: "DSS" },
  { value: "ird",     label: "IRD" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type FunnelStage = {
  key: string;
  label: string;
  description: string;
  count: number;
  color: string;
};

// Deterministic mock funnel — mirrors the metric semantics:
//   1. Total Calls       — every dialed-in call
//   2. Heard IVR Menu    — call connected past initial network handshake
//   3. Stayed Past IVR   — didn't abandon during the menu  (metric 1 inverse)
//   4. Chose to Speak    — opted out of self-service  (metric 6)
//   5. Stayed in Queue   — didn't abandon within 5s of queue arrival (metric 2 inverse)
//   6. Connected to CRO  — answered by a Customer Relationship Officer
//
// The drop-off between adjacent stages = the corresponding metric.
function buildFunnel(seed: number, total: number): FunnelStage[] {
  const wave = (i: number) => 1 - 0.04 * Math.sin(i + seed * 0.7);
  const heard      = Math.round(total * 0.985 * wave(0));
  const stayedIvr  = Math.round(heard * 0.91  * wave(1));  // metric 1 ≈ 9%
  const choseCro   = Math.round(stayedIvr * 0.74 * wave(2)); // metric 6 ≈ 74%
  const stayedQ    = Math.round(choseCro * 0.95 * wave(3));  // metric 2 ≈ 5%
  const connected  = Math.round(stayedQ * 0.93 * wave(4));   // post-5s queue abandons + answered

  return [
    { key: "total",     label: "Total Calls",       description: "Inbound dial events",                    count: total,       color: STAGE_COLORS[0] },
    { key: "heard",     label: "Heard IVR Menu",    description: "Call reached the IVR system",            count: heard,       color: STAGE_COLORS[0] },
    { key: "stayed",    label: "Stayed Past IVR",   description: "Did not abandon during the menu",        count: stayedIvr,   color: STAGE_COLORS[1] },
    { key: "chose",     label: "Chose to Speak",    description: "Opted to speak to a CRO",                count: choseCro,    color: STAGE_COLORS[2] },
    { key: "queued",    label: "Stayed in Queue",   description: "Did not abandon within 5s of queueing",  count: stayedQ,     color: STAGE_COLORS[3] },
    { key: "connected", label: "Connected to CRO",  description: "Picked up by an agent",                  count: connected,   color: STAGE_COLORS[4] },
  ];
}

type ProjectRow = {
  code: string;
  label: string;
  total: number;
  ivrAbandonPct: number;   // metric 1
  queueAbandonPct: number; // metric 2
  croChosePct: number;     // metric 6
  connectedPct: number;
};

function buildProjectRows(): ProjectRow[] {
  const projects = [
    { code: "MTCA",    base: 14_200, seed: 0 },
    { code: "CTD",     base: 8_900,  seed: 1 },
    { code: "Customs", base: 11_500, seed: 2 },
    { code: "DSS",     base: 9_400,  seed: 3 },
    { code: "IRD",     base: 6_700,  seed: 4 },
  ];
  return projects.map((p) => {
    const ivr     = 6  + (p.seed * 1.4) % 7;
    const queue   = 3  + (p.seed * 0.9) % 5;
    const cro     = 70 + (p.seed * 2.1) % 12;
    const conn    = 88 + (p.seed * 1.3) % 9;
    return {
      code: p.code,
      label: p.code,
      total: p.base,
      ivrAbandonPct:   Math.round(ivr   * 10) / 10,
      queueAbandonPct: Math.round(queue * 10) / 10,
      croChosePct:     Math.round(cro   * 10) / 10,
      connectedPct:    Math.round(conn  * 10) / 10,
    };
  });
}

function pctOf(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

export default function IvrFunnelPreviewPage() {
  // Three URL shapes resolve to this component (mirrors trend-comparison):
  //   /preview/ivr-funnel                                  → both undefined
  //   /department/:deptCode/report/ivr-funnel              → deptCode only
  //   /department/:deptCode/project/:projectCode/report/ivr-funnel
  // When projectCode is set we render the project logo in the header tile
  // and lock the filter dropdown to that project.
  const { deptCode, projectCode } = useParams<{
    deptCode?: string;
    projectCode?: string;
  }>();
  const today = new Date();

  const [project, setProject] = useState<string>(projectCode ?? "all");
  const [anchorYear, setAnchorYear] = useState<number>(today.getFullYear());
  const [anchorMonth, setAnchorMonth] = useState<number>(today.getMonth() + 1);

  // Live dept name for the breadcrumb / subtitle — matches the trend-comparison
  // pattern. Falls back to "Operation" if the URL has no deptCode (legacy
  // /preview/* path).
  // Dept codes are uppercase in the catalog (per CLAUDE.md). Normalize so
  // the breadcrumb fetch resolves regardless of URL case.
  const effectiveDeptCode = (deptCode ?? "OPS").toUpperCase();
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCatalogDepartment(effectiveDeptCode)
      .then((d) => { if (!cancelled) setDept(d); })
      .catch(() => { /* breadcrumb falls back to deptCode.toUpperCase() */ });
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  // Fetch the dept's projects so we can resolve the URL's projectCode into a
  // real CatalogProject (with logoFilename) and render the project logo in
  // the identity tile. Skipped when there's no projectCode in the URL.
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

  // Resolves to the strip's data-owner: specific project when one is
  // selected and we have its catalog row, else the dept. Memoized so
  // identity is stable when re-rendering chart cards below.
  const brandScope: BrandScope = useMemo(() => {
    if (project !== "all") {
      const cp = catalogProjects?.find((p) => p.code.toLowerCase() === project);
      if (cp) {
        return {
          kind: "project",
          project: { name: cp.displayName, logo: getLogoUrl(cp.logoFilename), logoPlateMode: cp.logoPlateMode },
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

  // Headline stage data scales with the current project pick — gives the
  // demo a felt sense that filtering does something.
  const total = useMemo(() => {
    if (project === "all") return 50_000;
    const row = buildProjectRows().find((r) => r.code.toLowerCase() === project);
    return row?.total ?? 8_000;
  }, [project]);

  const funnel = useMemo(() => buildFunnel(anchorMonth + anchorYear, total), [anchorMonth, anchorYear, total]);
  const projectRows = useMemo(() => buildProjectRows(), []);

  // Stage delta = drop-off from the previous stage (skip "Total Calls").
  const stageDeltas = useMemo(
    () =>
      funnel.map((s, i) => {
        if (i === 0) return null;
        const prev = funnel[i - 1].count;
        return prev === 0 ? 0 : Math.round(((prev - s.count) / prev) * 1000) / 10;
      }),
    [funnel],
  );

  const kpis = useMemo(() => {
    const tot = funnel[0].count;
    const heard = funnel[1].count;
    const stayed = funnel[2].count;
    const chose = funnel[3].count;
    const queued = funnel[4].count;
    const connected = funnel[5].count;
    return {
      ivrAbandons:   heard - stayed,        // metric 1
      ivrAbandonPct: pctOf(heard - stayed, heard),
      queueAbandons: chose - queued,         // metric 2
      queueAbandonPct: pctOf(chose - queued, chose),
      choseCro:      chose,                  // metric 6
      choseCroPct:   pctOf(chose, stayed),
      connected,
      connectedPct:  pctOf(connected, tot),
    };
  }, [funnel]);

  // Bar-chart data — Recharts has a Funnel component, but a horizontal
  // bar chart (each bar shrinking to its stage count) is more legible at
  // glance and supports the per-stage drop-off labels next to each row.
  const chartData = useMemo(
    () =>
      funnel.map((s, i) => ({
        name: s.label,
        count: s.count,
        color: s.color,
        delta: stageDeltas[i],
      })),
    [funnel, stageDeltas],
  );

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
              ? { name: proj.displayName, logo: getLogoUrl(proj.logoFilename), logoPlateMode: proj.logoPlateMode }
              : null;
          const projDisplay = proj?.displayName ?? projectCode?.toUpperCase();
          return (
        <ReportPageHeader
          backTo={backTo}
          backLabel={backLabel}
          project={headerProject}
          dept={dept}
          accentColor={ACCENT}
          title="IVR Funnel"
          subtitle={
            <>
              {dept?.name ?? "Operation"}
              {projectLabel ? ` · ${projectLabel}` : ""} ·{" "}
              {MONTHS[anchorMonth - 1]} {anchorYear} · Mock data (preview)
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
              <BreadcrumbCurrent>IVR Funnel</BreadcrumbCurrent>
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Backend not yet wired — exports will work once the IVR Funnel data source lands."
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">table_view</span>
                Excel
              </button>
              <button
                type="button"
                disabled
                title="Backend not yet wired — exports will work once the IVR Funnel data source lands."
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
                Month
              </label>
              <input
                type="month"
                value={`${anchorYear}-${String(anchorMonth).padStart(2, "0")}`}
                max={`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const [y, m] = v.split("-").map((s) => parseInt(s, 10));
                  if (!Number.isNaN(y) && !Number.isNaN(m)) {
                    setAnchorYear(y);
                    setAnchorMonth(m);
                  }
                }}
                className="py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent"
                style={{ colorScheme: "light" }}
              />
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
            { icon: "logout",         label: "IVR Abandons",       value: fmt.int(kpis.ivrAbandons),           sub: `${kpis.ivrAbandonPct} of menu listeners`,    tone: "bad"  as const },
            { icon: "timer_off",      label: "Queue Abandons (5s+)",value: fmt.int(kpis.queueAbandons),         sub: `${kpis.queueAbandonPct} of queued calls`,   tone: "bad"  as const },
            { icon: "support_agent",  label: "Chose to Speak",     value: fmt.int(kpis.choseCro),               sub: `${kpis.choseCroPct} of post-IVR callers`,   tone: "good" as const },
            { icon: "check_circle",   label: "Connected to CRO",   value: fmt.int(kpis.connected),              sub: `${kpis.connectedPct} of total calls`,       tone: "good" as const },
          ].map((k) => {
            const toneColor =
              k.tone === "good" ? "#15803d" :
              k.tone === "bad"  ? "#b91c1c" :
                                  ACCENT;
            return (
              <div key={k.label} className="prism-surface rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${toneColor}15`, color: toneColor }}
                  >
                    <span className="material-symbols-outlined text-xl">{k.icon}</span>
                  </div>
                  <p className="eyebrow-sm text-on-surface-variant/50 truncate">{k.label}</p>
                </div>
                <p className="text-2xl font-black text-on-surface tracking-tight tabular-nums">
                  {k.value}
                </p>
                <p className="text-[11px] text-on-surface-variant/60 mt-1">{k.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Funnel chart + stage list */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          <div className="lg:col-span-3 prism-surface rounded-2xl p-6">
            <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
              Funnel — call journey through the IVR
            </h3>
            <p className="text-[11px] text-on-surface-variant/50 mb-4">
              Stage-by-stage drop-off · current month
            </p>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 32, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eff3" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#566166" }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: "#566166" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                  formatter={(v) => [fmt.int(Number(v)), "Calls"]}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={28} label={{
                  position: "right",
                  fontSize: 11,
                  fill: "#1a1a1a",
                  fontWeight: 700,
                  formatter: (val) => typeof val === "number" ? fmt.int(val) : String(val ?? ""),
                }}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartCardBrandStrip scope={brandScope} accentColor={ACCENT} />
          </div>

          <div className="lg:col-span-2 prism-surface rounded-2xl p-6">
            <h3 className="text-sm font-bold text-on-surface mb-1 font-headline">
              Stage drop-off
            </h3>
            <p className="text-[11px] text-on-surface-variant/50 mb-4">
              Where callers leave the funnel
            </p>
            <ol className="space-y-3">
              {funnel.map((s, i) => {
                const delta = stageDeltas[i];
                return (
                  <li key={s.key} className="flex items-start gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
                      style={{ backgroundColor: `${s.color}20`, color: s.color }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[12px] font-bold text-on-surface">{s.label}</p>
                        <p className="text-[12px] font-bold text-on-surface tabular-nums">
                          {fmt.int(s.count)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[10px] text-on-surface-variant/60">{s.description}</p>
                        {delta !== null && delta > 0 && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
                            <span className="material-symbols-outlined text-[12px]">trending_down</span>
                            −{fmt.auto(delta)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
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
                  Per-project funnel summary
                </h3>
                <p className="text-[10px] text-on-surface-variant/50 mt-0.5 uppercase tracking-widest">
                  IVR / queue drop-off and CRO opt-in by project
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr className="bg-surface-container-high/30">
                  <th className="tbl-th">Project</th>
                  <th className="tbl-th text-right">Total calls</th>
                  <th className="tbl-th text-right">IVR abandons %</th>
                  <th className="tbl-th text-right">Queue abandons %</th>
                  <th className="tbl-th text-right">Chose CRO %</th>
                  <th className="tbl-th text-right">Connected %</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row) => (
                  <tr key={row.code} className="tbl-tr">
                    <td className="tbl-td-strong">{row.label}</td>
                    <td className="tbl-td-num">{fmt.int(row.total)}</td>
                    <td className="tbl-td-num" style={{ color: "#b91c1c" }}>{fmt.auto(row.ivrAbandonPct)}%</td>
                    <td className="tbl-td-num" style={{ color: "#b91c1c" }}>{fmt.auto(row.queueAbandonPct)}%</td>
                    <td className="tbl-td-num">{fmt.auto(row.croChosePct)}%</td>
                    <td className="tbl-td-num" style={{ color: "#047857" }}>{fmt.auto(row.connectedPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-on-surface-variant/50 text-center mb-6">
          Preview · mock data · backend not yet wired · planned data sources: <code className="font-mono text-on-surface-variant/70">avaya_routes_historical</code> + IVR session telemetry (TBD)
        </p>
      </div>
    </DashboardLayout>
  );
}
