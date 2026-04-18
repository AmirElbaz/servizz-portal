import { API_BASE_URL as BASE_URL } from "./config";

function getAuthHeaders(withJson = false): HeadersInit {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: {
      ...getAuthHeaders(!!init?.body),
      ...(init?.headers ?? {}),
    },
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

// ── ETag-aware variant for the policy editor ──────────────────────────────
// Returns both the parsed body and the ETag response header. When writing,
// accepts an optional If-Match header. A 412 Precondition Failed is surfaced
// as a ConcurrencyError so the caller can show a reload prompt.

export class ConcurrencyError extends Error {
  constructor(message = "This record was modified by another user.") {
    super(message);
    this.name = "ConcurrencyError";
  }
}

interface EtagRequestOptions {
  method?: string;
  body?: string;
  ifMatch?: string | null;
}

async function requestWithEtag<T>(
  url: string,
  options: EtagRequestOptions = {}
): Promise<{ data: T; etag: string | null }> {
  const hasBody = !!options.body;
  const headers: Record<string, string> = {
    ...(getAuthHeaders(hasBody) as Record<string, string>),
  };
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

// ── Shared catalog endpoints (not under /Admin) ──────────────────────────────
export interface RegisteredReport {
  code: string;
  name: string;
  viewCount: number;
  columnCount: number;
}
export interface ReportSchemaColumn {
  key: string;
  label: string;
  views: string[];
}
export interface ReportSchema {
  reportCode: string;
  name: string;
  columns: ReportSchemaColumn[];
}

export const getRegisteredReports = () =>
  request<RegisteredReport[]>("/Catalog/registered-reports");

export const getReportSchema = (code: string) =>
  request<ReportSchema>(`/Catalog/reports/${encodeURIComponent(code)}/schema`);

// ── Users ────────────────────────────────────────────────────────────────────
export interface AdminUserPolicy {
  id: number;
  code: string;
  name: string;
}
export interface AdminUser {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  lastSeen: string | null;
  policies: AdminUserPolicy[];
}

export const listUsers = () => request<AdminUser[]>("/Admin/users");

export const setUserAdmin = (id: number, isAdmin: boolean) =>
  request<void>(`/Admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isAdmin }),
  });

export const setUserPolicies = (id: number, policyIds: number[]) =>
  request<void>(`/Admin/users/${id}/policies`, {
    method: "PUT",
    body: JSON.stringify({ policyIds }),
  });

// ── Departments ──────────────────────────────────────────────────────────────
export interface AdminDepartment {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export const listDepartments = () => request<AdminDepartment[]>("/Admin/departments");

export const createDepartment = (body: Omit<AdminDepartment, "id">) =>
  request<AdminDepartment>("/Admin/departments", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateDepartment = (
  id: number,
  body: { name: string; description: string | null; icon: string | null }
) =>
  request<void>(`/Admin/departments/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteDepartment = (id: number) =>
  request<void>(`/Admin/departments/${id}`, { method: "DELETE" });

// Multipart upload for a department icon image (PNG / SVG / JPG / WebP, ≤500KB).
// Returns the stored filename which is also written into departments.icon.
export async function uploadDepartmentIcon(
  id: number,
  file: File
): Promise<{ icon: string }> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/Admin/departments/${id}/icon`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Upload failed: ${res.status}`);
  }
  return res.json();
}

// Re-exported from catalog.ts so admin pages can import it from here.
// Single source of truth lives in catalog.ts because non-admin pages need it too.
export { departmentIconUrl } from "./catalog";

// ── Structure (projects, project_departments, placements) ───────────────────
export interface AdminStructureProject {
  id: number;
  code: string;
  displayName: string;
  projectName: string;
  colorHex: string;
}
export interface AdminProjectDepartment {
  id: number;
  projectId: number;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
}
export interface AdminReportPlacement {
  id: number;
  projectDepartmentId: number;
  reportId: number;
  reportCode: string;
  reportName: string;
}
export interface AdminReportRow {
  id: number;
  code: string;
  name: string;
}
export interface AdminStructureSnapshot {
  projects: AdminStructureProject[];
  projectDepartments: AdminProjectDepartment[];
  placements: AdminReportPlacement[];
  allReports: AdminReportRow[];
}

export const getStructureSnapshot = () =>
  request<AdminStructureSnapshot>("/Admin/structure");

export const setProjectDepartments = (projectId: number, departmentIds: number[]) =>
  request<void>(`/Admin/structure/projects/${projectId}/departments`, {
    method: "PUT",
    body: JSON.stringify({ departmentIds }),
  });

export const setProjectDepartmentReports = (pdId: number, reportIds: number[]) =>
  request<void>(`/Admin/structure/project-departments/${pdId}/reports`, {
    method: "PUT",
    body: JSON.stringify({ reportIds }),
  });

// ── Policies ─────────────────────────────────────────────────────────────────
export interface AdminPolicyListItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  projectDepartmentCount: number;
  reportCount: number;
}

export interface AdminPolicyProjectDepartmentGrant {
  projectDepartmentId: number;
  projectId: number;
  projectCode: string;
  projectName: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
}
export interface AdminPolicyReportGrant {
  projectDepartmentReportId: number;
  projectDepartmentId: number;
  projectCode: string;
  departmentCode: string;
  reportId: number;
  reportCode: string;
  reportName: string;
}
export interface AdminPolicyUser {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
}

export interface AdminPolicyDetail {
  id: number;
  code: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  projectDepartments: AdminPolicyProjectDepartmentGrant[];
  reports: AdminPolicyReportGrant[];
  columns: Record<string, string[]>;
  users: AdminPolicyUser[];
}

export const listPolicies = () => request<AdminPolicyListItem[]>("/Admin/policies");

// Loads a policy and returns its ETag. The editor stores this and echoes it
// back on every save so concurrent edits by another admin surface as 412.
export const getPolicyWithEtag = (id: number) =>
  requestWithEtag<AdminPolicyDetail>(`/Admin/policies/${id}`);

export const createPolicy = (body: { code: string; name: string; description: string | null }) =>
  requestWithEtag<{ id: number }>("/Admin/policies", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updatePolicy = (
  id: number,
  body: { name: string; description: string | null },
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Admin/policies/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    ifMatch,
  });

export const deletePolicy = (id: number) =>
  request<void>(`/Admin/policies/${id}`, { method: "DELETE" });

export const setPolicyProjectDepartments = (
  id: number,
  projectDepartmentIds: number[],
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Admin/policies/${id}/project-departments`, {
    method: "PUT",
    body: JSON.stringify({ projectDepartmentIds }),
    ifMatch,
  });

export const setPolicyReports = (
  id: number,
  projectDepartmentReportIds: number[],
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Admin/policies/${id}/reports`, {
    method: "PUT",
    body: JSON.stringify({ projectDepartmentReportIds }),
    ifMatch,
  });

export const setPolicyColumns = (
  id: number,
  reportCode: string,
  columnKeys: string[],
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Admin/policies/${id}/columns`, {
    method: "PUT",
    body: JSON.stringify({ reportCode, columnKeys }),
    ifMatch,
  });

export const setPolicyUsers = (id: number, userIds: number[], ifMatch: string | null) =>
  requestWithEtag<void>(`/Admin/policies/${id}/users`, {
    method: "PUT",
    body: JSON.stringify({ userIds }),
    ifMatch,
  });

// ── User sync ────────────────────────────────────────────────────────────────
// Mirror of the backend's UserSyncService.SyncResult record. Timestamps are
// ISO strings, duration is the C# TimeSpan string format ("00:00:01.2345678").

export interface UserSyncResult {
  startedAt: string;
  finishedAt: string;
  duration: string;
  inserted: number;
  updated: number;
  sourceRows: number;
  error: string | null;
}

// Triggers an immediate user sync in addition to the hourly background tick.
// Admin-only. Server returns 400 + a human message when a sync is already
// running or when the connection strings are not configured.
export const triggerUserSync = () =>
  request<UserSyncResult>("/Admin/sync/users", { method: "POST" });
