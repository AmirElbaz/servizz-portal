import { API_BASE_URL as BASE_URL } from "./config";

// Operations Monthly Reports — the project-scoped surface on top of the shared
// template engine. Template design and section filling use the /Hr endpoints
// (services/hr.ts); these calls cover the Operations-only concerns: the
// auto-fill source catalog, a record's live auto values, and versioned PDFs.

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, { headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API error: ${res.status}`);
  }
  return res.json();
}

// ── Source-key catalog (drives the designer dropdown) ──────────────────────
export type MetricStatus = "live" | "planned";
export interface MetricCatalogEntry {
  key: string;
  label: string;
  unit: string; // "count" | "percent" | "duration"
  group: string;
  status: MetricStatus;
}

export const getMetricCatalog = () =>
  getJson<MetricCatalogEntry[]>("/Operations/metric-catalog");

// ── Live auto values for a record (project + month) ────────────────────────
export interface AutoValue {
  number: number | null;
  display: string;
}
export interface AutoValuesResponse {
  values: Record<string, AutoValue>;
}

export const getOpsAutoValues = (recordId: number) =>
  getJson<AutoValuesResponse>(`/Operations/reports/${recordId}/auto-values`);

// ── Versioned PDF ──────────────────────────────────────────────────────────
export interface OpsPdfVersion {
  versionNo: number;
  isCurrent: boolean;
  isPublished: boolean;
  generatedAt: string;
  byteSize: number;
  generatedBy: number;
}

export const listOpsPdfVersions = (recordId: number) =>
  getJson<OpsPdfVersion[]>(`/Operations/reports/${recordId}/versions`);

// Publish state per record for a whole template (one call) — drives the card's
// "published" badge and hides unpublished reports from non-admins.
export interface OpsPublishStatus {
  recordId: number;
  currentVersionNo: number | null;
  publishedVersionNo: number | null;
}

export const getOpsPublishStatus = (templateId: number, projectId?: number) =>
  getJson<OpsPublishStatus[]>(
    `/Operations/reports/publish-status?templateId=${templateId}` +
      (projectId != null ? `&projectId=${projectId}` : "")
  );

// ── Per-project section enable/disable (unified master template) ────────────
export interface OpsProjectSection {
  sectionId: number;
  name: string;
  sortOrder: number;
  enabled: boolean;
}
export interface OpsProjectSectionsResponse {
  templateId: number;
  sections: OpsProjectSection[];
}

export const getProjectSections = (projectId: number) =>
  getJson<OpsProjectSectionsResponse>(`/Operations/projects/${projectId}/sections`);

// Which project-page channel cards actually have data. The backend caches this,
// so the project page can hide the channels a project doesn't run.
export interface ChannelAvailability { voice: boolean; email: boolean; digital: boolean; ivr: boolean; }
export const getChannelAvailability = (projectCode: string) =>
  getJson<ChannelAvailability>(`/ChannelReports/availability?project=${encodeURIComponent(projectCode)}`);

export async function setProjectSections(
  projectId: number,
  sections: { sectionId: number; enabled: boolean }[]
): Promise<{ updated: number }> {
  const res = await fetch(`${BASE_URL}/Operations/projects/${projectId}/sections`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Save failed: ${res.status}`);
  }
  return res.json();
}

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json().catch(() => undefined as unknown as T);
}

// Publish the current version (visible to non-admins); unpublish hides it again.
export const publishOpsReport = (recordId: number) =>
  postJson<{ publishedVersionNo: number }>(`/Operations/reports/${recordId}/publish`);
export const unpublishOpsReport = (recordId: number) =>
  postJson<void>(`/Operations/reports/${recordId}/unpublish`);
// Make a specific version the current (default-served) one.
export const makeOpsVersionCurrent = (recordId: number, version: number) =>
  postJson<{ currentVersionNo: number }>(
    `/Operations/reports/${recordId}/versions/${version}/make-current`
  );

// Generate a NEW version (stores bytes + appends a version row). Returns the
// new version number.
export async function generateOpsPdf(
  recordId: number
): Promise<{ versionNo: number; byteSize: number; filename: string }> {
  const res = await fetch(`${BASE_URL}/Operations/reports/${recordId}/pdf`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Generate failed: ${res.status}`);
  }
  return res.json();
}

// Open latest (or a specific version) inline in a new tab for preview.
export async function previewOpsPdf(recordId: number, version?: number) {
  const qs = version != null ? `?version=${version}` : "";
  const res = await fetch(`${BASE_URL}/Operations/reports/${recordId}/pdf${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Fetch the PDF and return a blob object URL for in-app preview (iframe).
// Caller MUST URL.revokeObjectURL(url) when the preview closes.
export async function getOpsPdfObjectUrl(recordId: number, version?: number): Promise<string> {
  const qs = version != null ? `?version=${version}` : "";
  const res = await fetch(`${BASE_URL}/Operations/reports/${recordId}/pdf${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Preview failed: ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Download latest (or a specific version) as a blob.
export async function downloadOpsPdf(
  recordId: number,
  filename: string,
  version?: number
) {
  const qs = version != null ? `?version=${version}` : "";
  const res = await fetch(
    `${BASE_URL}/Operations/reports/${recordId}/pdf${qs}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
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
