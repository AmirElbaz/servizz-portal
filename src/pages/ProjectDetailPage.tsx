import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartmentProjectReports,
  onProjectLogoError,
  type CatalogReportSummary,
} from "../services/catalog";
import { adaptProject } from "../utils/adaptProject";
import { listHrTemplates, listHrRecords, createHrRecord, deleteHrRecord, type HrRecordSummary } from "../services/hr";
import {
  getOpsPdfObjectUrl,
  downloadOpsPdf,
  generateOpsPdf,
  listOpsPdfVersions,
  getOpsPublishStatus,
  publishOpsReport,
  unpublishOpsReport,
  makeOpsVersionCurrent,
  getChannelAvailability,
  type OpsPdfVersion,
  type ChannelAvailability,
} from "../services/opsReports";
import ConfirmModal from "../components/ui/ConfirmModal";
import { useAuth, roleAtLeast } from "../services/auth";
import { REPORT_MIN_DATE } from "../utils/reportDateRange";
import { pushRecentItem } from "../hooks/useRecentItems";
import BackLink from "../components/ui/BackLink";
import { useLogoPlate } from "../utils/logoPlate";
import { IvrCategorySection } from "../components/reports/IvrCategorySection";

// Department-first adaptation: the URL now carries BOTH a department code and
// a project code (/department/:deptCode/project/:projectCode). The departments
// grid is gone — a project's detail page shows its reports directly. The
// intermediate "department inside project" concept doesn't exist in the new
// model.
// The project's monthly Operations report. Everyone sees the latest month's
// report with Preview + Download. Admins/super-admins also get Edit and a
// month picker to open/generate any month. No naming — the report's name is
// "Monthly Report — <month>".
// Explicit English month names (host locale is Arabic — toLocaleString would
// localize, and new Date() shifts a month in UTC- timezones).
const OPS_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function OpsReportCard({
  templateId,
  projectId,
  deptCode,
  accent,
}: {
  templateId: number;
  projectId: number | null;
  deptCode: string;
  accent: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = roleAtLeast(user?.role, "admin");
  // Carried into the record page so its Back button returns HERE (the project
  // page), not the records list.
  const recordNavState = { state: { returnTo: location.pathname } };

  const [records, setRecords] = useState<HrRecordSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // In-app PDF review modal (blob object URL — revoked on close).
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  // Delete confirmation (in-app modal, not window.confirm).
  const [deleteTarget, setDeleteTarget] = useState<HrRecordSummary | null>(null);
  // Version history — admins / super-admins only: which record is expanded + its versions.
  const [versionsFor, setVersionsFor] = useState<number | null>(null);
  const [versions, setVersions] = useState<OpsPdfVersion[]>([]);
  // Publish state per record (current + published version no). Drives the
  // "Published" badge, the Publish/Unpublish toggle, and the non-admin filter.
  const [publishStatus, setPublishStatus] =
    useState<Record<number, { current: number | null; published: number | null }>>({});
  // Month filter for the list ("" = all months).
  const [filterMonth, setFilterMonth] = useState<string>("");

  const minMonth = REPORT_MIN_DATE.slice(0, 7);
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return m < minMonth ? minMonth : m;
  });

  async function refresh() {
    try {
      const res = await listHrRecords(templateId, {
        pageSize: 200,
        ...(projectId != null ? { projectId } : {}),
      });
      setRecords(res.rows);
    } catch {
      setRecords([]);
    }
    try {
      const ps = await getOpsPublishStatus(templateId, projectId ?? undefined);
      const map: Record<number, { current: number | null; published: number | null }> = {};
      for (const s of ps) map[s.recordId] = { current: s.currentVersionNo, published: s.publishedVersionNo };
      setPublishStatus(map);
    } catch {
      setPublishStatus({});
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, projectId]);

  function closePreview() {
    setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  }
  // Esc closes the review modal.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePreview(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  async function openReview(recordId: number, title: string, version?: number) {
    setBusy("prev");
    setErr(null);
    try {
      const url = await getOpsPdfObjectUrl(recordId, version);
      setPreview({ url, title });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(null);
    }
  }

  async function loadVersions(recordId: number) {
    try { setVersions(await listOpsPdfVersions(recordId)); }
    catch { setVersions([]); }
  }
  async function toggleVersions(recordId: number) {
    if (versionsFor === recordId) { setVersionsFor(null); return; }
    setVersionsFor(recordId);
    await loadVersions(recordId);
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await deleteHrRecord(id);
      setDeleteTarget(null);
      if (versionsFor === id) setVersionsFor(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
      setDeleteTarget(null);
    }
  }

  const withPeriod = records.filter((r) => r.period).sort((a, b) => (a.period! < b.period! ? 1 : -1));

  // Parse the YYYY-MM string DIRECTLY — `new Date("2026-06-01")` is UTC
  // midnight, which renders as the previous month ("May") in UTC- timezones.
  function monthLabel(period: string | null) {
    if (!period) return "";
    const [y, mm] = period.slice(0, 7).split("-").map(Number);
    return `${OPS_MONTHS[(mm || 1) - 1]} ${y}`;
  }

  async function doPublish(rec: HrRecordSummary, publish: boolean) {
    setBusy(`pub${rec.id}`);
    setErr(null);
    try {
      if (publish) await publishOpsReport(rec.id);
      else await unpublishOpsReport(rec.id);
      await refresh();
      if (versionsFor === rec.id) await loadVersions(rec.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  async function doMakeCurrent(recordId: number, version: number) {
    setBusy(`cur${recordId}`);
    setErr(null);
    try {
      await makeOpsVersionCurrent(recordId, version);
      await refresh();
      await loadVersions(recordId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Make current failed");
    } finally {
      setBusy(null);
    }
  }

  async function ensureRecord(month: string): Promise<number | null> {
    const existing = records.find((r) => r.period && r.period.slice(0, 7) === month);
    if (existing) return existing.id;
    try {
      const { data } = await createHrRecord(
        templateId,
        `Monthly Report — ${monthLabel(`${month}-01`)}`,
        [],
        `${month}-01`,
        "month", // master template is period_kind='month' → must send the granularity
        projectId
      );
      await refresh();
      return data.id;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
      return null;
    }
  }

  async function openMonth() {
    setBusy("open");
    setErr(null);
    const id = await ensureRecord(genMonth);
    setBusy(null);
    if (id) navigate(`/department/${deptCode}/templates/${templateId}/records/${id}`, recordNavState);
  }

  async function generateMonth() {
    setBusy("gen");
    setErr(null);
    const id = await ensureRecord(genMonth);
    if (id) {
      try {
        await generateOpsPdf(id);
        await refresh();
        if (versionsFor === id) await loadVersions(id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Generate failed");
      }
    }
    setBusy(null);
  }

  const btn =
    "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const ghost = `${btn} bg-surface-container-high/70 text-on-surface hover:bg-surface-container-high`;

  const monthsAvailable = Array.from(new Set(withPeriod.map((r) => r.period!.slice(0, 7))));
  let displayed = filterMonth
    ? withPeriod.filter((r) => r.period?.slice(0, 7) === filterMonth)
    : withPeriod;
  // Non-admins only ever see PUBLISHED reports.
  if (!isAdmin) displayed = displayed.filter((r) => publishStatus[r.id]?.published != null);

  return (
    <div className="prism-surface relative rounded-2xl p-6 overflow-hidden sm:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${accent}15`, color: accent }}
          >
            <span className="material-symbols-outlined text-[20px]">insights</span>
          </div>
          <h5 className="font-bold text-on-surface text-sm">Monthly Report</h5>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={genMonth}
              min={minMonth}
              onChange={(e) => setGenMonth(e.target.value)}
              className="px-2 py-1.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-[11px] focus:outline-none focus:border-primary/30"
            />
            <button type="button" disabled={busy !== null || !genMonth} onClick={openMonth} className={ghost}>
              {busy === "open" ? "…" : "Open / Edit"}
            </button>
            <button
              type="button"
              disabled={busy !== null || !genMonth}
              onClick={generateMonth}
              className={`${btn} text-white`}
              style={{ backgroundColor: accent }}
            >
              {busy === "gen" ? "Generating…" : "Generate"}
            </button>
          </div>
        )}
      </div>

      {withPeriod.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">filter_list</span>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-2 py-1.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-[11px] focus:outline-none focus:border-primary/30"
          >
            <option value="">All months</option>
            {monthsAvailable.map((m) => (
              <option key={m} value={m}>{monthLabel(`${m}-01`)}</option>
            ))}
          </select>
        </div>
      )}

      {displayed.length === 0 ? (
        <p className="text-[12px] text-on-surface-variant/50">
          {withPeriod.length === 0
            ? isAdmin
              ? "No reports yet — pick a month and Generate."
              : "No report available yet."
            : isAdmin
            ? "No report for the selected month."
            : "No published report for the selected month."}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-on-surface-variant/10">
          {displayed.map((rec) => {
            const published = publishStatus[rec.id]?.published ?? null;
            return (
            <div key={rec.id} className="py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant/40">description</span>
                <span className="text-sm font-semibold text-on-surface flex items-center gap-2 flex-1 min-w-[120px]">
                  {monthLabel(rec.period)}
                  {published != null ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-600/10 px-1.5 py-0.5 rounded">
                      Published v{published}
                    </span>
                  ) : isAdmin ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Draft
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => openReview(rec.id, `${monthLabel(rec.period)} — Monthly Report`)}
                  className={ghost}
                >
                  <span className="material-symbols-outlined text-[14px]">visibility</span> Review
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadOpsPdf(rec.id, `monthly-report-${rec.period?.slice(0, 7) ?? ""}.pdf`).catch((e) =>
                      setErr(e instanceof Error ? e.message : "Download failed")
                    )
                  }
                  className={ghost}
                >
                  <span className="material-symbols-outlined text-[14px]">download</span> Download
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => navigate(`/department/${deptCode}/templates/${templateId}/records/${rec.id}`, recordNavState)}
                    className={ghost}
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span> Edit
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => toggleVersions(rec.id)}
                    aria-expanded={versionsFor === rec.id}
                    className={ghost}
                  >
                    <span className="material-symbols-outlined text-[14px]">history</span> Versions
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    title={published != null ? "Hide from non-admins" : "Make visible to non-admins"}
                    onClick={() => doPublish(rec, published == null)}
                    className={
                      published != null
                        ? `${btn} text-amber-700 hover:bg-amber-500/10`
                        : `${btn} text-white`
                    }
                    style={published == null ? { backgroundColor: accent } : undefined}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {published != null ? "unpublished" : "publish"}
                    </span>
                    {busy === `pub${rec.id}` ? "…" : published != null ? "Unpublish" : "Publish"}
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    title="Delete this report"
                    onClick={() => setDeleteTarget(rec)}
                    className={`${btn} text-error hover:bg-error/10`}
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                )}
              </div>

              {/* Version history — admins / super-admins only. */}
              {isAdmin && versionsFor === rec.id && (
                <div className="mt-2 ml-7 pl-3 border-l-2 border-on-surface-variant/10 flex flex-col gap-1.5">
                  {versions.length === 0 ? (
                    <p className="text-[11px] text-on-surface-variant/50 py-1">
                      No versions yet — click Generate to publish one.
                    </p>
                  ) : (
                    versions.map((v) => (
                      <div key={v.versionNo} className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-on-surface">v{v.versionNo}</span>
                        {v.isCurrent && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-primary">current</span>
                        )}
                        {v.isPublished && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-green-700">published</span>
                        )}
                        <span className="text-on-surface-variant/50">
                          {new Date(v.generatedAt).toLocaleDateString()}
                        </span>
                        {!v.isCurrent && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => doMakeCurrent(rec.id, v.versionNo)}
                            className="ml-auto text-on-surface-variant/70 hover:text-on-surface font-semibold"
                          >
                            Make current
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => openReview(rec.id, `${monthLabel(rec.period)} — v${v.versionNo}`, v.versionNo)}
                          className={`${v.isCurrent ? "ml-auto " : ""}text-primary hover:underline font-semibold`}
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadOpsPdf(rec.id, `monthly-report-${rec.period?.slice(0, 7) ?? ""}-v${v.versionNo}.pdf`, v.versionNo).catch((e) =>
                              setErr(e instanceof Error ? e.message : "Download failed")
                            )
                          }
                          className="text-primary hover:underline font-semibold"
                        >
                          Download
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
      {err && <p className="text-[11px] text-error mt-2">{err}</p>}

      {/* Review modal — in-app PDF viewer (no download). */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-on-surface-variant/10">
              <h4 className="text-sm font-bold text-on-surface truncate">{preview.title}</h4>
              <button
                type="button"
                onClick={closePreview}
                aria-label="Close"
                className="text-on-surface-variant/60 hover:text-on-surface transition-colors p-1 rounded"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <iframe src={preview.url} title={preview.title} className="flex-1 w-full border-0" />
          </div>
        </div>
      )}

      {/* Delete confirmation — in-app modal (not window.confirm). */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete report"
        message={
          deleteTarget
            ? `Delete the ${monthLabel(deleteTarget.period)} report and all its generated versions? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default function ProjectDetailPage() {
  const { deptCode, projectCode } = useParams<{
    deptCode: string;
    projectCode: string;
  }>();
  const [project, setProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<CatalogReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Tile is chosen from the logo's own brightness, never the accent. A
  // per-project DB override (avaya_projects.logo_plate_mode) wins when set.
  const logoPlate = useLogoPlate(project?.logo, project?.logoPlateMode);
  // Which channel card is expanded inline (null = all collapsed).
  const [openChannel, setOpenChannel] = useState<"voice" | "digital" | null>(
    null,
  );
  // Which channel cards actually have data for this project (null = not yet
  // known → show optimistically; the backend caches this).
  const [channelAvail, setChannelAvail] = useState<ChannelAvailability | null>(null);
  useEffect(() => {
    if (!projectCode) { setChannelAvail(null); return; }
    getChannelAvailability(projectCode).then(setChannelAvail).catch(() => setChannelAvail(null));
  }, [projectCode]);
  // The unified Operations master template id (null until resolved). Powers the
  // "Monthly Report" card; the project it's for comes from opsProjectId.
  const [opsTemplateId, setOpsTemplateId] = useState<number | null>(null);
  // This project's numeric id (from the catalog by-code endpoint) — needed to
  // scope the shared master template's records to this project.
  const [opsProjectId, setOpsProjectId] = useState<number | null>(null);

  useEffect(() => {
    if (projectCode) localStorage.setItem("last-project", projectCode);
    if (deptCode) localStorage.setItem("last-department", deptCode);
  }, [projectCode, deptCode]);

  useEffect(() => {
    if (!projectCode || !deptCode) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchCatalogProject(projectCode),
      fetchCatalogDepartmentProjectReports(deptCode, projectCode),
    ])
      .then(([p, rpts]) => {
        // adaptProject preserves logoPlateMode so the DB override flows into
        // the hero plate. Inlining the mapping drops the field (see Locus
        // regression 2026-05-20).
        setProject(adaptProject(p));
        setReports(rpts);
        setOpsProjectId(p.id ?? null);
        // Resolve the ONE unified Operations master template (project_id NULL,
        // group 'ops-monthly-reports'). Every project shares it; the records are
        // scoped by the project id above.
        if (deptCode) {
          listHrTemplates(false, deptCode)
            .then((ts) => {
              const t = ts.find((x) => x.groupCode === "ops-monthly-reports");
              setOpsTemplateId(t?.id ?? null);
            })
            .catch(() => setOpsTemplateId(null));
        }
        if (deptCode) {
          pushRecentItem({
            kind: "project",
            id: `${deptCode}/${p.code}`,
            label: p.displayName,
            sublabel: p.shortLabel,
            icon: p.icon || "folder",
            href: `/department/${deptCode}/project/${p.code}`,
          });
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [projectCode, deptCode]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant/60 text-sm">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !project) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Project not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ "--accent": project.color } as React.CSSProperties}>
        <BackLink
          to={deptCode ? `/department/${deptCode}` : "/dashboard"}
          label="Back to Department"
        />

        {/* ── Hero Banner ── */}
        <section className="rounded-3xl mb-8 sm:mb-12 overflow-hidden flex">
          <div
            className="relative flex-1 px-5 sm:px-10 lg:px-16 py-8 sm:py-14 lg:py-18 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${project.color} 0%, color-mix(in srgb, ${project.color} 70%, #000) 100%)`,
            }}
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-[30%] -right-[15%] w-[50%] h-[70%] rounded-full bg-white/[0.07] blur-[100px]" />
              <div className="absolute -bottom-[20%] -left-[10%] w-[35%] h-[50%] rounded-full bg-black/10 blur-[80px]" />
            </div>
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
                backgroundSize: "50px 50px",
              }}
            />
            <div className="relative z-10">
              <nav className="flex items-center gap-2 mb-6 eyebrow-sm text-white/40">
                <Link to="/dashboard" className="hover:text-white/70 transition-colors no-underline text-white/40">
                  Dashboard
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <Link
                  to={`/department/${deptCode}`}
                  className="hover:text-white/70 transition-colors no-underline text-white/40"
                >
                  {deptCode}
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-white/70">{project.name}</span>
              </nav>
              <h1 className="text-2xl sm:text-4xl lg:text-6xl font-black tracking-tighter font-headline leading-[0.95] text-white mb-4">
                {project.name} <span className="text-white/50">Portal</span>
              </h1>
              <p className="text-white/45 text-base max-w-2xl leading-relaxed">
                {project.fullDescription}
              </p>
            </div>
          </div>
          {/* Logo block: filled with the project's own DB color via the
              shared plate helper (was bg-white — white logos vanished). */}
          <div
            className={`hidden sm:flex w-40 md:w-56 lg:w-64 items-center justify-center shrink-0 p-6 sm:p-8 relative ${
              logoPlate.border ? "ring-1 ring-inset ring-on-surface-variant/15" : ""
            }`}
            style={{ backgroundColor: logoPlate.bg }}
          >
            <svg
              className="absolute top-0 right-5 w-9 h-14 drop-shadow-md"
              viewBox="0 0 36 56"
              fill="none"
            >
              <path
                d="M0 0H36V48L18 40L0 48V0Z"
                style={{ fill: `color-mix(in srgb, ${project.color} 70%, black)` }}
              />
            </svg>
            <img src={project.logo} onError={onProjectLogoError} alt={project.name} className="w-28 lg:w-36 object-contain relative z-10" />
          </div>
        </section>

        {/* ── Reports ── */}
        {/* Three category buckets render in this fixed order:
              1. Skillset reports (header + grid; project's --accent)
              2. IVR & Queue Analytics (delegated to IvrCategorySection)
              3. Other reports (catch-all, hidden when empty)
            Skillset comes first because it's the primary operational lens —
            historical service-level / agent performance is the daily-read
            report. The IVR bundle is secondary depth and "Other" is for
            anything outside both categories. */}
        {(() => {
          const skillsetReports = reports.filter((r) => r.category === "skillset");
          const ivrReports = reports.filter((r) => r.category === "ivr");
          const otherReports = reports.filter(
            (r) => r.category !== "skillset" && r.category !== "ivr",
          );
          const accent = project.color;

          const reportCardClass =
            "group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50";

          const renderReportCard = (r: CatalogReportSummary) => (
            <Link
              key={r.code}
              to={`/department/${deptCode}/project/${projectCode}/report/${r.code}`}
              className={reportCardClass}
            >
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ boxShadow: `0 0 40px ${accent}15` }}
              />
              <div className="relative">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300"
                  style={{ backgroundColor: `${accent}15`, color: accent }}
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {r.icon || "bar_chart"}
                  </span>
                </div>
                <h5 className="font-bold text-on-surface text-sm mb-1">{r.name}</h5>
                {r.description && (
                  <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                    {r.description}
                  </p>
                )}
              </div>
            </Link>
          );

          return (
            <>
              {skillsetReports.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${accent}15`, color: accent }}
                    >
                      <span className="material-symbols-outlined text-lg">
                        groups
                      </span>
                    </span>
                    <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
                      Skillset reports
                    </h2>
                  </div>
                  <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mb-5 max-w-2xl pl-12">
                    Historical service-level and agent-performance views per skillset.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {skillsetReports.map(renderReportCard)}
                  </div>
                </section>
              )}

              {/* Monthly Reports — channel cards. Voice expands inline to
                  the IVR & Queue Analytics reports; digital is parked. */}
              <section className="mb-10">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${accent}15`, color: accent }}
                  >
                    <span className="material-symbols-outlined text-lg">
                      calendar_month
                    </span>
                  </span>
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
                    Monthly Reports
                  </h2>
                </div>
                <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mb-5 max-w-2xl pl-12">
                  Monthly reporting by channel. Voice opens the Inbound &amp; Queue
                  Analytics reports; digital channels are coming soon.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Voice / IVR card — expands to the IVR & Queue Analytics
                      reports. Shown only when the project actually has IVR data;
                      the project's own voice/skillset report lives in the
                      Skillset reports section above (so no report is lost when
                      this is hidden — e.g. Project Green has voice but no IVR). */}
                  {!!channelAvail?.ivr && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenChannel(openChannel === "voice" ? null : "voice")
                    }
                    aria-expanded={openChannel === "voice"}
                    className="group prism-surface relative rounded-2xl p-6 text-left overflow-hidden card-lift hover:border-accent-50"
                  >
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ boxShadow: `0 0 40px ${accent}15` }}
                    />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                          style={{ backgroundColor: `${accent}15`, color: accent }}
                        >
                          <span className="material-symbols-outlined text-[22px]">
                            headset_mic
                          </span>
                        </div>
                        <h5 className="font-bold text-on-surface text-sm mb-1">
                          Voice reports
                        </h5>
                        <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                          Inbound &amp; Queue Analytics
                        </p>
                      </div>
                      <span
                        className={`material-symbols-outlined text-on-surface-variant/50 transition-transform duration-300 ${
                          openChannel === "voice" ? "rotate-180" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </div>
                  </button>
                  )}

                  {/* Email — its own report; shown only when it has data. */}
                  {channelAvail?.email && (
                  <Link
                    to={`/department/${deptCode}/project/${projectCode}/report/email`}
                    className={reportCardClass}
                  >
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ boxShadow: `0 0 40px ${accent}15` }}
                    />
                    <div className="relative">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300"
                        style={{ backgroundColor: `${accent}15`, color: accent }}
                      >
                        <span className="material-symbols-outlined text-[22px]">mail</span>
                      </div>
                      <h5 className="font-bold text-on-surface text-sm mb-1">Email Report</h5>
                      <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                        Emails offered, handled &amp; pending by month.
                      </p>
                    </div>
                  </Link>
                  )}

                  {/* Chats + Facebook + Walk-Ins — shown only when it has data. */}
                  {channelAvail?.digital && (
                  <Link
                    to={`/department/${deptCode}/project/${projectCode}/report/digital-channels`}
                    className={reportCardClass}
                  >
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ boxShadow: `0 0 40px ${accent}15` }}
                    />
                    <div className="relative">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300"
                        style={{ backgroundColor: `${accent}15`, color: accent }}
                      >
                        <span className="material-symbols-outlined text-[22px]">forum</span>
                      </div>
                      <h5 className="font-bold text-on-surface text-sm mb-1">
                        Chats, Facebook &amp; Walk-Ins
                      </h5>
                      <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                        Digital-channel volumes by month.
                      </p>
                    </div>
                  </Link>
                  )}

                </div>

                {/* Voice expanded → the IVR & Queue Analytics reports. Only when
                    the project actually has IVR data — otherwise the section is
                    just preview placeholders with mock data (e.g. Project Green,
                    which has voice but no IVR). Rendered ABOVE the Monthly Ops
                    Report so expanding Voice pushes that card DOWN. */}
                {openChannel === "voice" && channelAvail?.ivr && (
                  <div className="mt-6">
                    <IvrCategorySection
                      realReports={ivrReports}
                      linkBuilder={(code) =>
                        `/department/${deptCode}/project/${projectCode}/report/${code}`
                      }
                    />
                  </div>
                )}

                {/* Monthly Ops Report — full width, BELOW the Voice expansion. */}
                <div className="mt-4">
                  {opsTemplateId ? (
                    <OpsReportCard templateId={opsTemplateId} projectId={opsProjectId} deptCode={deptCode ?? ""} accent={accent} />
                  ) : (
                    <div
                      aria-disabled="true"
                      title="Coming soon"
                      className="prism-surface relative rounded-2xl p-6 overflow-hidden cursor-default select-none"
                    >
                      <div className="relative">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant/70">
                            <span className="material-symbols-outlined text-[22px]">
                              insights
                            </span>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant/60">
                            Coming soon
                          </span>
                        </div>
                        <h5 className="font-bold text-on-surface/80 text-sm mb-1">
                          Monthly Ops Reports
                        </h5>
                        <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">
                          Planned — not available yet.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {otherReports.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
                    Other reports
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherReports.map(renderReportCard)}
                  </div>
                </section>
              )}

              {skillsetReports.length === 0 &&
                ivrReports.length === 0 &&
                otherReports.length === 0 && (
                  <div className="prism-surface rounded-2xl p-10 text-center">
                    <p className="text-sm text-on-surface-variant/60">
                      No reports are available in this project for your access level.
                    </p>
                  </div>
                )}
            </>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
