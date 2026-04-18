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
  const [grantedPdIds, setGrantedPdIds] = useState<Set<number>>(new Set());
  const [grantedPdrIds, setGrantedPdrIds] = useState<Set<number>>(new Set());
  const [grantedUserIds, setGrantedUserIds] = useState<Set<number>>(new Set());
  const [columnGrants, setColumnGrants] = useState<Record<string, Set<string>>>({});
  const [schemas, setSchemas] = useState<Record<string, ReportSchema>>({});

  // ── Dirty tracking: each tab gets a "saved snapshot" that reflects the
  // server state at load (or after the most recent successful save). Local
  // state is compared against these snapshots to derive dirty flags.
  const [savedDetails, setSavedDetails] = useState({ name: "", description: "" });
  const [savedAccessPdIds, setSavedAccessPdIds] = useState<Set<number>>(new Set());
  const [savedAccessPdrIds, setSavedAccessPdrIds] = useState<Set<number>>(new Set());
  const [savedUsers, setSavedUsers] = useState<Set<number>>(new Set());
  const [savedColumns, setSavedColumns] = useState<Record<string, Set<string>>>({});

  // ── ETag for optimistic concurrency. Captured on load and refreshed after
  // every successful save. Sent as If-Match on subsequent saves.
  const [etag, setEtag] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("access");

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
        const userIds = new Set(detail.users.map((u) => u.id));
        const cols = Object.fromEntries(
          Object.entries(detail.columns).map(([k, v]) => [k, new Set(v)])
        );

        setGrantedPdIds(pdIds);
        setGrantedPdrIds(pdrIds);
        setGrantedUserIds(userIds);
        setColumnGrants(cols);

        // Snapshot the loaded state so dirty flags start clean.
        setSavedDetails({ name: detail.name, description: detail.description ?? "" });
        setSavedAccessPdIds(new Set(pdIds));
        setSavedAccessPdrIds(new Set(pdrIds));
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
  const accessDirty =
    !setsEqual(grantedPdIds, savedAccessPdIds) ||
    !setsEqual(grantedPdrIds, savedAccessPdrIds);
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
  function togglePd(pdId: number) {
    setGrantedPdIds((prev) => {
      const next = new Set(prev);
      if (next.has(pdId)) next.delete(pdId);
      else next.add(pdId);
      return next;
    });
  }

  function togglePdr(pdrId: number) {
    setGrantedPdrIds((prev) => {
      const next = new Set(prev);
      if (next.has(pdrId)) next.delete(pdrId);
      else next.add(pdrId);
      return next;
    });
  }

  async function saveAccess() {
    if (!policy) return;
    // Two sequential writes. Refresh the ETag between them so the second call
    // carries the freshly-bumped token.
    const first = await setPolicyProjectDepartments(
      policy.id,
      Array.from(grantedPdIds),
      etag
    );
    const second = await setPolicyReports(
      policy.id,
      Array.from(grantedPdrIds),
      first.etag
    );
    setEtag(second.etag);
    setSavedAccessPdIds(new Set(grantedPdIds));
    setSavedAccessPdrIds(new Set(grantedPdrIds));
  }

  // ── Columns tab helpers ──
  // Derive the set of report codes this policy grants — from the granted
  // report-assignment rows in the Access tab's state.
  const grantedReportCodes = useMemo(() => {
    if (!snapshot) return [] as string[];
    const placementsById = new Map(snapshot.placements.map((p) => [p.id, p]));
    const codes = new Set<string>();
    for (const pdrId of grantedPdrIds) {
      const p = placementsById.get(pdrId);
      if (p) codes.add(p.reportCode);
    }
    return Array.from(codes).sort();
  }, [snapshot, grantedPdrIds]);

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

  // ── Project → departments → placements trees for the Access tab ──
  const projectsWithChildren = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.projects.map((project) => {
      const pdRows = snapshot.projectDepartments.filter((pd) => pd.projectId === project.id);
      return {
        project,
        pdRows: pdRows.map((pd) => ({
          ...pd,
          placements: snapshot.placements.filter((pl) => pl.projectDepartmentId === pd.id),
        })),
      };
    });
  }, [snapshot]);

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
                        Choose which departments this policy can see inside each project, then pick the specific reports inside each department.
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

                  <div className="flex flex-col gap-4">
                    {projectsWithChildren.map(({ project, pdRows }) => (
                      <div key={project.id} className="border border-on-surface-variant/10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-surface-container-low/60 flex items-center gap-3">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: project.colorHex }}
                          />
                          <h4 className="font-bold text-sm text-on-surface">{project.displayName}</h4>
                        </div>
                        {pdRows.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-on-surface-variant/50 italic">
                            No departments attached — set up in Project Structure.
                          </p>
                        ) : (
                          <div className="divide-y divide-on-surface-variant/8">
                            {pdRows.map((pd) => {
                              const pdGranted = grantedPdIds.has(pd.id);
                              return (
                                <div key={pd.id} className="px-4 py-3">
                                  <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={pdGranted}
                                      onChange={() => togglePd(pd.id)}
                                      className="accent-primary"
                                    />
                                    <span className="font-semibold text-sm text-on-surface">
                                      {pd.departmentName}
                                    </span>
                                  </label>
                                  {pdGranted && pd.placements.length > 0 && (
                                    <div className="mt-2 ml-7 flex flex-wrap gap-2">
                                      {pd.placements.map((pl) => {
                                        const on = grantedPdrIds.has(pl.id);
                                        return (
                                          <label
                                            key={pl.id}
                                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                              on
                                                ? "bg-primary/8 border-primary/25 text-primary font-semibold"
                                                : "bg-surface-container-low/40 border-on-surface-variant/8 text-on-surface-variant hover:bg-surface-container-low/70"
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
                                  {pdGranted && pd.placements.length === 0 && (
                                    <p className="mt-2 ml-7 text-[11px] text-on-surface-variant/50 italic">
                                      No reports have been added to this department for this project yet.
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
                        Grant access to at least one report in the Access tab to choose which columns are visible.
                      </p>
                    </div>
                  ) : (
                    grantedReportCodes.map((reportCode) => {
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
                    })
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
