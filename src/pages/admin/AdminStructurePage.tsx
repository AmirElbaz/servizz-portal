import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton from "../../components/admin/Skeleton";
import DepartmentIcon from "../../components/DepartmentIcon";
import {
  getStructureSnapshot,
  setProjectDepartmentReports,
  setDepartmentDirectReports,
  setDepartmentModules,
  getRegisteredReports,
  type AdminStructureSnapshot,
  type RegisteredReport,
} from "../../services/admin";
import {
  createProjectGroup,
  updateProjectGroup,
  deleteProjectGroup,
  moveProjectToGroup,
} from "../../services/catalog";

// Department-first structure page.
// Left: list of departments. Right: for the selected department, two
// sections — Projects (with nested per-project Reports) and Direct reports.
// Both render unconditionally; empty means "no attachments of that kind yet".
export default function AdminStructurePage() {
  const [snapshot, setSnapshot] = useState<AdminStructureSnapshot | null>(null);
  const [registered, setRegistered] = useState<RegisteredReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);

  // ── Project-group modal state (mirrors DepartmentDetailPage) ────────────
  // Name modal handles both "create" and "rename" — `id` discriminates.
  // Delete modal shows affected count and requires typing the name if
  // any projects will be demoted to Ungrouped.
  const [groupModal, setGroupModal] = useState<
    | { mode: "create"; name: string; error: string | null; busy: boolean }
    | { mode: "rename"; id: number; name: string; error: string | null; busy: boolean }
    | null
  >(null);
  const [deleteGroupModal, setDeleteGroupModal] = useState<
    { id: number; name: string; affected: number; confirm: string; error: string | null; busy: boolean } | null
  >(null);

  async function submitGroupModal() {
    if (!groupModal || !selectedDepartmentId) return;
    const name = groupModal.name.trim();
    if (!name) {
      setGroupModal({ ...groupModal, error: "Name is required." });
      return;
    }
    setGroupModal({ ...groupModal, busy: true, error: null });
    try {
      if (groupModal.mode === "create") {
        await createProjectGroup(selectedDepartmentId, name);
      } else {
        await updateProjectGroup(groupModal.id, { name });
      }
      await reload();
      setGroupModal(null);
    } catch (e) {
      setGroupModal({
        ...groupModal,
        busy: false,
        error: e instanceof Error ? e.message : "Failed to save group",
      });
    }
  }

  async function submitDeleteGroup() {
    if (!deleteGroupModal) return;
    if (
      deleteGroupModal.affected > 0 &&
      deleteGroupModal.confirm.trim() !== deleteGroupModal.name
    ) {
      setDeleteGroupModal({ ...deleteGroupModal, error: "Type the group name exactly to confirm." });
      return;
    }
    setDeleteGroupModal({ ...deleteGroupModal, busy: true, error: null });
    try {
      await deleteProjectGroup(deleteGroupModal.id);
      await reload();
      setDeleteGroupModal(null);
    } catch (e) {
      setDeleteGroupModal({
        ...deleteGroupModal,
        busy: false,
        error: e instanceof Error ? e.message : "Failed to delete group",
      });
    }
  }

  async function reload() {
    try {
      setLoading(true);
      const [snap, reports] = await Promise.all([
        getStructureSnapshot(),
        getRegisteredReports(),
      ]);
      setSnapshot(snap);
      setRegistered(reports);
      if (!selectedDepartmentId && snap.departments.length > 0) {
        setSelectedDepartmentId(snap.departments[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load structure");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const department = useMemo(
    () => snapshot?.departments.find((d) => d.id === selectedDepartmentId) ?? null,
    [snapshot, selectedDepartmentId]
  );

  // Projects OWNED by the selected department (migration 016: one dept per
  // project, canonicalized on `avaya_projects.department_id`). The legacy
  // `projectDepartments` junction is still present for downstream policy/
  // report plumbing, but ownership — and the admin project list — reads from
  // `project.departmentId`. This is what prevents Operation's projects from
  // showing up under QAT (or vice versa).
  const attachedProjects = useMemo(() => {
    if (!snapshot || !selectedDepartmentId) return [];
    return snapshot.projects.filter((p) => p.departmentId === selectedDepartmentId);
  }, [snapshot, selectedDepartmentId]);

  // Project groups belonging to the currently selected dept.
  const deptGroups = useMemo(() => {
    if (!snapshot || !selectedDepartmentId) return [];
    return snapshot.projectGroups
      .filter((g) => g.departmentId === selectedDepartmentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [snapshot, selectedDepartmentId]);

  // department_projects.id for a given (projectId, deptId) pair — needed when
  // placing reports in a project (the nested Reports section).
  function getDepartmentProjectId(projectId: number): number | null {
    if (!snapshot || !selectedDepartmentId) return null;
    const row = snapshot.projectDepartments.find(
      (pd) => pd.projectId === projectId && pd.departmentId === selectedDepartmentId
    );
    return row?.id ?? null;
  }

  // Direct reports placed under the selected department.
  const directReportIds = useMemo(() => {
    if (!snapshot || !selectedDepartmentId) return new Set<number>();
    return new Set(
      snapshot.directReports
        .filter((dr) => dr.departmentId === selectedDepartmentId)
        .map((dr) => dr.reportId)
    );
  }, [snapshot, selectedDepartmentId]);

  const reportIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    snapshot?.allReports.forEach((r) => map.set(r.code, r.id));
    return map;
  }, [snapshot]);

  // Modules currently enabled on the selected department. Drives which
  // configuration sections render below (Projects, Direct Reports, …).
  const enabledModuleCodes = useMemo(() => {
    if (!snapshot || !selectedDepartmentId) return new Set<string>();
    return new Set(
      snapshot.departmentModules
        .filter((dm) => dm.departmentId === selectedDepartmentId)
        .map((dm) => dm.moduleCode)
    );
  }, [snapshot, selectedDepartmentId]);

  // ── Toggle actions (optimistic snapshot updates) ──────────────────────────
  //
  // `toggleProject` was removed with migration 016: projects are now owned
  // by exactly one department via `avaya_projects.department_id`, so there
  // is no cross-dept attach/detach to toggle. Ownership is set when a row
  // is inserted into `avaya_projects` (either via DB or a future admin flow)
  // and the junction row is kept in sync by a trigger.

  async function toggleProjectReport(projectId: number, reportId: number) {
    if (!snapshot) return;
    const pdId = getDepartmentProjectId(projectId);
    if (pdId == null || pdId < 0) return; // guard: don't try against a temp-id row

    const prevSnapshot = snapshot;
    const current = snapshot.placements.filter((p) => p.projectDepartmentId === pdId);
    const currentIds = new Set(current.map((p) => p.reportId));
    const wasPlaced = currentIds.has(reportId);
    if (wasPlaced) currentIds.delete(reportId);
    else currentIds.add(reportId);

    const reportRow = snapshot.allReports.find((r) => r.id === reportId);
    const optimistic: AdminStructureSnapshot = wasPlaced
      ? {
          ...snapshot,
          placements: snapshot.placements.filter(
            (pl) => !(pl.projectDepartmentId === pdId && pl.reportId === reportId)
          ),
        }
      : {
          ...snapshot,
          placements: reportRow
            ? [
                ...snapshot.placements,
                {
                  id: -Date.now(),
                  projectDepartmentId: pdId,
                  reportId: reportRow.id,
                  reportCode: reportRow.code,
                  reportName: reportRow.name,
                },
              ]
            : snapshot.placements,
        };
    setSnapshot(optimistic);

    try {
      await setProjectDepartmentReports(pdId, Array.from(currentIds));
      setActionError(null);
    } catch (e) {
      setSnapshot(prevSnapshot);
      setActionError(e instanceof Error ? e.message : "Failed to save report placement");
    }
  }

  // Toggle a module's enabled state on the selected department. Does NOT
  // touch content tables — disabling hides the UI but the content (attached
  // projects, placed reports, etc.) is preserved for a future re-enable.
  async function toggleModule(moduleCode: string) {
    if (!selectedDepartmentId || !snapshot) return;
    const prevSnapshot = snapshot;
    const wasEnabled = enabledModuleCodes.has(moduleCode);
    const nextCodes = wasEnabled
      ? Array.from(enabledModuleCodes).filter((c) => c !== moduleCode)
      : [...Array.from(enabledModuleCodes), moduleCode];

    const optimistic: AdminStructureSnapshot = wasEnabled
      ? {
          ...snapshot,
          departmentModules: snapshot.departmentModules.filter(
            (dm) => !(dm.departmentId === selectedDepartmentId && dm.moduleCode === moduleCode)
          ),
        }
      : {
          ...snapshot,
          departmentModules: [
            ...snapshot.departmentModules,
            {
              departmentId: selectedDepartmentId,
              moduleCode,
              sortOrder: snapshot.modules.find((m) => m.code === moduleCode)?.sortOrder ?? 0,
            },
          ],
        };
    setSnapshot(optimistic);

    try {
      await setDepartmentModules(selectedDepartmentId, nextCodes);
      setActionError(null);
    } catch (e) {
      setSnapshot(prevSnapshot);
      setActionError(e instanceof Error ? e.message : "Failed to save module toggle");
    }
  }

  async function toggleDirectReport(reportId: number) {
    if (!selectedDepartmentId || !snapshot) return;
    const prevSnapshot = snapshot;
    const wasPlaced = directReportIds.has(reportId);

    const nextIds = wasPlaced
      ? Array.from(directReportIds).filter((id) => id !== reportId)
      : [...Array.from(directReportIds), reportId];

    const reportRow = snapshot.allReports.find((r) => r.id === reportId);
    const department = snapshot.departments.find((d) => d.id === selectedDepartmentId);
    if (!reportRow || !department) return;

    const optimistic: AdminStructureSnapshot = wasPlaced
      ? {
          ...snapshot,
          directReports: snapshot.directReports.filter(
            (dr) => !(dr.departmentId === selectedDepartmentId && dr.reportId === reportId)
          ),
        }
      : {
          ...snapshot,
          directReports: [
            ...snapshot.directReports,
            {
              id: -Date.now(),
              departmentId: selectedDepartmentId,
              reportId: reportRow.id,
              departmentCode: department.code,
              departmentName: department.name,
              reportCode: reportRow.code,
              reportName: reportRow.name,
            },
          ],
        };
    setSnapshot(optimistic);

    try {
      await setDepartmentDirectReports(selectedDepartmentId, nextIds);
      setActionError(null);
    } catch (e) {
      setSnapshot(prevSnapshot);
      setActionError(e instanceof Error ? e.message : "Failed to save direct report placement");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Catalog Structure"
        description="Pick a department, then decide which projects belong to it and which reports appear under each project. Departments can also host reports directly with no project layer."
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      {loading || !snapshot ? (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-3 h-fit">
            <Skeleton className="h-3 w-24 mx-3 my-2" />
            <div className="flex flex-col gap-1 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
            <Skeleton className="h-6 w-56 mb-5" />
            <Skeleton className="h-3 w-80 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* ── Master: department list ──────────────────────────────────── */}
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-3 h-fit">
            <div className="px-3 py-2 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                Departments
              </p>
            </div>
            {snapshot.departments.length === 0 ? (
              <p className="px-3 py-2 text-xs text-on-surface-variant/50 italic">
                Create a department on the Departments page first.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {snapshot.departments.map((d) => {
                  const isActive = d.id === selectedDepartmentId;
                  const projectCount = snapshot.projectDepartments.filter(
                    (pd) => pd.departmentId === d.id
                  ).length;
                  const directCount = snapshot.directReports.filter(
                    (dr) => dr.departmentId === d.id
                  ).length;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDepartmentId(d.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors border ${
                        isActive
                          ? "bg-primary/8 text-primary border-primary/15 font-semibold"
                          : "text-on-surface-variant hover:bg-surface-container-high/60 border-transparent"
                      }`}
                    >
                      <DepartmentIcon
                        icon={d.icon}
                        size={18}
                        className={isActive ? "text-primary" : "text-on-surface-variant/70"}
                      />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50 shrink-0">
                        {projectCount > 0 && `${projectCount}p`}
                        {projectCount > 0 && directCount > 0 && " · "}
                        {directCount > 0 && `${directCount}r`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Detail: selected department ──────────────────────────────── */}
          <div className="flex flex-col gap-6 min-w-0">
            {!department ? (
              <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center text-on-surface-variant/60 text-sm">
                Select a department to configure its projects and reports.
              </div>
            ) : (
              <>
                {/* Department header */}
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-high/60 flex items-center justify-center shrink-0">
                      <DepartmentIcon icon={department.icon} size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold text-on-surface font-headline tracking-tight truncate">
                        {department.name}
                      </h2>
                      <code className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded inline-block mt-0.5">
                        {department.code}
                      </code>
                    </div>
                  </div>
                  {department.description && (
                    <p className="text-sm text-on-surface-variant/70 mt-3">
                      {department.description}
                    </p>
                  )}
                </div>

                {/* ── Section 0: Modules enabled on this department ── */}
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                      Modules
                    </p>
                    <h3 className="text-base font-bold text-on-surface mt-0.5">
                      What lives under {department.name}
                    </h3>
                    <p className="text-xs text-on-surface-variant/60 mt-1">
                      Tick a module to turn it on. Its configuration panel appears below. Disabling hides the panel and the dept-landing section — existing content is preserved and restored if you re-enable.
                    </p>
                  </div>
                  {snapshot.modules.length === 0 ? (
                    <p className="text-sm text-on-surface-variant/60 italic">
                      No modules are registered yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {snapshot.modules.map((m) => {
                        const enabled = enabledModuleCodes.has(m.code);
                        return (
                          <label
                            key={m.code}
                            className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                              enabled
                                ? "bg-primary/5 border-primary/25"
                                : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleModule(m.code)}
                              className="accent-primary mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-on-surface-variant/70 text-[18px]">
                                  {m.icon || "extension"}
                                </span>
                                <p className="font-semibold text-sm text-on-surface truncate">
                                  {m.name}
                                </p>
                              </div>
                              {m.description && (
                                <p className="text-[11px] text-on-surface-variant/60 mt-0.5 leading-relaxed">
                                  {m.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Project groups CRUD (per dept) ── */}
                {enabledModuleCodes.has("projects") && (
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <p className="eyebrow-sm text-on-surface-variant/60">
                        Organization
                      </p>
                      <h3 className="text-base font-bold text-on-surface mt-0.5">
                        Project groups for {department.name}
                      </h3>
                      <p className="text-xs text-on-surface-variant/60 mt-1">
                        Groups are organizational buckets — they don't affect policy.
                        Projects can belong to one group or stay ungrouped.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setGroupModal({ mode: "create", name: "", error: null, busy: false })
                      }
                      className="btn-brand inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                      New group
                    </button>
                  </div>

                  {deptGroups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-on-surface-variant/15 p-6 text-center text-xs text-on-surface-variant/50">
                      No groups yet. All projects in this department are currently Ungrouped.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {deptGroups.map((g) => {
                        const count = attachedProjects.filter((p) => p.groupId === g.id).length;
                        return (
                          <div
                            key={g.id}
                            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-container-low/40 border border-on-surface-variant/8"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="material-symbols-outlined text-primary/70 text-[18px]">folder</span>
                              <span className="font-semibold text-sm text-on-surface truncate">{g.name}</span>
                              <span className="eyebrow-sm text-on-surface-variant/45 shrink-0">
                                {count} {count === 1 ? "project" : "projects"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title="Rename"
                                onClick={() =>
                                  setGroupModal({
                                    mode: "rename",
                                    id: g.id,
                                    name: g.name,
                                    error: null,
                                    busy: false,
                                  })
                                }
                                className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-primary hover:bg-primary/10 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                onClick={() =>
                                  setDeleteGroupModal({
                                    id: g.id,
                                    name: g.name,
                                    affected: count,
                                    confirm: "",
                                    error: null,
                                    busy: false,
                                  })
                                }
                                className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-error hover:bg-error/10 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}

                {/* ── Section 1: Projects owned by this department ── */}
                {enabledModuleCodes.has("projects") && (
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <p className="eyebrow-sm text-on-surface-variant/60">
                        Projects in this department
                      </p>
                      <h3 className="text-base font-bold text-on-surface mt-0.5">
                        {department.name}'s projects
                      </h3>
                      <p className="text-xs text-on-surface-variant/60 mt-1">
                        Since migration 016, projects are owned by exactly one
                        department. New projects are added directly in the database with
                        <code className="mx-1 px-1.5 py-0.5 rounded bg-surface-container-high/60 text-[11px]">department_id = {selectedDepartmentId}</code>.
                        For each project below, assign a group (optional) and pick the
                        reports that should appear inside it.
                      </p>
                    </div>
                  </div>

                  {attachedProjects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-on-surface-variant/15 p-6 text-center">
                      <p className="text-sm text-on-surface-variant/60">
                        No projects in {department.name} yet.
                      </p>
                      <p className="text-[11px] text-on-surface-variant/40 mt-1">
                        Insert rows into <code className="px-1 py-0.5 rounded bg-surface-container-high/60">avaya_projects</code> with <code className="px-1 py-0.5 rounded bg-surface-container-high/60">department_id = {selectedDepartmentId}</code>; the junction row is auto-created by a trigger.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {attachedProjects.map((p) => {
                        const pdId = getDepartmentProjectId(p.id);
                        const placedReportIds = pdId
                          ? new Set(
                              snapshot.placements
                                .filter((pl) => pl.projectDepartmentId === pdId)
                                .map((pl) => pl.reportId)
                            )
                          : new Set<number>();

                        return (
                          <div
                            key={p.id}
                            className="border border-on-surface-variant/10 rounded-xl overflow-hidden"
                          >
                            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: p.colorHex }}
                              />
                              <span className="font-semibold text-sm text-on-surface flex-1 truncate">
                                {p.displayName}
                              </span>
                              <label className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant/70">
                                <span className="eyebrow-sm text-on-surface-variant/55">Group</span>
                                <select
                                  value={p.groupId ?? ""}
                                  onChange={async (e) => {
                                    const gid = e.target.value === "" ? null : Number(e.target.value);
                                    try {
                                      await moveProjectToGroup(p.id, gid);
                                      await reload();
                                    } catch (err) {
                                      setActionError(err instanceof Error ? err.message : "Failed to move project");
                                    }
                                  }}
                                  className="text-xs font-semibold bg-white border border-on-surface-variant/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/40 transition-colors"
                                >
                                  <option value="">Ungrouped</option>
                                  {deptGroups.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            {/* Nested: reports inside this project */}
                            {pdId && pdId > 0 && (
                              <div className="px-4 py-3 border-t border-on-surface-variant/8 bg-surface-container-low/30">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-2">
                                  Reports in {p.displayName}
                                </p>
                                {registered.length === 0 ? (
                                  <p className="text-xs text-on-surface-variant/60 italic">
                                    No reports are registered in the backend yet.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {registered.map((r) => {
                                      const reportId = reportIdByCode.get(r.code);
                                      const placed =
                                        reportId !== undefined && placedReportIds.has(reportId);
                                      const disabled = reportId === undefined && !placed;
                                      return (
                                        <label
                                          key={r.code}
                                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                                            placed
                                              ? "bg-primary/5 border-primary/25 text-on-surface"
                                              : "bg-surface-container-lowest border-on-surface-variant/8 text-on-surface-variant hover:bg-surface-container-low/70"
                                          } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={placed}
                                            disabled={disabled}
                                            onChange={() => {
                                              if (reportId !== undefined)
                                                toggleProjectReport(p.id, reportId);
                                            }}
                                            className="accent-primary"
                                          />
                                          <span className="truncate flex-1">{r.name}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            {(!pdId || pdId < 0) && (
                              <div className="px-4 py-3 border-t border-on-surface-variant/8 bg-surface-container-low/30">
                                <p className="text-[11px] text-on-surface-variant/60 italic">
                                  Junction row not yet available — refresh in a moment.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}

                {/* ── Section 2: Direct reports under this department ── */}
                {enabledModuleCodes.has("direct_reports") && (
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                        Direct reports
                      </p>
                      <h3 className="text-base font-bold text-on-surface mt-0.5">
                        Reports directly under {department.name}
                      </h3>
                      <p className="text-xs text-on-surface-variant/60 mt-1">
                        Tick any reports that should be available without a project context.
                      </p>
                    </div>
                  </div>
                  {registered.length === 0 ? (
                    <p className="text-sm text-on-surface-variant/60 italic">
                      No reports are registered in the backend yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {registered.map((r) => {
                        const reportId = reportIdByCode.get(r.code);
                        const placed =
                          reportId !== undefined && directReportIds.has(reportId);
                        const disabled = reportId === undefined && !placed;
                        return (
                          <label
                            key={r.code}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                              placed
                                ? "bg-primary/5 border-primary/25"
                                : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                            } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={placed}
                              disabled={disabled}
                              onChange={() => {
                                if (reportId !== undefined) toggleDirectReport(reportId);
                              }}
                              className="accent-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-on-surface truncate">
                                {r.name}
                              </p>
                              <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider mt-0.5">
                                {r.viewCount} view{r.viewCount === 1 ? "" : "s"} ·{" "}
                                {r.columnCount} column{r.columnCount === 1 ? "" : "s"}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}

                {/* Hint when a module is enabled but nothing attached yet. */}
                {enabledModuleCodes.has("projects") && attachedProjects.length === 0 &&
                 enabledModuleCodes.has("direct_reports") && directReportIds.size === 0 && (
                  <div className="bg-surface-container-low/60 rounded-2xl border border-dashed border-on-surface-variant/20 p-5 text-center">
                    <p className="text-sm text-on-surface-variant/70">
                      {department.name} has no projects or direct reports yet. Use the sections
                      above to attach some.
                    </p>
                  </div>
                )}

                {/* Hint when no modules are enabled at all. */}
                {enabledModuleCodes.size === 0 && (
                  <div className="bg-surface-container-low/60 rounded-2xl border border-dashed border-on-surface-variant/20 p-5 text-center">
                    <p className="text-sm text-on-surface-variant/70">
                      {department.name} has no modules enabled yet. Tick a module above to start configuring it.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Group name modal (create + rename) ── */}
      {groupModal && department && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !groupModal.busy && setGroupModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-on-surface-variant/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-extrabold font-headline text-on-surface mb-2">
              {groupModal.mode === "create" ? "New project group" : "Rename group"}
            </h3>
            <p className="text-sm text-on-surface-variant/70 mb-4">
              {groupModal.mode === "create"
                ? `Groups organize ${department.name}'s projects into named buckets. You can move projects between groups anytime.`
                : "Pick a new name for this group."}
            </p>
            <label className="eyebrow-sm text-on-surface-variant/60 block mb-1.5">
              Group name
            </label>
            <input
              type="text"
              autoFocus
              value={groupModal.name}
              onChange={(e) => setGroupModal({ ...groupModal, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") submitGroupModal(); }}
              placeholder="e.g. Core projects"
              disabled={groupModal.busy}
              className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
            />
            {groupModal.error && (
              <p className="mt-2 text-xs text-error">{groupModal.error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGroupModal(null)}
                disabled={groupModal.busy}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant/70 hover:text-on-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitGroupModal}
                disabled={!groupModal.name.trim() || groupModal.busy}
                className="btn-brand px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {groupModal.busy
                  ? "Saving…"
                  : groupModal.mode === "create"
                    ? "Create group"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete group confirmation modal ── */}
      {deleteGroupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !deleteGroupModal.busy && setDeleteGroupModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full border-2 border-error/30 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-error">warning</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-extrabold font-headline text-on-surface mb-1">
                  Delete "{deleteGroupModal.name}"?
                </h3>
                <p className="text-sm text-on-surface-variant/70">
                  {deleteGroupModal.affected === 0 ? (
                    "This group has no projects and can be deleted safely."
                  ) : (
                    <>
                      The group will be removed. Its{" "}
                      <strong className="text-on-surface">{deleteGroupModal.affected}</strong>{" "}
                      {deleteGroupModal.affected === 1 ? "project" : "projects"} will move to{" "}
                      <strong className="text-on-surface">Ungrouped</strong> — they won't be deleted.
                    </>
                  )}
                </p>
              </div>
            </div>
            {deleteGroupModal.affected > 0 && (
              <>
                <label className="eyebrow-sm text-on-surface-variant/60 block mb-1.5">
                  Type <span className="text-error">{deleteGroupModal.name}</span> to confirm
                </label>
                <input
                  type="text"
                  autoFocus
                  value={deleteGroupModal.confirm}
                  onChange={(e) => setDeleteGroupModal({ ...deleteGroupModal, confirm: e.target.value, error: null })}
                  placeholder={deleteGroupModal.name}
                  disabled={deleteGroupModal.busy}
                  className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-error/40 focus:bg-white"
                />
              </>
            )}
            {deleteGroupModal.error && (
              <p className="mt-2 text-xs text-error">{deleteGroupModal.error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteGroupModal(null)}
                disabled={deleteGroupModal.busy}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant/70 hover:text-on-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDeleteGroup}
                disabled={
                  deleteGroupModal.busy ||
                  (deleteGroupModal.affected > 0 &&
                    deleteGroupModal.confirm.trim() !== deleteGroupModal.name)
                }
                className="px-4 py-2 rounded-xl bg-error text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {deleteGroupModal.busy ? "Deleting…" : "Delete group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
