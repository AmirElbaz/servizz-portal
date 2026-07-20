import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ProjectLogoPlate from "../../components/ProjectLogoPlate";
import { fetchCatalogProjects, getLogoUrl, type CatalogProject } from "../../services/catalog";
import Skeleton from "../../components/admin/Skeleton";
import GrammarField from "../../components/ui/GrammarField";
import RichTextField from "../../components/ui/RichTextField";
import { ConcurrencyError } from "../../services/admin";
import { useAuth, roleAtLeast } from "../../services/auth";
import {
  getHrRecord,
  getHrTemplate,
  patchHrRecordValues,
  updateHrRecord,
  exportHrRecordPdf,
  exportHrRecordExcel,
  publishHrRecordPdf,
  unpublishHrRecordPdf,
  listHrRecordPdfVersions,
  downloadHrRecordPdfVersion,
  getHrRecordPdfObjectUrl,
  type HrPdfVersion,
  asGridOptions,
  normalizeSelectOptions,
  splitGridLabel,
  formatPeriodLabel,
  populateQmsFromMonthly,
  populateTdFromTrainingMeeting,
  QMS_PERIODIC_CODE,
  TD_TEMPLATE_CODE,
  type QmsRollupResponse,
  type TdMeetingRollupResponse,
  type HrRecordDetail,
  type HrTemplateDetail,
  type HrTemplateField,
  type HrRecordStatus,
  type HrValuePatch,
  type HrGridColumn,
  type HrGridRow,
  type HrRagValue,
} from "../../services/hr";
import {
  getOpsAutoValues,
  getMetricCatalog,
  getProjectSections,
  setProjectSections,
  listOpsPdfVersions,
  generateOpsPdf,
  downloadOpsPdf,
  type OpsProjectSection,
} from "../../services/opsReports";

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
  const location = useLocation();
  // Set by the project page (OpsReportCard) so Back returns to the project page
  // instead of the records list.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? null;

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

  // The project this record belongs to (Operations) — shown in the header so a
  // user editing a long template never loses track of which project they're on.
  const [project, setProject] = useState<CatalogProject | null>(null);
  // Floating Save button: appears once the user scrolls past the sticky header
  // (detected via a sentinel just below it), so Save is always one tap away.
  const headerSentinelRef = useRef<HTMLDivElement>(null);
  const [headerOffscreen, setHeaderOffscreen] = useState(false);
  // Brief "Saved" confirmation on the floating button.
  const [justSaved, setJustSaved] = useState(false);

  // Operations monthly reports: live auto-filled values keyed by source_key,
  // resolved server-side for this record's project + month. Empty for HR/QA.
  const [opsAutoValues, setOpsAutoValues] =
    useState<Record<string, { number: number | null; display: string }>>({});
  const isOpsReport = useMemo(
    () => !!template?.fields.some((f) => f.sourceKey != null),
    [template]
  );
  // "June 2026" / "Q2 2026" — fixed-row grids put this in the column header
  // rather than repeating the month on every row. Null when the template has
  // no reporting period (HR checklists).
  const periodLabel = useMemo(
    () => (record?.period ? formatPeriodLabel(record.period, record.periodKind ?? "month") : null),
    [record?.period, record?.periodKind]
  );

  // QMS Half-Yearly / Yearly records can be rolled up from the Monthly /
  // Quarterly ones (client request 2026-07-09).
  const [rollup, setRollup] = useState<QmsRollupResponse | null>(null);
  const [rollupBusy, setRollupBusy] = useState(false);
  // Bumped after a roll-up. It feeds every FieldInput's `key`, forcing a
  // remount: GridFieldInput seeds its rows ONCE from valueJson, so without a
  // remount the grid would keep showing the pre-roll-up rows.
  const [dataVersion, setDataVersion] = useState(0);
  // The button SHOWS for every Half-Yearly/Yearly QMS record, and is disabled
  // with an explanatory tooltip when it can't run. A control that silently
  // vanishes is indistinguishable from a control that was never built.
  const isPeriodicQms = template?.code === QMS_PERIODIC_CODE;
  const canRollup =
    isPeriodicQms &&
    !!record?.period &&
    (record.periodKind === "half" || record.periodKind === "year");

  // T&D 2.1 auto-read from the training meeting report.
  const [tdRollup, setTdRollup] = useState<TdMeetingRollupResponse | null>(null);
  const [tdBusy, setTdBusy] = useState(false);
  const canTdRollup =
    template?.code === TD_TEMPLATE_CODE && record?.periodKind === "quarter" && !!record?.period;

  // Re-load the record's values after a server-side write (shared by both
  // populate actions); bumps dataVersion so grids re-seed.
  async function reloadAfterPopulate() {
    const r = await getHrRecord(rid);
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
    setDirtyIds(new Set());
    setDataVersion((v) => v + 1);
  }

  async function runTdRollup() {
    if (!canTdRollup || tdBusy) return;
    setTdBusy(true);
    setError(null);
    try {
      const res = await populateTdFromTrainingMeeting(rid);
      await reloadAfterPopulate();
      setTdRollup(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Populate failed");
    } finally {
      setTdBusy(false);
    }
  }

  async function runRollup() {
    if (!canRollup || rollupBusy) return;
    setRollupBusy(true);
    setError(null);
    try {
      const res = await populateQmsFromMonthly(rid);
      await reloadAfterPopulate();
      setRollup(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Populate failed");
    } finally {
      setRollupBusy(false);
    }
  }
  // Client role (servizz.gov account): published-PDFs-only model — direct
  // PDF/Excel render is hidden (and 403'd server-side); the live view they're
  // on only exists because the template has client_visible sections.
  const isClient = !isAdmin;
  // QA reports publish versioned PDFs (the client deliverable). Keyed off the
  // template's section group, which is config (not a template-name match).
  const isQaReport = template?.groupCode === "qa-reports";

  // Resolve the record's project (name + logo) from the catalog by id.
  useEffect(() => {
    const pid = record?.projectId;
    if (!pid) { setProject(null); return; }
    let cancelled = false;
    fetchCatalogProjects()
      .then((ps) => { if (!cancelled) setProject(ps.find((p) => p.id === pid) ?? null); })
      .catch(() => { if (!cancelled) setProject(null); });
    return () => { cancelled = true; };
  }, [record?.projectId]);

  // Show the floating Save button once the user scrolls past the header. We read
  // the sentinel's position on scroll (robust across scroll containers; an
  // IntersectionObserver on a zero-height target is unreliable).
  useEffect(() => {
    const onScroll = () => {
      const el = headerSentinelRef.current;
      if (el) setHeaderOffscreen(el.getBoundingClientRect().top < 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [loading]);

  // Brief "Saved" flash on the floating button.
  useEffect(() => {
    if (saveState !== "saved") return;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saveState]);
  // Source keys backed by a LIVE provider (auto, never editable). Planned keys
  // (no live feed yet, e.g. email/chat) stay manually editable until wired.
  const [liveKeys, setLiveKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isOpsReport) return;
    getMetricCatalog()
      .then((c) => setLiveKeys(new Set(c.filter((e) => e.status === "live").map((e) => e.key))))
      .catch(() => {});
  }, [isOpsReport]);

  // Operations: per-project section on/off, edited inline while filling the
  // report (Amir 2026-06-20 — "in the template while editing, not from
  // outside"). Toggles persist to ops_project_sections and apply to EVERY
  // month's report for this project. Disabled sections drop out of the form
  // and the generated PDF. Empty for HR/QA.
  const [projSections, setProjSections] = useState<OpsProjectSection[]>([]);
  const [togglingSection, setTogglingSection] = useState<number | null>(null);
  useEffect(() => {
    const pid = record?.projectId;
    if (pid == null) { setProjSections([]); return; }
    getProjectSections(pid)
      .then((res) => setProjSections(res.sections))
      .catch(() => setProjSections([]));
  }, [record?.projectId]);
  const disabledSectionIds = useMemo(
    () => new Set(projSections.filter((s) => !s.enabled).map((s) => s.sectionId)),
    [projSections]
  );

  async function toggleSection(sectionId: number, enabled: boolean) {
    const pid = record?.projectId;
    if (pid == null) return;
    setProjSections((prev) => prev.map((s) => (s.sectionId === sectionId ? { ...s, enabled } : s)));
    setTogglingSection(sectionId);
    try {
      await setProjectSections(pid, [{ sectionId, enabled }]);
    } catch {
      // Revert on failure.
      setProjSections((prev) => prev.map((s) => (s.sectionId === sectionId ? { ...s, enabled: !enabled } : s)));
    } finally {
      setTogglingSection(null);
    }
  }

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
        // Resolve live auto-fill values when any field is source-bound.
        if (t.data.fields.some((f) => f.sourceKey != null)) {
          getOpsAutoValues(rid)
            .then((res) => setOpsAutoValues(res.values))
            .catch(() => setOpsAutoValues({}));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load record"))
      .finally(() => setLoading(false));
  }, [tid, rid]);

  const sections = useMemo(() => {
    if (!template) {
      return {
        creation: [] as HrTemplateField[],
        details: [] as HrTemplateField[],
        grouped: [] as Array<{
          id?: number;
          name: string;
          description: string | null;
          fields: HrTemplateField[];
          enabled: boolean;
          auto: boolean;
          child: boolean;
        }>,
      };
    }
    // Operations: fields bound to a LIVE data source are auto-filled from the
    // database into the generated report — the person filling the form never
    // touches them, so hide them from the form entirely (Amir 2026-06-11). A
    // section left with no visible fields (e.g. Call Performance) drops off the
    // form via the `g.fields.length > 0` filter below; its data still flows
    // into the generated PDF. Planned-source fields (no live feed yet, e.g.
    // email/chat) keep a sourceKey but aren't in liveKeys, so they stay
    // manually editable until their feed is wired.
    const visibleFields = template.fields.filter(
      (f) => !(f.sourceKey && liveKeys.has(f.sourceKey))
    );

    // Creation fields (placement='creation') — asked at record creation, but
    // also surfaced on the detail page so users can view/correct them.
    const creation = visibleFields
      .filter((f) => f.placement === "creation")
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Detail fields only — Details bucket = non-checkbox, no section,
    // placement='detail'. Checkbox fields without a section drop into
    // "General" so they still render.
    const detailFields = visibleFields.filter((f) => f.placement !== "creation");
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

    // Ops reports render EVERY section (disabled ones collapse to a re-enable
    // toggle in place); other modules keep hiding empty/disabled sections.
    const ops = template.fields.some((f) => f.sourceKey != null);
    const autoSectionIds = new Set(
      template.fields
        .filter((f) => f.sourceKey)
        .map((f) => f.sectionId)
        .filter((x): x is number => x != null)
    );

    // Order parent-then-children so sub-sections (Call Performance → IVR,
    // Forecast, …) appear directly under their parent, matching the report.
    // Retired sections (migration 132) are dropped here rather than server-side
    // because the template designer consumes the same payload and must still be
    // able to see — and un-hide — them. Their fields keep their stored values.
    const all = template.sections.filter((s) => !s.hidden);
    const tops = all.filter((s) => s.parentId == null).sort((a, b) => a.sortOrder - b.sortOrder);
    const seq: typeof all = [];
    for (const p of tops) {
      seq.push(p);
      seq.push(...all.filter((s) => s.parentId === p.id).sort((a, b) => a.sortOrder - b.sortOrder));
    }
    const placed = new Set(seq.map((s) => s.id));
    for (const s of all) if (!placed.has(s.id)) seq.push(s); // orphan safety

    const ordered = seq
      .map((s) => ({
        id: s.id as number | undefined,
        name: s.name,
        description: s.description,
        fields: byId.get(s.id) ?? [],
        enabled: !disabledSectionIds.has(s.id),
        auto: autoSectionIds.has(s.id),
        child: s.parentId != null,
      }))
      .filter((g) => ops || (g.enabled && g.fields.length > 0));
    if (byId.has("general")) {
      ordered.push({
        id: undefined,
        name: "General",
        description: null,
        fields: byId.get("general")!,
        enabled: true,
        auto: false,
        child: false,
      });
    }
    return { creation, details, grouped: ordered };
  }, [template, liveKeys, disabledSectionIds]);

  const progress = useMemo(() => {
    if (!template) return { done: 0, total: 0, pct: 0 };
    // N/A excludes a checkbox from both numerator and denominator. A user
    // toggling N/A on a previously-blank field shrinks the total; toggling
    // back grows it again.
    const checks = template.fields.filter(
      (f) => f.fieldType === "checkbox" && !f.fieldKey.startsWith("show_") && f.fieldKey !== "forecast_247" && f.fieldKey !== "callbacks_workflow_enabled" && !isMarkedNa(values.get(f.id))
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
      const { etag: newEtag, data } = await patchHrRecordValues(rid, patches, etag);
      setEtag(newEtag);
      // The backend auto-derives status from progress (a fully-ticked
      // checklist becomes "completed", dropping below 100% reverts to "open").
      // Reflect the flip in the header dropdown without a refetch.
      if (data?.status && record && data.status !== record.status) {
        setRecord({ ...record, status: data.status });
      }
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
    <DashboardLayout wide={(template?.fields ?? []).some((f) => f.fieldType === "grid")}>
      <div className="mb-6">
        {/* Guarded back-navigation: this app uses a non-data <BrowserRouter>,
            so React Router's useBlocker isn't available. We confirm-on-dirty
            for the in-page Back link (the most common in-app exit). Full tab
            close / reload is still covered by the beforeunload handler. */}
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
            navigate(returnTo ?? `/department/${deptCode}/templates/${tid}/records`);
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant/70 hover:text-primary transition-colors mb-3"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          {returnTo ? "Back" : "Back to records"}
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

      {/* T&D 2.1 auto-read receipt — spells out what was pulled and the rules,
          since they haven't been signed off by the client. */}
      {tdRollup && (
        <div className="mb-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
              Section 2.1: {tdRollup.rowsWritten} programme row{tdRollup.rowsWritten === 1 ? "" : "s"} from “{tdRollup.meetingRecord}”
            </p>
            <button type="button" onClick={() => setTdRollup(null)} aria-label="Dismiss"
              className="text-on-surface-variant/50 hover:text-on-surface rounded p-0.5">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <p className="mt-2 text-[13px] text-on-surface-variant">
            From {tdRollup.fromTotal} meeting item{tdRollup.fromTotal === 1 ? "" : "s"}:
            kept {tdRollup.rowsWritten}; excluded {tdRollup.excludedWorkshops} workshop(s),
            {" "}{tdRollup.excludedOutOfQuarter} outside {tdRollup.quarter}
            {tdRollup.skippedUndated > 0 && <>, {tdRollup.skippedUndated} with no readable date</>}.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-primary">
              How this was filled ({tdRollup.assumptions.length} rules — not yet confirmed by the client)
            </summary>
            <ul className="mt-2 ml-4 list-disc space-y-1 text-[13px] text-on-surface-variant">
              {tdRollup.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* Roll-up receipt. The aggregation rules have NOT been signed off by QA,
          so they are spelled out here rather than buried in the code — this
          panel is meant to be read, checked and sent on. */}
      {rollup && (
        <div className="mb-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
              Populated {rollup.fieldsWritten} field{rollup.fieldsWritten === 1 ? "" : "s"} from{" "}
              {rollup.sourcesUsed.length} record{rollup.sourcesUsed.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => setRollup(null)}
              aria-label="Dismiss"
              className="text-on-surface-variant/50 hover:text-on-surface rounded p-0.5"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Per-source breakdown. The "Overall row" column is the tell: if only
              the latest month shows ✓, the Overall summary boxes reflect that
              month alone — the months without it must be filled to aggregate. */}
          <div className="mt-2 overflow-x-auto rounded-lg border border-primary/15">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-on-surface-variant/70 text-left bg-primary/5">
                  <th className="px-2 py-1 font-semibold">Source</th>
                  <th className="px-2 py-1 font-semibold">Period</th>
                  <th className="px-2 py-1 font-semibold text-right">Rows</th>
                  <th className="px-2 py-1 font-semibold text-right">Checks</th>
                  <th className="px-2 py-1 font-semibold text-center">Overall row</th>
                  <th className="px-2 py-1 font-semibold text-center">Used</th>
                </tr>
              </thead>
              <tbody>
                {rollup.sources.map((s) => (
                  <tr key={s.id} className={`border-t border-primary/10 ${s.used ? "" : "opacity-50"}`}>
                    <td className="px-2 py-1 text-on-surface">{s.title}</td>
                    <td className="px-2 py-1 text-on-surface-variant">{s.period}{s.periodKind ? ` · ${s.periodKind}` : ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{s.rows}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{s.checks}</td>
                    <td className="px-2 py-1 text-center">{s.hasOverallRows ? "✓" : "—"}</td>
                    <td className="px-2 py-1 text-center">{s.used ? "✓" : "ignored"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rollup.usedCount > 0 && rollup.monthsWithOverall < rollup.usedCount && (
            <p className="mt-2 text-[12px] text-amber-700">
              Only {rollup.monthsWithOverall} of {rollup.usedCount} source record(s) carry the
              “Overall — All Projects” rows, so the Overall Summary boxes reflect only those.
              Fill the Overall rows in every month for a full Jan–Jun aggregate.
            </p>
          )}

          <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-primary">
              How these numbers were calculated ({rollup.assumptions.length} rules — not yet confirmed by QA)
            </summary>
            <ul className="mt-2 ml-4 list-disc space-y-1 text-[13px] text-on-surface-variant">
              {rollup.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </details>
        </div>
      )}

      {/* ── Header card: title / status / progress / export ──
           Sticky so the save indicator and progress ring stay visible while
           ticking through a long checklist. */}
      <div className="sticky top-0 z-30 -mx-2 px-2 pb-2 pt-1 bg-surface/80 backdrop-blur-sm mb-5">
      <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              {project && (
                <ProjectLogoPlate
                  src={getLogoUrl(project.logoFilename)}
                  alt={project.displayName}
                  title={project.displayName}
                  className="w-11 h-11 rounded-xl p-1.5 shrink-0"
                  imgClassName="w-full h-full"
                  override={project.logoPlateMode}
                />
              )}
              <div className="min-w-0">
                {project && (
                  <p className="text-sm font-extrabold text-on-surface leading-tight truncate">
                    {project.displayName}
                  </p>
                )}
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
                  {template.name}
                </p>
              </div>
              {isDirty && (
                <span
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                  className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0 ml-1"
                />
              )}
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
              {/* Old per-record export is for HR/QA forms only. Operations
                  monthly reports are produced via the server-side generator
                  (Versions panel / project page) — hide these here. Clients
                  never get the direct render (server 403s; they use the
                  published versions in the Versions panel). */}
              {isPeriodicQms && isAdmin && !isClient && (
                <button
                  type="button"
                  onClick={runRollup}
                  disabled={!canRollup || rollupBusy || isDirty}
                  title={
                    !canRollup
                      ? "Set this record's reporting period to a half-year or a year first — the roll-up needs to know which months to read."
                      : isDirty
                        ? "Save your changes first — populating overwrites this report's values from the monthly records."
                        : "Fill this report from the Monthly / Quarterly records inside its period"
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/15 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={`material-symbols-outlined text-[16px]${rollupBusy ? " animate-spin" : ""}`}>
                    {rollupBusy ? "progress_activity" : "auto_awesome"}
                  </span>
                  {rollupBusy ? "Populating…" : "Populate from monthly"}
                </button>
              )}
              {/* T&D: fill section 2.1 from the training meeting report. */}
              {canTdRollup && isAdmin && !isClient && (
                <button
                  type="button"
                  onClick={runTdRollup}
                  disabled={tdBusy || isDirty}
                  title={isDirty
                    ? "Save your changes first — populating overwrites section 2.1 from the training meeting report."
                    : "Fill section 2.1 (Training Programmes) from the Monthly Training Meeting for this quarter"}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/15 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={`material-symbols-outlined text-[16px]${tdBusy ? " animate-spin" : ""}`}>
                    {tdBusy ? "progress_activity" : "auto_awesome"}
                  </span>
                  {tdBusy ? "Populating…" : "Populate 2.1 from training meeting"}
                </button>
              )}
              {/* Live on-demand export — HR checklists only. QA reports use the
                  publish flow below (frozen PDF + Excel), so they don't get a
                  second, live export path that would confuse it. */}
              {!isOpsReport && !isClient && !isQaReport && (
                <>
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
                </>
              )}
              {isOpsReport && (
                <PdfVersionsButton recordId={rid} disabled={isDirty} api="ops" canGenerate={isAdmin} />
              )}
              {/* QA reports: editors get a clear Publish button (freezes a PDF
                  + Excel); viewers get Preview PDF + Download PDF/Excel of the
                  published version. */}
              {!isOpsReport && isQaReport && (
                <QaPublishArea recordId={rid} isEditor={isAdmin} disabled={isDirty} />
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* When this scrolls out of view the header's Save button is gone, so the
          floating Save button below takes over. */}
      <div ref={headerSentinelRef} aria-hidden="true" className="h-0" />

      {isAdmin && projSections.length > 0 && (
        <p className="text-[11px] text-on-surface-variant/50 mb-3 px-1">
          Tick a section to include it in this project's report; untick to leave it out.
          Applies to every month for this project.
        </p>
      )}

      {/* ── Creation info (placement='creation', editable here too) ── */}
      {sections.creation.length > 0 && (
        <div className="bg-white rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent p-6 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4">
            Creation info
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.creation.map((f) => (
              <FieldInput
                key={`${f.id}:${dataVersion}`}
                field={f}
                value={values.get(f.id)}
                onPatch={(p) => patchValue(f.id, p)}
                onToggleNa={(next) => toggleNa(f.id, next)}
                disabled={!isAdmin || concurrency}
                autoValue={f.sourceKey ? opsAutoValues[f.sourceKey] : undefined}
                autoLive={!!f.sourceKey && liveKeys.has(f.sourceKey)}
                rich={isOpsReport}
                periodLabel={periodLabel}
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
                    key={`${f.id}:${dataVersion}`}
                    field={f}
                    value={v}
                    onPatch={(p) => patchValue(f.id, p)}
                    onToggleNa={(next) => toggleNa(f.id, next)}
                    disabled={!isAdmin || concurrency}
                    hasError={hasError}
                    autoValue={f.sourceKey ? opsAutoValues[f.sourceKey] : undefined}
                    autoLive={!!f.sourceKey && liveKeys.has(f.sourceKey)}
                    rich={isOpsReport}
                    periodLabel={periodLabel}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sections ── */}
      {sections.grouped.map(({ id, name, description, fields, enabled, auto, child }) => {
        // Same N/A-aware progress as the header ring, scoped to this section.
        const applicableChecks = fields.filter(
          (f) => f.fieldType === "checkbox" && !f.fieldKey.startsWith("show_") && f.fieldKey !== "forecast_247" && f.fieldKey !== "callbacks_workflow_enabled" && !isMarkedNa(values.get(f.id))
        );
        const done = applicableChecks.filter((f) => values.get(f.id)?.valueBool === true).length;
        // Ops admins can enable/disable a section right here — disabled
        // sections collapse to just this toggle (no fields, greyed) and drop
        // out of the generated report. Per-project (applies to every month).
        const canToggle = isOpsReport && isAdmin && record?.projectId != null && id != null;
        return (
          <div
            key={id ?? name}
            className={`rounded-2xl border p-6 mb-5 ${child ? "ml-6 border-l-2 border-l-primary/20" : ""} ${
              enabled
                ? "bg-white border-on-surface-variant/5"
                : "bg-on-surface/[0.02] border-dashed border-on-surface-variant/20"
            }`}
          >
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0 flex items-start gap-3">
                {canToggle && (
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={togglingSection === id}
                    onChange={(e) => toggleSection(id!, e.target.checked)}
                    title={enabled ? "Disable — leave this section out of the report" : "Enable — include this section"}
                    className="accent-primary mt-0.5 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${enabled ? "text-on-surface" : "text-on-surface-variant/50"}`}>
                    {name}
                  </p>
                  {enabled && description && (
                    <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mt-1">
                      {description}
                    </p>
                  )}
                  {!enabled && (
                    <p className="text-[12px] text-on-surface-variant/40 mt-1">
                      Disabled — won't appear in the report.
                    </p>
                  )}
                </div>
              </div>
              {enabled && applicableChecks.length > 0 && (
                <span className="text-[11px] font-bold text-primary tabular-nums shrink-0">
                  {done}/{applicableChecks.length}
                </span>
              )}
            </div>
            {enabled &&
              (auto && fields.length === 0 ? (
                <p className="text-[12px] text-on-surface-variant/50">
                  Auto-filled from the month's data — no manual entry needed.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {fields
                    .filter((f) => {
                      // Forecast: keep it simple for non-technical users — hide the
                      // SLA table + its comment until the "24/7 project" box is ticked.
                      if (f.fieldKey === "forecast_sla_grid" || f.fieldKey === "forecast_sla_comment") {
                        const toggle = fields.find((x) => x.fieldKey === "forecast_247");
                        return !!(toggle && values.get(toggle.id)?.valueBool);
                      }
                      // Call Performance: hide the Callbacks / Workflow numbers until
                      // the "Show Callbacks / Workflow block" toggle is ticked.
                      if (f.fieldKey === "callbacks_count" || f.fieldKey === "workflow_count") {
                        const toggle = fields.find((x) => x.fieldKey === "callbacks_workflow_enabled");
                        return !!(toggle && values.get(toggle.id)?.valueBool);
                      }
                      return true;
                    })
                    .map((f) => {
                    const v = values.get(f.id);
                    // Live recompute — once showValidation is on, the red ring
                    // appears on unfilled required fields and disappears the
                    // instant they're filled. No "show error once" staleness.
                    const hasError =
                      showValidation && f.isRequired && !isFieldFilled(f, v);
                    return (
                      <div key={f.id} id={`field-${f.id}`}>
                        <FieldInput
                          key={`${f.id}:${dataVersion}`}
                          field={f}
                          value={v}
                          onPatch={(p) => patchValue(f.id, p)}
                          onToggleNa={(next) => toggleNa(f.id, next)}
                          disabled={!isAdmin || concurrency}
                          hasError={hasError}
                          rich={isOpsReport}
                          justify={["executive summary", "facebook", "operational updates"].includes(name.trim().toLowerCase())}
                          periodLabel={periodLabel}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
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

      {/* ── Floating Save button ──
          Appears bottom-right once the user has scrolled past the header, so on a
          long template Save is always one tap away. Prominent "Save (N)" when
          there are unsaved changes; a calm muted "Saved" when there's nothing to
          do, so a non-technical user always sees it and knows the state. */}
      {isAdmin && headerOffscreen && (() => {
        const clean = !isDirty && saveState !== "error";
        const tone =
          saveState === "error" ? "bg-error text-white hover:bg-error/90"
          : justSaved ? "bg-success text-white"
          : clean ? "bg-surface-container-high text-on-surface hover:bg-surface-container-high/80"
          : "bg-primary text-white hover:bg-primary-dim";
        const icon =
          saveState === "saving" ? "progress_activity"
          : saveState === "error" ? "error"
          : justSaved || clean ? "check_circle"
          : "save";
        const label =
          saveState === "saving" ? "Saving…"
          : saveState === "error" ? "Retry"
          : justSaved ? "Saved"
          : clean ? "Saved"
          : "Save";
        return (
          <button
            type="button"
            onClick={handleSave}
            disabled={concurrency || saveState === "saving"}
            aria-label={
              isDirty ? `Save ${dirtyIds.size} ${dirtyIds.size === 1 ? "change" : "changes"}`
              : saveState === "error" ? "Retry saving changes"
              : "All changes saved"
            }
            className={`fixed bottom-6 right-6 max-sm:bottom-4 max-sm:right-4 z-40
              inline-flex items-center gap-2 pl-4 pr-3 h-12 rounded-2xl
              text-sm font-bold shadow-lg shadow-black/20
              transition-colors mb-[env(safe-area-inset-bottom)]
              ${tone} disabled:opacity-80 disabled:cursor-wait`}
          >
            <span className={`material-symbols-outlined text-[20px] ${saveState === "saving" ? "animate-spin" : ""}`}>
              {icon}
            </span>
            <span>{label}</span>
            {isDirty && saveState !== "saving" && saveState !== "error" && !justSaved && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/25 text-white text-[11px] font-extrabold tabular-nums"
              >
                {dirtyIds.size}
              </span>
            )}
          </button>
        );
      })()}
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

// A dropdown that lists the record's versioned PDFs, lets STAFF generate /
// publish a new version, and download any version. Two backends share the
// same versions table:
//   api="ops" — Operations monthly reports (server-side generator; "Generate")
//   api="hr"  — QA/HR form reports (HrPdfService render; "Publish" — this is
//               the client-facing deliverable per the QA servizz.gov model)
// canGenerate=false renders the list/download-only view (client role).
function PdfVersionsButton({
  recordId,
  disabled,
  api,
  canGenerate,
}: {
  recordId: number;
  disabled: boolean;
  api: "ops" | "hr";
  canGenerate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Array<{ versionNo: number; isCurrent: boolean; generatedAt: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [downloadingVer, setDownloadingVer] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const actionLabel = api === "hr" ? "Publish" : "Generate";

  async function refresh() {
    try {
      setVersions(api === "hr"
        ? await listHrRecordPdfVersions(recordId)
        : await listOpsPdfVersions(recordId));
    }
    catch { setVersions([]); }
  }
  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [open]);

  async function generate() {
    setBusy(true); setErr(null);
    try {
      if (api === "hr") await publishHrRecordPdf(recordId);
      else await generateOpsPdf(recordId);
      await refresh();
    }
    catch (e) { setErr(e instanceof Error ? e.message : `${actionLabel} failed`); }
    finally { setBusy(false); }
  }

  async function download(versionNo: number) {
    const filename = `${api === "hr" ? "report" : "ops-report"}-${recordId}-v${versionNo}.pdf`;
    setDownloadingVer(versionNo); setErr(null);
    try {
      await (api === "hr"
        ? downloadHrRecordPdfVersion(recordId, filename, versionNo)
        : downloadOpsPdf(recordId, filename, versionNo));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingVer(null);
    }
  }

  const btnClass =
    "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/70 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={btnClass} title="Report PDF versions">
        <span className="material-symbols-outlined text-[16px]">history</span>
        Versions
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-on-surface-variant/10 shadow-lg p-3 z-20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/60">PDF versions</p>
            {canGenerate && (
              <button
                type="button"
                onClick={generate}
                disabled={busy || disabled}
                className="text-[11px] font-bold text-primary disabled:opacity-50"
                title={disabled ? "Save changes first" : `${actionLabel} a new version from the latest data`}
              >
                {busy ? `${actionLabel.replace(/e$/, "")}ing…` : `+ ${actionLabel}`}
              </button>
            )}
          </div>
          {err && <p className="text-[11px] text-error mb-2">{err}</p>}
          {versions.length === 0 ? (
            <p className="text-[11px] text-on-surface-variant/50 py-2">
              {canGenerate ? `No versions yet — ${actionLabel.toLowerCase()} one.` : "No published versions yet."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1 max-h-60 overflow-auto">
              {versions.map((v) => (
                <li key={v.versionNo} className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => download(v.versionNo)}
                    disabled={downloadingVer !== null}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-semibold disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                    title={`Download v${v.versionNo} (PDF)`}
                  >
                    {downloadingVer === v.versionNo && (
                      <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                    )}
                    v{v.versionNo}
                  </button>
                  {v.isCurrent && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-green-600">current</span>
                  )}
                  <span className="ml-auto text-on-surface-variant/45 text-[10px]">
                    {new Date(v.generatedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── QA publish + deliverables ────────────────────────────────────────────────
// Editors get a clear, prominent Publish button (freezes a PDF + Excel snapshot
// of the record). Anyone with a published version — editors and viewers alike —
// gets Preview PDF + Download PDF + Download Excel of that frozen version. A
// viewer with nothing published yet sees a plain "not published" note.
function QaPublishArea({
  recordId,
  isEditor,
  disabled,
}: {
  recordId: number;
  isEditor: boolean;
  disabled: boolean;
}) {
  const [versions, setVersions] = useState<HrPdfVersion[]>([]);
  // Which action is in-flight (null = idle). Drives per-button spinners so a
  // slow blob fetch (esp. downloads/preview) shows feedback instead of looking
  // frozen; every button disables while ANY action runs, to block double-fires.
  const [loading, setLoading] = useState<
    null | "publish" | "unpublish" | "preview" | "pdf" | "xlsx"
  >(null);
  const busy = loading !== null;
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const current = versions.find((v) => v.isCurrent) ?? null;

  async function refresh() {
    try { setVersions(await listHrRecordPdfVersions(recordId)); }
    catch { setVersions([]); }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);
  // Revoke the preview blob URL on unmount / when it changes.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  // Close the preview on Escape (belt-and-suspenders alongside the overlay/close-button).
  useEffect(() => {
    if (!previewUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePreview(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  async function publish() {
    setLoading("publish"); setErr(null);
    try { await publishHrRecordPdf(recordId); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Publish failed"); }
    finally { setLoading(null); }
  }
  async function unpublish() {
    if (!window.confirm(
      "Unpublish this report? Viewers will no longer be able to see or download it. " +
      "You can publish again at any time."
    )) return;
    setLoading("unpublish"); setErr(null);
    try { await unpublishHrRecordPdf(recordId); closePreview(); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Unpublish failed"); }
    finally { setLoading(null); }
  }
  async function openPreview() {
    setLoading("preview"); setErr(null);
    try { setPreviewUrl(await getHrRecordPdfObjectUrl(recordId)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Preview failed"); }
    finally { setLoading(null); }
  }
  async function download(format: "pdf" | "xlsx") {
    setLoading(format); setErr(null);
    try {
      await downloadHrRecordPdfVersion(recordId, `report-${recordId}.${format}`, undefined, format);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(null);
    }
  }
  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  const btn =
    "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const ghost = `${btn} bg-surface-container-high/70 text-on-surface hover:bg-surface-container-high`;

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {isEditor && (
        <button
          type="button"
          onClick={publish}
          disabled={busy || disabled}
          title={disabled
            ? "Save your changes first — publishing freezes what's saved."
            : "Freezes a PDF + Excel that viewers can download. Re-publish to update."}
          className={`${btn} bg-primary text-white hover:bg-primary/90`}
        >
          <span className={`material-symbols-outlined text-[16px]${loading === "publish" ? " animate-spin" : ""}`}>
            {loading === "publish" ? "progress_activity" : "publish"}
          </span>
          {loading === "publish" ? "Publishing…" : current ? "Re-publish" : "Publish"}
        </button>
      )}

      {isEditor && current && (
        <button
          type="button"
          onClick={unpublish}
          disabled={busy}
          title="Removes the published PDF + Excel so viewers can no longer see this report. You can publish again anytime."
          className={`${btn} bg-error/10 text-error hover:bg-error/20`}
        >
          <span className={`material-symbols-outlined text-[16px]${loading === "unpublish" ? " animate-spin" : ""}`}>
            {loading === "unpublish" ? "progress_activity" : "visibility_off"}
          </span>
          {loading === "unpublish" ? "Unpublishing…" : "Unpublish"}
        </button>
      )}

      {current && (
        <>
          <button type="button" onClick={openPreview} disabled={busy} className={ghost} title="Preview the published PDF">
            <span className={`material-symbols-outlined text-[16px]${loading === "preview" ? " animate-spin" : ""}`}>
              {loading === "preview" ? "progress_activity" : "visibility"}
            </span>
            {loading === "preview" ? "Opening…" : "Preview PDF"}
          </button>
          <button type="button" onClick={() => download("pdf")} disabled={busy} className={ghost}>
            <span className={`material-symbols-outlined text-[16px]${loading === "pdf" ? " animate-spin" : ""}`}>
              {loading === "pdf" ? "progress_activity" : "picture_as_pdf"}
            </span>
            {loading === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
          {current.hasXlsx && (
            <button type="button" onClick={() => download("xlsx")} disabled={busy} className={ghost}>
              <span className={`material-symbols-outlined text-[16px]${loading === "xlsx" ? " animate-spin" : ""}`}>
                {loading === "xlsx" ? "progress_activity" : "table_view"}
              </span>
              {loading === "xlsx" ? "Preparing…" : "Download Excel"}
            </button>
          )}
        </>
      )}

      {isEditor && current && (
        <span className="text-[11px] text-on-surface-variant/55">
          Published v{current.versionNo} · {new Date(current.generatedAt).toLocaleDateString()} — frozen; re-publish to refresh.
        </span>
      )}
      {isEditor && !current && (
        <span className="text-[11px] text-on-surface-variant/55">
          Not published yet. Publishing freezes a PDF + Excel for viewers.
        </span>
      )}
      {!isEditor && !current && (
        <span className="text-[12px] text-on-surface-variant/60 italic">This report hasn't been published yet.</span>
      )}
      {err && <span className="text-[11px] text-error">{err}</span>}

      {previewUrl && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl w-[90vw] h-[90vh] max-w-5xl flex flex-col overflow-hidden border border-on-surface-variant/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-on-surface-variant/10 shrink-0">
              <p className="text-sm font-bold text-on-surface truncate">Published PDF preview</p>
              <button type="button" onClick={closePreview} aria-label="Close preview"
                className="text-on-surface-variant/50 hover:text-on-surface transition-colors p-1 rounded">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <iframe src={previewUrl} title="Published PDF preview" className="flex-1 w-full border-0" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Swatch colours for `*_color` select fields (e.g. the PCA card colour toggle).
// Tokens + hexes mirror the backend map in OperationsMonthlyPdfService.PcaAccentHex
// ("default" = the report's ink text colour).
const COLOR_SWATCHES: Record<string, string> = {
  default: "#1B2A3A",
  blue: "#1D5FA8",
  red: "#C0392B",
  green: "#15803D",
};

// Preview swatches for `*_palette` select fields (per-chart colour palette).
// Mirror the backend: Builder.Palette (Brand) and OperationsMonthlyPdfService
// .StatusPalette (Status). We show the leading colours of each preset so the
// author can SEE the palette instead of picking a bare "Brand"/"Status" word.
// `hint` explains how the colours map onto the chart (slice/series order).
const PALETTE_PRESETS: Record<string, { colors: string[]; hint: string }> = {
  Brand: {
    colors: ["#2E9BD6", "#0C1E33", "#6FB7E0", "#A9D3EE", "#4B6075"],
    hint: "The usual report blues & navy",
  },
  Status: {
    colors: ["#15803D", "#E08D1A", "#C0392B"],
    hint: "Green · amber · red — by row order (e.g. positive / neutral / negative)",
  },
};

function FieldInput({
  field,
  value,
  onPatch,
  onToggleNa,
  disabled,
  hasError,
  autoValue,
  autoLive,
  rich,
  justify,
  periodLabel,
}: {
  field: HrTemplateField;
  value: HrValuePatch | undefined;
  onPatch: (p: Partial<HrValuePatch>) => void;
  onToggleNa: (next: boolean) => void;
  disabled: boolean;
  hasError?: boolean;
  // Resolved reporting period ("June 2026"), for grids whose column headers
  // carry a {period} token. Null for templates with no period.
  periodLabel?: string | null;
  // Operations: live auto-filled value for a source-bound field.
  autoValue?: { number: number | null; display: string };
  // True when the field is bound to a LIVE data source → render read-only.
  autoLive?: boolean;
  // Operations narratives: use the rich-text editor instead of the grammar
  // textarea, and keep the HTML formatting through to the PDF.
  rich?: boolean;
  // Justify the rich-text prose (Executive Summary only) — mirrors the PDF.
  justify?: boolean;
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
    // Visibility toggles ("show_*") default to CHECKED — the number is shown
    // unless explicitly unticked. Normal checklist checkboxes default unchecked.
    const isVisibilityToggle = field.fieldKey.startsWith("show_");
    const checked = isVisibilityToggle ? value?.valueBool !== false : value?.valueBool === true;
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

  // Operations: a field bound to a LIVE data source is auto-filled from the
  // database at generation time and is ALWAYS read-only here — never an input
  // (it shows "—" when this month has no data yet). Fields bound to a "planned"
  // source (no live feed yet, e.g. email/chat) fall through to a normal
  // editable input and are filled manually until their feed is wired.
  if (field.sourceKey && autoLive) {
    return (
      <div>
        {header}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary/70 shrink-0">
            auto_awesome
          </span>
          <span className="text-sm font-bold text-on-surface tabular-nums">{autoValue?.display ?? "—"}</span>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/45">
            auto · from data
          </span>
        </div>
      </div>
    );
  }

  // Snippet image uploader (e.g. Social Listening). Stores the image as a base64
  // data URL in valueText so it embeds straight into the PDF — no file pipeline.
  if (field.fieldKey.endsWith("_snippet")) {
    const dataUrl = markedNa ? "" : value?.valueText ?? "";
    const onFile = (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) { window.alert("Please choose an image file (PNG or JPG)."); return; }
      if (file.size > 2 * 1024 * 1024) { window.alert("That image is too large — please keep it under 2 MB."); return; }
      const reader = new FileReader();
      reader.onload = () =>
        onPatch({ valueText: String(reader.result), valueNumber: null, valueDate: null, valueBool: null, valueJson: null });
      reader.readAsDataURL(file);
    };
    return (
      <div>
        {header}
        {dataUrl ? (
          <div className="rounded-lg border border-on-surface-variant/15 bg-surface-container-high/30 p-2">
            <img src={dataUrl} alt="Snippet preview" className="max-h-48 rounded-md mx-auto" />
            {!inputDisabled && (
              <div className="mt-2 flex items-center justify-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container-high/80">
                  <span className="material-symbols-outlined text-[16px]">image</span>
                  Replace
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
                <button
                  type="button"
                  onClick={() => onPatch({ valueText: null, valueNumber: null, valueDate: null, valueBool: null, valueJson: null })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error/10 text-error text-xs font-bold hover:bg-error/20"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          <label
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-on-surface-variant/20 bg-surface-container-high/20 py-8 text-on-surface-variant/70 ${
              inputDisabled ? "opacity-60" : "cursor-pointer hover:border-primary/40 hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[28px]">upload</span>
            <span className="text-xs font-bold">Upload snippet image</span>
            <span className="text-[11px] text-on-surface-variant/50">PNG or JPG, up to 2 MB</span>
            <input type="file" accept="image/*" disabled={inputDisabled} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
    );
  }

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
          spellCheck
          lang="en"
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

  // Colour-swatch picker: a `select` whose key ends in "_color" renders as
  // clickable colour swatches instead of a dropdown. Unset shows "default".
  if (field.fieldType === "select" && field.fieldKey.endsWith("_color")) {
    const options = normalizeSelectOptions(field.options);
    const current = markedNa ? "" : value?.valueText ?? "";
    return (
      <div>
        {header}
        <div className="flex items-center gap-2">
          {options.map((o) => {
            const hex = COLOR_SWATCHES[o.value] ?? "#1B2A3A";
            const selected = current === o.value || (current === "" && o.value === "default");
            return (
              <button
                key={o.value}
                type="button"
                title={o.label}
                disabled={inputDisabled}
                aria-pressed={selected}
                onClick={() =>
                  onPatch({ valueText: o.value, valueNumber: null, valueDate: null, valueBool: null })
                }
                className={`w-7 h-7 rounded-full transition-shadow disabled:opacity-40 ${
                  selected
                    ? "ring-2 ring-offset-2 ring-primary border-transparent"
                    : "border border-on-surface-variant/25 hover:ring-1 hover:ring-on-surface-variant/30"
                }`}
                style={{ backgroundColor: hex }}
              />
            );
          })}
        </div>
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  // Palette-preview picker: a `select` whose key ends in "_palette" renders each
  // preset as a card showing its actual leading colours + a one-line hint, so
  // the author can see "Brand" vs "Status" rather than picking a bare word.
  // Unset defaults to Brand (matches the backend: blank / non-"Status" → Brand).
  if (field.fieldType === "select" && field.fieldKey.endsWith("_palette")) {
    const options = normalizeSelectOptions(field.options);
    const current = markedNa ? "" : value?.valueText ?? "";
    return (
      <div>
        {header}
        <div className="flex flex-col gap-2">
          {options.map((o) => {
            const preset = PALETTE_PRESETS[o.value] ?? PALETTE_PRESETS.Brand;
            const selected =
              current === o.value || (current === "" && o.value === "Brand");
            return (
              <button
                key={o.value}
                type="button"
                disabled={inputDisabled}
                aria-pressed={selected}
                onClick={() =>
                  onPatch({ valueText: o.value, valueNumber: null, valueDate: null, valueBool: null })
                }
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors disabled:opacity-40 ${
                  selected
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "border-on-surface-variant/15 hover:border-on-surface-variant/30 hover:bg-surface-container-low/40"
                }`}
              >
                <span className="flex items-center gap-1 shrink-0">
                  {preset.colors.map((hex, i) => (
                    <span
                      key={i}
                      className="w-5 h-5 rounded-full border border-black/5"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-on-surface">{o.label}</span>
                  <span className="block text-[11px] text-on-surface-variant/70 leading-snug">
                    {preset.hint}
                  </span>
                </span>
                {selected && (
                  <span
                    className="material-symbols-outlined text-[18px] text-primary ml-auto shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                  >
                    check_circle
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "select") {
    const options = normalizeSelectOptions(field.options);
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
    const onText = (val: string) =>
      onPatch({ valueText: val || null, valueNumber: null, valueDate: null, valueBool: null, valueJson: null });
    // "_menu" fields are split into bullets line-by-line by the report generator,
    // so they stay a plain editor (rich HTML has no newlines to split on).
    const useRich = rich && !field.fieldKey.endsWith("_menu");
    return (
      <div>
        {header}
        {useRich ? (
          <RichTextField
            value={markedNa ? "" : value?.valueText ?? ""}
            disabled={inputDisabled}
            placeholder={markedNa ? "Not applicable" : undefined}
            hasError={hasError}
            justify={justify}
            onChange={onText}
          />
        ) : (
          <GrammarField
            value={markedNa ? "" : value?.valueText ?? ""}
            disabled={inputDisabled}
            placeholder={markedNa ? "Not applicable" : undefined}
            hasError={hasError}
            onChange={onText}
          />
        )}
        {hasError && !markedNa && <ErrorHint label={field.label} />}
      </div>
    );
  }

  if (field.fieldType === "grid") {
    return (
      <div>
        <span className={labelClass}>{field.label}</span>
        <GridFieldInput field={field} value={value} onPatch={onPatch} disabled={disabled} periodLabel={periodLabel ?? null} />
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

// Seeds the editor's rows. A grid that already holds rows is parsed verbatim —
// `presetRows` fills an EMPTY grid only, so historical records keep their own
// rows (and their own project vocabulary) untouched forever.
function seedGridRows(json: string | null | undefined, presetRows?: HrGridRow[]): GridRowWithId[] {
  if (!json) return (presetRows ?? []).map((r) => ({ ...r, __rid: newRowId() }));
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
  periodLabel,
}: {
  field: HrTemplateField;
  value: HrValuePatch | undefined;
  onPatch: (p: Partial<HrValuePatch>) => void;
  disabled: boolean;
  // Resolved reporting period ("June 2026") for {period} column headers.
  periodLabel: string | null;
}) {
  const grid = asGridOptions(field.options);
  const columns: HrGridColumn[] = grid?.columns ?? [];

  // A row is "preset" (locked cells, no delete) iff it carries the options'
  // rowKey property. Legacy rows in old records have none, so those records
  // stay exactly as editable as they have always been.
  const rowKeyProp = grid?.rowKey ?? null;
  const isPresetRow = (row: HrGridRow) =>
    rowKeyProp != null && row[rowKeyProp] != null && row[rowKeyProp] !== "";

  // Seed ONCE from the saved JSON. We deliberately don't re-seed on every
  // value change — the parent's valueJson reflects our own commits, and
  // re-seeding would regenerate ids (and drop focus) on each keystroke. A full
  // page reload (e.g. after a 412) remounts this component and re-seeds.
  const [rows, setRows] = useState<GridRowWithId[]>(() => seedGridRows(value?.valueJson, grid?.presetRows));

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
  // Pagination: large action logs (e.g. the training-meeting grid runs to 200+
  // rows) are paginated so the DOM stays light. Small grids (< PAGE_SIZE) render
  // as before — no controls, no behaviour change.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // A preset-backed grid is a fixed scorecard read top-to-bottom (56 rows for
  // Quality Monitoring Scores). Splitting it across pages would hide two thirds
  // of it behind pager clicks, so pagination applies only to grow-as-you-go
  // grids (e.g. the 200+ row training-meeting action log).
  const paged = !grid?.rowsFixed && rows.length > PAGE_SIZE;
  const safePage = Math.min(page, pageCount - 1);
  const startIdx = paged ? safePage * PAGE_SIZE : 0;
  const visibleRows = paged ? rows.slice(startIdx, startIdx + PAGE_SIZE) : rows;

  function addRow() {
    const next = [...rows, { __rid: newRowId() }];
    commit(next);
    setPage(Math.ceil(next.length / PAGE_SIZE) - 1); // jump to the new last row
  }
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

  // Shown once above the table when a column header carries {period}, so the
  // month reads as a property of the whole record rather than of any row.
  const periodChip = periodLabel && columns.some((c) => splitGridLabel(c.label).hasPeriod)
    ? periodLabel
    : null;

  // Leftmost fixed column identifies the row; it gets the anchor weighting.
  const anchorKey = columns.find((c) => c.readonly)?.key;

  // Size each column to its widest content (header label or any cell value),
  // bounded per type, so a 2-digit number column never claims as much room as a
  // long project-name column. Numeric/select headers wrap (no nowrap below) so
  // they can stay narrow; text columns grow to fit the longest value (capped).
  const colWidths = columns.map((c) => {
    // Auto-numbered columns render the row index, so they must NOT be sized by
    // whatever legacy strings sit under that key (the training-meeting sheet
    // has cells like "184\nDONE" that would blow the column wide open).
    if (c.autoNumber) return 84;
    let valLen = 0;
    for (const r of rows) {
      const v = r[c.key];
      if (v == null || typeof v === "object") continue;
      const len = String(v).length;
      if (len > valLen) valLen = len;
    }
    // Header width estimate (uppercase, letter-spaced, ~7px/char + padding) so
    // the label never wraps — the header is the dominant width driver for short
    // numeric columns like "Accuracy (%)". A "{period}" label renders on two
    // lines, so measure the longer of the static text and the resolved period
    // rather than the raw token.
    const { text: headText, hasPeriod } = splitGridLabel(c.label);
    const headChars = hasPeriod
      ? Math.max(headText.length, periodLabel?.length ?? 0)
      : headText.length;
    const headerW = Math.round(headChars * 7) + 30;
    switch (c.type) {
      case "number":
      case "percent":
        // +40 leaves room for the number spinner / "%" affix so digits never
        // clip; headerW keeps the label on one line.
        return Math.min(220, Math.max(100, valLen * 10 + 40, headerW));
      case "date":
        return Math.max(140, headerW);
      case "month":
        return Math.max(128, headerW);
      case "rag":
        return Math.max(168, headerW);
      case "select":
        return Math.min(200, Math.max(120, valLen * 8 + 44, headerW));
      case "textarea":
        // Multi-line cell — fixed generous width; height does the work.
        return 340;
      default: {
        const ch = Math.max(c.label.length, valLen);
        return Math.min(320, Math.max(128, Math.round(ch * 7.5) + 22, headerW));
      }
    }
  });
  // # column (40) + per-column widths + actions column (40 when editable).
  const tableWidth = 40 + colWidths.reduce((a, b) => a + b, 0) + (disabled ? 0 : 40);

  return (
    // The header can only stick to a scrolling ancestor, and this wrapper is
    // already one (overflow-x-auto forces overflow-y to auto). Giving it a max
    // height makes the table scroll INSIDE it, which is what lets `sticky top-0`
    // on the header actually pin — action logs run to 200+ rows and operators
    // were scrolling back up just to re-read the column names. The help strip,
    // pager and "Add row" sit OUTSIDE the scroll box so they stay put.
    <div className="mt-1.5 rounded-xl border border-on-surface-variant/10">
      {(grid?.help || periodChip) && (
        <p className="px-3 py-2 text-[11px] text-on-surface-variant/60 italic border-b border-on-surface-variant/10 bg-surface-container-low/30">
          {periodChip && (
            <span className="not-italic font-bold text-primary mr-1.5">{periodChip} ·</span>
          )}
          {grid?.help}
        </p>
      )}
      <div className="max-h-[70vh] overflow-auto">
      {/* auto layout + width:100% → columns size to content AND the table fills
          the available width (no wasted space); minWidth keeps content-based
          floors so nothing clips, and the wrapper scrolls only when truly cramped. */}
      <table className="border-collapse w-full" style={{ tableLayout: "auto", width: "100%", minWidth: tableWidth }}>
        <thead>
          <tr>
            {/* Sticky corner: pinned on both axes, so it must outrank both the
                sticky header cells (z-20) and the sticky body `#` cells (z-10).
                Backgrounds here are opaque — a translucent sticky cell lets the
                rows scrolling beneath it show through. */}
            <th scope="col" className="sticky left-0 top-0 z-30 bg-surface-container-high w-10 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/50 text-left">#</th>
            {columns.map((c, ci) => {
              // "{period}" resolves from the record, so render it on its own
              // line in the brand colour — it must not read as static boilerplate.
              const { text: headText, hasPeriod } = splitGridLabel(c.label);
              return (
                <th key={c.key} scope="col" style={{ minWidth: colWidths[ci] }} className="sticky top-0 z-20 bg-surface-container-high px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60 text-left align-bottom whitespace-nowrap border-l border-on-surface-variant/10">
                  <span>{headText}</span>
                  {hasPeriod && periodLabel && (
                    <span className="block text-primary normal-case tracking-normal font-bold">{periodLabel}</span>
                  )}
                </th>
              );
            })}
            {!disabled && <th scope="col" className="sticky top-0 z-20 bg-surface-container-high w-10 px-2 py-2"><span className="sr-only">Actions</span></th>}
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
            visibleRows.map((row, li) => {
              const preset = isPresetRow(row);
              return (
              // User-added rows get a faint left accent so the fixed scorecard
              // stays visually "default" and the exceptions are what stand out.
              // Rows are never tinted — the sticky `#` cell is opaque bg-white
              // and a tint would bleed through it on horizontal scroll.
              <tr key={row.__rid} className={`border-t border-on-surface-variant/8 hover:bg-surface-container-low/30 group/row${preset ? "" : " border-l-2 border-l-primary/30"}`}>
                <td className={`${stickyCol} group-hover/row:bg-surface-container-low px-2 py-1.5 text-[12px] font-semibold text-on-surface-variant/50 tabular-nums align-top pt-3`}>
                  {startIdx + li + 1}
                </td>
                {columns.map((c) => {
                  // Dedupe select: hide values already picked in OTHER rows (the
                  // current row keeps its own value so it stays selected).
                  const exclude = c.dedupe
                    ? rows
                        .filter((r) => r.__rid !== row.__rid)
                        .map((r) => r[c.key])
                        .filter((v): v is string => typeof v === "string" && v.length > 0)
                    : undefined;
                  return (
                    <td key={c.key} className="px-2 py-1.5 align-top border-l border-on-surface-variant/8">
                      <GridCellInput
                        column={c}
                        rowNum={startIdx + li + 1}
                        value={row[c.key]}
                        disabled={disabled}
                        readOnly={preset && !!c.readonly}
                        anchor={c.key === anchorKey}
                        inputClass={cellInput}
                        excludeValues={exclude}
                        onChange={(cell) => setCell(row.__rid, c.key, cell)}
                      />
                    </td>
                  );
                })}
                {!disabled && (
                  <td className="px-1 py-1.5 align-top pt-2">
                    {/* Preset rows are undeletable. Render nothing rather than a
                        disabled button — a disabled control is still a tab stop
                        in some browsers, and 56 dead stops is a real cost. */}
                    {!preset && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.__rid)}
                        title="Remove row"
                        aria-label={`Remove row ${startIdx + li + 1}`}
                        className="text-on-surface-variant/40 hover:text-error hover:bg-error/5 rounded p-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                  </td>
                )}
              </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      {paged && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-on-surface-variant/10 bg-surface-container-low/30 text-[12px]">
          <span className="text-on-surface-variant/60 tabular-nums">
            {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="px-2 py-1 rounded-md font-semibold text-on-surface-variant/70 hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center"
              aria-label="Previous page"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <span className="text-on-surface-variant/70 tabular-nums px-1">Page {safePage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="px-2 py-1 rounded-md font-semibold text-on-surface-variant/70 hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center"
              aria-label="Next page"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      )}
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
// Full month names for the grid "month" column dropdown (matches the report
// samples, which spell months out).
const GRID_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Grid date cell: day/month/year, always ───────────────────────────────────
// `<input type="date">` renders in the BROWSER's locale, so on a US-locale
// machine it shows mm/dd/yyyy and there is no CSS or attribute to change that.
// The QA team read 07/01 as 7 January and the browser meant 7 July. So the
// visible control is a plain text box we format ourselves as dd/mm/yyyy, with a
// calendar button that opens the native picker.
//
// Canonical storage is ISO yyyy-MM-dd (sortable, and what the picker speaks).
// A legacy value that is not ISO — the training-meeting sheet has 558
// "24.08.2022" and 187 "13/1/2026" strings, plus "N/A" and "TBC" — is shown
// EXACTLY as stored and never silently reinterpreted. Typing a valid
// dd/mm/yyyy converts it to ISO on blur; anything else is kept verbatim.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/;

function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Returns the ISO form of a dd/mm/yyyy string, or null when it isn't a real
// calendar date. Rejects 31/04/2023 (April has 30 days) rather than rolling it
// over into May — the sheet contains exactly that value.
function dmyToIso(text: string): string | null {
  const m = DMY_DATE.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}`;
}

function GridDateCell({
  label,
  rowNum,
  value,
  disabled,
  inputClass,
  onChange,
}: {
  label: string;
  rowNum: number;
  value: string;
  disabled: boolean;
  inputClass: string;
  onChange: (cell: string | null) => void;
}) {
  const iso = ISO_DATE.test(value) ? value : "";
  // What the user sees: ISO renders as dd/mm/yyyy; anything else renders as-is.
  const display = iso ? isoToDmy(iso) : value;
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? display;
  const unparsed = !!value && !iso;

  function commitDraft() {
    if (draft == null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === "") { onChange(null); return; }
    const asIso = dmyToIso(text);
    // Not a real date → store what they typed rather than discard it.
    onChange(asIso ?? text);
  }

  return (
    <span className="relative flex items-center">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={shown}
        disabled={disabled}
        aria-label={`${label}, row ${rowNum}. Format day slash month slash year.`}
        title={unparsed ? `Stored as "${value}" — not a recognised date, left exactly as entered.` : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDraft(); } }}
        className={`${inputClass} pr-8 ${unparsed ? "text-amber-700" : ""}`}
      />
      {!disabled && (
        // The native input sits invisibly over the icon: clicking it opens the
        // browser's own picker in every engine (showPicker() is not universal).
        // Its own mm/dd/yyyy text is never seen because it has zero opacity.
        <span className="absolute right-1 inline-flex items-center justify-center w-6 h-6 rounded text-on-surface-variant/50 hover:text-primary hover:bg-primary/5">
          <span className="material-symbols-outlined text-[16px] pointer-events-none">calendar_month</span>
          <input
            type="date"
            value={iso}
            tabIndex={-1}
            aria-label={`Pick ${label} from a calendar, row ${rowNum}`}
            onChange={(e) => { setDraft(null); onChange(e.target.value || null); }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </span>
      )}
    </span>
  );
}

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
  readOnly,
  anchor,
  inputClass,
  excludeValues,
  onChange,
}: {
  column: HrGridColumn;
  rowNum: number;
  value: HrGridRow[string];
  disabled: boolean;
  // Permanently fixed cell on a preset row — never an input.
  readOnly?: boolean;
  // The row's identifying cell (leftmost fixed column): weighted like
  // `.tbl-td-strong` so the eye can anchor on it down a 56-row scorecard.
  anchor?: boolean;
  inputClass: string;
  excludeValues?: string[];
  onChange: (cell: HrGridRow[string]) => void;
}) {
  // An auto-numbered column IS the row's position. Derived on every render, so
  // deleting row 2 renumbers rows 3..N automatically — nothing to store, and
  // nothing to fall out of sync. Any legacy value under this key is ignored,
  // never rewritten (migration 127).
  if (column.autoNumber) {
    return (
      <span className="block text-[13px] py-1.5 font-semibold text-on-surface tabular-nums">
        {rowNum}
      </span>
    );
  }

  // A fixed cell renders as static text, not as a disabled input. Input chrome
  // would invite a click that does nothing, and `disabled` drops the value out
  // of the accessible tree — the identifying columns of a scorecard row are
  // exactly the values a screen-reader user needs. The <th scope="col"> already
  // associates each value with its column header, so no extra ARIA is needed.
  if (readOnly) {
    const text = value == null || typeof value === "object" ? "" : String(value);
    return (
      <span className={`block text-[13px] py-1.5 ${anchor ? "font-semibold text-on-surface" : "text-on-surface-variant/80"}`}>
        {text || "—"}
      </span>
    );
  }

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

  if (column.type === "select" || column.type === "month") {
    // Month columns are a fixed dropdown of full month names (matches the
    // report samples) — no free-text typing. Select columns use their own
    // configured options.
    const opts = column.type === "month" ? GRID_MONTHS : column.options ?? [];
    // Dedupe columns hide values already chosen elsewhere, but always keep this
    // cell's own current value so it stays visible/selected.
    const cur = typeof value === "string" ? value : "";
    const shown = excludeValues && excludeValues.length
      ? opts.filter((o) => o === cur || !excludeValues.includes(o))
      : opts;
    return (
      <select
        value={cur}
        disabled={disabled}
        aria-label={`${column.label}, row ${rowNum}`}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      >
        <option value="">—</option>
        {shown.map((o) => (
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
      <GridDateCell
        label={column.label}
        rowNum={rowNum}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        inputClass={inputClass}
        onChange={onChange}
      />
    );
  }

  if (column.type === "textarea") {
    // Multi-line cell that grows to show ALL the text (like the Excel cell) —
    // no inner scroll. Height is estimated from both explicit line breaks AND
    // wrapped long lines (the cell is ~42 chars wide at 340px / 13px), so a
    // paragraph that wraps several times still gets the rows it needs. Native
    // `field-sizing: content` (where supported) auto-fits exactly; the row
    // estimate is the fallback for browsers without it.
    const text = typeof value === "string" ? value : value == null ? "" : String(value);
    const CHARS_PER_LINE = 42;
    const estRows = (text ? text.split("\n") : [""])
      .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / CHARS_PER_LINE)), 0);
    const rows = Math.min(40, Math.max(2, estRows));
    return (
      <textarea
        value={text}
        disabled={disabled}
        rows={rows}
        aria-label={`${column.label}, row ${rowNum}`}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${inputClass} resize-y leading-snug`}
        style={{ overflowY: "auto", ...({ fieldSizing: "content" } as React.CSSProperties) }}
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
