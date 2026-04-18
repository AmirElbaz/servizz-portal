import { useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton from "../../components/admin/Skeleton";
import DepartmentIcon from "../../components/DepartmentIcon";
import {
  getStructureSnapshot,
  setProjectDepartments,
  setProjectDepartmentReports,
  listDepartments,
  getRegisteredReports,
  type AdminStructureSnapshot,
  type AdminDepartment,
  type RegisteredReport,
} from "../../services/admin";

export default function AdminStructurePage() {
  const [snapshot, setSnapshot] = useState<AdminStructureSnapshot | null>(null);
  const [allDepartments, setAllDepartments] = useState<AdminDepartment[]>([]);
  const [registered, setRegistered] = useState<RegisteredReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  async function reload() {
    try {
      setLoading(true);
      const [snap, depts, reports] = await Promise.all([
        getStructureSnapshot(),
        listDepartments(),
        getRegisteredReports(),
      ]);
      setSnapshot(snap);
      setAllDepartments(depts);
      setRegistered(reports);
      if (!selectedProjectId && snap.projects.length > 0) {
        setSelectedProjectId(snap.projects[0].id);
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

  const project = useMemo(
    () => snapshot?.projects.find((p) => p.id === selectedProjectId) ?? null,
    [snapshot, selectedProjectId]
  );

  const projectDepts = useMemo(() => {
    if (!snapshot || !selectedProjectId) return [];
    return snapshot.projectDepartments.filter((pd) => pd.projectId === selectedProjectId);
  }, [snapshot, selectedProjectId]);

  const attachedDeptIds = useMemo(() => new Set(projectDepts.map((pd) => pd.departmentId)), [projectDepts]);

  async function toggleDepartment(deptId: number) {
    if (!selectedProjectId || !snapshot) return;
    const wasAttached = attachedDeptIds.has(deptId);
    const dept = allDepartments.find((d) => d.id === deptId);
    if (!dept) return;

    // Capture rollback state before mutating.
    const prevSnapshot = snapshot;

    // Optimistic snapshot: either detach (and cascade-remove placements under
    // this project_department) or attach (with a temp negative id that the
    // subsequent reload() will overwrite with the real one).
    const optimistic: AdminStructureSnapshot = wasAttached
      ? {
          ...snapshot,
          projectDepartments: snapshot.projectDepartments.filter(
            (pd) => !(pd.projectId === selectedProjectId && pd.departmentId === deptId)
          ),
          placements: snapshot.placements.filter((pl) => {
            const owning = snapshot.projectDepartments.find((x) => x.id === pl.projectDepartmentId);
            return !(
              owning &&
              owning.projectId === selectedProjectId &&
              owning.departmentId === deptId
            );
          }),
        }
      : {
          ...snapshot,
          projectDepartments: [
            ...snapshot.projectDepartments,
            {
              id: -Date.now(), // temp id — reload() replaces with real id
              projectId: selectedProjectId,
              departmentId: deptId,
              departmentCode: dept.code,
              departmentName: dept.name,
            },
          ],
        };

    setSnapshot(optimistic);

    const nextIds = wasAttached
      ? Array.from(attachedDeptIds).filter((id) => id !== deptId)
      : [...Array.from(attachedDeptIds), deptId];

    try {
      await setProjectDepartments(selectedProjectId, nextIds);
      // Silently reload so we pick up real pd.id for the new row. This is
      // required because the Report Placement checkbox below needs a valid id
      // to PUT. We do NOT await reload() before clearing actionError so the UI
      // stays responsive — reload runs after the optimistic update is
      // already visible.
      await reload();
      setActionError(null);
    } catch (e) {
      setSnapshot(prevSnapshot);
      setActionError(e instanceof Error ? e.message : "Failed to save department attachment");
    }
  }

  async function toggleReport(pdId: number, reportId: number) {
    if (!snapshot) return;
    const prevSnapshot = snapshot;
    const current = snapshot.placements.filter((p) => p.projectDepartmentId === pdId);
    const currentIds = new Set(current.map((p) => p.reportId));
    const wasPlaced = currentIds.has(reportId);

    if (wasPlaced) currentIds.delete(reportId);
    else currentIds.add(reportId);

    // Optimistic snapshot: add/remove the placement locally.
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
      // No reload here — unlike department toggles, placement ids don't drive
      // further drill-down UI, so we can skip the extra round-trip.
      setActionError(null);
    } catch (e) {
      setSnapshot(prevSnapshot);
      setActionError(e instanceof Error ? e.message : "Failed to save report placement");
    }
  }

  // Map report code → numeric id from the snapshot's allReports list.
  const reportIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    snapshot?.allReports.forEach((r) => map.set(r.code, r.id));
    return map;
  }, [snapshot]);

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Project Structure"
        description="Assign departments to each project, then tick which registered reports appear in each (project, department) pair."
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      {loading || !snapshot ? (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-3 h-fit">
            <Skeleton className="h-3 w-20 mx-3 my-2" />
            <div className="flex flex-col gap-1 mt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 mx-0 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
            <Skeleton className="h-6 w-48 mb-5" />
            <Skeleton className="h-3 w-64 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Left: project list */}
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-3 h-fit">
            <div className="px-3 py-2 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                Projects
              </p>
            </div>
            <div className="flex flex-col gap-1">
              {snapshot.projects.map((p) => {
                const isActive = p.id === selectedProjectId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors border ${
                      isActive
                        ? "bg-primary/8 text-primary border-primary/15 font-semibold"
                        : "text-on-surface-variant hover:bg-surface-container-high/60 border-transparent"
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.colorHex }}
                    />
                    <span className="truncate">{p.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex flex-col gap-6 min-w-0">
            {project ? (
              <>
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project.colorHex }}
                    />
                    <h2 className="text-xl font-extrabold text-on-surface font-headline tracking-tight">
                      {project.displayName}
                    </h2>
                  </div>

                  <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-3">
                    Departments in this project
                  </p>
                  {allDepartments.length === 0 ? (
                    <p className="text-sm text-on-surface-variant/60">
                      Create at least one department on the Departments page first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allDepartments.map((d) => {
                        const attached = attachedDeptIds.has(d.id);
                        return (
                          <label
                            key={d.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                              attached
                                ? "bg-primary/5 border-primary/25"
                                : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={attached}
                              onChange={() => toggleDepartment(d.id)}
                              className="accent-primary"
                            />
                            <DepartmentIcon
                              icon={d.icon}
                              size={20}
                              className="text-on-surface-variant/70"
                            />
                            <span className="font-semibold text-sm text-on-surface">{d.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Report placement per attached department */}
                {projectDepts.map((pd) => {
                  const pdPlacements = snapshot.placements.filter(
                    (pl) => pl.projectDepartmentId === pd.id
                  );
                  const placedReportIds = new Set(pdPlacements.map((p) => p.reportId));

                  return (
                    <div
                      key={pd.id}
                      className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                            Report Placement
                          </p>
                          <h3 className="text-base font-bold text-on-surface mt-0.5">
                            {pd.departmentName}
                          </h3>
                        </div>
                      </div>
                      {registered.length === 0 ? (
                        <p className="text-sm text-on-surface-variant/60">
                          No reports are registered in the backend yet.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {registered.map((r) => {
                            // Resolve numeric reportId — if not in the placements map, we cannot toggle it yet,
                            // but placement requires the report to exist in the reports table (startup upsert does this).
                            const reportId = reportIdByCode.get(r.code);
                            const placed = reportId !== undefined && placedReportIds.has(reportId);
                            const disabled = reportId === undefined && !placed;

                            return (
                              <label
                                key={r.code}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                                  placed
                                    ? "bg-primary/5 border-primary/25"
                                    : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                                } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                                title={disabled ? "Report has no DB row yet — restart the backend so the registrar can upsert it." : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={placed}
                                  disabled={disabled}
                                  onChange={() => {
                                    if (reportId !== undefined) toggleReport(pd.id, reportId);
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
                  );
                })}
              </>
            ) : (
              <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center text-on-surface-variant/60 text-sm">
                Select a project to manage its structure.
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
