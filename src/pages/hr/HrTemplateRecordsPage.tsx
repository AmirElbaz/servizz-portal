import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Skeleton from "../../components/admin/Skeleton";
import ConfirmModal from "../../components/ui/ConfirmModal";
import {
  listHrRecords,
  getHrTemplate,
  createHrRecord,
  exportHrTemplatePdf,
  exportHrTemplateExcel,
  deleteHrRecord,
  type HrRecordSummary,
  type HrTemplateDetail,
  type HrTemplateField,
  type HrRecordStatus,
  type HrValuePatch,
} from "../../services/hr";
import { pushRecentItem } from "../../hooks/useRecentItems";
import { useAuth, roleAtLeast } from "../../services/auth";

// Records list for a single template. Default landing route — clicked from
// the dept page template card. Admin / any-HR-access user can:
//   - Filter by search / status / updatedSince
//   - Page through (server-paginated at pageSize=50)
//   - Create a new record (redirects into the record detail)
//   - Export all filtered records as one PDF
//   - Jump to the Designer (sibling route) for structural edits
export default function HrTemplateRecordsPage() {
  const { deptCode, templateId } = useParams<{ deptCode: string; templateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // HR template / record management is a centrecom_user (staff) capability.
  const isAdmin = roleAtLeast(user?.role, "centrecom_user");
  const tid = Number(templateId);

  const [template, setTemplate] = useState<HrTemplateDetail | null>(null);
  const [rows, setRows] = useState<HrRecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HrRecordStatus | "">("");
  // Month filter: empty = all, else YYYY-MM (e.g., "2026-04").
  // Default to the current month so the page opens scoped to "this month"
  // rather than every record ever filed — admins explicitly broaden via the
  // "All months" option when they need history.
  const [createdMonth, setCreatedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = idle; "pdf" / "xlsx" while that specific export is in flight.
  // Tracks per-format so we can spin only the active button and leave the
  // other one disabled-but-not-spinning.
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newValues, setNewValues] = useState<Record<number, HrValuePatch>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrRecordSummary | null>(null);

  // Last-12-months list for the month filter dropdown. Generated client-side
  // so the filter always offers a reasonable rolling window without a second
  // API call to populate it.
  const monthOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString(undefined, { month: "short", year: "numeric" });
      out.push({ value, label });
    }
    return out;
  }, []);

  // Fields the New-record modal should ask for (placement='creation').
  const creationFields = useMemo(() => {
    if (!template) return [] as HrTemplateField[];
    return template.fields
      .filter((f) => f.placement === "creation")
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [template]);

  useEffect(() => {
    if (!Number.isFinite(tid)) return;
    getHrTemplate(tid)
      .then((r) => {
        setTemplate(r.data);
        if (deptCode) {
          pushRecentItem({
            kind: "hr-template",
            id: `${deptCode}/${tid}`,
            label: r.data.name,
            // Use the template's section name (e.g. "Quality & Training
            // Reports", "Servizz Projects") so QA templates don't show up as
            // "HR Templates" in recents.
            sublabel: r.data.groupName ?? "Templates",
            icon: "checklist",
            href: `/department/${deptCode}/templates/${tid}/records`,
          });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load template"));
  }, [tid, deptCode]);

  async function reloadRows() {
    if (!Number.isFinite(tid)) return;
    try {
      setLoading(true);
      const res = await listHrRecords(tid, {
        search: search || undefined,
        status: status || undefined,
        createdMonth: createdMonth || undefined,
        page,
        pageSize,
      });
      setRows(res.rows);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }

  // Debounce search input so we don't hammer the API on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(1);
      reloadRows();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    reloadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, createdMonth, page, tid]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  // Required creation fields that aren't filled yet. Used to block Create
  // and surface an inline error inside the modal.
  const missingRequiredOnCreate = useMemo(() => {
    return creationFields.filter((f) => f.isRequired && !isCreationFieldFilled(f, newValues[f.id]));
  }, [creationFields, newValues]);

  async function handleCreate() {
    if (!newTitle.trim() || !Number.isFinite(tid)) return;
    if (missingRequiredOnCreate.length > 0) return;
    try {
      setCreating(true);
      const values = Object.values(newValues).filter((v) =>
        v.valueText != null || v.valueNumber != null ||
        v.valueDate != null || v.valueBool != null
      );
      const { data } = await createHrRecord(tid, newTitle.trim(), values);
      navigate(`/department/${deptCode}/templates/${tid}/records/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create record");
    } finally {
      setCreating(false);
    }
  }

  function patchNewValue(fieldId: number, patch: Partial<HrValuePatch>) {
    setNewValues((prev) => {
      const current = prev[fieldId] ?? { fieldId };
      return { ...prev, [fieldId]: { ...current, ...patch } };
    });
  }

  function openNewModal() {
    setNewTitle("");
    setNewValues({});
    setShowNewModal(true);
  }

  async function handleExportAll(format: "pdf" | "xlsx") {
    if (!template || exporting) return;
    try {
      setExporting(format);
      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const filename = `${template.code}-all-${date}.${format}`;
      const params = {
        search: search || undefined,
        status: status || undefined,
      };
      if (format === "pdf") await exportHrTemplatePdf(tid, filename, params);
      else await exportHrTemplateExcel(tid, filename, params);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  async function performDeleteRow(rid: number) {
    try {
      await deleteHrRecord(rid);
      await reloadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link
          to={`/department/${deptCode}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant/70 hover:text-primary transition-colors no-underline mb-3"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to department
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tighter font-headline text-on-surface mb-1">
              {template?.name ?? "Template"}
            </h1>
            {template?.description && (
              <p className="text-sm text-on-surface-variant/70 max-w-2xl">
                {template.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Design is admin-only. Non-admins don't see the entry point;
                even if they deep-linked, the Designer page itself redirects
                them and the backend rejects structure mutations. */}
            {isAdmin && (
              <Link
                to={`/department/${deptCode}/templates/${tid}/design`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors no-underline"
              >
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Design
              </Link>
            )}
            <button
              type="button"
              onClick={() => handleExportAll("pdf")}
              disabled={exporting !== null || rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              {exporting === "pdf" ? (
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              )}
              {exporting === "pdf" ? "Exporting…" : "All PDF"}
            </button>
            <button
              type="button"
              onClick={() => handleExportAll("xlsx")}
              disabled={exporting !== null || rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              {exporting === "xlsx" ? (
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">table_view</span>
              )}
              {exporting === "xlsx" ? "Exporting…" : "All Excel"}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={openNewModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New record
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* ── Filter row ── */}
      <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or any creation field…"
            className="w-full pl-10 pr-4 py-2 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/8 text-sm focus:outline-none focus:border-primary/30 focus:bg-white transition-all"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["", "open", "completed"] as const).map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => { setPage(1); setStatus(s); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                status === s
                  ? "bg-primary/10 text-primary"
                  : "text-on-surface-variant/70 hover:bg-surface-container-high/40"
              }`}
            >
              {s === "" ? "All" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/8">
          <label
            htmlFor="created-month"
            className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 pl-1"
          >
            Month
          </label>
          <select
            id="created-month"
            value={createdMonth}
            onChange={(e) => { setPage(1); setCreatedMonth(e.target.value); }}
            className="bg-transparent text-sm focus:outline-none pr-1"
          >
            <option value="">All months</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Records table ── */}
      <div className="bg-white rounded-2xl border border-on-surface-variant/5 overflow-hidden">
        {loading ? (
          <div className="p-4 flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 mb-2">
              inbox
            </span>
            <p className="text-sm text-on-surface-variant/60">
              {total === 0
                ? isAdmin
                  ? "No records yet. Click New record to create the first one."
                  : "No records yet."
                : "No records match your filters."}
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead className="bg-surface-container-low/50">
              <tr>
                <th className="tbl-th">Name</th>
                <th className="tbl-th">Progress</th>
                <th className="tbl-th">Status</th>
                <th className="tbl-th">Updated</th>
                {isAdmin && <th className="tbl-th w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.total > 0 ? Math.round((100 * r.done) / r.total) : 0;
                return (
                  <tr key={r.id} className="tbl-tr">
                    <td className="tbl-td-strong">
                      <Link
                        to={`/department/${deptCode}/templates/${tid}/records/${r.id}`}
                        className="hover:text-primary no-underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="tbl-td">
                      {r.total > 0 ? (
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <div className="flex-1 h-1.5 bg-surface-container-high/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct === 100 ? "bg-success" : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span
                            className={`text-[12px] font-bold shrink-0 tabular-nums ${
                              pct === 100 ? "text-success" : "text-on-surface-variant/70"
                            }`}
                          >
                            {r.done}/{r.total}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-on-surface-variant/40 italic">—</span>
                      )}
                    </td>
                    <td className="tbl-td">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="tbl-td">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="tbl-td text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          aria-label="Delete record"
                          className="text-on-surface-variant/40 hover:text-error transition-colors p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-on-surface-variant/60">
          <span>
            {total} record{total === 1 ? "" : "s"} · page {page} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-white border border-on-surface-variant/10 font-semibold hover:bg-surface-container-high/40 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className="px-3 py-1.5 rounded-lg bg-white border border-on-surface-variant/10 font-semibold hover:bg-surface-container-high/40 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Delete-record confirmation ── */}
      <ConfirmModal
        open={deleteTarget !== null}
        title={`Delete "${deleteTarget?.title ?? ""}"?`}
        message="This permanently removes this record and every value it holds. This cannot be undone."
        confirmLabel="Delete record"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await performDeleteRow(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      {/* ── New-record modal ── */}
      {showNewModal && template && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full border border-on-surface-variant/5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold font-headline text-on-surface mb-4">
              New record
            </h3>

            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
              {template.titleLabel || "Title"}
            </label>
            <input
              type="text"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && creationFields.length === 0) handleCreate();
              }}
              placeholder="e.g. Josephine Sacco"
              className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
            />

            {creationFields.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 pt-3 border-t border-on-surface-variant/10">
                {creationFields.map((f) => (
                  <NewRecordFieldInput
                    key={f.id}
                    field={f}
                    value={newValues[f.id]}
                    onPatch={(p) => patchNewValue(f.id, p)}
                  />
                ))}
              </div>
            )}

            {missingRequiredOnCreate.length > 0 && (
              <p className="mt-4 text-xs text-error flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>
                <span>
                  Fill required field{missingRequiredOnCreate.length === 1 ? "" : "s"}:{" "}
                  <strong>{missingRequiredOnCreate.map((f) => f.label).join(", ")}</strong>
                </span>
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant/70 hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating || missingRequiredOnCreate.length > 0}
                title={
                  missingRequiredOnCreate.length > 0
                    ? `Fill required: ${missingRequiredOnCreate.map((f) => f.label).join(", ")}`
                    : undefined
                }
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// Returns true when a creation-field value satisfies the isRequired gate.
// Kept separate from the record-detail version because the modal stores
// values keyed by field id in a plain object, not a Map.
function isCreationFieldFilled(field: HrTemplateField, v: HrValuePatch | undefined): boolean {
  if (!v) return false;
  switch (field.fieldType) {
    case "text":
    case "select":
      return !!(v.valueText && v.valueText.trim() !== "");
    case "number":
      return v.valueNumber != null;
    case "date":
      return !!v.valueDate;
    case "checkbox":
      return v.valueBool === true;
  }
  return false;
}

// Dynamic field input for the New-record modal. Renders one input per
// show_on_create field on the template. Mirrors the types used in the
// record detail page but simpler (no ETag flow — values are committed as
// part of the POST).
function NewRecordFieldInput({
  field,
  value,
  onPatch,
}: {
  field: HrTemplateField;
  value: HrValuePatch | undefined;
  onPatch: (p: Partial<HrValuePatch>) => void;
}) {
  const labelEl = (
    <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1">
      {field.label}
      {field.isRequired && <span className="text-error ml-1">*</span>}
    </label>
  );
  const inputCls =
    "w-full px-3 py-2 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white";

  if (field.fieldType === "text" || field.fieldType === "select") {
    const options = Array.isArray(field.options)
      ? (field.options as Array<{ value: string; label: string }>)
      : [];
    return (
      <div>
        {labelEl}
        {field.fieldType === "select" ? (
          <select
            value={value?.valueText ?? ""}
            onChange={(e) => onPatch({ valueText: e.target.value || null, valueNumber: null, valueDate: null, valueBool: null })}
            className={inputCls}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value?.valueText ?? ""}
            onChange={(e) => onPatch({ valueText: e.target.value || null, valueNumber: null, valueDate: null, valueBool: null })}
            className={inputCls}
          />
        )}
      </div>
    );
  }
  if (field.fieldType === "number") {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          value={value?.valueNumber ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            onPatch({ valueNumber: n, valueText: null, valueDate: null, valueBool: null });
          }}
          className={inputCls}
        />
      </div>
    );
  }
  if (field.fieldType === "date") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          value={value?.valueDate?.slice(0, 10) ?? ""}
          onChange={(e) => onPatch({ valueDate: e.target.value || null, valueText: null, valueNumber: null, valueBool: null })}
          className={inputCls}
        />
      </div>
    );
  }
  if (field.fieldType === "checkbox") {
    const checked = value?.valueBool === true;
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onPatch({ valueBool: e.target.checked, valueText: null, valueNumber: null, valueDate: null })}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm text-on-surface">{field.label}</span>
      </label>
    );
  }
  return null;
}

function StatusPill({ status }: { status: HrRecordStatus }) {
  const styles = {
    open: "bg-primary/10 text-primary",
    completed: "bg-success-container text-on-success-container",
  }[status];
  const label = status[0].toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles}`}>
      {label}
    </span>
  );
}
