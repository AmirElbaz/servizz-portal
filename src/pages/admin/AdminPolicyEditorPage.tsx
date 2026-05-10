import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import SaveButton from "../../components/admin/SaveButton";
import RequiredMark from "../../components/admin/RequiredMark";
import ViewBadge from "../../components/admin/ViewBadge";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton from "../../components/admin/Skeleton";
import Paginator from "../../components/ui/Paginator";
import {
  getPolicyWithEtag,
  createPolicy,
  updatePolicy,
  setPolicyProjectDepartments,
  setPolicyReports,
  setPolicyColumns,
  setPolicyUsers,
  setPolicyDirectReports,
  setPolicyDepartments,
  getStructureSnapshot,
  listUsers,
  getReportSchema,
  ConcurrencyError,
  type AdminPolicyDetail,
  type AdminStructureSnapshot,
  type AdminUser,
  type ReportSchema,
} from "../../services/admin";

type Tab = "access" | "columns" | "users";

export default function AdminPolicyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  // ── Top-level policy fields ──
  const [policy, setPolicy] = useState<AdminPolicyDetail | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ code?: string; name?: string }>({});

  // ── Shared data ──
  const [snapshot, setSnapshot] = useState<AdminStructureSnapshot | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);

  // ── Grant state ──
  // Legacy policy_projects set — the department-first editor doesn't edit
  // this, but we keep the setter so loadAll can mirror server state into it
  // (we clear it on every saveAccess). The value is never read.
  const [, setGrantedPdIds] = useState<Set<number>>(new Set());
  const [grantedPdrIds, setGrantedPdrIds] = useState<Set<number>>(new Set());
  const [grantedDirectReportIds, setGrantedDirectReportIds] = useState<Set<number>>(new Set());
  // Whole-department grants (policy_departments). Ticking a department at the
  // top of the Access tab writes to this set; inside a fully-granted dept,
  // the leaf pickers are hidden because everything is already granted.
  const [grantedDepartmentIds, setGrantedDepartmentIds] = useState<Set<number>>(new Set());
  const [grantedUserIds, setGrantedUserIds] = useState<Set<number>>(new Set());
  const [columnGrants, setColumnGrants] = useState<Record<string, Set<string>>>({});
  const [schemas, setSchemas] = useState<Record<string, ReportSchema>>({});

  // ── Dirty tracking: each tab gets a "saved snapshot" that reflects the
  // server state at load (or after the most recent successful save). Local
  // state is compared against these snapshots to derive dirty flags.
  const [savedDetails, setSavedDetails] = useState({ name: "", description: "" });
  // savedAccessPdIds: see grantedPdIds above — setter only, value unused.
  const [, setSavedAccessPdIds] = useState<Set<number>>(new Set());
  const [savedAccessPdrIds, setSavedAccessPdrIds] = useState<Set<number>>(new Set());
  const [savedDirectReportIds, setSavedDirectReportIds] = useState<Set<number>>(new Set());
  const [savedDepartmentIds, setSavedDepartmentIds] = useState<Set<number>>(new Set());
  const [savedUsers, setSavedUsers] = useState<Set<number>>(new Set());
  const [savedColumns, setSavedColumns] = useState<Record<string, Set<string>>>({});

  // ── ETag for optimistic concurrency. Captured on load and refreshed after
  // every successful save. Sent as If-Match on subsequent saves.
  const [etag, setEtag] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("access");

  // Columns tab — which granted report's columns to configure right now.
  // Single-select; when granted reports change (e.g. user unticks the dept
  // in Access), we auto-fall-back to the first granted code, or null.
  const [selectedColumnReportCode, setSelectedColumnReportCode] = useState<string | null>(null);

  // ── Client-side pagination for the Users tab ──
  // The Users tab renders every user as a checkbox card, which gets unwieldy
  // with real user counts. The `grantedUserIds` set lives at the component
  // scope, so ticking a box on page 2 persists when the admin navigates
  // back to page 1 — pagination only affects what's rendered, not state.
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(15);

  async function loadAll() {
    try {
      setLoading(true);
      const [snap, users] = await Promise.all([getStructureSnapshot(), listUsers()]);
      setSnapshot(snap);
      setAllUsers(users);

      if (!isNew && id) {
        const { data: detail, etag: fetchedEtag } = await getPolicyWithEtag(Number(id));
        setPolicy(detail);
        setEtag(fetchedEtag);
        setCode(detail.code);
        setName(detail.name);
        setDescription(detail.description ?? "");

        const pdIds = new Set(detail.projectDepartments.map((g) => g.projectDepartmentId));
        const pdrIds = new Set(detail.reports.map((g) => g.projectDepartmentReportId));
        const directIds = new Set(detail.directReports.map((g) => g.departmentReportId));
        const deptIds = new Set(detail.departments.map((g) => g.departmentId));
        const userIds = new Set(detail.users.map((u) => u.id));
        const cols = Object.fromEntries(
          Object.entries(detail.columns).map(([k, v]) => [k, new Set(v)])
        );

        setGrantedPdIds(pdIds);
        setGrantedPdrIds(pdrIds);
        setGrantedDirectReportIds(directIds);
        setGrantedDepartmentIds(deptIds);
        setGrantedUserIds(userIds);
        setColumnGrants(cols);

        // Snapshot the loaded state so dirty flags start clean.
        setSavedDetails({ name: detail.name, description: detail.description ?? "" });
        setSavedAccessPdIds(new Set(pdIds));
        setSavedAccessPdrIds(new Set(pdrIds));
        setSavedDirectReportIds(new Set(directIds));
        setSavedDepartmentIds(new Set(deptIds));
        setSavedUsers(new Set(userIds));
        setSavedColumns(
          Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, new Set(v)]))
        );
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Derived dirty flags per tab ──
  const detailsDirty =
    name !== savedDetails.name || description !== savedDetails.description;
  // Access dirty tracks the whole-department grant set plus the two leaf
  // grant sets. policy_projects is no longer written from this editor.
  const accessDirty =
    !setsEqual(grantedDepartmentIds, savedDepartmentIds) ||
    !setsEqual(grantedPdrIds, savedAccessPdrIds) ||
    !setsEqual(grantedDirectReportIds, savedDirectReportIds);
  const usersDirty = !setsEqual(grantedUserIds, savedUsers);
  const columnsDirty = !columnGrantsEqual(columnGrants, savedColumns);
  const anyDirty = detailsDirty || accessDirty || usersDirty || columnsDirty;

  // Warn on browser close / refresh when anything is unsaved.
  useEffect(() => {
    if (!anyDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  // Translate a ConcurrencyError into a user-facing banner telling the admin
  // to reload. Other errors go to the plain actionError banner.
  function handleSaveError(err: Error) {
    if (err instanceof ConcurrencyError) {
      setActionError(
        "This policy was modified by another admin. Reload the page to see their changes before saving."
      );
    } else {
      setActionError(err.message);
    }
  }

  // ── Create / save top form ──
  function validateDetails(): boolean {
    const errs: { code?: string; name?: string } = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (isNew) {
      if (!code.trim()) errs.code = "Code is required.";
      else if (!/^[a-z0-9-]+$/.test(code.trim()))
        errs.code = "Use lowercase letters, numbers, and hyphens only.";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function saveDetails() {
    if (!validateDetails()) throw new Error("validation");
    if (isNew) {
      const { data: created } = await createPolicy({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
      });
      navigate(`/admin/policies/${created.id}`, { replace: true });
    } else if (policy) {
      const { etag: newEtag } = await updatePolicy(
        policy.id,
        {
          name: name.trim(),
          description: description.trim() || null,
        },
        etag
      );
      setEtag(newEtag);
      setSavedDetails({ name: name.trim(), description: description.trim() });
    }
  }

  // ── Access tab helpers ──
  function togglePdr(pdrId: number) {
    setGrantedPdrIds((prev) => {
      const next = new Set(prev);
      if (next.has(pdrId)) next.delete(pdrId);
      else next.add(pdrId);
      return next;
    });
  }

  function toggleDirectReport(drId: number) {
    setGrantedDirectReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(drId)) next.delete(drId);
      else next.add(drId);
      return next;
    });
  }

  // Toggle the whole-department grant. Granting a department is the "give
  // full access" shortcut: every current and future leaf inside the dept is
  // accessible without any leaf-level ticks. When a dept is fully granted we
  // clear any leaf-level ticks inside it since they would be redundant noise
  // — the user gets everything regardless. Ungranting the dept restores the
  // normal leaf-level editor.
  function toggleDepartment(deptId: number) {
    const turningOn = !grantedDepartmentIds.has(deptId);
    setGrantedDepartmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
    if (turningOn && snapshot) {
      // Drop leaf ticks inside this department; they'd just be stale rows
      // after save. The dept-level grant supersedes them.
      const pdIdsInDept = new Set(
        snapshot.projectDepartments
          .filter((pd) => pd.departmentId === deptId)
          .map((pd) => pd.id)
      );
      const pdrIdsInDept = new Set(
        snapshot.placements
          .filter((pl) => pdIdsInDept.has(pl.projectDepartmentId))
          .map((pl) => pl.id)
      );
      const directInDept = new Set(
        snapshot.directReports.filter((dr) => dr.departmentId === deptId).map((dr) => dr.id)
      );
      if (pdrIdsInDept.size > 0) {
        setGrantedPdrIds((prev) => {
          const next = new Set(prev);
          for (const id of pdrIdsInDept) next.delete(id);
          return next;
        });
      }
      if (directInDept.size > 0) {
        setGrantedDirectReportIds((prev) => {
          const next = new Set(prev);
          for (const id of directInDept) next.delete(id);
          return next;
        });
      }
    }
  }

  async function saveAccess() {
    if (!policy) return;
    // Four sequential writes, each forwarding the ETag from the previous
    // response so concurrent-edit detection stays intact across the chain.
    //
    // Order:
    //   1. policy_departments   — whole-department grants (top-level ticks).
    //   2. policy_projects      — cleared. The new editor never writes this
    //                             table; any rows are legacy from the old
    //                             project-first editor and silently leak
    //                             department access, so we wipe them each save.
    //   3. policy_project_reports    — leaf-level grants in projects.
    //   4. policy_department_reports — leaf-level grants on direct reports.
    const first = await setPolicyDepartments(
      policy.id,
      Array.from(grantedDepartmentIds),
      etag
    );
    const second = await setPolicyProjectDepartments(policy.id, [], first.etag);
    const third = await setPolicyReports(
      policy.id,
      Array.from(grantedPdrIds),
      second.etag
    );
    const fourth = await setPolicyDirectReports(
      policy.id,
      Array.from(grantedDirectReportIds),
      third.etag
    );
    setEtag(fourth.etag);
    setGrantedPdIds(new Set());
    setSavedAccessPdIds(new Set());
    setSavedDepartmentIds(new Set(grantedDepartmentIds));
    setSavedAccessPdrIds(new Set(grantedPdrIds));
    setSavedDirectReportIds(new Set(grantedDirectReportIds));
  }

  // ── Columns tab helpers ──
  // Derive the set of report codes this policy grants. Three sources:
  //   1. Explicit project-report leaf grants (`policy_project_reports`).
  //   2. Explicit direct-report grants on a department (`policy_department_reports`).
  //   3. Whole-department grants (`policy_departments`) — ticking a dept at
  //      the top of the Access tab implicitly grants every report reachable
  //      through it (every project_report under any of its projects + every
  //      direct_report attached to it). These reports MUST surface in the
  //      Columns tab so the admin doesn't have to bounce back to Access and
  //      tick a leaf just to expose them.
  const grantedReportCodes = useMemo(() => {
    if (!snapshot) return [] as string[];
    const placementsById = new Map(snapshot.placements.map((p) => [p.id, p]));
    const directById = new Map(snapshot.directReports.map((p) => [p.id, p]));
    const codes = new Set<string>();

    // (1) Leaf project-report grants.
    for (const pdrId of grantedPdrIds) {
      const p = placementsById.get(pdrId);
      if (p) codes.add(p.reportCode);
    }

    // (2) Leaf direct-report grants.
    for (const drId of grantedDirectReportIds) {
      const p = directById.get(drId);
      if (p) codes.add(p.reportCode);
    }

    // (3) Whole-department grants — fan out to every reachable report.
    if (grantedDepartmentIds.size > 0) {
      // departmentId → set of projectDepartment.id under that dept
      const pdsByDept = new Map<number, Set<number>>();
      for (const pd of snapshot.projectDepartments) {
        let bucket = pdsByDept.get(pd.departmentId);
        if (!bucket) { bucket = new Set(); pdsByDept.set(pd.departmentId, bucket); }
        bucket.add(pd.id);
      }
      for (const deptId of grantedDepartmentIds) {
        const pdIds = pdsByDept.get(deptId);
        if (pdIds) {
          for (const placement of snapshot.placements) {
            if (pdIds.has(placement.projectDepartmentId)) codes.add(placement.reportCode);
          }
        }
        for (const dr of snapshot.directReports) {
          if (dr.departmentId === deptId) codes.add(dr.reportCode);
        }
      }
    }

    return Array.from(codes).sort();
  }, [snapshot, grantedPdrIds, grantedDirectReportIds, grantedDepartmentIds]);

  // Lazy-fetch schema when a report first appears in the granted list.
  useEffect(() => {
    grantedReportCodes.forEach(async (code) => {
      if (schemas[code]) return;
      try {
        const schema = await getReportSchema(code);
        setSchemas((prev) => ({ ...prev, [code]: schema }));
      } catch (e) {
        console.error("Failed to load schema for", code, e);
      }
    });
  }, [grantedReportCodes, schemas]);

  // Keep the dropdown selection in sync with the granted set. If the current
  // pick is no longer granted (admin unticked the dept in Access), fall back
  // to the first granted code, or null when nothing is granted.
  useEffect(() => {
    if (grantedReportCodes.length === 0) {
      if (selectedColumnReportCode !== null) setSelectedColumnReportCode(null);
      return;
    }
    if (!selectedColumnReportCode || !grantedReportCodes.includes(selectedColumnReportCode)) {
      setSelectedColumnReportCode(grantedReportCodes[0]);
    }
  }, [grantedReportCodes, selectedColumnReportCode]);

  function toggleColumn(reportCode: string, key: string) {
    setColumnGrants((prev) => {
      const current = new Set(prev[reportCode] ?? []);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...prev, [reportCode]: current };
    });
  }

  async function saveColumns(reportCode: string) {
    if (!policy) return;
    const keys = Array.from(columnGrants[reportCode] ?? []);
    const { etag: newEtag } = await setPolicyColumns(policy.id, reportCode, keys, etag);
    setEtag(newEtag);
    setSavedColumns((prev) => ({
      ...prev,
      [reportCode]: new Set(keys),
    }));
  }

  // ── Users tab helpers ──
  function toggleUser(uid: number) {
    setGrantedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function saveUsers() {
    if (!policy) return;
    const { etag: newEtag } = await setPolicyUsers(
      policy.id,
      Array.from(grantedUserIds),
      etag
    );
    setEtag(newEtag);
    setSavedUsers(new Set(grantedUserIds));
  }

  // ── Department-first tree for the Access tab ──
  // Each department contains two parallel lists:
  //   projects: { project, placements[] } for each project attached to the dept
  //   directReports: placements with no project layer
  // Ticking a department is UI-only (expand/collapse). Grants are written at
  // the leaf checkboxes: placements → policy_project_reports, direct reports
  // → policy_department_reports. The intermediate policy_projects table is
  // no longer written from this editor; legacy rows are preserved by the
  // navigation queries on the backend.
  const departmentTree = useMemo(() => {
    if (!snapshot) return [];
    const projectById = new Map(snapshot.projects.map((p) => [p.id, p]));
    return snapshot.departments.map((dept) => {
      const pdRows = snapshot.projectDepartments.filter((pd) => pd.departmentId === dept.id);
      const projects = pdRows
        .map((pd) => {
          const project = projectById.get(pd.projectId);
          if (!project) return null;
          return {
            project,
            pd,
            placements: snapshot.placements.filter((pl) => pl.projectDepartmentId === pd.id),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const directReports = snapshot.directReports.filter((dr) => dr.departmentId === dept.id);
      return { dept, projects, directReports };
    });
    // Every department is listed — including ones with no content yet. A
    // whole-department grant is useful for pre-authorizing users before the
    // admin has set up the dept's content (future templates, records, etc.).
  }, [snapshot]);

  // Track which departments are expanded in the Access tab. UI-only state —
  // no persistence, no grant implication. Departments with any existing grant
  // start expanded so admins can see what's there without clicking.
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set());
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!snapshot) return;
    const initialDepts = new Set<number>();
    const initialProjects = new Set<number>();
    for (const { dept, projects, directReports } of departmentTree) {
      const hasDirectGrant = directReports.some((dr) => grantedDirectReportIds.has(dr.id));
      const grantedProjects = projects.filter((p) =>
        p.placements.some((pl) => grantedPdrIds.has(pl.id))
      );
      if (hasDirectGrant || grantedProjects.length > 0) initialDepts.add(dept.id);
      for (const gp of grantedProjects) initialProjects.add(gp.pd.id);
    }
    setExpandedDeptIds(initialDepts);
    setExpandedProjectKeys(initialProjects);
    // Intentionally runs only when the snapshot arrives / policy loads. User
    // interaction after that takes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, savedAccessPdrIds, savedDirectReportIds]);

  function toggleDeptExpanded(deptId: number) {
    setExpandedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }
  function toggleProjectExpanded(pdId: number) {
    setExpandedProjectKeys((prev) => {
      const next = new Set(prev);
      if (next.has(pdId)) next.delete(pdId);
      else next.add(pdId);
      return next;
    });
  }

  return (
    <AdminLayout>
      <div className="mb-4">
        <Link
          to="/admin/policies"
          className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant/70 hover:text-primary transition-colors no-underline"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to policies
        </Link>
      </div>

      <AdminPageHeader
        title={isNew ? "New Policy" : name || "Policy"}
        description={
          isNew
            ? "Create a new policy, then decide which projects, reports, columns, and users it applies to."
            : "Decide which projects, reports, columns, and users this policy applies to."
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      {loading ? (
        <>
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Skeleton className="h-3 w-12 mb-2" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
              <div>
                <Skeleton className="h-3 w-12 mb-2" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
              <div className="md:col-span-2">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </div>
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
            <Skeleton className="h-5 w-40 mb-5" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* ─── Details card ─── */}
          <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  Code {isNew && <RequiredMark />}
                </label>
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (formErrors.code) setFormErrors({ ...formErrors, code: undefined });
                  }}
                  disabled={!isNew}
                  placeholder="e.g. hr-regional-lead"
                  className={`w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border text-on-surface text-sm focus:outline-none focus:bg-white transition-all disabled:opacity-60 ${
                    formErrors.code
                      ? "border-error/50 focus:border-error/60"
                      : "border-on-surface-variant/8 focus:border-primary/30"
                  }`}
                />
                {formErrors.code && (
                  <p className="text-xs text-error mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {formErrors.code}
                  </p>
                )}
                {isNew && (
                  <p className="text-[11px] text-on-surface-variant/50 mt-1.5">
                    Lowercase letters, numbers, and hyphens only. Cannot be changed after creation.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  Name <RequiredMark />
                </label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
                  }}
                  placeholder="e.g. HR Regional Lead"
                  className={`w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border text-on-surface text-sm focus:outline-none focus:bg-white transition-all ${
                    formErrors.name
                      ? "border-error/50 focus:border-error/60"
                      : "border-on-surface-variant/8 focus:border-primary/30"
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-error mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {formErrors.name}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary/30 focus:bg-white transition-all resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <SaveButton
                onSave={saveDetails}
                onError={handleSaveError}
              >
                {isNew ? "Create Policy" : "Save Details"}
              </SaveButton>
            </div>
          </div>

          {isNew ? (
            <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center text-on-surface-variant/60 text-sm">
              Create the policy first to configure access, columns, and users.
            </div>
          ) : (
            <>
              {/* ─── Tab Switcher ─── */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-2 inline-flex gap-1">
                  <TabButton
                    active={tab === "access"}
                    onClick={() => setTab("access")}
                    icon="lock_open"
                    dirty={accessDirty}
                  >
                    Access
                  </TabButton>
                  <TabButton
                    active={tab === "columns"}
                    onClick={() => setTab("columns")}
                    icon="view_column"
                    dirty={columnsDirty}
                  >
                    Columns
                  </TabButton>
                  <TabButton
                    active={tab === "users"}
                    onClick={() => setTab("users")}
                    icon="group"
                    dirty={usersDirty}
                  >
                    Users
                  </TabButton>
                </div>
                {anyDirty && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    Unsaved changes
                  </div>
                )}
              </div>

              {tab === "access" && (
                <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-base font-bold text-on-surface">Access</h3>
                      <p className="text-xs text-on-surface-variant/70 mt-0.5">
                        Tick a department to grant full access to everything inside it (current and future). For finer control, leave the department unticked and expand it to pick specific reports.
                      </p>
                    </div>
                    <SaveButton
                      onSave={saveAccess}
                      size="sm"
                      onError={handleSaveError}
                    >
                      Save Access
                    </SaveButton>
                  </div>

                  {departmentTree.length === 0 ? (
                    <p className="text-sm text-on-surface-variant/60 italic">
                      No departments exist yet. Create one on the Departments page first.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {departmentTree.map(({ dept, projects, directReports }) => {
                        const expanded = expandedDeptIds.has(dept.id);
                        const fullGrant = grantedDepartmentIds.has(dept.id);
                        const hasAnything = projects.length > 0 || directReports.length > 0;
                        const grantedLeafCount =
                          directReports.filter((dr) => grantedDirectReportIds.has(dr.id)).length +
                          projects.reduce(
                            (acc, p) =>
                              acc + p.placements.filter((pl) => grantedPdrIds.has(pl.id)).length,
                            0
                          );
                        return (
                          <div
                            key={dept.id}
                            className={`border rounded-xl overflow-hidden ${
                              fullGrant
                                ? "border-primary/25 bg-primary/5"
                                : "border-on-surface-variant/10"
                            }`}
                          >
                            <div
                              className={`px-4 py-3 flex items-center gap-3 transition-colors ${
                                fullGrant
                                  ? ""
                                  : expanded
                                    ? "bg-primary/5"
                                    : "bg-surface-container-low/60"
                              }`}
                            >
                              {/* Real grant checkbox — writes policy_departments */}
                              <label className="flex items-center cursor-pointer" title="Grant full access to this department">
                                <input
                                  type="checkbox"
                                  checked={fullGrant}
                                  onChange={() => toggleDepartment(dept.id)}
                                  className="accent-primary w-4 h-4"
                                />
                              </label>
                              {/* Expand toggle — disabled while fully granted since the drill-down is hidden */}
                              <button
                                type="button"
                                onClick={() => !fullGrant && hasAnything && toggleDeptExpanded(dept.id)}
                                disabled={fullGrant || !hasAnything}
                                className={`flex-1 flex items-center gap-3 text-left ${
                                  fullGrant || !hasAnything ? "cursor-default" : "cursor-pointer"
                                }`}
                              >
                                <span
                                  className={`material-symbols-outlined text-[18px] transition-transform ${
                                    fullGrant || !hasAnything
                                      ? "text-transparent"
                                      : expanded
                                        ? "rotate-90 text-primary"
                                        : "text-on-surface-variant/50"
                                  }`}
                                >
                                  chevron_right
                                </span>
                                <span className="material-symbols-outlined text-on-surface-variant/70 text-[18px]">
                                  {dept.icon || "folder"}
                                </span>
                                <span className="font-bold text-sm text-on-surface flex-1 truncate">
                                  {dept.name}
                                </span>
                                <code className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded">
                                  {dept.code}
                                </code>
                                {fullGrant ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                                    <span
                                      className="material-symbols-outlined text-[12px]"
                                      style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                      done_all
                                    </span>
                                    Full access
                                  </span>
                                ) : grantedLeafCount > 0 ? (
                                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    {grantedLeafCount} granted
                                  </span>
                                ) : !hasAnything ? (
                                  <span className="text-[10px] font-semibold text-on-surface-variant/50 italic">
                                    empty
                                  </span>
                                ) : null}
                              </button>
                            </div>

                            {!fullGrant && expanded && hasAnything && (
                              <div className="border-t border-on-surface-variant/8 divide-y divide-on-surface-variant/8">
                                {/* Projects inside this department */}
                                {projects.length > 0 && (
                                  <div className="p-4 flex flex-col gap-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                                      Projects in {dept.name}
                                    </p>
                                    {projects.map(({ project, pd, placements }) => {
                                      const projExpanded = expandedProjectKeys.has(pd.id);
                                      const projGranted = placements.filter((pl) =>
                                        grantedPdrIds.has(pl.id)
                                      ).length;
                                      return (
                                        <div
                                          key={pd.id}
                                          className="border border-on-surface-variant/10 rounded-lg overflow-hidden"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => toggleProjectExpanded(pd.id)}
                                            className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                                              projExpanded
                                                ? "bg-primary/5"
                                                : "bg-surface-container-lowest hover:bg-surface-container-low/60"
                                            } cursor-pointer`}
                                          >
                                            <span
                                              className={`material-symbols-outlined text-[16px] transition-transform ${
                                                projExpanded
                                                  ? "rotate-90 text-primary"
                                                  : "text-on-surface-variant/50"
                                              }`}
                                            >
                                              chevron_right
                                            </span>
                                            <div
                                              className="w-2 h-2 rounded-full shrink-0"
                                              style={{ backgroundColor: project.colorHex }}
                                            />
                                            <span className="font-semibold text-sm text-on-surface flex-1 truncate">
                                              {project.displayName}
                                            </span>
                                            {projGranted > 0 && (
                                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                {projGranted}/{placements.length}
                                              </span>
                                            )}
                                          </button>

                                          {projExpanded && (
                                            <div className="px-4 py-3 border-t border-on-surface-variant/8 bg-surface-container-lowest/40">
                                              {placements.length === 0 ? (
                                                <p className="text-[11px] text-on-surface-variant/50 italic">
                                                  No reports have been placed in {project.displayName} for {dept.name}. Add them in Catalog Structure.
                                                </p>
                                              ) : (
                                                <div className="flex flex-wrap gap-2">
                                                  {placements.map((pl) => {
                                                    const on = grantedPdrIds.has(pl.id);
                                                    return (
                                                      <label
                                                        key={pl.id}
                                                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                          on
                                                            ? "bg-primary/8 border-primary/25 text-primary font-semibold"
                                                            : "bg-white border-on-surface-variant/10 text-on-surface-variant hover:bg-surface-container-low/60"
                                                        }`}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={on}
                                                          onChange={() => togglePdr(pl.id)}
                                                          className="accent-primary"
                                                        />
                                                        {pl.reportName}
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Direct reports inside this department */}
                                {directReports.length > 0 && (
                                  <div className="p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-2">
                                      Direct reports in {dept.name}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {directReports.map((dr) => {
                                        const on = grantedDirectReportIds.has(dr.id);
                                        return (
                                          <label
                                            key={dr.id}
                                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                              on
                                                ? "bg-primary/8 border-primary/25 text-primary font-semibold"
                                                : "bg-white border-on-surface-variant/10 text-on-surface-variant hover:bg-surface-container-low/60"
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={on}
                                              onChange={() => toggleDirectReport(dr.id)}
                                              className="accent-primary"
                                            />
                                            {dr.reportName}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {tab === "columns" && (
                <div className="flex flex-col gap-4">
                  {grantedReportCodes.length === 0 ? (
                    <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center">
                      <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 mb-2">
                        view_column
                      </span>
                      <p className="text-sm text-on-surface-variant/60">
                        Grant access to at least one department, project-report, or direct report in the Access tab to choose which columns are visible.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Report picker — shows a dropdown of every report the
                          policy effectively grants (via leaf ticks OR a
                          whole-department grant). Configure columns one
                          report at a time so the page stays readable when a
                          full-dept grant fans out to 10+ reports. */}
                      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-5">
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 block mb-1.5">
                            Configure columns for
                          </span>
                          <select
                            value={selectedColumnReportCode ?? ""}
                            onChange={(e) => setSelectedColumnReportCode(e.target.value || null)}
                            className="w-full py-2 px-3 bg-surface-container-low/50 rounded-xl border border-on-surface-variant/10 text-on-surface text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
                          >
                            {grantedReportCodes.map((code) => {
                              const sch = schemas[code];
                              return (
                                <option key={code} value={code}>
                                  {sch?.name ?? code}
                                  {sch ? ` · ${code}` : ""}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <p className="text-[11px] text-on-surface-variant/50 mt-2">
                          {grantedReportCodes.length} report{grantedReportCodes.length === 1 ? "" : "s"} granted by this policy. Column choices apply globally per report — picking a project here is a UI lens only.
                        </p>
                      </div>

                      {/* Single-report card for the currently-selected code. */}
                      {selectedColumnReportCode && (() => {
                        const reportCode = selectedColumnReportCode;
                        const schema = schemas[reportCode];
                        const allowed = columnGrants[reportCode] ?? new Set<string>();
                        return (
                        <div
                          key={reportCode}
                          className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-base font-bold text-on-surface">
                                {schema?.name ?? reportCode}
                              </h3>
                              <code className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded mt-1 inline-block">
                                {reportCode}
                              </code>
                            </div>
                            <SaveButton
                              onSave={() => saveColumns(reportCode)}
                              disabled={!schema}
                              size="sm"
                              onError={handleSaveError}
                            >
                              Save Columns
                            </SaveButton>
                          </div>
                          {!schema ? (
                            <p className="text-sm text-on-surface-variant/50 italic">Loading schema…</p>
                          ) : (
                            <>
                              {/* ── View legend (colors are consistent per view, generic across reports) ── */}
                              {(() => {
                                const distinctViews = Array.from(
                                  new Set(schema.columns.flatMap((c) => c.views))
                                ).sort();
                                return (
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-4 border-b border-on-surface-variant/8">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                                      Views
                                    </span>
                                    {distinctViews.map((v) => {
                                      const count = schema.columns.filter((c) =>
                                        c.views.includes(v)
                                      ).length;
                                      return (
                                        <div key={v} className="flex items-center gap-1.5">
                                          <ViewBadge view={v} size="sm" />
                                          <span className="text-[10px] font-semibold text-on-surface-variant/60">
                                            {count} col{count === 1 ? "" : "s"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {schema.columns.map((col) => {
                                  const on = allowed.has(col.key);
                                  return (
                                    <label
                                      key={col.key}
                                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                                        on
                                          ? "bg-primary/5 border-primary/25"
                                          : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={on}
                                        onChange={() => toggleColumn(reportCode, col.key)}
                                        className="mt-0.5 accent-primary"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-xs text-on-surface truncate">
                                          {col.label}
                                        </p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {col.views.map((v) => (
                                            <ViewBadge key={v} view={v} />
                                          ))}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              {tab === "users" && (() => {
                const totalUsers = allUsers.length;
                const attachedCount = grantedUserIds.size;
                const start = (usersPage - 1) * usersPageSize;
                const pagedUsers = allUsers.slice(start, start + usersPageSize);
                return (
                  <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
                    <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
                      <div>
                        <h3 className="text-base font-bold text-on-surface">Attached Users</h3>
                        <p className="text-xs text-on-surface-variant/70 mt-0.5">
                          Users attached to this policy inherit its grants.
                          {attachedCount > 0 && (
                            <span className="ml-1 font-semibold text-primary">
                              {attachedCount} of {totalUsers} selected.
                            </span>
                          )}
                        </p>
                      </div>
                      <SaveButton
                        onSave={saveUsers}
                        size="sm"
                        onError={handleSaveError}
                      >
                        Save Users
                      </SaveButton>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {pagedUsers.map((u) => {
                        const on = grantedUserIds.has(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                              on
                                ? "bg-primary/5 border-primary/25"
                                : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleUser(u.id)}
                              className="accent-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-on-surface truncate">
                                {u.fullName || u.username}
                              </p>
                              <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider mt-0.5">
                                {u.username}
                                {u.isAdmin && " · admin"}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {totalUsers > 0 && (
                      <div className="mt-5 pt-5 border-t border-on-surface-variant/8">
                        <Paginator
                          totalItems={totalUsers}
                          currentPage={usersPage}
                          pageSize={usersPageSize}
                          onPageChange={setUsersPage}
                          onPageSizeChange={setUsersPageSize}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </AdminLayout>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  dirty = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
        active
          ? "bg-primary/8 text-primary border border-primary/15"
          : "text-on-surface-variant hover:bg-surface-container-high/60 border border-transparent"
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {children}
      {dirty && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-amber-500"
          aria-label="Unsaved changes"
          title="Unsaved changes"
        />
      )}
    </button>
  );
}

// ── Dirty-state comparison helpers ───────────────────────────────────────

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function columnGrantsEqual(
  a: Record<string, Set<string>>,
  b: Record<string, Set<string>>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (!setsEqual(a[k], b[k])) return false;
  }
  return true;
}
