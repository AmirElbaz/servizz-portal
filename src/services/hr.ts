import { API_BASE_URL as BASE_URL } from "./config";
import { ConcurrencyError } from "./admin";

// Shared HTTP helpers mirror the pattern in admin.ts (same ETag / 401 / 403
// / 412 handling). Kept inline here to avoid coupling the HR module to the
// admin module's internals; a future cleanup can extract to services/http.ts.

function authHeaders(withJson = false): Record<string, string> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: { ...authHeaders(!!init?.body), ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (res.status === 403) throw new Error("Forbidden");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

interface EtagOptions {
  method?: string;
  body?: string;
  ifMatch?: string | null;
}

async function requestWithEtag<T>(
  url: string,
  options: EtagOptions = {}
): Promise<{ data: T; etag: string | null }> {
  const hasBody = !!options.body;
  const headers: Record<string, string> = { ...authHeaders(hasBody) };
  if (options.ifMatch) headers["If-Match"] = options.ifMatch;

  const res = await fetch(`${BASE_URL}${url}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (res.status === 403) throw new Error("Forbidden");
  if (res.status === 412) {
    const body = await res.json().catch(() => null);
    throw new ConcurrencyError(body?.message);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API error: ${res.status} ${res.statusText}`);
  }
  const etag = res.headers.get("ETag");
  if (res.status === 204) return { data: undefined as unknown as T, etag };
  const data = (await res.json()) as T;
  return { data, etag };
}

// ── Types ────────────────────────────────────────────────────────────────

export type HrFieldType =
  | "text"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  // QA form/report types:
  | "textarea" // multi-line free-text prose
  | "grid"     // repeating table; columns live in `options.columns`
  | "note";    // read-only descriptive / cross-reference block (no value)
export type HrRecordStatus = "open" | "completed";
export type HrFieldPlacement = "creation" | "detail";

// ── Reporting periods ─────────────────────────────────────────────────────
// Template-level config: what kind of reporting period records cover.
// null = no period (HR checklists; ops templates use their own month flow).
export type HrTemplatePeriodKind =
  | "month" | "quarter" | "month_or_quarter" | "half_or_year" | "year";
// Record-level granularity actually chosen for one record.
export type HrRecordPeriodKind = "month" | "quarter" | "half" | "year";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Human label for a record's reporting period: "June 2026", "Q2 2026",
// "H1 2026", "2026". Explicit English month names (NOT toLocaleString) so the
// label is stable regardless of the host machine's locale. Parses the ISO
// string directly (not via new Date()) so a UTC-midnight date can't shift to
// the previous month in UTC-negative timezones.
export function formatPeriodLabel(periodIso: string, kind: HrRecordPeriodKind): string {
  const [y, m1] = periodIso.slice(0, 7).split("-").map(Number); // m1 is 1-based
  const m = (m1 || 1) - 1;
  switch (kind) {
    case "month":   return `${MONTH_NAMES[m]} ${y}`;
    case "quarter": return `Q${Math.floor(m / 3) + 1} ${y}`;
    case "half":    return `H${m < 6 ? 1 : 2} ${y}`;
    case "year":    return `${y}`;
  }
}

// ── Grid (repeating-table) field options ──────────────────────────────────
// A 'grid' field stores its column definitions in `HrTemplateField.options` and
// its rows in `HrRecordValue.valueJson` (a JSON array of {colKey: cellValue}).
export type HrGridColumnType =
  | "text" | "textarea" | "number" | "date" | "select" | "rag" | "percent" | "month";

export interface HrGridColumn {
  key: string;
  label: string;
  type: HrGridColumnType;
  options?: string[]; // for select columns
  dedupe?: boolean;   // select: a value picked in one row drops out of the other rows' lists
  // Cell is fixed on preset rows — rendered as static text, never an input.
  // Rows without a rowKey (legacy records, user-added rows) ignore this.
  readonly?: boolean;
  // The column IS the row's 1-based position. Rendered read-only and derived
  // on the fly, so deleting a row renumbers everything below it for free. Any
  // value stored under this key is ignored (never read, never rewritten).
  autoNumber?: boolean;
}

export interface HrGridOptions {
  help?: string;
  columns: HrGridColumn[];
  // ── Fixed-row grids (Quality Monitoring Scores, migration 126) ───────────
  // `presetRows` seeds an EMPTY grid with a canonical row set. It never
  // rewrites a grid that already holds rows, so historical records keep their
  // own rows and their own vocabulary untouched.
  presetRows?: HrGridRow[];
  // Name of the property carrying each preset row's stable slug. A row is
  // "fixed" (locked cells, no delete) iff it carries this property. Legacy
  // rows have none, so old records stay as editable as they have always been.
  rowKey?: string;
  // Hides "Add row" for preset-seeded grids. User-added rows are still
  // deletable; preset rows never are.
  rowsFixed?: boolean;
}

// A fixed-row grid puts a "{period}" token in a column label (e.g.
// "Checks — {period}"). The reporting month lives on the record, not on every
// row, so the header carries it. Splits the label so the caller can render the
// static part and the resolved period distinctly.
export function splitGridLabel(label: string): { text: string; hasPeriod: boolean } {
  const hasPeriod = label.includes("{period}");
  if (!hasPeriod) return { text: label, hasPeriod };
  return { text: label.replace(/\s*—?\s*\{period\}/g, "").trim(), hasPeriod };
}

// A RAG cell value: a completion date plus a Red/Amber/Green status.
export type HrRagStatus = "Red" | "Amber" | "Green";
export interface HrRagValue {
  status?: HrRagStatus | "";
  date?: string;
}

// One grid row = a map of column key → cell value (string | number | HrRagValue).
export type HrGridRow = Record<string, string | number | HrRagValue | null>;

// Safely read a field's options as grid options (returns null when not a grid
// or malformed). The backend stores `options` as jsonb, which Dapper/Npgsql
// return to the client as a JSON *string* (not a parsed object), so we accept
// either a string (parse it) or an already-parsed object.
export function asGridOptions(options: unknown): HrGridOptions | null {
  let o = options;
  if (typeof o === "string") {
    try { o = JSON.parse(o); } catch { return null; }
  }
  if (o && typeof o === "object" && Array.isArray((o as HrGridOptions).columns)) {
    return o as HrGridOptions;
  }
  return null;
}

// Normalize a 'select' field's options to {value,label}[], tolerant of every
// shape we've stored: a JSON string, an array of strings, an array of
// {value,label}, or an object { options: string[] }.
export function normalizeSelectOptions(options: unknown): { value: string; label: string }[] {
  let o = options;
  if (typeof o === "string") {
    try { o = JSON.parse(o); } catch { return []; }
  }
  let arr: unknown[] = [];
  if (Array.isArray(o)) arr = o;
  else if (o && typeof o === "object" && Array.isArray((o as { options?: unknown[] }).options))
    arr = (o as { options: unknown[] }).options;
  else return [];

  return arr
    .map((it): { value: string; label: string } => {
      if (typeof it === "string") return { value: it, label: it };
      if (it && typeof it === "object") {
        const r = it as { value?: unknown; label?: unknown };
        const v = String(r.value ?? r.label ?? "");
        const l = String(r.label ?? r.value ?? "");
        return { value: v, label: l };
      }
      return { value: String(it), label: String(it) };
    })
    .filter((x) => x.value !== "");
}

// A template "section" (HR / Non Servizz / …). The backend gates each section
// by `minRole`; the list endpoint only returns sections the caller may see, so
// the UI can render whatever it receives without re-checking access.
export interface HrTemplateGroup {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  minRole: string | null;
}

export interface HrTemplate {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  fieldCount: number;
  recordCount: number;
  // Section the template belongs to. The list endpoint only returns templates
  // in sections the caller may see.
  groupId: number | null;
  groupCode: string | null;
  groupName: string | null;
  // Operations: the avaya_project this template is scoped to (null for HR/QA).
  projectId: number | null;
  // Reporting-period config (QA quarterly/half-yearly/yearly reports).
  periodKind: HrTemplatePeriodKind | null;
}

export interface HrTemplateField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: HrFieldType;
  ownerTeam: string | null;   // optional "who's responsible" metadata
  sectionId: number | null;   // null → Details bucket
  isRequired: boolean;
  showOnCreate: boolean;      // legacy; superseded by placement
  placement: HrFieldPlacement; // "creation" = in New-record modal, "detail" = on record form
  // Admin-set: when true, the record-detail page surfaces an "N/A" toggle on
  // this field and users can mark it non-applicable per record. Excluded from
  // progress totals and rendered as "N/A" in exports.
  allowsNa: boolean;
  // Operations: binds this field to an auto-fill data source (e.g.
  // 'skillset.pca'). Null = manual field. See the metric catalog.
  sourceKey: string | null;
  options: unknown;
  sortOrder: number;
}

export interface HrTemplateSection {
  id: number;
  name: string;
  // Optional intro prose rendered under the section heading (QA reports).
  description: string | null;
  sortOrder: number;
  // Operations master: sub-sections nest under a parent section (the parent is a
  // TOC entry; children share its number + a cyan eyebrow in the PDF). null =
  // top-level section.
  parentId?: number | null;
  // When TRUE this section appears in the client role's read-only LIVE view.
  // Default FALSE = clients see only published PDF versions. For client-role
  // callers the backend already filters GetTemplate to flagged sections only.
  clientVisible: boolean;
  // Retired section (migration 132): not rendered in the record form, the PDF
  // or the Excel export, but its fields and their stored values are retained.
  // The template DESIGNER still receives it so an admin can bring it back.
  hidden?: boolean;
}

export interface HrTemplateDetail {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  archived: boolean;
  titleLabel: string;         // label for the record-name input in the New-record modal
  createdAt: string;
  updatedAt: string;
  // How many records are filed against this template. Used by the Designer
  // page to render the design-lock banner and disable structure mutations
  // when > 0. Backend also enforces this (409 on mutations).
  recordCount: number;
  // Section the template belongs to (HR / Non Servizz / …).
  groupId: number | null;
  groupCode: string | null;
  groupName: string | null;
  // Operations: the avaya_project this template is scoped to (null for HR/QA,
  // and null for the unified Operations master — its records carry the project).
  projectId: number | null;
  // Reporting-period config (QA quarterly/half-yearly/yearly reports).
  periodKind: HrTemplatePeriodKind | null;
  // The unified Operations master always has records, so additive structure
  // edits (add section/field, reorder, rename, edit options) stay allowed while
  // destructive edits stay locked.
  allowLockedDesign?: boolean;
  sections: HrTemplateSection[];
  fields: HrTemplateField[];
}

export interface HrRecordSummary {
  id: number;
  title: string;
  status: HrRecordStatus;
  createdAt: string;
  updatedAt: string;
  // Reporting period start date (ISO) + its granularity. period alone is set
  // for ops monthly records; periodKind is set for QA period-kind templates.
  period: string | null;
  periodKind: HrRecordPeriodKind | null;
  done: number;
  total: number;
  // Current published PDF version (null = never published). Client-role users
  // only receive rows that HAVE a published version; staff see all rows with
  // these fields populated when applicable.
  publishedVersionNo: number | null;
  publishedAt: string | null;
}

export interface HrRecordValue {
  fieldId: number;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueBool: boolean | null;
  // Rows of a 'grid' field, as a JSON array string. Parse with JSON.parse to
  // get HrGridRow[]. Null for non-grid fields.
  valueJson: string | null;
  // Per-record N/A flag. Defaults to true (applicable). Server only accepts
  // false when the parent field has allowsNa = true.
  isApplicable: boolean;
  updatedAt: string;
}

export interface HrRecordDetail {
  id: number;
  templateId: number;
  title: string;
  status: HrRecordStatus;
  // Operations: the project this report belongs to (null for HR/QA).
  projectId?: number | null;
  // Reporting period start (ISO) + granularity, mirroring HrRecordSummary.
  // Fixed-row grids resolve their "{period}" column header from these.
  period: string | null;
  periodKind: HrRecordPeriodKind | null;
  createdAt: string;
  updatedAt: string;
  values: HrRecordValue[];
}

export interface HrRecordListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: HrRecordSummary[];
}

// ── Template endpoints ───────────────────────────────────────────────────

// `departmentCode` scopes templates to one templates-hosting department (HR or
// QA). Defaults to HR server-side when omitted, so callers that don't pass it
// keep their current behaviour.
export const listHrTemplates = (
  includeArchived = false,
  departmentCode?: string,
  // Operations: scope to one project's templates (avaya_projects id).
  projectId?: number
) => {
  const qs = new URLSearchParams({ includeArchived: String(includeArchived) });
  if (departmentCode) qs.set("departmentCode", departmentCode);
  if (projectId != null) qs.set("projectId", String(projectId));
  return request<HrTemplate[]>(`/Hr/templates?${qs}`);
};

// Sections the caller may see/manage within a department (HR sections, or QA's
// "Quality & Training Reports"). Scoped by departmentCode (defaults to HR).
export const listHrTemplateGroups = (departmentCode?: string) => {
  const suffix = departmentCode
    ? `?departmentCode=${encodeURIComponent(departmentCode)}`
    : "";
  return request<HrTemplateGroup[]>(`/Hr/template-groups${suffix}`);
};

// Retired sections (`hidden`) are filtered out server-side. The template
// designer passes includeHidden so an admin can see and un-hide them; nothing
// else should.
export const getHrTemplate = (id: number, includeHidden = false) =>
  requestWithEtag<HrTemplateDetail>(
    `/Hr/templates/${id}${includeHidden ? "?includeHidden=true" : ""}`
  );

export const createHrTemplate = (body: {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  // Target section. Omit/null → backend defaults to the 'hr' section.
  groupId?: number | null;
  // Operations: scope the template to one avaya_project.
  projectId?: number | null;
}) =>
  requestWithEtag<{ id: number }>("/Hr/templates", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateHrTemplate = (
  id: number,
  body: {
    name: string;
    description: string | null;
    icon: string | null;
    titleLabel: string | null;
    // Move the template to another section. Omit to leave it where it is.
    groupId?: number | null;
    // Reporting-period config. Omit = unchanged; "none" = clear; else a
    // HrTemplatePeriodKind value.
    periodKind?: HrTemplatePeriodKind | "none";
  },
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Hr/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    ifMatch,
  });

export const archiveHrTemplate = (id: number) =>
  request<void>(`/Hr/templates/${id}/archive`, { method: "POST" });
export const unarchiveHrTemplate = (id: number) =>
  request<void>(`/Hr/templates/${id}/unarchive`, { method: "POST" });
export const deleteHrTemplate = (id: number) =>
  request<void>(`/Hr/templates/${id}`, { method: "DELETE" });

// ── Field endpoints ──────────────────────────────────────────────────────

export const addHrField = (
  templateId: number,
  body: {
    fieldKey: string;
    label: string;
    fieldType: HrFieldType;
    ownerTeam: string | null;
    sectionId: number | null;
    isRequired: boolean;
    showOnCreate: boolean;
    placement: HrFieldPlacement;
    allowsNa: boolean;
    sourceKey?: string | null;
    options: unknown;
    sortOrder: number;
  }
) =>
  request<{ id: number }>(`/Hr/templates/${templateId}/fields`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateHrField = (
  fieldId: number,
  body: {
    label: string;
    fieldType: HrFieldType;
    ownerTeam: string | null;
    sectionId: number | null;
    isRequired: boolean;
    showOnCreate: boolean;
    placement: HrFieldPlacement;
    allowsNa: boolean;
    sourceKey?: string | null;
    options: unknown;
  }
) =>
  request<void>(`/Hr/fields/${fieldId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

// Dedicated endpoint that flips ONLY the allows_na flag. Backend bypasses
// the design-lock that guards full UpdateField — admins can flip allows_na
// even after a template has records (the flag is non-destructive and
// flipping it doesn't reinterpret stored values).
export const setHrFieldAllowsNa = (fieldId: number, allowsNa: boolean) =>
  request<void>(`/Hr/fields/${fieldId}/allows-na`, {
    method: "PATCH",
    body: JSON.stringify({ allowsNa }),
  });

export const deleteHrField = (fieldId: number) =>
  request<void>(`/Hr/fields/${fieldId}`, { method: "DELETE" });

export const reorderHrFields = (
  templateId: number,
  orders: { fieldId: number; sortOrder: number; sectionId: number | null }[]
) =>
  request<void>(`/Hr/templates/${templateId}/fields/reorder`, {
    method: "PUT",
    body: JSON.stringify({ orders }),
  });

// ── Section endpoints ────────────────────────────────────────────────────

export const addHrSection = (
  templateId: number,
  body: { name: string; sortOrder: number; description?: string | null }
) =>
  request<{ id: number }>(`/Hr/templates/${templateId}/sections`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateHrSection = (
  sectionId: number,
  name: string,
  description?: string | null
) =>
  request<void>(`/Hr/sections/${sectionId}`, {
    method: "PUT",
    body: JSON.stringify({ name, description: description ?? null }),
  });

export const deleteHrSection = (sectionId: number) =>
  request<void>(`/Hr/sections/${sectionId}`, { method: "DELETE" });

// Flips ONLY the section's client_visible flag. Dedicated endpoint that
// bypasses the design-lock (like allows-na) so admins can apply the client
// live-visibility outline AFTER records exist.
export const setHrSectionClientVisible = (sectionId: number, clientVisible: boolean) =>
  request<void>(`/Hr/sections/${sectionId}/client-visible`, {
    method: "PATCH",
    body: JSON.stringify({ clientVisible }),
  });

export const reorderHrSections = (
  templateId: number,
  orders: { sectionId: number; sortOrder: number }[]
) =>
  request<void>(`/Hr/templates/${templateId}/sections/reorder`, {
    method: "PUT",
    body: JSON.stringify({ orders }),
  });

// ── Record endpoints ─────────────────────────────────────────────────────

export const listHrRecords = (
  templateId: number,
  params: {
    search?: string;
    status?: HrRecordStatus;
    createdMonth?: string;   // YYYY-MM (HR checklists — filters by created_at)
    // Reporting-period range filter (period-kind templates). ISO dates;
    // periodFrom inclusive, periodTo exclusive. periodKind restricts to one
    // granularity (e.g. only 'year' records).
    periodFrom?: string;
    periodTo?: string;
    periodKind?: HrRecordPeriodKind;
    // Operations master template is shared across projects — scope to one.
    projectId?: number;
    page?: number;
    pageSize?: number;
  } = {}
) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.createdMonth) qs.set("createdMonth", params.createdMonth);
  if (params.periodFrom) qs.set("periodFrom", params.periodFrom);
  if (params.periodTo) qs.set("periodTo", params.periodTo);
  if (params.periodKind) qs.set("periodKind", params.periodKind);
  if (params.projectId != null) qs.set("projectId", String(params.projectId));
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<HrRecordListResponse>(
    `/Hr/templates/${templateId}/records${suffix}`
  );
};

export const getHrRecord = (rid: number) =>
  requestWithEtag<HrRecordDetail>(`/Hr/records/${rid}`);

export const createHrRecord = (
  templateId: number,
  title: string,
  values?: HrValuePatch[],
  // Reporting period start date (ISO). Ops: report month. QA period-kind
  // templates: the canonical period start, with periodKind = the granularity
  // the user picked ('quarter', 'half', …). Null for HR checklists.
  period?: string | null,
  periodKind?: HrRecordPeriodKind | null,
  // Operations master template: the project this report is for (required there;
  // null for HR/QA).
  projectId?: number | null
) =>
  requestWithEtag<{ id: number }>(`/Hr/templates/${templateId}/records`, {
    method: "POST",
    body: JSON.stringify({
      title,
      values: values ?? [],
      period: period ?? null,
      periodKind: periodKind ?? null,
      projectId: projectId ?? null,
    }),
  });

export const updateHrRecord = (
  rid: number,
  body: { title: string; status: HrRecordStatus },
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Hr/records/${rid}`, {
    method: "PUT",
    body: JSON.stringify(body),
    ifMatch,
  });

export interface HrValuePatch {
  fieldId: number;
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: string | null;
  valueBool?: boolean | null;
  // For 'grid' fields: a JSON array string of the rows (HrGridRow[]).
  valueJson?: string | null;
  // When omitted, the server defaults to true (applicable). Send false to
  // mark the field N/A for this record; server rejects with 400 when the
  // parent field doesn't have allowsNa.
  isApplicable?: boolean | null;
}

// Returns the record's status after the save — the backend auto-derives it
// from checklist progress (100% applicable ticks → "completed", otherwise
// "open"), so the caller can reflect an open↔completed flip without refetching.
export const patchHrRecordValues = (
  rid: number,
  values: HrValuePatch[],
  ifMatch: string | null
) =>
  requestWithEtag<{ status: HrRecordStatus }>(`/Hr/records/${rid}/values`, {
    method: "PATCH",
    body: JSON.stringify({ values }),
    ifMatch,
  });

export const deleteHrRecord = (rid: number) =>
  request<void>(`/Hr/records/${rid}`, { method: "DELETE" });

// ── PDF URLs (download via anchor, not fetch — keeps auth cookie flow) ──
// The backend requires a bearer token on these endpoints, so we can't just
// link to them. Fetch as blob and trigger download.

async function downloadBlob(url: string, filename: string) {
  const res = await fetch(`${BASE_URL}${url}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export const exportHrRecordPdf = (rid: number, filename: string) =>
  downloadBlob(`/Hr/records/${rid}/pdf`, filename);

export const exportHrTemplatePdf = (
  templateId: number,
  filename: string,
  params: { search?: string; status?: HrRecordStatus } = {}
) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return downloadBlob(`/Hr/templates/${templateId}/pdf${suffix}`, filename);
};

export const exportHrRecordExcel = (rid: number, filename: string) =>
  downloadBlob(`/Hr/records/${rid}/xlsx`, filename);

export const exportHrTemplateExcel = (
  templateId: number,
  filename: string,
  params: { search?: string; status?: HrRecordStatus } = {}
) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return downloadBlob(`/Hr/templates/${templateId}/xlsx${suffix}`, filename);
};

// ── Published PDF versions (the client-facing deliverable) ───────────────
// Staff publish a record's PDF; every publish appends a version (latest =
// current, history retained). Clients only ever consume these stored
// versions — the live form and Excel are staff-only.

export interface HrPdfVersion {
  versionNo: number;
  isCurrent: boolean;
  generatedAt: string;
  byteSize: number;
  // Whether this version also has a frozen Excel (versions published before
  // migration 138 are PDF-only).
  hasXlsx: boolean;
}

export const publishHrRecordPdf = (rid: number) =>
  request<{ versionNo: number; byteSize: number; filename: string }>(
    `/Hr/records/${rid}/pdf-versions`,
    { method: "POST" }
  );

// Undo a publish (e.g. a report published by mistake). Deletes every published
// version so the record reverts to "not published" and viewers can no longer
// see it. Re-publishing regenerates from the live record at v1.
export const unpublishHrRecordPdf = (rid: number) =>
  request<{ removed: number }>(`/Hr/records/${rid}/pdf-versions`, { method: "DELETE" });

// ── QMS roll-up ───────────────────────────────────────────────────────────
// Populates a "Half-Yearly / Yearly" Quality Monitoring Scores record from the
// "Monthly / Quarterly" records inside its period. Snapshot, re-runnable.
// `assumptions` documents the aggregation rules the server applied — surface
// them, they have not been signed off by QA yet.
export interface QmsRollupSource {
  id: number;
  title: string;
  period: string;
  periodKind: string | null;
}
export interface QmsRollupSourceDetail extends QmsRollupSource {
  used: boolean;
  rows: number;
  checks: number;
  hasOverallRows: boolean;
}
export interface QmsRollupResponse {
  sourcesUsed: QmsRollupSource[];
  sourcesIgnored: QmsRollupSource[];
  sources: QmsRollupSourceDetail[];
  usedCount: number;
  monthsWithOverall: number;
  fieldsWritten: number;
  assumptions: string[];
}

export const populateQmsFromMonthly = (rid: number) =>
  request<QmsRollupResponse>(`/Hr/records/${rid}/populate-from-monthly`, { method: "POST" });

// Template codes that support the roll-up action.
export const QMS_PERIODIC_CODE = "qc-mechanism-periodic";

// ── T&D 2.1 auto-read from the training meeting report ────────────────────
export interface TdMeetingRollupResponse {
  meetingRecord: string;
  quarter: string;
  rowsWritten: number;
  fromTotal: number;
  excludedWorkshops: number;
  excludedOutOfQuarter: number;
  skippedUndated: number;
  assumptions: string[];
}
export const populateTdFromTrainingMeeting = (rid: number) =>
  request<TdMeetingRollupResponse>(`/Hr/records/${rid}/populate-from-training-meeting`, { method: "POST" });

export const TD_TEMPLATE_CODE = "training-development";

export const listHrRecordPdfVersions = (rid: number) =>
  request<HrPdfVersion[]>(`/Hr/records/${rid}/pdf-versions`);

// Downloads a published version. format 'xlsx' fetches the frozen Excel; the
// default 'pdf' fetches the PDF. Omit `version` for the current published one.
export const downloadHrRecordPdfVersion = (
  rid: number,
  filename: string,
  version?: number,
  format: "pdf" | "xlsx" = "pdf"
) => {
  const params = new URLSearchParams();
  if (version != null) params.set("version", String(version));
  if (format === "xlsx") params.set("format", "xlsx");
  const q = params.toString();
  return downloadBlob(`/Hr/records/${rid}/pdf-versions/download${q ? `?${q}` : ""}`, filename);
};

// Fetch the current (or a specific) published PDF version and return a blob
// object URL for in-app preview (iframe in a modal — popping a new window
// gets popup-blocked / downloaded by some browsers). Caller MUST revoke the
// URL when the preview closes.
export async function getHrRecordPdfObjectUrl(rid: number, version?: number): Promise<string> {
  const suffix = version != null ? `?version=${version}` : "";
  const res = await fetch(
    `${BASE_URL}/Hr/records/${rid}/pdf-versions/download${suffix}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  const blob = await res.blob();
  // Force the viewable type — a missing/octet-stream type makes browsers
  // download instead of render.
  const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  return URL.createObjectURL(pdfBlob);
}

