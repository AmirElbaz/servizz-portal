import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fmt } from "../../utils/fmt";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Skeleton from "../../components/admin/Skeleton";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useAuth, roleAtLeast } from "../../services/auth";
import {
  getHrTemplate,
  updateHrTemplate,
  addHrField,
  updateHrField,
  setHrFieldAllowsNa,
  deleteHrField,
  reorderHrFields,
  addHrSection,
  updateHrSection,
  setHrSectionClientVisible,
  deleteHrSection,
  reorderHrSections,
  archiveHrTemplate,
  deleteHrTemplate,
  asGridOptions,
  type HrTemplateDetail,
  type HrTemplateField,
  type HrTemplateSection,
  type HrTemplatePeriodKind,
  type HrFieldType,
  type HrGridColumn,
  type HrGridColumnType,
} from "../../services/hr";
import { getMetricCatalog, type MetricCatalogEntry } from "../../services/opsReports";

// Template designer — sections and their fields.
//
// Sections are first-class containers with an editable header, drag-
// reorderable relative to each other, and they own a "+ Add field" CTA.
// Fields live inside sections and can be dragged within a section or across
// sections (cross-section drag updates section_id via the reorder endpoint).
//
// The special "Details" bucket renders at the top and holds fields whose
// section_id is NULL — typically the small metadata fields like CRO Name,
// Date of Commencement, Project.
export default function HrTemplateDesignerPage() {
  const { deptCode, templateId } = useParams<{ deptCode: string; templateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // HR template design is a centrecom_user (staff) capability and above.
  const isAdmin = roleAtLeast(user?.role, "centrecom_user");
  const tid = Number(templateId);

  // Design is admin-only (enforced by the backend too). Non-admins who
  // deep-link here get bounced to the records page immediately.
  useEffect(() => {
    if (user && !isAdmin && deptCode && Number.isFinite(tid)) {
      navigate(`/department/${deptCode}/templates/${tid}/records`, { replace: true });
    }
  }, [user, isAdmin, deptCode, tid, navigate]);

  const [template, setTemplate] = useState<HrTemplateDetail | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Brief "Saved" flash after the user clicks Save. Designer edits normally
  // commit on blur / change / drop, but users want a visible acknowledgement
  // that they're committed. The button force-commits any focused input
  // (by blurring it) then flashes the tick for ~1.5s.
  const [saveFlash, setSaveFlash] = useState<"idle" | "saving" | "saved">("idle");

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false);
  const [confirmDeleteField, setConfirmDeleteField] = useState<HrTemplateField | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<HrTemplateSection | null>(null);
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  async function reload() {
    if (!Number.isFinite(tid)) return;
    try {
      setLoading(true);
      // The designer is the one place retired sections must still be visible —
      // otherwise there is no way to bring one back.
      const { data, etag: newEtag } = await getHrTemplate(tid, true);
      setTemplate(data);
      setEtag(newEtag);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [tid]);

  // Operations templates (project-scoped) bind fields to a data-source catalog.
  // Fetch it only when this is a project-scoped template; HR/QA never see it.
  const [metricCatalog, setMetricCatalog] = useState<MetricCatalogEntry[]>([]);
  useEffect(() => {
    if (template?.projectId != null) {
      getMetricCatalog().then(setMetricCatalog).catch(() => setMetricCatalog([]));
    } else {
      setMetricCatalog([]);
    }
  }, [template?.projectId]);

  // ── Derived data ────────────────────────────────────────────────────────
  // Detail surfaces exclude creation-placement fields — those live in their
  // own Creation form card at the top of the designer.
  const detailsBucket = useMemo(() => {
    if (!template) return [] as HrTemplateField[];
    return template.fields
      .filter((f) => f.placement !== "creation" && f.sectionId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [template]);

  const sectionsWithFields = useMemo(() => {
    if (!template) return [] as Array<{ section: HrTemplateSection; fields: HrTemplateField[] }>;
    const byId = new Map<number, HrTemplateField[]>();
    for (const f of template.fields) {
      if (f.placement === "creation") continue;
      if (f.sectionId === null) continue;
      if (!byId.has(f.sectionId)) byId.set(f.sectionId, []);
      byId.get(f.sectionId)!.push(f);
    }
    for (const arr of byId.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return template.sections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ section: s, fields: byId.get(s.id) ?? [] }));
  }, [template]);

  // Creation fields have placement='creation' — admins define them directly
  // (label + type + required) in the Creation form card. They are independent
  // of the main template fields (placement='detail'): different rows, defined
  // with their own controls, and they only surface in the New-record modal.
  const creationFields = useMemo(() => {
    if (!template) return [] as HrTemplateField[];
    return template.fields
      .filter((f) => f.placement === "creation")
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [template]);

  // Detail fields are filtered inline in the sectionsWithFields / detailsBucket
  // memos above; no separate derived template needed.

  // ── Template metadata saves ────────────────────────────────────────────
  async function saveTemplateMetadata(patch: {
    name?: string;
    description?: string | null;
    icon?: string | null;
    titleLabel?: string;
    // "none" clears the reporting-period config; omit = unchanged.
    periodKind?: HrTemplatePeriodKind | "none";
  }) {
    if (!template) return;
    try {
      setSaving(true);
      const body = {
        name:        patch.name        ?? template.name,
        description: patch.description !== undefined ? patch.description : template.description,
        icon:        patch.icon        !== undefined ? patch.icon        : template.icon,
        titleLabel:  patch.titleLabel  ?? template.titleLabel,
        ...(patch.periodKind !== undefined ? { periodKind: patch.periodKind } : {}),
      };
      const { etag: newEtag } = await updateHrTemplate(template.id, body, etag);
      setEtag(newEtag);
      setTemplate({
        ...template,
        name: body.name,
        description: body.description,
        icon: body.icon,
        titleLabel: body.titleLabel,
        ...(patch.periodKind !== undefined
          ? { periodKind: patch.periodKind === "none" ? null : patch.periodKind }
          : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Field ops ───────────────────────────────────────────────────────────
  async function handleAddField(sectionId: number | null) {
    if (!template) return;
    const nextSortOrder = (template.fields.reduce((m, f) => Math.max(m, f.sortOrder), 0) ?? 0) + 10;
    const seq = (template.fields.length + 1).toString().padStart(2, "0");
    try {
      await addHrField(template.id, {
        fieldKey: `field_${seq}_${Math.random().toString(36).slice(2, 6)}`,
        label: "New field",
        fieldType: "text",
        ownerTeam: null,
        sectionId,
        isRequired: false,
        showOnCreate: false,
        placement: "detail",
        // N/A is available on every HR checklist field by default (Amir
        // 2026-06-14). Admins can still turn it off per-field via the toggle.
        allowsNa: true,
        options: null,
        sortOrder: nextSortOrder,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add field");
    }
  }

  async function handleAddCreationField(label: string, fieldType: HrFieldType, isRequired: boolean) {
    if (!template) return;
    const nextSortOrder = (template.fields.reduce((m, f) => Math.max(m, f.sortOrder), 0) ?? 0) + 10;
    const seq = (template.fields.length + 1).toString().padStart(2, "0");
    try {
      await addHrField(template.id, {
        fieldKey: `create_${seq}_${Math.random().toString(36).slice(2, 6)}`,
        label: label.trim() || "New field",
        fieldType,
        ownerTeam: null,
        sectionId: null,
        isRequired,
        showOnCreate: false,
        placement: "creation",
        allowsNa: false,
        options: null,
        sortOrder: nextSortOrder,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add creation field");
    }
  }

  async function handleUpdateField(field: HrTemplateField, patch: Partial<HrTemplateField>) {
    try {
      const nextOptions = patch.options !== undefined ? patch.options : field.options;
      await updateHrField(field.id, {
        label:        patch.label        ?? field.label,
        fieldType:    patch.fieldType    ?? field.fieldType,
        ownerTeam:    patch.ownerTeam    !== undefined ? patch.ownerTeam    : field.ownerTeam,
        sectionId:    patch.sectionId    !== undefined ? patch.sectionId    : field.sectionId,
        isRequired:   patch.isRequired   ?? field.isRequired,
        showOnCreate: patch.showOnCreate ?? field.showOnCreate,
        placement:    patch.placement    ?? field.placement,
        allowsNa:     patch.allowsNa     ?? field.allowsNa,
        sourceKey:    patch.sourceKey    !== undefined ? patch.sourceKey : field.sourceKey,
        options:      nextOptions,
      });
      // An options-only edit (the grid column editor reordering/adding/typing a
      // column) doesn't change the form's structure, and the editor already
      // reflects the change from its own local state. A full reload() here just
      // causes a jarring flash. Patch the field in place instead and skip the
      // refetch; structural edits (label/type/section/etc.) still reload.
      const optionsOnly = Object.keys(patch).length === 1 && "options" in patch;
      if (optionsOnly) {
        setTemplate((t) =>
          t ? { ...t, fields: t.fields.map((f) => (f.id === field.id ? { ...f, options: nextOptions } : f)) } : t
        );
        return;
      }
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("FIELD_TYPE_LOCKED") || msg.toLowerCase().includes("locked")) {
        setError("This field's type is locked because records already hold values for it. Duplicate the template to change types.");
      } else {
        setError(msg);
      }
    }
  }

  // Dedicated path for the allows-N/A toggle so it works even when the
  // template is design-locked (records exist). The regular updateHrField
  // endpoint 409s in that case; this one hits a lock-bypassed endpoint and
  // only flips the single flag. Local state mirrors the change so the row
  // updates immediately.
  async function handleToggleAllowsNa(field: HrTemplateField, next: boolean) {
    if (!template) return;
    try {
      await setHrFieldAllowsNa(field.id, next);
      setTemplate({
        ...template,
        fields: template.fields.map((f) =>
          f.id === field.id ? { ...f, allowsNa: next } : f
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update N/A setting");
    }
  }

  async function performDeleteField(field: HrTemplateField) {
    try {
      await deleteHrField(field.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // ── Section ops ─────────────────────────────────────────────────────────
  async function createSection() {
    if (!template || !newSectionName.trim()) return;
    const nextSort = (template.sections.reduce((m, s) => Math.max(m, s.sortOrder), 0) ?? 0) + 10;
    try {
      await addHrSection(template.id, { name: newSectionName.trim(), sortOrder: nextSort });
      setNewSectionName("");
      setShowNewSection(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create section");
    }
  }

  async function renameSection(section: HrTemplateSection, name: string) {
    if (!name.trim() || name === section.name) return;
    try {
      // Pass the existing description through — the PUT replaces it, so
      // omitting it here would silently null a seeded section description.
      await updateHrSection(section.id, name.trim(), section.description);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    }
  }

  // Flips the section's "visible live to client" flag via the dedicated
  // lock-bypass endpoint (mirrors handleToggleAllowsNa — works even when the
  // template already has records, which is exactly when the client-visibility
  // outline gets applied). Local patch, no reload flash.
  async function handleToggleClientVisible(section: HrTemplateSection, next: boolean) {
    if (!template) return;
    try {
      await setHrSectionClientVisible(section.id, next);
      setTemplate({
        ...template,
        sections: template.sections.map((s) =>
          s.id === section.id ? { ...s, clientVisible: next } : s
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update client visibility");
    }
  }

  async function performDeleteSection(section: HrTemplateSection) {
    try {
      await deleteHrSection(section.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // ── DnD: reorder sections ──────────────────────────────────────────────
  async function handleReorderSections(event: DragEndEvent) {
    if (!template || !event.over || event.active.id === event.over.id) return;
    const ids = sectionsWithFields.map((s) => s.section.id);
    const oldIndex = ids.indexOf(event.active.id as number);
    const newIndex = ids.indexOf(event.over.id as number);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    const origOrders = template.sections.map((s) => s.sortOrder).sort((a, b) => a - b);
    const payload = reordered.map((id, i) => ({ sectionId: id, sortOrder: origOrders[i] ?? (i + 1) * 10 }));
    // Optimistic UI
    setTemplate({
      ...template,
      sections: template.sections.map((s) => {
        const p = payload.find((x) => x.sectionId === s.id);
        return p ? { ...s, sortOrder: p.sortOrder } : s;
      }),
    });
    try {
      await reorderHrSections(template.id, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
      await reload();
    }
  }

  // ── DnD: reorder fields (within / across sections) ─────────────────────
  async function handleReorderFields(
    group: HrTemplateField[],
    sectionId: number | null,
    event: DragEndEvent
  ) {
    if (!template || !event.over || event.active.id === event.over.id) return;
    const oldIndex = group.findIndex((f) => f.id === event.active.id);
    const newIndex = group.findIndex((f) => f.id === event.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(group, oldIndex, newIndex);
    const origOrders = group.map((f) => f.sortOrder).sort((a, b) => a - b);
    const patched = reordered.map((f, i) => ({
      fieldId: f.id,
      sortOrder: origOrders[i] ?? (i + 1) * 10,
      sectionId,
    }));
    // Optimistic local update
    setTemplate({
      ...template,
      fields: template.fields.map((f) => {
        const p = patched.find((x) => x.fieldId === f.id);
        return p ? { ...f, sortOrder: p.sortOrder, sectionId: p.sectionId } : f;
      }),
    });
    try {
      await reorderHrFields(template.id, patched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
      await reload();
    }
  }

  // ── Archive / hard-delete template ─────────────────────────────────────
  async function performArchive() {
    if (!template) return;
    try {
      await archiveHrTemplate(template.id);
      navigate(`/department/${deptCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    }
  }

  // Save-all handler — blurs the currently-focused element so its onBlur
  // save fires, then flashes the "Saved" tick for visual confirmation.
  // Drag, adds/deletes, and dropdown changes commit immediately on action;
  // only text inputs (template name/description, section name, field label,
  // owner team) need the blur nudge.
  async function handleSaveAll() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSaveFlash("saving");
    // Small delay so any onBlur-triggered PUT gets a chance to start;
    // saveTemplateMetadata/handleUpdateField will flip saving=true in parallel.
    await new Promise((r) => setTimeout(r, 400));
    setSaveFlash("saved");
    setTimeout(() => setSaveFlash((s) => (s === "saved" ? "idle" : s)), 1500);
  }

  // Ctrl/Cmd+S shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveAll();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function performDeleteTemplate() {
    if (!template) return;
    try {
      await deleteHrTemplate(template.id);
      navigate(`/department/${deptCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (loading || !template) {
    return (
      <DashboardLayout>
        <div className="mb-6">
          <Skeleton className="h-4 w-32 mb-3" />
          <Skeleton className="h-10 w-80 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5">
          <Skeleton className="h-3 w-40 mb-4" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
      </DashboardLayout>
    );
  }

  const sectionSensors = (
    <SectionsSortableWrapper
      sectionIds={sectionsWithFields.map((s) => s.section.id)}
      onDragEnd={handleReorderSections}
    >
      {sectionsWithFields.map(({ section, fields }) => (
        <SortableSection
          key={section.id}
          section={section}
          fields={fields}
          allSections={template.sections}
          sourceCatalog={metricCatalog}
          showSource={template.projectId != null}
          onRenameSection={(name) => renameSection(section, name)}
          onToggleClientVisible={(next) => handleToggleClientVisible(section, next)}
          onDeleteSection={() => setConfirmDeleteSection(section)}
          onAddField={() => handleAddField(section.id)}
          onReorderFields={(e) => handleReorderFields(fields, section.id, e)}
          onUpdateField={handleUpdateField}
          onToggleAllowsNa={handleToggleAllowsNa}
          onDeleteField={setConfirmDeleteField}
        />
      ))}
    </SectionsSortableWrapper>
  );

  // Design-lock: once any record is filed against this template its shape is
  // frozen. The backend enforces the same rule with a 409. We show a prominent
  // banner so the admin understands why field/section buttons below will fail.
  const designLocked = (template.recordCount ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link
          to={`/department/${deptCode}/templates/${tid}/records`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant/70 hover:text-primary transition-colors no-underline mb-3"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to records
        </Link>
        {designLocked && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 px-4 py-3 rounded-2xl border-2 border-primary/25 bg-primary/5"
          >
            <span className="material-symbols-outlined text-primary text-[22px] shrink-0 mt-0.5">
              lock
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-bold text-on-surface">Design is locked.</p>
              <p className="text-on-surface-variant/70 mt-0.5 leading-relaxed">
                This template has <strong className="text-on-surface">{fmt.int(template.recordCount)}</strong>{" "}
                {template.recordCount === 1 ? "record" : "records"} filed against
                it. Adding, editing, or removing fields and sections is disabled to
                keep record data consistent. You can still rename the template,
                update its description, archive it, or let users file more records.
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50 mb-1">
              Designer
            </p>
            <input
              type="text"
              value={template.name}
              onChange={(e) => setTemplate({ ...template, name: e.target.value })}
              onBlur={(e) => saveTemplateMetadata({ name: e.target.value || "Untitled" })}
              className="w-full text-3xl font-black tracking-tighter font-headline text-on-surface bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1"
            />
            <textarea
              rows={2}
              value={template.description ?? ""}
              onChange={(e) => setTemplate({ ...template, description: e.target.value })}
              onBlur={(e) => saveTemplateMetadata({ description: e.target.value || null })}
              placeholder="Add a description…"
              className="mt-2 w-full text-sm text-on-surface-variant bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 resize-none"
            />
            {/* Reporting-period config: when set, the New-record modal asks
                for the period (quarter / half / year / month), auto-fills the
                title from it, blocks duplicate periods, and the records page
                filters by period instead of created month. Not for project-
                scoped Operations templates (they have their own month flow). */}
            {template.projectId == null && (
              <div className="mt-2 inline-flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                  Reporting period
                </span>
                <select
                  value={template.periodKind ?? "none"}
                  onChange={(e) =>
                    saveTemplateMetadata({ periodKind: e.target.value as HrTemplatePeriodKind | "none" })
                  }
                  className="px-2 py-1 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/10 text-xs font-bold focus:outline-none focus:border-primary/30"
                >
                  <option value="none">None</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="month_or_quarter">Monthly or Quarterly</option>
                  <option value="half_or_year">Half-yearly or Yearly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              title="Save all changes (Ctrl+S)"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold transition-colors whitespace-nowrap ${
                saveFlash === "saved"
                  ? "bg-success hover:bg-success"
                  : "bg-primary hover:bg-primary-dim"
              }`}
            >
              {saveFlash === "saving" || saving ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  Saving…
                </>
              ) : saveFlash === "saved" ? (
                <>
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  Saved
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">archive</span>
              Archive
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteTemplate(true)}
              disabled={designLocked}
              title={designLocked ? "Template has records — archive it instead." : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-error/10 text-error text-xs font-bold hover:bg-error/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              Delete template
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-start gap-2">
          <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="text-error/70 hover:text-error"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Wrap all field/section surfaces so the design-lock dims interaction
          in one place instead of threading a `disabled` prop into every
          child component. The metadata (name/description at the top), Save,
          and Archive stay outside — those are allowed while locked. */}
      <div
        className={designLocked ? "opacity-55 pointer-events-none select-none" : undefined}
        aria-disabled={designLocked}
      >

      {/* ── Creation form: what the "New record" modal asks for ── */}
      <CreationFormCard
        titleLabel={template.titleLabel}
        onTitleLabelChange={(value) => saveTemplateMetadata({ titleLabel: value.trim() || "Title" })}
        creationFields={creationFields}
        onAddField={handleAddCreationField}
        onUpdateField={handleUpdateField}
        onToggleAllowsNa={handleToggleAllowsNa}
        onDeleteField={setConfirmDeleteField}
      />

      {/* ── Details bucket (metadata fields, no section) ── */}
      <DetailsBucket
        fields={detailsBucket}
        allSections={template.sections}
        sourceCatalog={metricCatalog}
        showSource={template.projectId != null}
        onAddField={() => handleAddField(null)}
        onReorderFields={(e) => handleReorderFields(detailsBucket, null, e)}
        onUpdateField={handleUpdateField}
        onToggleAllowsNa={handleToggleAllowsNa}
        onDeleteField={setConfirmDeleteField}
      />

      {/* ── Sections ── */}
      {sectionSensors}

      {/* ── New-section CTA ── */}
      <div className="bg-surface-container-low/50 rounded-2xl border border-dashed border-on-surface-variant/20 p-6 text-center">
        <button
          type="button"
          onClick={() => { setNewSectionName(""); setShowNewSection(true); }}
          className="btn-brand inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          New section
        </button>
        <p className="text-[11px] text-on-surface-variant/50 mt-2">
          Sections group related fields under a shared header. Drag fields between sections to reorganize.
        </p>
      </div>

      </div>{/* end design-lock wrapper */}

      {/* ── New-section modal ── */}
      {showNewSection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowNewSection(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-on-surface-variant/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold font-headline text-on-surface mb-4">
              New section
            </h3>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1.5">
              Section name
            </label>
            <input
              type="text"
              autoFocus
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSection(); }}
              placeholder="e.g. HR Documents"
              className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewSection(false)}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant/70 hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createSection}
                disabled={!newSectionName.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-colors disabled:opacity-50"
              >
                Create section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modals ── */}
      <ConfirmModal
        open={confirmArchive}
        title="Archive this template?"
        message="Existing records stay intact. The template is hidden from the Templates list but can be unarchived later."
        confirmLabel="Archive"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => { await performArchive(); setConfirmArchive(false); }}
      />
      <ConfirmModal
        open={confirmDeleteTemplate}
        title={`Hard-delete "${template.name}"?`}
        message={`This permanently removes the template, every section, every field, and every record underneath it. This cannot be undone.\n\nIf you just want to hide it, archive instead.`}
        confirmLabel="Delete template"
        variant="danger"
        requireTyped="DELETE"
        onCancel={() => setConfirmDeleteTemplate(false)}
        onConfirm={async () => { await performDeleteTemplate(); setConfirmDeleteTemplate(false); }}
      />
      <ConfirmModal
        open={confirmDeleteField !== null}
        title={`Delete field "${confirmDeleteField?.label ?? ""}"?`}
        message="This removes the field from this template and deletes any stored values for it across every existing record. This cannot be undone."
        confirmLabel="Delete field"
        variant="danger"
        requireTyped="DELETE"
        onCancel={() => setConfirmDeleteField(null)}
        onConfirm={async () => {
          if (confirmDeleteField) await performDeleteField(confirmDeleteField);
          setConfirmDeleteField(null);
        }}
      />
      <ConfirmModal
        open={confirmDeleteSection !== null}
        title={`Delete section "${confirmDeleteSection?.name ?? ""}"?`}
        message={`The section will be removed. Any fields inside move back to "Details" and keep their values — delete them separately if you want to clear the data.`}
        confirmLabel="Delete section"
        variant="danger"
        onCancel={() => setConfirmDeleteSection(null)}
        onConfirm={async () => {
          if (confirmDeleteSection) await performDeleteSection(confirmDeleteSection);
          setConfirmDeleteSection(null);
        }}
      />
    </DashboardLayout>
  );
}

// ── Creation form card ──────────────────────────────────────────────────
// Admins define creation fields directly here — label, type, required — with
// no coupling to the main template's checklist fields. Each row is a
// standalone creation field (placement='creation' on the backend), stored
// against the record just like any other value.
function CreationFormCard({
  titleLabel,
  onTitleLabelChange,
  creationFields,
  onAddField,
  onUpdateField,
  onToggleAllowsNa,
  onDeleteField,
}: {
  titleLabel: string;
  onTitleLabelChange: (value: string) => void;
  creationFields: HrTemplateField[];
  onAddField: (label: string, fieldType: HrFieldType, isRequired: boolean) => Promise<void>;
  onUpdateField: (f: HrTemplateField, patch: Partial<HrTemplateField>) => void;
  onToggleAllowsNa: (f: HrTemplateField, next: boolean) => void;
  onDeleteField: (f: HrTemplateField) => void;
}) {
  const [label, setLabel] = useState(titleLabel);
  useEffect(() => setLabel(titleLabel), [titleLabel]);

  // Inline draft for the new-creation-field row. No modal — just type label,
  // pick type, tick required, hit enter.
  const [draftLabel, setDraftLabel] = useState("");
  const [draftType, setDraftType] = useState<HrFieldType>("text");
  const [draftRequired, setDraftRequired] = useState(false);
  const [adding, setAdding] = useState(false);

  async function submitDraft() {
    if (!draftLabel.trim() || adding) return;
    setAdding(true);
    try {
      await onAddField(draftLabel.trim(), draftType, draftRequired);
      setDraftLabel("");
      setDraftType("text");
      setDraftRequired(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent p-6 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            edit_note
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-on-surface">
            Creation form
          </h3>
          <p className="text-xs text-on-surface-variant/70 mt-0.5">
            What the "New record" modal asks for. Define each question below — label, data type, required. Creation fields are independent of the checklist below.
          </p>
        </div>
      </div>

      {/* Record-name label */}
      <div className="mb-5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 block mb-1">
          Record name — label shown in the modal
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { if (label.trim() !== titleLabel) onTitleLabelChange(label); }}
          placeholder="Title"
          className="w-full md:w-80 px-3 py-2 bg-white rounded-lg border border-on-surface-variant/15 text-sm focus:outline-none focus:border-primary/40"
        />
      </div>

      {/* Existing creation fields */}
      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
        Extra questions
      </label>
      {creationFields.length === 0 ? (
        <div className="border border-dashed border-on-surface-variant/20 rounded-lg p-4 text-center mb-3">
          <p className="text-[11px] text-on-surface-variant/50">
            Just the record name for now. Add questions below to collect more info at creation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {creationFields.map((f, i) => (
            <CreationFieldRow
              key={f.id}
              index={i + 1}
              field={f}
              onUpdate={(patch) => onUpdateField(f, patch)}
              onToggleAllowsNa={(next) => onToggleAllowsNa(f, next)}
              onDelete={() => onDeleteField(f)}
            />
          ))}
        </div>
      )}

      {/* Inline add-field row */}
      <div className="rounded-lg border border-dashed border-primary/25 bg-white/70 p-3 flex items-center gap-2 flex-wrap">
        <span className="material-symbols-outlined text-primary/70 text-[18px]">add_circle</span>
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitDraft(); }}
          placeholder="Question label (e.g. Employee name)"
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30"
        />
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as HrFieldType)}
          className="px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-xs font-bold focus:outline-none focus:border-primary/30"
        >
          <option value="text">Text</option>
          <option value="textarea">Long text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="checkbox">Checkbox</option>
          <option value="select">Select</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/70">
          <input
            type="checkbox"
            checked={draftRequired}
            onChange={(e) => setDraftRequired(e.target.checked)}
            className="accent-primary"
          />
          Required
        </label>
        <button
          type="button"
          onClick={submitDraft}
          disabled={!draftLabel.trim() || adding}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-colors disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// Compact inline editor for an existing creation-placement field. No drag
// handle — creation fields ordering is simple enough that admins can delete
// and re-add if they want to change sequence. Keeps the row dense.
function CreationFieldRow({
  index,
  field,
  onUpdate,
  onToggleAllowsNa,
  onDelete,
}: {
  index: number;
  field: HrTemplateField;
  onUpdate: (patch: Partial<HrTemplateField>) => void;
  onToggleAllowsNa: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  useEffect(() => setLabel(field.label), [field.label]);
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-on-surface-variant/10 flex-wrap">
      <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold tabular-nums shrink-0">
        {index}
      </span>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() !== field.label) onUpdate({ label: label.trim() || "Untitled" }); }}
        className="flex-1 min-w-[200px] px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30"
      />
      <select
        value={field.fieldType}
        onChange={(e) => onUpdate({ fieldType: e.target.value as HrFieldType })}
        className="px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-xs font-bold focus:outline-none focus:border-primary/30"
      >
        <option value="text">Text</option>
        <option value="textarea">Long text</option>
        <option value="number">Number</option>
        <option value="date">Date</option>
        <option value="checkbox">Checkbox</option>
        <option value="select">Select</option>
      </select>
      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/70">
        <input
          type="checkbox"
          checked={field.isRequired}
          onChange={(e) => onUpdate({ isRequired: e.target.checked })}
          className="accent-primary"
        />
        Required
      </label>
      <AllowsNaToggle field={field} onChange={onToggleAllowsNa} />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete creation field"
        className="text-on-surface-variant/50 hover:text-error transition-colors p-1 rounded"
      >
        <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </div>
  );
}

// Standalone toggle: marks a field as "user can mark N/A on a record". Lives
// inside the design-lock wrapper but bypasses it (pointer-events-auto +
// dedicated lock-bypass endpoint), because flipping this flag is non-
// destructive and explicitly allowed even when records exist.
function AllowsNaToggle({
  field,
  onChange,
}: {
  field: HrTemplateField;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/70 pointer-events-auto"
      title="Lets users mark this field N/A on a record. Editable even after the template has records."
    >
      <input
        type="checkbox"
        checked={field.allowsNa}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary pointer-events-auto"
      />
      Allows N/A
    </label>
  );
}

// ── Details bucket (no section_id) ───────────────────────────────────────
function DetailsBucket({
  fields,
  allSections,
  sourceCatalog,
  showSource,
  onAddField,
  onReorderFields,
  onUpdateField,
  onToggleAllowsNa,
  onDeleteField,
}: {
  fields: HrTemplateField[];
  allSections: HrTemplateSection[];
  sourceCatalog: MetricCatalogEntry[];
  showSource: boolean;
  onAddField: () => void;
  onReorderFields: (e: DragEndEvent) => void;
  onUpdateField: (f: HrTemplateField, patch: Partial<HrTemplateField>) => void;
  onToggleAllowsNa: (f: HrTemplateField, next: boolean) => void;
  onDeleteField: (f: HrTemplateField) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50">
            Details
          </p>
          <p className="text-[11px] text-on-surface-variant/50 mt-0.5">
            Record-level metadata that sits outside any section.
          </p>
        </div>
        <span className="text-[11px] text-on-surface-variant/50 tabular-nums">{fields.length}</span>
      </div>

      {fields.length === 0 ? (
        <div className="border border-dashed border-on-surface-variant/15 rounded-lg p-6 text-center mb-3">
          <span className="material-symbols-outlined text-on-surface-variant/30 text-[28px]">south</span>
          <p className="text-[11px] text-on-surface-variant/50 mt-1 max-w-sm mx-auto">
            No metadata fields yet. Add one below for record-level info like name or date.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorderFields}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {fields.map((f) => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  allSections={allSections}
                  sourceCatalog={sourceCatalog}
                  showSource={showSource}
                  onUpdate={(p) => onUpdateField(f, p)}
                  onToggleAllowsNa={(next) => onToggleAllowsNa(f, next)}
                  onDelete={() => onDeleteField(f)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={onAddField}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dim transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add field to Details
        </button>
      </div>
    </div>
  );
}

// ── Sortable section wrapper (reorders sections themselves) ──────────────
function SectionsSortableWrapper({
  sectionIds,
  onDragEnd,
  children,
}: {
  sectionIds: number[];
  onDragEnd: (e: DragEndEvent) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

// ── One sortable section with its own sortable field list ────────────────
function SortableSection({
  section,
  fields,
  allSections,
  sourceCatalog,
  showSource,
  onRenameSection,
  onToggleClientVisible,
  onDeleteSection,
  onAddField,
  onReorderFields,
  onUpdateField,
  onToggleAllowsNa,
  onDeleteField,
}: {
  section: HrTemplateSection;
  fields: HrTemplateField[];
  allSections: HrTemplateSection[];
  sourceCatalog: MetricCatalogEntry[];
  showSource: boolean;
  onRenameSection: (name: string) => void;
  onToggleClientVisible: (next: boolean) => void;
  onDeleteSection: () => void;
  onAddField: () => void;
  onReorderFields: (e: DragEndEvent) => void;
  onUpdateField: (f: HrTemplateField, patch: Partial<HrTemplateField>) => void;
  onToggleAllowsNa: (f: HrTemplateField, next: boolean) => void;
  onDeleteField: (f: HrTemplateField) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  const fieldSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [name, setName] = useState(section.name);
  useEffect(() => setName(section.name), [section.name]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl border border-on-surface-variant/5 p-6 mb-5 ${
        isDragging ? "ring-2 ring-primary/30" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          aria-label="Drag to reorder section"
          className="cursor-grab active:cursor-grabbing text-on-surface-variant/40 hover:text-on-surface-variant/70 p-0.5 touch-none"
          {...attributes}
          {...listeners}
        >
          <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRenameSection(name)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="flex-1 text-base font-bold text-on-surface bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 py-0.5"
        />
        <span className="text-[11px] text-on-surface-variant/50 tabular-nums">{fields.length}</span>
        {/* Client live-visibility chip. Works even on design-locked templates
            (dedicated lock-bypass endpoint) — that's the whole point: the
            visibility outline is applied AFTER the report is in use. */}
        <button
          type="button"
          onClick={() => onToggleClientVisible(!section.clientVisible)}
          title={
            section.clientVisible
              ? "Clients can see this section live (read-only). Click to hide it from the client live view."
              : "Hidden from clients (they only get published PDFs). Click to show this section live to clients."
          }
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
            section.clientVisible
              ? "bg-primary/10 border-primary/25 text-primary hover:bg-primary/15"
              : "border-dashed border-on-surface-variant/25 text-on-surface-variant/60 hover:bg-surface-container-low/60"
          }`}
        >
          <span className="material-symbols-outlined text-[12px]">
            {section.clientVisible ? "visibility" : "visibility_off"}
          </span>
          {section.clientVisible ? "Client: live" : "Client: PDF only"}
        </button>
        <button
          type="button"
          onClick={onDeleteSection}
          aria-label="Delete section"
          className="text-on-surface-variant/40 hover:text-error transition-colors p-1 rounded"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>

      {fields.length === 0 ? (
        <div className="border border-dashed border-on-surface-variant/15 rounded-lg p-5 text-center mb-3">
          <p className="text-[11px] text-on-surface-variant/50">
            Empty section — add a field below, or drag a field here.
          </p>
        </div>
      ) : (
        <DndContext sensors={fieldSensors} collisionDetection={closestCenter} onDragEnd={onReorderFields}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {fields.map((f) => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  allSections={allSections}
                  sourceCatalog={sourceCatalog}
                  showSource={showSource}
                  onUpdate={(p) => onUpdateField(f, p)}
                  onToggleAllowsNa={(next) => onToggleAllowsNa(f, next)}
                  onDelete={() => onDeleteField(f)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={onAddField}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dim transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add field to this section
        </button>
      </div>
    </div>
  );
}

// ── Sortable field row ──────────────────────────────────────────────────
// Section moves via the dropdown (explicit choice) rather than cross-drag,
// which matches the drag-within-one-section model used by dnd-kit's
// SortableContext. Cross-section drag would require a separate multi-
// container setup; the dropdown is simpler and more discoverable.
function SortableFieldRow({
  field,
  allSections,
  sourceCatalog,
  showSource,
  onUpdate,
  onToggleAllowsNa,
  onDelete,
}: {
  field: HrTemplateField;
  allSections: HrTemplateSection[];
  sourceCatalog: MetricCatalogEntry[];
  showSource: boolean;
  onUpdate: (p: Partial<HrTemplateField>) => void;
  onToggleAllowsNa: (next: boolean) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const [label, setLabel] = useState(field.label);
  const [ownerTeam, setOwnerTeam] = useState(field.ownerTeam ?? "");
  useEffect(() => { setLabel(field.label); setOwnerTeam(field.ownerTeam ?? ""); }, [field]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg border border-on-surface-variant/10 bg-surface-container-low/30 flex-wrap ${
        isDragging ? "ring-2 ring-primary/30" : ""
      }`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab active:cursor-grabbing text-on-surface-variant/40 hover:text-on-surface-variant/70 p-0.5 touch-none"
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </button>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() !== field.label) onUpdate({ label: label.trim() || "Untitled" }); }}
        placeholder="Field label"
        className="flex-1 min-w-[180px] px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30"
      />
      <input
        type="text"
        value={ownerTeam}
        onChange={(e) => setOwnerTeam(e.target.value)}
        onBlur={() => {
          const trimmed = ownerTeam.trim();
          if (trimmed !== (field.ownerTeam ?? "")) onUpdate({ ownerTeam: trimmed || null });
        }}
        placeholder="Owner (optional)"
        className="w-40 px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-xs focus:outline-none focus:border-primary/30"
      />
      <div className="flex items-center gap-2 ml-auto">
        <select
          value={field.sectionId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onUpdate({ sectionId: v === "" ? null : Number(v) });
          }}
          className="px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-xs focus:outline-none focus:border-primary/30"
          aria-label="Move to section"
          title="Move to section"
        >
          <option value="">Details</option>
          {allSections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={field.fieldType}
          onChange={(e) => {
            const ft = e.target.value as HrFieldType;
            // Reset options to match the new type so a field can't carry
            // orphaned config (e.g. grid columns left on a text field). Grid
            // keeps existing columns if it was already a grid, else starts empty.
            const nextOptions =
              ft === "grid"
                ? (asGridOptions(field.options) ?? { columns: [] })
                : null;
            onUpdate({ fieldType: ft, options: nextOptions });
          }}
          className="px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-xs font-bold focus:outline-none focus:border-primary/30"
        >
          <option value="text">Text</option>
          <option value="textarea">Long text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="checkbox">Checkbox</option>
          <option value="select">Select</option>
          <option value="grid">Table (grid)</option>
          <option value="note">Note (read-only)</option>
        </select>
        {/* Operations: bind this field to an auto-fill data source. When a live
            source is selected the field renders read-only on the record page
            and is populated from that month's data. "Planned" sources stay
            manual until their data feed is wired. */}
        {showSource && field.fieldType !== "note" && field.fieldType !== "grid" && (
          <select
            value={field.sourceKey ?? ""}
            onChange={(e) => onUpdate({ sourceKey: e.target.value === "" ? null : e.target.value })}
            className="px-3 py-1.5 bg-white rounded-lg border border-on-surface-variant/10 text-xs focus:outline-none focus:border-primary/30 max-w-[200px]"
            aria-label="Auto-fill source"
            title="Auto-fill data source (Operations)"
          >
            <option value="">Manual (no source)</option>
            {sourceCatalog.map((m) => (
              <option key={m.key} value={m.key}>
                {m.status === "planned" ? "◦ " : ""}{m.label}
              </option>
            ))}
          </select>
        )}
        {/* "Required" is meaningless for a read-only note. "Allows N/A" is
            meaningless for notes and grids (N/A isn't rendered for them on the
            record page), so hide those controls to avoid silent no-ops. */}
        {field.fieldType !== "note" && (
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant/70">
            <input
              type="checkbox"
              checked={field.isRequired}
              onChange={(e) => onUpdate({ isRequired: e.target.checked })}
              className="accent-primary"
            />
            Required
          </label>
        )}
        {field.fieldType !== "note" && field.fieldType !== "grid" && (
          <AllowsNaToggle field={field} onChange={onToggleAllowsNa} />
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete field"
          className="text-on-surface-variant/50 hover:text-error transition-colors p-1 rounded"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>

      {/* Grid fields get an inline column editor (full-width, wraps below the
          row). Editing options goes through the same updateHrField path, so
          it's design-locked once the template has records. */}
      {field.fieldType === "grid" && (
        <div className="basis-full w-full mt-2">
          <GridColumnsEditor field={field} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ── Grid column editor ────────────────────────────────────────────────────
// Lets an admin define a grid field's columns (label, type, and — for select
// columns — the option list) plus an optional help line. Commits the whole
// { help, columns } object to the field's `options` on each structural change
// or input blur. Column `key` is slugified from the label on creation and kept
// stable afterwards so existing row data keeps matching.
function GridColumnsEditor({
  field,
  onUpdate,
}: {
  field: HrTemplateField;
  onUpdate: (p: Partial<HrTemplateField>) => void;
}) {
  const parsed = asGridOptions(field.options);
  const [help, setHelp] = useState(parsed?.help ?? "");
  const [columns, setColumns] = useState<HrGridColumn[]>(parsed?.columns ?? []);

  useEffect(() => {
    const p = asGridOptions(field.options);
    setHelp(p?.help ?? "");
    setColumns(p?.columns ?? []);
  }, [field.id]); // re-sync when the row is swapped for a different field

  function commit(nextCols: HrGridColumn[], nextHelp: string) {
    onUpdate({ options: { help: nextHelp || undefined, columns: nextCols } });
  }

  function slugKey(label: string, taken: Set<string>): string {
    let base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!base) base = "col";
    let key = base;
    let n = 2;
    while (taken.has(key)) key = `${base}_${n++}`;
    return key;
  }

  function addColumn() {
    const taken = new Set(columns.map((c) => c.key));
    const next = [...columns, { key: slugKey(`col_${columns.length + 1}`, taken), label: "", type: "text" as HrGridColumnType }];
    setColumns(next);
    commit(next, help);
  }

  function updateColumn(idx: number, patch: Partial<HrGridColumn>) {
    const next = columns.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setColumns(next);
    commit(next, help);
  }

  function removeColumn(idx: number) {
    const next = columns.filter((_, i) => i !== idx);
    setColumns(next);
    commit(next, help);
  }

  function moveColumn(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= columns.length) return;
    const next = columns.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setColumns(next);
    commit(next, help);
  }

  const cellCls =
    "px-2 py-1 rounded-md text-xs border border-on-surface-variant/15 bg-white focus:outline-none focus:border-primary/30";

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-primary/80 mb-2">
        Table columns
      </p>

      <div className="flex flex-col gap-1.5">
        {columns.length === 0 && (
          <p className="text-[11px] text-on-surface-variant/50 italic">No columns yet — add the first one.</p>
        )}
        {columns.map((c, i) => (
          <div key={c.key} className="flex items-center gap-1.5 flex-wrap">
            <div className="flex flex-col">
              <button type="button" onClick={() => moveColumn(i, -1)} disabled={i === 0}
                className="text-on-surface-variant/40 hover:text-on-surface-variant disabled:opacity-20 leading-none" aria-label="Move up">
                <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
              </button>
              <button type="button" onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1}
                className="text-on-surface-variant/40 hover:text-on-surface-variant disabled:opacity-20 leading-none" aria-label="Move down">
                <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
              </button>
            </div>
            <input
              type="text"
              defaultValue={c.label}
              placeholder="Column label"
              onBlur={(e) => { if (e.target.value !== c.label) updateColumn(i, { label: e.target.value }); }}
              className={`${cellCls} flex-1 min-w-[140px]`}
            />
            <select
              value={c.type}
              onChange={(e) => updateColumn(i, { type: e.target.value as HrGridColumnType })}
              className={`${cellCls} font-bold`}
            >
              <option value="text">Text</option>
              <option value="textarea">Text (multi-line)</option>
              <option value="number">Number</option>
              <option value="percent">Percent</option>
              <option value="date">Date</option>
              <option value="select">Select</option>
              <option value="rag">RAG (status + date)</option>
            </select>
            {c.type === "select" && (
              <input
                type="text"
                defaultValue={(c.options ?? []).join(", ")}
                placeholder="Options, comma-separated"
                onBlur={(e) => {
                  const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  updateColumn(i, { options: opts });
                }}
                className={`${cellCls} flex-1 min-w-[160px]`}
              />
            )}
            <button type="button" onClick={() => removeColumn(i)} aria-label="Remove column"
              className="text-on-surface-variant/40 hover:text-error p-0.5">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:bg-primary/5 px-2 py-1 rounded-md"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Add column
        </button>
        <input
          type="text"
          defaultValue={help}
          placeholder="Optional help text shown above the table"
          onBlur={(e) => { if (e.target.value !== help) { setHelp(e.target.value); commit(columns, e.target.value); } }}
          className={`${cellCls} flex-1 min-w-[200px]`}
        />
      </div>
    </div>
  );
}
