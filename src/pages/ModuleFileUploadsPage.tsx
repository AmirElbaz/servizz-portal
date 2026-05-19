import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import BackLink from "../components/ui/BackLink";
import {
  fetchCatalogDepartment,
  type CatalogDepartmentSummary,
} from "../services/catalog";
import {
  downloadFile,
  fetchFileBlob,
  getModule,
  listFiles,
  replaceFile,
  softDeleteFile,
  uploadFile,
  type ModuleGroupSummary,
  type ModuleSummary,
  type UploadedFileSummary,
} from "../services/modules";
import { Can, usePermissions } from "../services/permissions";
import { fmt } from "../utils/fmt";

const ACCENT = "#2EB2FF";

// Permission prefix lookup. Mirrors backend ModulePermissions.PrefixFor.
function prefixFor(moduleCode: string): string {
  if (moduleCode === "bdf-reports") return "bdf";
  return moduleCode;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${fmt.int(n)} B`;
  if (n < 1024 * 1024) return `${fmt.dec(n / 1024, 1)} KB`;
  return `${fmt.dec(n / 1024 / 1024, 1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ModuleFileUploadsPage() {
  const { deptCode, moduleCode } = useParams<{ deptCode: string; moduleCode: string }>();
  const [searchParams] = useSearchParams();
  const initialGroupCode = searchParams.get("group");
  const effectiveDeptCode = (deptCode ?? "IT").toUpperCase();
  const effectiveModuleCode = moduleCode ?? "bdf-reports";
  const prefix = prefixFor(effectiveModuleCode);
  const { loaded: permsLoaded } = usePermissions();

  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [module, setModule] = useState<ModuleSummary | null>(null);
  const [groups, setGroups] = useState<ModuleGroupSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  const [files, setFiles] = useState<UploadedFileSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Replace state — `replaceFor` is the file id the next picked PDF should
  // overwrite. Each row's Replace button arms a hidden picker, which fires
  // a single change event with the chosen PDF and clears `replaceFor`.
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceFor, setReplaceFor] = useState<number | null>(null);
  const [replacing, setReplacing] = useState(false);

  // Preview state — `previewing` is the file currently rendered in the
  // modal. `previewUrl` is the blob: URL backing the iframe; we revoke it
  // when the modal closes or the user picks a different file.
  const [previewing, setPreviewing] = useState<UploadedFileSummary | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Confirm-delete state — replaces window.confirm so the dialog matches the
  // rest of the admin UI and isn't visually jarring.
  const [pendingDelete, setPendingDelete] = useState<UploadedFileSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Initial: dept + module
  useEffect(() => {
    let cancelled = false;
    fetchCatalogDepartment(effectiveDeptCode)
      .then((d) => { if (!cancelled) setDept(d); })
      .catch(() => { /* breadcrumb falls back to code */ });
    return () => { cancelled = true; };
  }, [effectiveDeptCode]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Pass the dept code so we only get THIS dept's groups — different
    // departments hosting the same module kind have entirely separate
    // report types after migration 028.
    getModule(effectiveModuleCode, effectiveDeptCode)
      .then((res) => {
        if (cancelled) return;
        setModule(res.module);
        setGroups(res.groups);
        if (res.groups.length > 0 && activeGroupId == null) {
          // Honor ?group=<code> for deep-links from the dept landing's
          // group cards. Falls back to the first group when the URL value
          // doesn't match anything (renamed / deleted group, stale link).
          const fromUrl = initialGroupCode
            ? res.groups.find((g) => g.code === initialGroupCode)
            : null;
          setActiveGroupId(fromUrl?.id ?? res.groups[0].id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load module");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveModuleCode]);

  const loadFiles = useCallback(async () => {
    if (activeGroupId == null) return;
    setLoadingFiles(true);
    setError(null);
    try {
      const res = await listFiles(effectiveModuleCode, {
        groupId: activeGroupId,
        from: from || undefined,
        to: to || undefined,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setFiles(res.rows);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoadingFiles(false);
    }
  }, [effectiveModuleCode, activeGroupId, from, to, q, page]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId],
  );

  const groupScope: [string, string] | undefined = activeGroupId != null
    ? ["group", activeGroupId.toString()]
    : undefined;
  const moduleScope: [string, string] = ["module", effectiveModuleCode];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file again re-fires
    if (!f || activeGroupId == null) return;

    setUploading(true);
    setError(null);
    try {
      await uploadFile(effectiveModuleCode, activeGroupId, f);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function requestDelete(file: UploadedFileSummary) {
    setPendingDelete(file);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await softDeleteFile(effectiveModuleCode, pendingDelete.id);
      setPendingDelete(null);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  // Pull bytes via the authed endpoint, build a blob URL, hand it to the
  // modal's iframe. Revokes on close / on switch / on unmount so we don't
  // leak object URLs across the page lifetime.
  useEffect(() => {
    if (!previewing) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewLoading(true);
    setError(null);
    fetchFileBlob(effectiveModuleCode, previewing.id)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPreviewUrl(createdUrl);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Preview failed");
        setPreviewing(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing?.id]);

  // Escape key closes the preview modal — simple keyboard affordance.
  useEffect(() => {
    if (!previewing && !pendingDelete) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (previewing) setPreviewing(null);
        else if (pendingDelete && !deleting) setPendingDelete(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewing, pendingDelete, deleting]);

  function startReplace(fileId: number) {
    setReplaceFor(fileId);
    // setTimeout so React commits the state before we trigger the picker;
    // otherwise the change event fires before `replaceFor` is set.
    setTimeout(() => replaceInputRef.current?.click(), 0);
  }

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    const fileId = replaceFor;
    setReplaceFor(null);
    if (!f || fileId == null) return;

    setReplacing(true);
    setError(null);
    try {
      await replaceFile(effectiveModuleCode, fileId, f);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardLayout wide>
      <div style={{ "--accent": ACCENT } as React.CSSProperties}>
        <BackLink to={`/department/${effectiveDeptCode}`} label={`Back to ${dept?.name ?? "Department"}`} />

        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
            <Link to="/dashboard" className="hover:text-on-surface no-underline text-on-surface-variant/50">Dashboard</Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <Link to={`/department/${effectiveDeptCode}`} className="hover:text-on-surface no-underline text-on-surface-variant/50">
              {dept?.name ?? effectiveDeptCode}
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-accent">{module?.name ?? effectiveModuleCode}</span>
          </nav>

          <div className="flex flex-col sm:flex-row items-start justify-between gap-4 sm:gap-6">
            <div>
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tighter font-headline text-on-surface flex items-center gap-3">
                {module?.icon && <span className="material-symbols-outlined text-3xl text-accent">{module.icon}</span>}
                {module?.name ?? effectiveModuleCode}
              </h1>
              {module?.description && (
                <p className="text-on-surface-variant/60 text-sm mt-1 max-w-2xl">{module.description}</p>
              )}
            </div>
            <Can permission={`${prefix}:upload`} resource={[groupScope ?? moduleScope, moduleScope]}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || activeGroupId == null}
                className="bg-accent text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:opacity-90 transition-all disabled:opacity-40"
                style={{ boxShadow: `0 4px 20px ${ACCENT}25` }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {uploading ? "hourglass_top" : "upload"}
                </span>
                {uploading ? "Uploading…" : "Upload PDF"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleUpload}
                className="hidden"
              />
            </Can>
            {/* Hidden picker shared by every row's Replace button. The
                row's onClick sets `replaceFor` then triggers .click(); the
                change event handler reads that id, posts the file, and
                clears the state. Lives here (not per-row) so React doesn't
                re-create N hidden inputs on every render. */}
            <input
              ref={replaceInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleReplace}
              className="hidden"
            />
          </div>
        </div>

        {/* Group tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {groups.length === 0 ? (
            <p className="text-sm text-on-surface-variant/60 italic">No groups configured yet.</p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { setActiveGroupId(g.id); setPage(1); }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors flex items-center gap-2 ${
                  activeGroupId === g.id
                    ? "bg-accent text-white border-transparent shadow"
                    : "bg-surface-container-high/50 text-on-surface-variant border-on-surface-variant/10 hover:bg-surface-container-high"
                }`}
              >
                {g.icon && <span className="material-symbols-outlined text-[16px]">{g.icon}</span>}
                {g.name}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${activeGroupId === g.id ? "bg-white/20" : "bg-on-surface-variant/10"}`}>
                  {g.fileCount}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Filter bar */}
        <div className="mb-6 prism-surface rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/10 text-sm focus:outline-none focus:border-accent"
              style={{ colorScheme: "light" }}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/10 text-sm focus:outline-none focus:border-accent"
              style={{ colorScheme: "light" }}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">Search filename</label>
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="audit-q1.pdf"
              className="w-full py-2 px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/10 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-300/50 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            <p className="font-bold mb-1">Something went wrong</p>
            <p className="text-[12px] text-rose-600/80">{error}</p>
          </div>
        )}

        {!permsLoaded && (
          <p className="text-on-surface-variant/50 text-sm italic mb-4">Loading permissions…</p>
        )}

        {/* File table */}
        <div className="prism-surface rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-on-surface-variant/6 flex items-center justify-between">
            <h3 className="text-sm font-bold text-on-surface font-headline">
              {activeGroup ? activeGroup.name : "Files"}
            </h3>
            <span className="text-[11px] text-on-surface-variant/50">
              {loadingFiles ? "Loading…" : `${total} file${total === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-high/30 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                  <th className="px-4 py-3">Filename</th>
                  <th className="px-4 py-3">Uploaded by</th>
                  <th className="px-4 py-3">Uploaded at</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingFiles && files.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-t border-on-surface-variant/6">
                      <td className="px-4 py-3"><div className="h-4 w-48 rounded bg-surface-container-high/70 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-surface-container-high/70 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-32 rounded bg-surface-container-high/70 animate-pulse" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-surface-container-high/70 animate-pulse" /></td>
                      <td className="px-4 py-3 text-right"><div className="h-4 w-12 ml-auto rounded bg-surface-container-high/70 animate-pulse" /></td>
                    </tr>
                  ))
                ) : files.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      {(q || from || to) ? (
                        <>
                          <span className="material-symbols-outlined block text-[40px] text-on-surface-variant/30 mb-2">
                            search_off
                          </span>
                          <p className="text-sm text-on-surface-variant/60">
                            No files match the current filters.
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined block text-[40px] text-on-surface-variant/30 mb-2">
                            folder_open
                          </span>
                          <p className="text-sm text-on-surface-variant/60">
                            No files yet in {activeGroup?.name ?? "this group"}.
                          </p>
                        </>
                      )}
                    </td>
                  </tr>
                ) : files.map((f) => {
                  return (
                    <tr key={f.id} className="border-t border-on-surface-variant/6 hover:bg-surface-container-low/40">
                      <td className="px-4 py-3 text-sm text-on-surface font-medium">
                        <span className="material-symbols-outlined text-[18px] text-accent align-middle mr-1.5">picture_as_pdf</span>
                        {f.filename}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">
                        {f.uploadedByName ?? `User #${f.uploadedBy}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant tabular-nums">
                        {formatDate(f.uploadedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant tabular-nums">
                        {formatBytes(f.byteSize)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Can permission={`${prefix}:view`} resource={[groupScope ?? moduleScope, moduleScope]}>
                            <button
                              type="button"
                              title="Preview in browser"
                              onClick={() => setPreviewing(f)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent/10 transition-colors text-on-surface-variant hover:text-accent"
                            >
                              <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </button>
                          </Can>
                          <Can permission={`${prefix}:view`} resource={[groupScope ?? moduleScope, moduleScope]}>
                            <button
                              type="button"
                              title="Download"
                              onClick={() => downloadFile(effectiveModuleCode, f.id, f.filename)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent/10 transition-colors text-on-surface-variant hover:text-accent"
                            >
                              <span className="material-symbols-outlined text-[18px]">download</span>
                            </button>
                          </Can>
                          <Can permission={`${prefix}:replace`} resource={[groupScope ?? moduleScope, moduleScope]}>
                            <button
                              type="button"
                              title="Replace with a new PDF (keeps the same row, updates the bytes)"
                              disabled={replacing && replaceFor === f.id}
                              onClick={() => startReplace(f.id)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-primary/10 transition-colors text-on-surface-variant hover:text-primary disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {replacing && replaceFor === f.id ? "hourglass_top" : "swap_horiz"}
                              </span>
                            </button>
                          </Can>
                          <Can permission={`${prefix}:delete`} resource={[groupScope ?? moduleScope, moduleScope]}>
                            <button
                              type="button"
                              title="Soft-delete"
                              onClick={() => requestDelete(f)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-rose-500/10 transition-colors text-on-surface-variant hover:text-rose-600"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </Can>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-on-surface-variant/6 flex items-center justify-between text-[12px] text-on-surface-variant">
              <button
                type="button"
                disabled={page <= 1 || loadingFiles}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-2 rounded-lg border border-on-surface-variant/10 font-semibold hover:bg-surface-container-high disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="font-semibold tabular-nums">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages || loadingFiles}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-2 rounded-lg border border-on-surface-variant/10 font-semibold hover:bg-surface-container-high disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Preview modal ─────────────────────────────────────────────
          Renders the PDF inline via an authed blob URL so the bytes never
          leave the page and the auth header is honored on fetch. Click the
          backdrop or hit Escape to close. */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setPreviewing(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
        >
          <div
            className="bg-surface rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-3 border-b border-on-surface-variant/8 flex items-center gap-3">
              <span className="material-symbols-outlined text-accent text-[22px] shrink-0">picture_as_pdf</span>
              <div className="min-w-0 flex-1">
                <h2 id="preview-title" className="text-sm font-bold text-on-surface font-headline truncate">
                  {previewing.filename}
                </h2>
                <p className="text-[11px] text-on-surface-variant/60 tabular-nums">
                  {formatBytes(previewing.byteSize)} · uploaded {formatDate(previewing.uploadedAt)}
                  {previewing.uploadedByName ? ` by ${previewing.uploadedByName}` : ""}
                </p>
              </div>
              <button
                type="button"
                title="Download"
                onClick={() => downloadFile(effectiveModuleCode, previewing.id, previewing.filename)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-accent/10 transition-colors text-on-surface-variant hover:text-accent"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
              </button>
              <button
                type="button"
                title="Close (Esc)"
                onClick={() => setPreviewing(null)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-on-surface-variant/10 transition-colors text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </header>
            <div className="flex-1 bg-surface-container-low/40 relative">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant/60 text-sm">
                  <span className="material-symbols-outlined animate-spin text-[28px] mr-2">progress_activity</span>
                  Loading preview…
                </div>
              )}
              {previewUrl && (
                <iframe
                  src={previewUrl}
                  title={previewing.filename}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm-delete modal ──────────────────────────────────────
          Replaces window.confirm so the destructive action matches the
          rest of the admin tone. Click Cancel / backdrop / Escape to back
          out; only the explicit Delete button commits. */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !deleting && setPendingDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <div
            className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#fee2e2", color: "#b91c1c" }}
              >
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-title" className="text-base font-bold text-on-surface font-headline">
                  Soft-delete this file?
                </h2>
                <p className="text-[13px] text-on-surface-variant/70 mt-1 truncate">
                  {pendingDelete.filename}
                </p>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant/80 leading-relaxed mb-5">
              The file will be hidden from listings but the bytes stay on
              disk for audit. An admin can restore it later from the database
              if needed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-on-surface-variant/15 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
