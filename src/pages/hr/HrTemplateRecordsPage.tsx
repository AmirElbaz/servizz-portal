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
  downloadHrRecordPdfVersion,
  getHrRecordPdfObjectUrl,
  formatPeriodLabel,
  type HrRecordSummary,
  type HrTemplateDetail,
  type HrTemplateField,
  type HrRecordStatus,
  type HrRecordPeriodKind,
  type HrValuePatch,
} from "../../services/hr";
import { pushRecentItem } from "../../hooks/useRecentItems";
import { useAuth, roleAtLeast } from "../../services/auth";
import { REPORT_MIN_DATE } from "../../utils/reportDateRange";

// Explicit English month names (NOT toLocaleString — host locale is Arabic).
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  // Client role (servizz.gov account): published-PDFs-only model. The backend
  // already filters the records list to published rows and 403s the live form
  // / Excel; the gating below is cosmetic on top of that.
  const isClient = !isAdmin;
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
  // Operations: the report month for a project-scoped template (YYYY-MM).
  const [newPeriod, setNewPeriod] = useState("");
  // Reporting-period picker state (period-kind templates — QA quarterly /
  // half-yearly / yearly reports). The record title is AUTO-FILLED from the
  // picked period ("Q2 2026") but stays editable; titleEdited stops the
  // auto-fill once the user types their own title.
  const now = new Date();
  const [newPK, setNewPK] = useState<HrRecordPeriodKind>("quarter");
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [newQ, setNewQ] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [newMonthSel, setNewMonthSel] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [newHalf, setNewHalf] = useState(now.getMonth() < 6 ? 1 : 2);
  const [titleEdited, setTitleEdited] = useState(false);
  // Period filter state (replaces the created-month filter on period
  // templates): year + a part chip ("" = whole year, q1-q4, h1/h2, year).
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodPart, setPeriodPart] = useState("");
  const [newValues, setNewValues] = useState<Record<number, HrValuePatch>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrRecordSummary | null>(null);
  // In-app PDF preview modal (published versions). url is a blob object URL —
  // revoked on close.
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  function closePreview() {
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  }

  // Esc closes the preview modal.
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePreview();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

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

  // Reporting-period templates (QA quarterly / half-yearly / yearly) filter
  // by PERIOD, not by created month — a Q1 report created in April must not
  // file under April, and the default current-month filter must not hide it.
  const tplPeriodKind = template?.periodKind ?? null;
  const hasPeriods = tplPeriodKind != null;
  // QA reports are consumed per-record (each record = a period with its own
  // published PDF), so the bulk "All PDF / All Excel" exports are hidden —
  // rows carry preview/download actions instead. HR checklists keep them.
  const isQaReport = template?.groupCode === "qa-reports";

  // Maps the period filter (year + part) to a half-open [from, to) range plus
  // an optional granularity restriction. "year"/"h1"/"h2" need the granularity
  // because a full-year record's start date (Jan 1) would otherwise also match
  // the H1 range; a specific MONTH ("m4") restricts to month records so the Q2
  // quarterly record (which also starts Apr 1) doesn't file under April.
  // Quarter parts deliberately DON'T restrict: on a month-or-quarter template,
  // Q2 should show April–June monthly records AND the Q2 quarterly record.
  function periodFilterParams(): { periodFrom: string; periodTo: string; periodKind?: HrRecordPeriodKind } {
    const y = periodYear;
    const iso = (yy: number, m: number) => `${yy}-${String(m).padStart(2, "0")}-01`;
    if (/^m\d{1,2}$/.test(periodPart)) {
      const m = Number(periodPart.slice(1));
      return m === 12
        ? { periodFrom: iso(y, 12), periodTo: iso(y + 1, 1), periodKind: "month" }
        : { periodFrom: iso(y, m), periodTo: iso(y, m + 1), periodKind: "month" };
    }
    switch (periodPart) {
      case "q1": case "q2": case "q3": case "q4": {
        const q = Number(periodPart[1]);
        const startM = (q - 1) * 3 + 1;
        return startM === 10
          ? { periodFrom: iso(y, 10), periodTo: iso(y + 1, 1) }
          : { periodFrom: iso(y, startM), periodTo: iso(y, startM + 3) };
      }
      case "h1": return { periodFrom: iso(y, 1), periodTo: iso(y, 7), periodKind: "half" };
      case "h2": return { periodFrom: iso(y, 7), periodTo: iso(y + 1, 1), periodKind: "half" };
      case "year": return { periodFrom: iso(y, 1), periodTo: iso(y + 1, 1), periodKind: "year" };
      default: return { periodFrom: iso(y, 1), periodTo: iso(y + 1, 1) };
    }
  }

  async function reloadRows() {
    // Wait for the template — the filter SHAPE depends on its periodKind, and
    // firing early would apply the created-month default to period templates.
    if (!Number.isFinite(tid) || !template) return;
    try {
      setLoading(true);
      const res = await listHrRecords(tid, {
        search: search || undefined,
        status: status || undefined,
        ...(hasPeriods
          ? periodFilterParams()
          : { createdMonth: createdMonth || undefined }),
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
  }, [status, createdMonth, periodYear, periodPart, page, tid, template?.id]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  // Required creation fields that aren't filled yet. Used to block Create
  // and surface an inline error inside the modal.
  const missingRequiredOnCreate = useMemo(() => {
    return creationFields.filter((f) => f.isRequired && !isCreationFieldFilled(f, newValues[f.id]));
  }, [creationFields, newValues]);

  // Canonical period START date for the picker's current selection. The
  // backend re-normalizes defensively, but we send canonical anyway.
  function pickedPeriodIso(): string {
    const iso = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
    switch (newPK) {
      case "month":   return `${newMonthSel}-01`;
      case "quarter": return iso(newYear, (newQ - 1) * 3 + 1);
      case "half":    return iso(newYear, newHalf === 1 ? 1 : 7);
      case "year":    return iso(newYear, 1);
    }
  }

  // Auto-fill the record title from the picked period ("Q2 2026") until the
  // user edits the title themselves.
  useEffect(() => {
    if (!hasPeriods || !showNewModal || titleEdited) return;
    setNewTitle(formatPeriodLabel(pickedPeriodIso(), newPK));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPK, newYear, newQ, newMonthSel, newHalf, showNewModal, hasPeriods]);

  async function handleCreate() {
    if (!newTitle.trim() || !Number.isFinite(tid)) return;
    if (missingRequiredOnCreate.length > 0) return;
    try {
      setCreating(true);
      const values = Object.values(newValues).filter((v) =>
        v.valueText != null || v.valueNumber != null ||
        v.valueDate != null || v.valueBool != null
      );
      // Period-kind templates send the structured period; project-scoped
      // (Operations) templates keep their report-month flow.
      let period: string | null = null;
      let periodKind: HrRecordPeriodKind | null = null;
      if (hasPeriods) {
        period = pickedPeriodIso();
        periodKind = newPK;
      } else if (template?.projectId != null && newPeriod) {
        period = `${newPeriod}-01`;
      }
      const { data } = await createHrRecord(tid, newTitle.trim(), values, period, periodKind);
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
    setTitleEdited(false);
    // Default the period granularity to the template's most common cadence:
    // month for month-or-quarter (QMS M/Q), half for half-or-year (QMS H/Y),
    // quarter for plain-quarterly reports.
    if (tplPeriodKind) {
      const def: HrRecordPeriodKind =
        tplPeriodKind === "month_or_quarter" ? "month"
        : tplPeriodKind === "half_or_year" ? "half"
        : tplPeriodKind === "month" ? "month"
        : tplPeriodKind === "year" ? "year"
        : "quarter";
      setNewPK(def);
    }
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
            {/* Bulk exports are staff working tools — the client role gets
                published per-record PDFs only (backend 403s these anyway),
                and QA reports drop them entirely (per-record preview/download
                in the rows instead — Amir 2026-06-11). */}
            {!isClient && !isQaReport && (
              <>
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
              </>
            )}
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
        {/* Period templates filter by REPORTING PERIOD (year + part); HR
            checklists keep the created-month filter. */}
        {hasPeriods ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/8">
              <label
                htmlFor="period-year"
                className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 pl-1"
              >
                Year
              </label>
              <select
                id="period-year"
                value={periodYear}
                onChange={(e) => { setPage(1); setPeriodYear(Number(e.target.value)); }}
                className="bg-transparent text-sm focus:outline-none pr-1"
              >
                {Array.from({ length: Math.max(1, now.getFullYear() - 2026 + 1) }, (_, i) => 2026 + i)
                  .reverse()
                  .map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
              </select>
            </div>
            {/* Month-or-quarter templates (QMS M/Q) hold BOTH monthly and
                quarterly records, so the part filter is a dropdown offering
                both granularities. Other period templates keep the chips. */}
            {tplPeriodKind === "month_or_quarter" ? (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/8">
                <label
                  htmlFor="period-part"
                  className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 pl-1"
                >
                  Period
                </label>
                <select
                  id="period-part"
                  value={periodPart}
                  onChange={(e) => { setPage(1); setPeriodPart(e.target.value); }}
                  className="bg-transparent text-sm focus:outline-none pr-1"
                >
                  <option value="">All periods</option>
                  <optgroup label="Quarters">
                    {[1, 2, 3, 4].map((q) => (
                      <option key={`q${q}`} value={`q${q}`}>Q{q}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Months">
                    {MONTH_LABELS.map((m, i) => (
                      <option key={`m${i + 1}`} value={`m${i + 1}`}>{m}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {(tplPeriodKind === "half_or_year"
                  ? [["", "All"], ["h1", "H1"], ["h2", "H2"], ["year", "Full year"]]
                  : [["", "All"], ["q1", "Q1"], ["q2", "Q2"], ["q3", "Q3"], ["q4", "Q4"]]
                ).map(([value, label]) => (
                  <button
                    key={value || "all"}
                    type="button"
                    onClick={() => { setPage(1); setPeriodPart(value); }}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                      periodPart === value
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant/70 hover:bg-surface-container-high/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
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
        )}
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
                  : isClient
                    ? "No published reports yet."
                    : "No records yet."
                : "No records match your filters."}
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead className="bg-surface-container-low/50">
              <tr>
                <th className="tbl-th">Name</th>
                {hasPeriods && <th className="tbl-th">Period</th>}
                <th className="tbl-th">Progress</th>
                <th className="tbl-th">Status</th>
                <th className="tbl-th">Published</th>
                <th className="tbl-th">Updated</th>
                <th className="tbl-th w-24"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.total > 0 ? Math.round((100 * r.done) / r.total) : 0;
                // Clients only open the live form when the template has
                // client-visible sections (the backend filters GetTemplate for
                // clients, so any returned section IS client-visible).
                const canOpen =
                  !isClient || (template?.sections.some((s) => s.clientVisible) ?? false);
                return (
                  <tr key={r.id} className="tbl-tr">
                    <td className="tbl-td-strong">
                      {canOpen ? (
                        <Link
                          to={`/department/${deptCode}/templates/${tid}/records/${r.id}`}
                          className="hover:text-primary no-underline"
                        >
                          {r.title}
                        </Link>
                      ) : (
                        <span>{r.title}</span>
                      )}
                    </td>
                    {hasPeriods && (
                      <td className="tbl-td">
                        {r.period && r.periodKind ? (
                          <span className="text-[12px] font-semibold tabular-nums">
                            {formatPeriodLabel(r.period, r.periodKind)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-on-surface-variant/40 italic">—</span>
                        )}
                      </td>
                    )}
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
                      {r.publishedVersionNo != null ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-container text-on-success-container text-[11px] font-bold">
                          v{r.publishedVersionNo}
                          {r.publishedAt && (
                            <span className="font-semibold opacity-70">
                              · {new Date(r.publishedAt).toLocaleDateString()}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[12px] text-on-surface-variant/40 italic">—</span>
                      )}
                    </td>
                    <td className="tbl-td">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="tbl-td text-right whitespace-nowrap">
                      {r.publishedVersionNo != null && (
                        <button
                          type="button"
                          onClick={() =>
                            getHrRecordPdfObjectUrl(r.id)
                              .then((url) =>
                                setPreview({ url, title: `${r.title} · v${r.publishedVersionNo}` })
                              )
                              .catch((e) =>
                                setError(e instanceof Error ? e.message : "Preview failed")
                              )
                          }
                          aria-label={`Preview published PDF v${r.publishedVersionNo}`}
                          title={`Preview published PDF (v${r.publishedVersionNo})`}
                          className="text-on-surface-variant/50 hover:text-primary transition-colors p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                      )}
                      {r.publishedVersionNo != null && (
                        <button
                          type="button"
                          onClick={() =>
                            downloadHrRecordPdfVersion(
                              r.id,
                              `${template?.code ?? "report"}-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-v${r.publishedVersionNo}.pdf`
                            ).catch((e) =>
                              setError(e instanceof Error ? e.message : "Download failed")
                            )
                          }
                          aria-label={`Download published PDF v${r.publishedVersionNo}`}
                          title={`Download published PDF (v${r.publishedVersionNo})`}
                          className="text-on-surface-variant/50 hover:text-primary transition-colors p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[18px]">download</span>
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          aria-label="Delete record"
                          className="text-on-surface-variant/40 hover:text-error transition-colors p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      )}
                    </td>
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

      {/* ── PDF preview modal (published versions) ── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePreview}
          role="dialog"
          aria-modal="true"
          aria-label={`PDF preview: ${preview.title}`}
        >
          <div
            className="bg-white rounded-2xl w-[90vw] h-[90vh] max-w-5xl flex flex-col overflow-hidden border border-on-surface-variant/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-on-surface-variant/10">
              <p className="text-sm font-bold text-on-surface truncate">{preview.title}</p>
              <button
                type="button"
                onClick={closePreview}
                aria-label="Close preview"
                className="text-on-surface-variant/50 hover:text-on-surface transition-colors p-1 rounded"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <iframe
              src={preview.url}
              title={preview.title}
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}

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

            {/* Reporting-period picker (QA quarterly / half-yearly / yearly
                reports). Picks the period FIRST; the title below auto-fills
                from it ("Q2 2026") and stays editable. */}
            {hasPeriods && (
              <div className="mb-4">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  Reporting period
                </label>
                {/* Granularity toggle — only for templates that allow a choice. */}
                {(tplPeriodKind === "month_or_quarter" || tplPeriodKind === "half_or_year") && (
                  <div className="flex items-center gap-1 mb-2">
                    {(tplPeriodKind === "month_or_quarter"
                      ? ([["month", "Monthly"], ["quarter", "Quarterly"]] as const)
                      : ([["half", "Half-yearly"], ["year", "Yearly"]] as const)
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNewPK(value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          newPK === value
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface-variant/70 hover:bg-surface-container-high/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {newPK === "month" ? (
                    <input
                      type="month"
                      value={newMonthSel}
                      min={REPORT_MIN_DATE.slice(0, 7)}
                      onChange={(e) => setNewMonthSel(e.target.value)}
                      className="px-3 py-2 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
                    />
                  ) : (
                    <>
                      <select
                        value={newYear}
                        onChange={(e) => setNewYear(Number(e.target.value))}
                        aria-label="Year"
                        className="px-3 py-2 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
                      >
                        {Array.from({ length: Math.max(1, now.getFullYear() - 2026 + 1) }, (_, i) => 2026 + i)
                          .reverse()
                          .map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                      </select>
                      {newPK === "quarter" && (
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4].map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => setNewQ(q)}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                                newQ === q
                                  ? "bg-primary text-white"
                                  : "bg-surface-container-high/50 text-on-surface-variant/70 hover:bg-surface-container-high"
                              }`}
                            >
                              Q{q}
                            </button>
                          ))}
                        </div>
                      )}
                      {newPK === "half" && (
                        <div className="flex items-center gap-1">
                          {[1, 2].map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setNewHalf(h)}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                                newHalf === h
                                  ? "bg-primary text-white"
                                  : "bg-surface-container-high/50 text-on-surface-variant/70 hover:bg-surface-container-high"
                              }`}
                            >
                              H{h}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
              {template.titleLabel || "Title"}
            </label>
            <input
              type="text"
              autoFocus={!hasPeriods}
              value={newTitle}
              onChange={(e) => { setTitleEdited(true); setNewTitle(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && creationFields.length === 0) handleCreate();
              }}
              placeholder={hasPeriods ? "Auto-filled from the period — edit if needed" : "e.g. Josephine Sacco"}
              className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
            />

            {template.projectId != null && (
              <div className="mt-4">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  Report month
                </label>
                <input
                  type="month"
                  value={newPeriod}
                  min={REPORT_MIN_DATE.slice(0, 7)}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
                />
              </div>
            )}

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
                disabled={
                  !newTitle.trim() ||
                  creating ||
                  missingRequiredOnCreate.length > 0 ||
                  (template.projectId != null && !newPeriod)
                }
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
