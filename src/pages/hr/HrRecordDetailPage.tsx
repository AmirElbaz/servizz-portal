import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Skeleton from "../../components/admin/Skeleton";
import { ConcurrencyError } from "../../services/admin";
import { useAuth, roleAtLeast } from "../../services/auth";
import {
  getHrRecord,
  getHrTemplate,
  patchHrRecordValues,
  updateHrRecord,
  exportHrRecordPdf,
  exportHrRecordExcel,
  asGridOptions,
  type HrRecordDetail,
  type HrTemplateDetail,
  type HrTemplateField,
  type HrRecordStatus,
  type HrValuePatch,
  type HrGridColumn,
  type HrGridRow,
  type HrRagValue,
} from "../../services/hr";

// Record detail — the "fill the checklist" page. Section-grouped fields,
// explicit Save button (no auto-save — quick navigations were eating debounced
// flushes), ETag concurrency, progress ring in header, PDF export.
//
// Save strategy:
//   - Checkbox and typed-value edits mark field ids in `dirtyIds` and update
//     local `values` optimistically. Nothing hits the server until the admin
//     clicks Save (or hits Ctrl/Cmd+S).
//   - Save flushes all dirty ids in one PATCH with If-Match. On 412 we show
//     a banner asking the user to reload; edits stay in memory.
//   - Title + status changes flow through PUT immediately on blur/change —
//     they're single-action inputs, no batching needed.
//   - Browser close / refresh fires a beforeunload warning while dirty.
//   - The tab title gets a leading "●" while dirty so users can spot
//     unsaved work when switching tabs.
export default function HrRecordDetailPage() {
  const { deptCode, templateId, recordId } = useParams<{
    deptCode: string;
    templateId: string;
    recordId: string;
  }>();
  // Record editing is admin-only (Amir 2026-05-21). Non-admins can still
  // open the page (server keeps GETs on RequireHrAccessAsync), but the
  // title/status/values inputs are read-only and the Save button is hidden.
  // Server enforces the same via RequireHrAdminAsync on the PUT/PATCH
  // endpoints — this is cosmetic gating, not the source of truth.
  const { user } = useAuth();
  // HR record editing is a centrecom_user (staff) capability and above — same
  // gate as the server's RequireHrAdminAsync (now "staff or higher").
  const isAdmin = roleAtLeast(user?.role, "centrecom_user");
  const tid = Number(templateId);
  const rid = Number(recordId);
  const navigate = useNavigate();

  const [template, setTemplate] = useState<HrTemplateDetail | null>(null);
  const [record, setRecord] = useState<HrRecordDetail | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Flips to true the first time the user clicks Save with required fields
  // empty. Drives the red error ring on affected inputs and persists as the
  // user types — as each field gets filled the red clears live. Starts false
  // so fresh checklists don't pre-light as "broken."
  const [showValidation, setShowValidation] = useState(false);
  const [concurrency, setConcurrency] = useState(false);
  // null = idle; "pdf" / "xlsx" while that specific export is in flight.
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  // Values by field id — local state, flushed to the server only on Save.
  const [values, setValues] = useState<Map<number, HrValuePatch>>(new Map());

  // Dirty set of field ids that still need to be flushed. We keep this in a
  // Set<number> state (not a ref) so the Save button and unsaved pill
  // re-render when it changes.
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const isDirty = dirtyIds.size > 0;

  useEffect(() => {
    if (!Number.isFinite(tid) || !Number.isFinite(rid)) return;
    setLoading(true);
    Promise.all([getHrTemplate(tid), getHrRecord(rid)])
      .then(([t, r]) => {
        setTemplate(t.data);
        setRecord(r.data);
        setEtag(r.etag);
        const m = new Map<number, HrValuePatch>();
        for (const v of r.data.values) {
          m.set(v.fieldId, {
            fieldId: v.fieldId,
            valueText: v.valueText,
            valueNumber: v.valueNumber,
            valueDate: v.valueDate,
            valueBool: v.valueBool,
            valueJson: v.valueJson,
            isApplicable: v.isApplicable,
          });
        }
        setValues(m);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load record"))
      .finally(() => setLoading(false));
  }, [tid, rid]);

  const sections = useMemo(() => {
    if (!template) {
      return {
        creation: [] as HrTemplateField[],
        details: [] as HrTemplateField[],
        grouped: [] as Array<{ name: string; description: string | null; fields: HrTemplateField[] }>,
      };
    }
    // Creation fields (placement='creation') — asked at record creation, but
    // also surfaced on the detail page so users can view/correct them.
    const creation = template.fields
      .filter((f) => f.placement === "creation")
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Detail fields only — Details bucket = non-checkbox, no section,
    // placement='detail'. Checkbox fields without a section drop into
    // "General" so they still render.
    const detailFields = template.fields.filter((f) => f.placement !== "creation");
    const details = detailFields
      .filter((f) => f.fieldType !== "checkbox" && f.sectionId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const byId = new Map<number | "general", HrTemplateField[]>();
    for (const f of detailFields) {
      if (f.sectionId === null && f.fieldType !== "checkbox") continue;
      const key: number | "general" = f.sectionId ?? "general";
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key)!.push(f);
    }
    for (const arr of byId.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

    const ordered = template.sections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ name: s.name, description: s.description, fields: byId.get(s.id) ?? [] }))
      .filter((g) => g.fields.length > 0);
    if (byId.has("general")) {
      ordered.push({ name: "General", description: null, fields: byId.get("general")! });
    }
    return { creation, details, grouped: ordered };
  }, [template]);

  const progress = useMemo(() => {
    if (!template) return { done: 0, total: 0, pct: 0 };
    // N/A excludes a checkbox from both numerator and denominator. A user
    // toggling N/A on a previously-blank field shrinks the total; toggling
    // back grows it again.
    const checks = template.fields.filter(
      (f) => f.fieldType === "checkbox" && !isMarkedNa(values.get(f.id))
    );
    const done = checks.filter((f) => values.get(f.id)?.valueBool === true).length;
    return { done, total: checks.length, pct: checks.length > 0 ? Math.round((100 * done) / checks.length) : 0 };
  }, [template, values]);

  // Required-field validation. A field's "filled" state depends on its type:
  //   text / select : non-empty trimmed string
  //   number        : any numeric value (including 0)
  //   date          : any date set
  //   checkbox      : must be ticked (TRUE) — required checkbox means "ack"
  // A field marked N/A counts as satisfied — the user has explicitly opted
  // out, which is the whole point of the toggle.
  const missingRequired = useMemo(() => {
    if (!template) return [] as HrTemplateField[];
    return template.fields.filter((f) => {
      if (!f.isRequired) return false;
      const v = values.get(f.id);
      if (isMarkedNa(v)) return false;
      return !isFieldFilled(f, v);
    });
  }, [template, values]);

  // ── Value change → dirty set (no auto-save) ─────────────────────────────
  function patchValue(fieldId: number, patch: Partial<HrValuePatch>) {
    if (concurrency) return; // blocked until reload after 412
    setValues((prev) => {
      const next = new Map(prev);
      const current = prev.get(fieldId) ?? { fieldId };
      next.set(fieldId, { ...current, ...patch });
      return next;
    });
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(fieldId);
      return next;
    });
    // Clear the transient "saved" badge the moment the user edits again, so
    // it never stays green while there are unsaved changes.
    setSaveState((s) => (s === "saved" ? "idle" : s));
  }

  // Toggle a field's N/A flag. Marking N/A also clears the typed value
  // (a stored tick or text shouldn't sit under an N/A label); marking back
  // to applicable leaves the field unticked / empty so the user types it
  // fresh.
  function toggleNa(fieldId: number, markedNa: boolean) {
    patchValue(fieldId, markedNa
      ? { isApplicable: false, valueText: null, valueNumber: null, valueDate: null, valueBool: null }
      : { isApplicable: true,  valueText: null, valueNumber: null, valueDate: null, valueBool: null });
  }

  async function handleSave() {
    if (concurrency || saveState === "saving") return;
    if (missingRequired.length > 0) {
      // Light up the red error ring on every missing field and scroll the
      // first one into view with focus. No modal — the user sees exactly
      // which input is wrong, directly in context.
      setShowValidation(true);
      const first = missingRequired[0];
      // Defer to the next frame so setShowValidation has committed and the
      // red ring is already painted when we scroll / focus.
      requestAnimationFrame(() => {
        const el = document.getElementById(`field-${first.id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const input = el.querySelector("input, select, textarea") as HTMLElement | null;
          input?.focus({ preventScroll: true });
        }
      });
      return;
    }
    if (dirtyIds.size === 0) return;
    const ids = Array.from(dirtyIds);
    setSaveState("saving");
    try {
      const patches: HrValuePatch[] = ids.map((fid) => {
        const v = values.get(fid) ?? { fieldId: fid };
        return {
          fieldId: fid,
          valueText: v.valueText ?? null,
          valueNumber: v.valueNumber ?? null,
          valueDate: v.valueDate ?? null,
          valueBool: v.valueBool ?? null,
          valueJson: v.valueJson ?? null,
          // null = "don't change" on the server; we always send the local
          // state explicitly so toggling N/A and toggling back both round-
          // trip correctly.
          isApplicable: v.isApplicable ?? true,
        };
      });
      const { etag: newEtag } = await patchHrRecordValues(rid, patches, etag);
      setEtag(newEtag);
      setDirtyIds(new Set());
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (e) {
      if (e instanceof ConcurrencyError) {
        setConcurrency(true);
      } else {
        setError(e instanceof Error ? e.message : "Save failed");
      }
      setSaveState("error");
    }
  }

  // ── Ctrl/Cmd+S to save ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyIds, values, etag, concurrency, saveState]);

  // ── Warn on browser close while dirty ───────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // ── Tab title reflects dirty state ──────────────────────────────────────
  useEffect(() => {
    if (!record) return;
    const baseTitle = record.title || "Record";
    document.title = isDirty ? `● ${baseTitle}` : baseTitle;
    return () => { document.title = "Servizz Portal"; };
  }, [isDirty, record]);

  // ── Title / status edits ────────────────────────────────────────────────
  async function changeTitleOrStatus(title: string, status: HrRecordStatus) {
    if (!record) return;
    try {
      const { etag: newEtag } = await updateHrRecord(rid, { title, status }, etag);
      setEtag(newEtag);
      setRecord({ ...record, title, status });
    } catch (e) {
      if (e instanceof ConcurrencyError) setConcurrency(true);
      else setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleExport(format: "pdf" | "xlsx") {
    if (!template || !record || exporting) return;
    // Export reads from the database, not from local state. If we have
    // unsaved edits the export would silently show the pre-edit values —
    // a footgun. Block it here; the UI also disables the buttons in this
    // state so this branch is belt + suspenders.
    if (dirtyIds.size > 0) {
      setError("Save your changes before exporting — the export reads from the database and won't include unsaved edits.");
      return;
    }
    try {
      setExporting(format);
      const slug = record.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const filename = `${template.code}-${slug}-${date}.${format}`;
      if (format === "pdf") await exportHrRecordPdf(rid, filename);
      else await exportHrRecordExcel(rid, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  if (loading || !template || !record) {
    return (
      <DashboardLayout>
        <div className="mb-6">
          <Skeleton className="h-4 w-32 mb-3" />
        </div>
        <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5">
          <Skeleton className="h-3 w-40 mb-2" />
          <Skeleton className="h-8 w-72 mb-3" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5">
          <Skeleton className="h-3 w-28 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
        {error && (
          <p className="text-sm text-error">{error}</p>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        {/* Guarded back-navigation: this app uses a non-data <BrowserRouter>,
            so React Router's useBlocker isn't available. We confirm-on-dirty
            for the in-page Back link (the most common in-app exit). Full tab
            close / reload is still covered by the beforeunload handler. */}
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
            navigate(`/department/${deptCode}/templates/${tid}/records`);
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant/70 hover:text-primary transition-colors mb-3"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to records
        </button>
      </div>

      {concurrency && (
        <div className="mb-4 px-4 py-3 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-sm font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">sync_problem</span>
          This record was modified in another tab.{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-1 underline font-bold"
          >
            Reload
          </button>
        </div>
      )}
      {error && !concurrency && (
        <div className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* ── Header card: title / status / progress / export ──
           Sticky so the save indicator and progress ring stay visible while
           ticking through a long checklist. */}
      <div className="sticky top-0 z-30 -mx-2 px-2 pb-2 pt-1 bg-surface/80 backdrop-blur-sm mb-5">
      <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              {isDirty && (
                <span
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                  className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"
                />
              )}
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
                {template.name}
              </p>
            </div>
            <input
              type="text"
              value={record.title}
              onChange={(e) => setRecord({ ...record, title: e.target.value })}
              onBlur={(e) => changeTitleOrStatus(e.target.value || "Untitled", record.status)}
              disabled={!isAdmin}
              readOnly={!isAdmin}
              className="w-full text-2xl font-black tracking-tighter font-headline text-on-surface bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 disabled:cursor-not-allowed"
            />
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <select
                value={record.status}
                onChange={(e) => changeTitleOrStatus(record.title, e.target.value as HrRecordStatus)}
                disabled={!isAdmin}
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-surface-container-high/60 border border-on-surface-variant/10 focus:outline-none focus:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="open">Open</option>
                <option value="completed">Completed</option>
              </select>
              <SaveStatus state={saveState} dirtyCount={dirtyIds.size} />
              <span className="text-[11px] text-on-surface-variant/50">
                Updated {new Date(record.updatedAt).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            {progress.total > 0 && <ProgressRing done={progress.done} total={progress.total} pct={progress.pct} />}
            <div className="flex items-center gap-1.5">
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={concurrency || saveState === "saving"}
                  title={
                    isDirty
                      ? "Save changes (Ctrl+S)"
                      : "Nothing to save yet — click to check required fields"
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                    isDirty
                      ? "bg-primary text-white hover:bg-primary-dim"
                      : "bg-surface-container-high/70 text-on-surface hover:bg-surface-container-high"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  {saveState === "saving"
                    ? "Saving…"
                    : isDirty
                      ? `Save${dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ""}`
                      : "Save"}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleExport("pdf")}
                disabled={isDirty || exporting !== null}
                title={
                  isDirty
                    ? "Save your changes first — the export reads from the database and won't include unsaved edits."
                    : "Export as PDF"
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/70 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting === "pdf" ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                )}
                {exporting === "pdf" ? "Exporting…" : "PDF"}
              </button>
              <button
                type="button"
                onClick={() => handleExport("xlsx")}
                disabled={isDirty || exporting !== null}
                title={
                  isDirty
                    ? "Save your changes first — the export reads from the database and won't include unsaved edits."
                    : "Export as Excel"
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/70 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting === "xlsx" ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">table_view</span>
                )}
                {exporting === "xlsx" ? "Exporting…" : "Excel"}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* ── Creation info (placement='creation', editable here too) ── */}
      {sections.creation.length > 0 && (
        <div className="bg-white rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent p-6 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4">
            Creation info
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.creation.map((f) => (
              <FieldInput
                key={f.id}
                field={f}
                value={values.get(f.id)}
                onPatch={(p) => patchValue(f.id, p)}
                onToggleNa={(next) => toggleNa(f.id, next)}
                disabled={!isAdmin || concurrency}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Details section (non-checkbox metadata fields) ── */}
      {sections.details.length > 0 && (
        <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50 mb-4">
            Details
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.details.map((f) => {
              const v = values.get(f.id);
              // Wrap in `id="field-{id}"` AND thread hasError through —
              // required-field scroll target + red ring both live here,
              // matching the grouped-sections render below.
              const hasError =
                showValidation && f.isRequired && !isFieldFilled(f, v);
              return (
                <div key={f.id} id={`field-${f.id}`}>
                  <FieldInput
                    field={f}
                    value={v}
                    onPatch={(p) => patchValue(f.id, p)}
                    onToggleNa={(next) => toggleNa(f.id, next)}
                    disabled={!isAdmin || concurrency}
                    hasError={hasError}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sections ── */}
      {sections.grouped.map(({ name, description, fields }) => {
        // Same N/A-aware progress as the header ring, scoped to this section.
        const applicableChecks = fields.filter(
          (f) => f.fieldType === "checkbox" && !isMarkedNa(values.get(f.id))
        );
        const done = applicableChecks.filter((f) => values.get(f.id)?.valueBool === true).length;
        return (
          <div key={name} className="bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface">
                  {name}
                </p>
                {description && (
                  <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mt-1">
                    {description}
                  </p>
                )}
              </div>
              {applicableChecks.length > 0 && (
                <span className="text-[11px] font-bold text-primary tabular-nums shrink-0">
                  {done}/{applicableChecks.length}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {fields.map((f) => {
                const v = values.get(f.id);
                // Live recompute — once showValidation is on, the red ring
                // appears on unfilled required fields and disappears the
                // instant they're filled. No "show error once" staleness.
                const hasError =
                  showValidation && f.isRequired && !isFieldFilled(f, v);
                return (
                  <div key={f.id} id={`field-${f.id}`}>
                    <FieldInput
                      field={f}
                      value={v}
                      onPatch={(p) => patchValue(f.id, p)}
                      onToggleNa={(next) => toggleNa(f.id, next)}
                      disabled={!isAdmin || concurrency}
                      hasError={hasError}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Bottom save bar ──
          Mirrors the header Save button so users who scroll to the end of a
          long checklist don't have to scroll back to the top to commit. */}
      {isAdmin && (
        <div className="mt-6 flex items-center justify-end gap-3 bg-white rounded-2xl border border-on-surface-variant/5 p-4">
          <SaveStatus state={saveState} dirtyCount={dirtyIds.size} />
          <button
            type="button"
            onClick={handleSave}
            disabled={concurrency || saveState === "saving"}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              isDirty
                ? "bg-primary text-white hover:bg-primary-dim"
                : "bg-surface-container-high/70 text-on-surface hover:bg-surface-container-high"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {saveState === "saving"
              ? "Saving…"
              : isDirty
                ? `Save${dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ""}`
                : "Save"}
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}

// Returns true when the field has a usable value for validation purposes.
// Used for the required-field gate on the Save button and for subtle red
// outlines on empty required inputs.
function isFieldFilled(field: HrTemplateField, v: HrValuePatch | undefined): boolean {
  if (!v) return false;
  switch (field.fieldType) {
    case "text":
    case "textarea":
    case "select":
      return !!(v.valueText && v.valueText.trim() !== "");
    case "number":
      return v.valueNumber != null;
    case "date":
      return !!v.valueDate;
    case "checkbox":
      return v.valueBool === true;
    case "grid":
      // "Filled" = at least one row entered.
      try {
        const rows = v.valueJson ? JSON.parse(v.valueJson) : [];
        return Array.isArray(rows) && rows.length > 0;
      } catch {
        return false;
      }
    case "note":
      return true; // read-only; never blocks
  }
  return false;
}

// A value is "marked N/A" when its isApplicable flag is explicitly false.
// Default (undefined / true) means applicable — same convention as the
// server-side column default.
function isMarkedNa(v: HrValuePatch | undefined): boolean {
  return v?.isApplicable === false;
}

// ── Field input dispatcher ──────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onPatch,
  onToggleNa,
  disabled,
  hasError,
}: {
  field: HrTemplateField;
  value: HrValuePatch | undefined;
  onPatch: (p: Partial<HrValuePatch>) => void;
  onToggleNa: (next: boolean) => void;
  disabled: boolean;
  hasError?: boolean;
}) {
  // Shared input classes. The red ring + background wash applies when the
  // parent flagged this field as a missing-required; otherwise the input
  // keeps its standard Prism styling.
  const inputBase =
    "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none disabled:opacity-60 transition-colors";
  const inputNeutral =
    "bg-surface-container-high/50 border-on-surface-variant/10 focus:border-primary/30 focus:bg-white";
  const inputError =
    "bg-error/5 border-error/50 focus:border-error focus:bg-white";
  const inputClass = `${inputBase} ${hasError ? inputError : inputNeutral}`;

  const labelClass = "text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1";

  // N/A state. Only togglable when the admin enabled allowsNa on the field.
  // When marked N/A, the input is disabled and visually de-emphasized; the
  // chip switches to "Applicable" to invite toggling back.
  const markedNa = value?.isApplicable === false;
  const inputDisabled = disabled || markedNa;

  // Read-only descriptive / cross-reference block. No value, no N/A.
  if (field.fieldType === "note") {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-surface-container-low/40 border border-on-surface-variant/10">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-on-surface-variant/50 mt-0.5 shrink-0">
          info
        </span>
        <p className="text-[12px] text-on-surface-variant/70 leading-relaxed italic">
          {field.label}
        </p>
      </div>
    );
  }

  if (field.fieldType === "checkbox") {
    const checked = value?.valueBool === true;
    return (
      <label
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          markedNa
            ? "bg-surface-container-low/40 opacity-60"
            : checked
              ? "bg-success-container cursor-pointer"
              : hasError
                ? "bg-error/5 border border-error/40 cursor-pointer"
                : "hover:bg-surface-container-low/40 cursor-pointer"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={inputDisabled}
          onChange={(e) => onPatch({ valueBool: e.target.checked, valueText: null, valueNumber: null, valueDate: null })}
          className="w-4 h-4"
          style={{ accentColor: "var(--color-success)" }}
        />
        <span
          className={`text-sm flex-1 ${
            markedNa
              ? "text-on-surface-variant/60 line-through"
              : checked
                ? "text-on-success-container font-medium"
                : "text-on-surface-variant"
          }`}
        >
          {field.label}
          {field.isRequired && !markedNa && <span className="text-error ml-1">*</span>}
        </span>
        {field.allowsNa && (
          <NaChip markedNa={markedNa} disabled={disabled} onToggle={onToggleNa} />
        )}
        {!markedNa && checked && (
          <span
            className="material-symbols-outlined text-[16px] text-success shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            check_circle
          </span>
        )}
      </label>
    );
  }

  // Label + optional N/A chip — shared across non-checkbox field types so
  // every input renders the same header layout.
  const header = (
    <div className="flex items-center justify-between gap-2 mb-1">
      <span className={`${labelClass} mb-0 ${markedNa ? "line-through opacity-60" : ""}`}>
        {field.label}
        {field.isRequired && !markedNa && <span className="text-error ml-1">*</span>}
      </span>
      {field.allowsNa && (
        <NaChip markedNa={markedNa} disabled={disabled} onToggle={onToggleNa} />
      )}
    </div>
  );

  if (field.fieldType === "text") {
    return (
      <div>
        {header}
        <input
          type="text"
          value={markedNa ? "" : value?.valueText ?? ""}
          disabled={inputDisabled}
          placeholder={markedNa ? "Not applicable" : undefined}
          onChange={(e) => onPatch({ valueText: e.target.value || null, valueNumber: null, valueDate: null, valueBool: null })}
          className={inputClass}
          aria-invalid={hasError || undefined}
        />
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "number") {
    return (
      <div>
        {header}
        <input
          type="number"
          value={markedNa ? "" : value?.valueNumber ?? ""}
          disabled={inputDisabled}
          placeholder={markedNa ? "Not applicable" : undefined}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            onPatch({ valueNumber: n, valueText: null, valueDate: null, valueBool: null });
          }}
          className={inputClass}
          aria-invalid={hasError || undefined}
        />
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "date") {
    return (
      <div>
        {header}
        <input
          type="date"
          value={markedNa ? "" : value?.valueDate?.slice(0, 10) ?? ""}
          disabled={inputDisabled}
          onChange={(e) => onPatch({ valueDate: e.target.value || null, valueText: null, valueNumber: null, valueBool: null })}
          className={inputClass}
          aria-invalid={hasError || undefined}
        />
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "select") {
    const options = Array.isArray(field.options)
      ? (field.options as Array<{ value: string; label: string }>)
      : [];
    return (
      <div>
        {header}
        <select
          value={markedNa ? "" : value?.valueText ?? ""}
          disabled={inputDisabled}
          onChange={(e) => onPatch({ valueText: e.target.value || null, valueNumber: null, valueDate: null, valueBool: null })}
          className={inputClass}
          aria-invalid={hasError || undefined}
        >
          <option value="">{markedNa ? "Not applicable" : "—"}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "textarea") {
    return (
      <div>
        {header}
        <textarea
          rows={4}
          value={markedNa ? "" : value?.valueText ?? ""}
          disabled={inputDisabled}
          placeholder={markedNa ? "Not applicable" : undefined}
          onChange={(e) => onPatch({ valueText: e.target.value || null, valueNumber: null, valueDate: null, valueBool: null, valueJson: null })}
          className={`${inputClass} resize-y leading-relaxed`}
          aria-invalid={hasError || undefined}
        />
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "grid") {
    return (
      <div>
        <span className={labelClass}>{field.label}</span>
        <GridFieldInput field={field} value={value} onPatch={onPatch} disabled={disabled} />
      </div>
    );
  }

  return null;
}

// ── Grid (repeating-table) field editor ──────────────────────────────────
// Renders the field's columns as a table the user can add/remove rows in.
// Rows are held in a LOCAL buffer with a stable per-row id (`__rid`) so React
// reconciles by identity, not array index — deleting a middle row can't shift
// a focused input onto the wrong row's value. The buffer serializes to the
// parent's valueJson on every change (with __rid stripped so stored data stays
// clean); the page-level Save then flushes it to the server.
type GridRowWithId = HrGridRow & { __rid: string };

function newRowId(): string {
  // crypto.randomUUID is available in all evergreen browsers this app targets;
  // fall back to a random string just in case.
  try { return crypto.randomUUID(); } catch { return `r_${Math.random().toString(36).slice(2)}`; }
}

function seedGridRows(json: string | null | undefined): GridRowWithId[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return (parsed as HrGridRow[]).map((r) => ({ ...r, __rid: newRowId() }));
  } catch {
    return [];
  }
}

function GridFieldInput({
  field,
  value,
  onPatch,
  disabled,
}: {
  field: HrTemplateField;
  value: HrValuePatch | undefined;
  onPatch: (p: Partial<HrValuePatch>) => void;
  disabled: boolean;
}) {
  const grid = asGridOptions(field.options);
  const columns: HrGridColumn[] = grid?.columns ?? [];

  // Seed ONCE from the saved JSON. We deliberately don't re-seed on every
  // value change — the parent's valueJson reflects our own commits, and
  // re-seeding would regenerate ids (and drop focus) on each keystroke. A full
  // page reload (e.g. after a 412) remounts this component and re-seeds.
  const [rows, setRows] = useState<GridRowWithId[]>(() => seedGridRows(value?.valueJson));

  function commit(next: GridRowWithId[]) {
    setRows(next);
    const clean = next.map(({ __rid, ...rest }) => { void __rid; return rest; });
    onPatch({
      valueJson: clean.length ? JSON.stringify(clean) : null,
      valueText: null, valueNumber: null, valueDate: null, valueBool: null,
    });
  }

  function setCell(rid: string, key: string, cell: HrGridRow[string]) {
    commit(rows.map((r) => (r.__rid === rid ? { ...r, [key]: cell } : r)));
  }
  function addRow() { commit([...rows, { __rid: newRowId() }]); }
  function removeRow(rid: string) { commit(rows.filter((r) => r.__rid !== rid)); }

  if (columns.length === 0) {
    return (
      <p className="text-[12px] text-on-surface-variant/50 italic mt-1">
        This grid has no columns configured.
      </p>
    );
  }

  const cellInput =
    "w-full px-2 py-1.5 rounded-md text-[13px] border border-on-surface-variant/10 bg-surface-container-high/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 focus:bg-white disabled:opacity-60";

  // Sticky first-column treatment: the `#` column stays pinned while the table
  // scrolls right (8-col grids overflow on a laptop), so row context is never
  // lost. The data cells in that column share the same left:0 + bg.
  const stickyCol = "sticky left-0 z-10 bg-white";

  return (
    <div className="mt-1.5 overflow-x-auto rounded-xl border border-on-surface-variant/10">
      {grid?.help && (
        <p className="px-3 py-2 text-[11px] text-on-surface-variant/60 italic border-b border-on-surface-variant/10 bg-surface-container-low/30">
          {grid.help}
        </p>
      )}
      <table className="w-full border-collapse" style={{ minWidth: Math.max(480, columns.length * 150) }}>
        <thead>
          <tr className="bg-surface-container-high/60">
            <th scope="col" className={`${stickyCol} bg-surface-container-high w-10 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/50 text-left`}>#</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60 text-left whitespace-nowrap">
                {c.label}
              </th>
            ))}
            {!disabled && <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 2} className="px-3 py-5 text-center text-[12px] text-on-surface-variant/40 italic">
                No rows yet{!disabled && " — click “Add row” to start"}.
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={row.__rid} className="border-t border-on-surface-variant/8 hover:bg-surface-container-low/30 group/row">
                <td className={`${stickyCol} group-hover/row:bg-surface-container-low px-2 py-1.5 text-[12px] font-semibold text-on-surface-variant/50 tabular-nums align-top pt-3`}>
                  {ri + 1}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5 align-top">
                    <GridCellInput
                      column={c}
                      rowNum={ri + 1}
                      value={row[c.key]}
                      disabled={disabled}
                      inputClass={cellInput}
                      onChange={(cell) => setCell(row.__rid, c.key, cell)}
                    />
                  </td>
                ))}
                {!disabled && (
                  <td className="px-1 py-1.5 align-top pt-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.__rid)}
                      title="Remove row"
                      aria-label={`Remove row ${ri + 1}`}
                      className="text-on-surface-variant/40 hover:text-error hover:bg-error/5 rounded p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="w-full px-3 py-2 text-[12px] font-bold text-primary hover:bg-primary/5 border-t border-on-surface-variant/10 inline-flex items-center justify-center gap-1 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add row
        </button>
      )}
    </div>
  );
}

// One cell editor, dispatched on the column type. Stores primitives for
// text/number/date/select/percent and a { status, date } object for RAG.
// `rowNum` is used only to build accessible labels.
const RAG_TONE: Record<string, { bg: string; fg: string }> = {
  Red:   { bg: "var(--color-rag-red)",   fg: "#fff" },
  Amber: { bg: "var(--color-rag-amber)", fg: "#fff" },
  Green: { bg: "var(--color-rag-green)", fg: "#fff" },
};

function GridCellInput({
  column,
  rowNum,
  value,
  disabled,
  inputClass,
  onChange,
}: {
  column: HrGridColumn;
  rowNum: number;
  value: HrGridRow[string];
  disabled: boolean;
  inputClass: string;
  onChange: (cell: HrGridRow[string]) => void;
}) {
  if (column.type === "rag") {
    const rag = (value && typeof value === "object" ? value : {}) as HrRagValue;
    const tone = rag.status ? RAG_TONE[rag.status] : undefined;
    // Status + completion date read as ONE logical value: grouped in a bordered
    // mini-cell, the status as a filled colour chip, the date clearly labelled.
    return (
      <div className="flex flex-col gap-1 min-w-[150px] rounded-lg border border-on-surface-variant/12 p-1.5 bg-white">
        <select
          value={rag.status ?? ""}
          disabled={disabled}
          aria-label={`RAG status, row ${rowNum}`}
          onChange={(e) => onChange({ ...rag, status: (e.target.value || "") as HrRagValue["status"] })}
          className={`w-full px-2 py-1 rounded-md text-[12px] font-bold border focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60 ${tone ? "border-transparent" : "border-on-surface-variant/15 text-on-surface-variant/60"}`}
          style={tone ? { background: tone.bg, color: tone.fg } : undefined}
        >
          <option value="" style={{ color: "#1a2024" }}>— status —</option>
          <option value="Red" style={{ color: "#1a2024" }}>Red</option>
          <option value="Amber" style={{ color: "#1a2024" }}>Amber</option>
          <option value="Green" style={{ color: "#1a2024" }}>Green</option>
        </select>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant/45 px-0.5">Completion date</span>
          <input
            type="date"
            value={rag.date ?? ""}
            disabled={disabled}
            aria-label={`RAG completion date, row ${rowNum}`}
            onChange={(e) => onChange({ ...rag, date: e.target.value || undefined })}
            className="w-full px-2 py-1 rounded-md text-[12px] border border-on-surface-variant/10 bg-surface-container-high/40 focus:outline-none focus:ring-1 focus:ring-primary/20 focus:bg-white disabled:opacity-60"
          />
        </label>
      </div>
    );
  }

  if (column.type === "select") {
    const opts = column.options ?? [];
    return (
      <select
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        aria-label={`${column.label}, row ${rowNum}`}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  if (column.type === "number" || column.type === "percent") {
    const isPct = column.type === "percent";
    return (
      <div className="relative">
        <input
          type="number"
          value={typeof value === "number" ? value : value == null ? "" : String(value)}
          disabled={disabled}
          aria-label={`${column.label}, row ${rowNum}`}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          // Percent inputs hide the native spinner so the trailing "%" affix
          // doesn't collide with the up/down arrows (Chrome).
          className={`${inputClass} text-right tabular-nums ${isPct ? "pr-6 grid-no-spinner" : ""}`}
        />
        {isPct && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-on-surface-variant/50 pointer-events-none">%</span>
        )}
      </div>
    );
  }

  if (column.type === "date") {
    return (
      <input
        type="date"
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        aria-label={`${column.label}, row ${rowNum}`}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      />
    );
  }

  // text (default)
  return (
    <input
      type="text"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      disabled={disabled}
      aria-label={`${column.label}, row ${rowNum}`}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputClass}
    />
  );
}

// Small toggle pill placed next to a togglable field. When on (markedNa),
// renders as a muted "Not applicable" badge; when off, a clickable
// "Mark N/A" button. Clicking flips the field's isApplicable flag through
// the parent's onToggle handler.
function NaChip({
  markedNa,
  disabled,
  onToggle,
}: {
  markedNa: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (markedNa) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(false)}
        title="Mark this field as applicable again"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high/60 border border-on-surface-variant/15 text-[10px] font-bold text-on-surface-variant/70 hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="material-symbols-outlined text-[12px]">block</span>
        N/A · undo
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(true)}
      title="Mark this field non-applicable — it won't count toward progress."
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-on-surface-variant/25 text-[10px] font-bold text-on-surface-variant/60 hover:bg-surface-container-low/60 hover:text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      Mark N/A
    </button>
  );
}

// Small inline helper text shown under a flagged required field.
function ErrorHint({ label }: { label: string }) {
  return (
    <p
      className="mt-1 text-[11px] font-semibold text-error flex items-center gap-1"
      role="alert"
    >
      <span className="material-symbols-outlined text-[13px]">error</span>
      {label} is required.
    </p>
  );
}

// ── Header helpers ──────────────────────────────────────────────────────────

// Shows a compact pill reflecting save state + dirty count. Lives next to
// the status dropdown inside the sticky header card, so users always see
// whether their work is committed while scrolling through long checklists.
function SaveStatus({
  state,
  dirtyCount,
}: {
  state: "idle" | "saving" | "saved" | "error";
  dirtyCount: number;
}) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
        Saving…
      </span>
    );
  }
  if (state === "saved" && dirtyCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
        <span
          className="material-symbols-outlined text-[14px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-error">
        <span className="material-symbols-outlined text-[14px]">error</span>
        Save failed
      </span>
    );
  }
  if (dirtyCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
      </span>
    );
  }
  return null;
}

function ProgressRing({ done, total, pct }: { done: number; total: number; pct: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (c * pct) / 100;
  // Ring switches to success color at exactly 100% so the header metric
  // reinforces the "done" signal alongside the pill and bars below.
  const strokeColor = pct === 100 ? "var(--color-success)" : "var(--color-primary)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-surface-container-high)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={strokeColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-black tabular-nums text-on-surface">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}
