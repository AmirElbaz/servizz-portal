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

// ── Grid (repeating-table) field options ──────────────────────────────────
// A 'grid' field stores its column definitions in `HrTemplateField.options` and
// its rows in `HrRecordValue.valueJson` (a JSON array of {colKey: cellValue}).
export type HrGridColumnType =
  | "text" | "number" | "date" | "select" | "rag" | "percent";

export interface HrGridColumn {
  key: string;
  label: string;
  type: HrGridColumnType;
  options?: string[]; // for select columns
}

export interface HrGridOptions {
  help?: string;
  columns: HrGridColumn[];
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
  options: unknown;
  sortOrder: number;
}

export interface HrTemplateSection {
  id: number;
  name: string;
  // Optional intro prose rendered under the section heading (QA reports).
  description: string | null;
  sortOrder: number;
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
  sections: HrTemplateSection[];
  fields: HrTemplateField[];
}

export interface HrRecordSummary {
  id: number;
  title: string;
  status: HrRecordStatus;
  createdAt: string;
  updatedAt: string;
  done: number;
  total: number;
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
export const listHrTemplates = (includeArchived = false, departmentCode?: string) => {
  const qs = new URLSearchParams({ includeArchived: String(includeArchived) });
  if (departmentCode) qs.set("departmentCode", departmentCode);
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

export const getHrTemplate = (id: number) =>
  requestWithEtag<HrTemplateDetail>(`/Hr/templates/${id}`);

export const createHrTemplate = (body: {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  // Target section. Omit/null → backend defaults to the 'hr' section.
  groupId?: number | null;
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
    createdMonth?: string;   // YYYY-MM
    page?: number;
    pageSize?: number;
  } = {}
) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.createdMonth) qs.set("createdMonth", params.createdMonth);
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
  values?: HrValuePatch[]
) =>
  requestWithEtag<{ id: number }>(`/Hr/templates/${templateId}/records`, {
    method: "POST",
    body: JSON.stringify({ title, values: values ?? [] }),
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

export const patchHrRecordValues = (
  rid: number,
  values: HrValuePatch[],
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Hr/records/${rid}/values`, {
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
