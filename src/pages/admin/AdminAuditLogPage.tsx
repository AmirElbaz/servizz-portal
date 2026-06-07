import { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Modal from "../../components/admin/Modal";
import Paginator from "../../components/ui/Paginator";
import Skeleton, { SkeletonTableRow } from "../../components/admin/Skeleton";
import {
  searchAudit,
  getAuditEvent,
  getAuditFilters,
  type AuditEventRow,
  type AuditEventDetail,
  type AuditFilterOptions,
} from "../../services/admin";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
// Compact form for the scannable list — date + HH:MM, no seconds.
function fmtTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
// Full precision (incl. seconds) for the detail modal, where exactness matters.
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Turn an action code like "policy.grants.update" into "Policy · Grants · Update".
function prettyAction(action: string): string {
  return action
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" · ");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function valuePreview(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

// ── Status pills ─────────────────────────────────────────────────────────────

// Single outcome pill. Success uses the theme's success token (not raw emerald)
// so "done" reads consistently with the rest of the app. Critical is conveyed
// separately as a row accent + a marker on the action, keeping this column clean.
function StatusPill({ success }: { success: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
        success
          ? "bg-success-container text-on-success-container border border-success/20"
          : "bg-error/8 text-error border border-error/20"
      }`}
    >
      <span className="material-symbols-outlined text-[12px]">
        {success ? "check_circle" : "cancel"}
      </span>
      {success ? "Success" : "Failed"}
    </span>
  );
}

function CriticalTag() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200/70">
      <span className="material-symbols-outlined text-[11px]">warning</span>
      Critical
    </span>
  );
}

function ModuleChip({ module }: { module: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-primary/8 text-primary border border-primary/15">
      {module}
    </span>
  );
}

// ── Before/After diff ────────────────────────────────────────────────────────
// The centerpiece: shows exactly what changed. When both before and after are
// plain objects, renders a per-field table (changed = amber, added = emerald,
// removed = red). Otherwise falls back to side-by-side pretty JSON.

function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const hasBefore = before !== null && before !== undefined;
  const hasAfter = after !== null && after !== undefined;

  if (!hasBefore && !hasAfter) {
    return (
      <p className="text-sm text-on-surface-variant/50 italic">
        No before/after detail was recorded for this event.
      </p>
    );
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).sort();
    return (
      <div className="overflow-hidden rounded-xl border border-on-surface-variant/10">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low/60">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              <th className="px-3 py-2 w-1/4">Field</th>
              <th className="px-3 py-2">Before</th>
              <th className="px-3 py-2">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-on-surface-variant/8">
            {keys.map((k) => {
              const b = (before as Record<string, unknown>)[k];
              const a = (after as Record<string, unknown>)[k];
              const inB = k in (before as object);
              const inA = k in (after as object);
              const changed = JSON.stringify(b) !== JSON.stringify(a);
              const tone = !inB
                ? "bg-emerald-50/60"
                : !inA
                ? "bg-error/5"
                : changed
                ? "bg-amber-50/60"
                : "";
              return (
                <tr key={k} className={tone}>
                  <td className="px-3 py-2 font-semibold text-on-surface align-top break-all">
                    {k}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-on-surface-variant align-top break-all">
                    {inB ? valuePreview(b) : <span className="text-on-surface-variant/30">—</span>}
                  </td>
                  <td
                    className={`px-3 py-2 font-mono text-[12px] align-top break-all ${
                      changed ? "text-on-surface font-semibold" : "text-on-surface-variant"
                    }`}
                  >
                    {inA ? valuePreview(a) : <span className="text-on-surface-variant/30">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Fallback: side-by-side raw JSON (arrays / primitives / asymmetric shapes).
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <JsonPanel label="Before" tone="error" value={before} show={hasBefore} />
      <JsonPanel label="After" tone="emerald" value={after} show={hasAfter} />
    </div>
  );
}

function JsonPanel({
  label,
  tone,
  value,
  show,
}: {
  label: string;
  tone: "error" | "emerald";
  value: unknown;
  show: boolean;
}) {
  if (!show) return null;
  const head =
    tone === "error" ? "text-error" : "text-emerald-700";
  return (
    <div>
      <h4 className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${head}`}>
        {label}
      </h4>
      <pre className="bg-surface-container-low p-3 rounded-lg text-[11px] leading-relaxed overflow-auto max-h-[280px] font-mono border border-on-surface-variant/8 whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ── Metadata row in the detail modal ─────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
        {label}
      </p>
      <p className="text-sm text-on-surface mt-0.5 break-all">{value ?? "—"}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function AdminAuditLogPage() {
  // Filters
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [success, setSuccess] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // Data
  const [rows, setRows] = useState<AuditEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter dropdown options
  const [options, setOptions] = useState<AuditFilterOptions>({
    actions: [],
    modules: [],
    entityTypes: [],
  });

  // Detail
  const [selected, setSelected] = useState<AuditEventRow | null>(null);
  const [detail, setDetail] = useState<AuditEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Debounce the free-text search.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [from, to, module, action, entityType, success, qDebounced]);

  // Load filter options once.
  useEffect(() => {
    getAuditFilters()
      .then(setOptions)
      .catch(() => {
        /* non-fatal — dropdowns just stay empty */
      });
  }, []);

  // The request key that drives reloads.
  const queryKey = useMemo(
    () =>
      JSON.stringify({ from, to, module, action, entityType, success, qDebounced, page, pageSize }),
    [from, to, module, action, entityType, success, qDebounced, page, pageSize]
  );

  const reqIdRef = useRef(0);
  useEffect(() => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    searchAudit({
      from,
      to,
      module: module || undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      success: success === "" ? undefined : success === "true",
      q: qDebounced || undefined,
      page,
      pageSize,
    })
      .then((res) => {
        if (reqId !== reqIdRef.current) return; // stale response — ignore
        setRows(res.rows);
        setTotal(res.total);
        setError(null);
      })
      .catch((e) => {
        if (reqId !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load audit log");
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (reqId === reqIdRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  function openDetail(row: AuditEventRow) {
    setSelected(row);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    getAuditEvent(row.id, row.occurredAt)
      .then(setDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : "Failed to load detail"))
      .finally(() => setDetailLoading(false));
  }

  function resetFilters() {
    setFrom(isoDaysAgo(30));
    setTo(todayIso());
    setModule("");
    setAction("");
    setEntityType("");
    setSuccess("");
    setQ("");
  }

  const hasActiveFilters =
    !!module || !!action || !!entityType || !!success || !!q;

  // Removable chips summarizing what's currently constraining the list (date
  // range is always set, so it's not chipped).
  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (module) activeChips.push({ key: "module", label: `Module: ${module}`, clear: () => setModule("") });
  if (action) activeChips.push({ key: "action", label: `Action: ${action}`, clear: () => setAction("") });
  if (entityType) activeChips.push({ key: "entity", label: `Entity: ${entityType}`, clear: () => setEntityType("") });
  if (success) activeChips.push({ key: "success", label: success === "true" ? "Success only" : "Failures only", clear: () => setSuccess("") });
  if (q) activeChips.push({ key: "q", label: `“${q}”`, clear: () => setQ("") });

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Audit Log"
        description="Every meaningful action across the platform — who did what, when, and what changed."
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ── Filter bar (lighter than the data card so the table is the hero) ── */}
      <div className="bg-surface-container-low/40 rounded-2xl border border-on-surface-variant/8 p-3 mb-4 space-y-3">
        {/* Primary search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description or username…"
            className="w-full py-2.5 pl-10 pr-3 bg-white rounded-xl border border-on-surface-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Secondary filters — one wrapping line */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range reads as ONE control */}
          <div className="inline-flex items-center gap-1.5 bg-white rounded-xl border border-on-surface-variant/10 px-2.5 py-1.5">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">calendar_today</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={dateInputCls} aria-label="From date" />
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/30">arrow_forward</span>
            <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className={dateInputCls} aria-label="To date" />
          </div>

          <select value={module} onChange={(e) => setModule(e.target.value)} className={selectCls} aria-label="Module">
            <option value="">All modules</option>
            {options.modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)} className={selectCls} aria-label="Action">
            <option value="">All actions</option>
            {options.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className={selectCls} aria-label="Entity type">
            <option value="">All entities</option>
            {options.entityTypes.map((et) => <option key={et} value={et}>{et}</option>)}
          </select>
          <select value={success} onChange={(e) => setSuccess(e.target.value)} className={selectCls} aria-label="Outcome">
            <option value="">All outcomes</option>
            <option value="true">Success only</option>
            <option value="false">Failures only</option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            Reset
          </button>
        </div>

        {/* Result count + active-filter chips */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-[11px] font-semibold text-on-surface-variant/60 tabular-nums">
            {loading ? "Loading…" : `${total.toLocaleString()} event${total === 1 ? "" : "s"}`}
          </span>
          {activeChips.length > 0 && <span className="text-on-surface-variant/20">·</span>}
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-semibold bg-primary/8 text-primary border border-primary/15 hover:bg-primary/15 transition-colors"
            >
              {chip.label}
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Results (the hero card) ── */}
      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 overflow-hidden">
        {!loading && rows.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center text-on-surface-variant/50">
            <span className="material-symbols-outlined text-[40px]">manage_search</span>
            <p className="text-sm mt-2 font-semibold text-on-surface-variant">No audit events match these filters.</p>
            <p className="text-xs mt-1">
              {hasActiveFilters ? "Clear a filter or widen the date range." : "Try widening the date range."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary/8 text-primary border border-primary/15 hover:bg-primary/15 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="tbl">
                <thead className="bg-surface-container-low/60">
                  <tr>
                    <th className="tbl-th">When</th>
                    <th className="tbl-th">User</th>
                    <th className="tbl-th">Action</th>
                    <th className="tbl-th">Module</th>
                    <th className="tbl-th">Entity</th>
                    <th className="tbl-th">Outcome</th>
                    <th className="tbl-th w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonTableRow key={i} widths={["w-24", "w-28", "w-48", "w-16", "w-24", "w-20", "w-5"]} />
                      ))
                    : rows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => openDetail(row)}
                          className="tbl-tr group cursor-pointer"
                        >
                          <td className={`tbl-td tabular-nums ${row.isCritical ? "border-l-2 border-l-amber-400" : ""}`}>
                            {fmtTimeShort(row.occurredAt)}
                          </td>
                          <td className="tbl-td-strong">
                            {row.actorUsername ?? <span className="font-normal text-on-surface-variant/40">anonymous</span>}
                            {row.actorUserId != null && (
                              <span className="text-on-surface-variant/40 text-[11px] font-normal"> #{row.actorUserId}</span>
                            )}
                          </td>
                          <td className="tbl-td max-w-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-on-surface" title={row.action}>{prettyAction(row.action)}</span>
                              {row.isCritical && <CriticalTag />}
                            </div>
                            {row.description && (
                              <p className="text-[11px] text-on-surface-variant/60 mt-0.5 truncate" title={row.description}>
                                {row.description}
                              </p>
                            )}
                          </td>
                          <td className="tbl-td"><ModuleChip module={row.module} /></td>
                          <td className="tbl-td">
                            {row.entityType ?? "—"}
                            {row.entityId != null && <span className="text-on-surface-variant/40"> · {row.entityId}</span>}
                          </td>
                          <td className="tbl-td"><StatusPill success={row.success} /></td>
                          <td className="tbl-td text-right">
                            <span className="material-symbols-outlined text-[18px] text-on-surface-variant/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                              chevron_right
                            </span>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-on-surface-variant/8">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="p-4 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/3" />
                    </li>
                  ))
                : rows.map((row) => (
                    <li
                      key={row.id}
                      onClick={() => openDetail(row)}
                      className={`p-4 active:bg-surface-container-low/40 transition-colors cursor-pointer ${
                        row.isCritical ? "border-l-2 border-l-amber-400" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-on-surface text-sm">{prettyAction(row.action)}</span>
                        <ModuleChip module={row.module} />
                      </div>
                      {row.description && (
                        <p className="text-[12px] text-on-surface-variant/70 mt-1">{row.description}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[11px] text-on-surface-variant/50 tabular-nums">
                          {fmtTimeShort(row.occurredAt)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {row.isCritical && <CriticalTag />}
                          <StatusPill success={row.success} />
                        </div>
                      </div>
                      <p className="text-[11px] text-on-surface-variant/50 mt-1">
                        {row.actorUsername ?? "anonymous"}
                        {row.entityType ? ` · ${row.entityType}${row.entityId ? ` #${row.entityId}` : ""}` : ""}
                      </p>
                    </li>
                  ))}
            </ul>

            {!loading && (
              <div className="border-t border-on-surface-variant/8 px-4 py-4">
                <Paginator
                  totalItems={total}
                  currentPage={page}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail modal ── */}
      <Modal
        open={!!selected}
        title="Audit event"
        width="lg"
        onClose={() => setSelected(null)}
      >
        {detailLoading ? (
          <div className="py-10 flex items-center justify-center text-on-surface-variant/50">
            <span className="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
          </div>
        ) : detailError ? (
          <ErrorBanner message={detailError} />
        ) : detail ? (
          <div className="space-y-5">
            {/* Headline */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-on-surface">{prettyAction(detail.action)}</span>
              <ModuleChip module={detail.module} />
              <StatusPill success={detail.success} />
              {detail.isCritical && <CriticalTag />}
            </div>
            {detail.description && (
              <p className="text-sm text-on-surface-variant">{detail.description}</p>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-container-low/60 border border-on-surface-variant/8">
              <MetaItem
                label="User"
                value={
                  detail.actorUsername
                    ? `${detail.actorUsername}${detail.actorUserId != null ? ` (#${detail.actorUserId})` : ""}`
                    : "anonymous"
                }
              />
              <MetaItem label="When" value={fmtTime(detail.occurredAt)} />
              <MetaItem
                label="Entity"
                value={
                  detail.entityType
                    ? `${detail.entityType}${detail.entityId != null ? ` · ${detail.entityId}` : ""}`
                    : "—"
                }
              />
              <MetaItem label="IP address" value={detail.ipAddress} />
              <MetaItem
                label="Request"
                value={detail.httpMethod ? `${detail.httpMethod} ${detail.route ?? ""}` : detail.route}
              />
              <MetaItem
                label="Status"
                value={
                  detail.statusCode != null
                    ? `${detail.statusCode}${detail.durationMs != null ? ` · ${detail.durationMs} ms` : ""}`
                    : detail.durationMs != null
                    ? `${detail.durationMs} ms`
                    : "—"
                }
              />
              <MetaItem label="Action code" value={<span className="font-mono text-[12px]">{detail.action}</span>} />
              <MetaItem
                label="Correlation ID"
                value={<span className="font-mono text-[11px]">{detail.correlationId ?? "—"}</span>}
              />
              <MetaItem label="Event ID" value={<span className="font-mono text-[11px]">{detail.id}</span>} />
            </div>

            {/* Before / after */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2">
                What changed
              </h3>
              <DiffView before={detail.beforeValues} after={detail.afterValues} />
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminLayout>
  );
}

// ── Small UI atoms ───────────────────────────────────────────────────────────

// Compact white select for the filter toolbar (native arrow kept — no custom
// appearance-none chrome to maintain).
const selectCls =
  "py-1.5 px-3 bg-white rounded-xl border border-on-surface-variant/10 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer";

// Bare date input that lives inside the grouped date-range pill (transparent so
// the pill's white background and border read as a single control).
const dateInputCls =
  "bg-transparent text-sm text-on-surface focus:outline-none [color-scheme:light]";
