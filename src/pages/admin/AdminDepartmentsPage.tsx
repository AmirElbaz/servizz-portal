import { useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Modal from "../../components/admin/Modal";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import SaveButton from "../../components/admin/SaveButton";
import RequiredMark from "../../components/admin/RequiredMark";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton, { SkeletonTableRow } from "../../components/admin/Skeleton";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  uploadDepartmentIcon,
  departmentIconUrl,
  type AdminDepartment,
} from "../../services/admin";
import { fmt } from "../../utils/fmt";

type EditState =
  | { mode: "create" }
  | { mode: "edit"; department: AdminDepartment }
  | null;

type FormState = {
  code: string;
  name: string;
  description: string;
  icon: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = { code: "", name: "", description: "", icon: "" };

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState>(null);
  const [deleting, setDeleting] = useState<AdminDepartment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function reload() {
    try {
      setLoading(true);
      const rows = await listDepartments();
      setDepartments(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setInitialForm(EMPTY_FORM);
    setErrors({});
    setPendingFile(null);
    setFilePreview(null);
    setModalError(null);
    setEditing({ mode: "create" });
  }

  function openEdit(dept: AdminDepartment) {
    const initial: FormState = {
      code: dept.code,
      name: dept.name,
      description: dept.description ?? "",
      icon: dept.icon ?? "",
    };
    setForm(initial);
    setInitialForm(initial);
    setErrors({});
    setPendingFile(null);
    setFilePreview(null);
    setModalError(null);
    setEditing({ mode: "edit", department: dept });
  }

  function isDirty(): boolean {
    if (pendingFile) return true;
    return (
      form.code !== initialForm.code ||
      form.name !== initialForm.name ||
      form.description !== initialForm.description ||
      form.icon !== initialForm.icon
    );
  }

  // Actually dismisses the modal without prompting. Called either directly
  // (save flow) or after the user confirms discard.
  function doCloseModal() {
    setEditing(null);
    setPendingFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    setModalError(null);
  }

  // Attempts close — if the form is dirty, opens the discard ConfirmDialog
  // instead of closing directly. Wired to Modal.onClose and onBeforeClose.
  function requestCloseModal(): boolean {
    if (isDirty()) {
      setConfirmDiscard(true);
      return false;
    }
    doCloseModal();
    return true;
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setErrors((prev) => ({ ...prev, icon: "File too large. Max 500KB." }));
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setErrors((prev) => ({ ...prev, icon: "Use PNG, SVG, JPG, or WebP." }));
      return;
    }
    setErrors((prev) => ({ ...prev, icon: undefined }));
    setPendingFile(file);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(URL.createObjectURL(file));
  }

  function clearFile() {
    setPendingFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    if (editing?.mode === "create" && !form.code.trim())
      errs.code = "Code is required.";
    if (editing?.mode === "create" && form.code.trim() && !/^[a-z0-9-]+$/.test(form.code.trim()))
      errs.code = "Use lowercase letters, numbers, and hyphens only.";
    return errs;
  }

  async function save() {
    if (!editing) return;
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) throw new Error("validation");

    setModalError(null);

    let id: number;
    if (editing.mode === "create") {
      const created = await createDepartment({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
      });
      id = created.id;
    } else {
      await updateDepartment(editing.department.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
      });
      id = editing.department.id;
    }

    if (pendingFile) {
      await uploadDepartmentIcon(id, pendingFile);
    }

    await reload();
    // Snapshot the new "clean" state so close doesn't trigger discard prompt.
    setInitialForm({ ...form });
    setPendingFile(null);
    setTimeout(() => doCloseModal(), 900);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteDepartment(deleting.id);
      setDeleting(null);
      setActionError(null);
      await reload();
    } catch (e) {
      setDeleting(null);
      setActionError(e instanceof Error ? e.message : "Failed to delete department");
    }
  }

  // ── Shared helper to render a department's current icon ──
  function renderIcon(icon: string | null, size = 22) {
    const url = departmentIconUrl(icon);
    if (url) {
      return (
        <img
          src={url}
          alt=""
          className="object-contain"
          style={{ width: size, height: size }}
        />
      );
    }
    return (
      <span
        className="material-symbols-outlined text-on-surface-variant"
        style={{ fontSize: size }}
      >
        {icon || "domain"}
      </span>
    );
  }

  // ── Modal icon preview — prefers picked file, then existing icon field ──
  function renderModalPreview() {
    if (filePreview) {
      return (
        <img
          src={filePreview}
          alt="Preview"
          className="w-16 h-16 object-contain rounded-xl bg-white border border-on-surface-variant/10 p-2"
        />
      );
    }
    const url = departmentIconUrl(form.icon || null);
    if (url) {
      return (
        <img
          src={url}
          alt=""
          className="w-16 h-16 object-contain rounded-xl bg-white border border-on-surface-variant/10 p-2"
        />
      );
    }
    return (
      <div className="w-16 h-16 rounded-xl bg-surface-container-high/60 border border-on-surface-variant/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-on-surface-variant/60">
          {form.icon || "domain"}
        </span>
      </div>
    );
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Departments"
        description="Define the organizational departments (HR, Finance, etc.) that can be attached to projects."
        action={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dim text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Department
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 overflow-hidden">
        {loading ? (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low/60">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    <th className="px-6 py-3">Icon</th>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface-variant/8">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonTableRow
                      key={i}
                      widths={["w-6", "w-16", "w-32", "w-full", "w-36"]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-on-surface-variant/8">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="p-4 flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : departments.length === 0 ? (
          <div className="p-10 text-center text-on-surface-variant/60 text-sm">
            No departments yet. Click "New Department" to create one.
          </div>
        ) : (
          <>
            {/* ── Desktop / tablet: full table ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low/60">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    <th className="px-6 py-3">Icon</th>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface-variant/8">
                  {departments.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="px-6 py-4">{renderIcon(d.icon, 22)}</td>
                      <td className="px-6 py-4">
                        <code className="text-[11px] font-semibold uppercase tracking-wider text-primary bg-primary/8 px-2 py-0.5 rounded">
                          {d.code}
                        </code>
                      </td>
                      <td className="px-6 py-4 font-semibold text-on-surface">{d.name}</td>
                      <td className="px-6 py-4 text-on-surface-variant">{d.description ?? "—"}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2 flex-nowrap">
                          <button
                            onClick={() => openEdit(d)}
                            className="inline-flex items-center justify-center min-w-[4.5rem] px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleting(d)}
                            className="inline-flex items-center justify-center min-w-[4.5rem] px-3 py-1.5 rounded-lg text-xs font-semibold text-error bg-error/8 hover:bg-error/15 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile: stacked card list ── */}
            <ul className="md:hidden divide-y divide-on-surface-variant/8">
              {departments.map((d) => (
                <li key={d.id} className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-high/60 flex items-center justify-center shrink-0">
                      {renderIcon(d.icon, 22)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-sm text-on-surface truncate">{d.name}</p>
                      <code className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/8 px-1.5 py-0.5 rounded mt-1 inline-block">
                        {d.code}
                      </code>
                      {d.description && (
                        <p className="text-[11px] text-on-surface-variant/70 mt-1.5">
                          {d.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(d)}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(d)}
                      aria-label={`Delete ${d.name}`}
                      className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg text-on-surface-variant/60 hover:text-error hover:bg-error/8 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing?.mode === "create" ? "New Department" : "Edit Department"}
        onClose={doCloseModal}
        onBeforeClose={requestCloseModal}
        width="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => requestCloseModal()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              onSave={save}
              size="sm"
              onError={(err) => setModalError(err.message)}
            >
              {editing?.mode === "create" ? "Create" : "Save"}
            </SaveButton>
          </>
        }
      >
        <ErrorBanner message={modalError} onDismiss={() => setModalError(null)} />
        <div className="space-y-4">
          {editing?.mode === "create" && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                Code <RequiredMark />
              </label>
              <input
                value={form.code}
                onChange={(e) => {
                  setForm({ ...form, code: e.target.value });
                  if (errors.code) setErrors({ ...errors, code: undefined });
                }}
                placeholder="e.g. hr"
                className={`w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border text-on-surface text-sm focus:outline-none focus:bg-white transition-all ${
                  errors.code
                    ? "border-error/50 focus:border-error/60"
                    : "border-on-surface-variant/8 focus:border-primary/30"
                }`}
              />
              {errors.code && (
                <p className="text-xs text-error mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {errors.code}
                </p>
              )}
              <p className="text-[11px] text-on-surface-variant/50 mt-1.5">
                URL slug — lowercase letters, numbers, and hyphens.
              </p>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
              Name <RequiredMark />
            </label>
            <input
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              placeholder="e.g. Human Resources"
              className={`w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border text-on-surface text-sm focus:outline-none focus:bg-white transition-all ${
                errors.name
                  ? "border-error/50 focus:border-error/60"
                  : "border-on-surface-variant/8 focus:border-primary/30"
              }`}
            />
            {errors.name && (
              <p className="text-xs text-error mt-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary/30 focus:bg-white transition-all resize-none"
            />
          </div>

          {/* ── Icon uploader ────────────────────────────────────────────── */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
              Icon
            </label>
            <div className="flex items-start gap-4">
              {renderModalPreview()}
              <div className="flex-1 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleFilePicked}
                  className="hidden"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload</span>
                    {pendingFile ? "Replace image" : "Upload image"}
                  </button>
                  {(pendingFile || form.icon) && (
                    <button
                      type="button"
                      onClick={() => {
                        clearFile();
                        setForm({ ...form, icon: "" });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {pendingFile && (
                  <p className="text-[11px] text-on-surface-variant/70 mt-2 truncate">
                    Ready to upload: <span className="font-semibold">{pendingFile.name}</span>{" "}
                    ({fmt.int(Math.round(pendingFile.size / 1024))} KB)
                  </p>
                )}
                {errors.icon && (
                  <p className="text-xs text-error mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {errors.icon}
                  </p>
                )}
                <p className="text-[11px] text-on-surface-variant/50 mt-2">
                  PNG, SVG, JPG, or WebP · up to 500 KB · or enter a Material Symbols name below.
                </p>
                {!pendingFile && (
                  <input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    placeholder="e.g. badge, domain, attach_money"
                    className="w-full mt-2 px-3 py-2 bg-surface-container-high/60 rounded-lg border border-on-surface-variant/8 text-on-surface text-xs focus:outline-none focus:border-primary/30 focus:bg-white transition-all"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete department?"
        message={
          deleting
            ? `Are you sure you want to delete "${deleting.name}"? This will also remove it from any projects it is attached to.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        message="You have unsaved changes in this department. Close anyway and lose them?"
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          doCloseModal();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </AdminLayout>
  );
}
