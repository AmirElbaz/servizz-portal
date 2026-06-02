import { API_BASE_URL as BASE_URL } from "./config";
import type { AccessRole } from "./auth";

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
export type SignupStatus =
  | "invited" | "email_pending" | "requested" | "pending_approval" | "active";

export interface AdminUser {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  lastSeen: string | null;
  signupStatus: SignupStatus;
  policies: AdminUserPolicy[];
}

export const listUsers = () => request<AdminUser[]>("/Admin/users");

// ── Admin invitations ────────────────────────────────────────────────────
//
// Single and batch flows. Both return the freshly generated temp passwords
// IN THE RESPONSE — they are never stored anywhere as plaintext, so the
// admin must capture them before the modal closes. The frontend exposes
// them in a copy-to-clipboard panel (single) or a downloadable .txt
// (batch).

export interface InviteUserResponse {
  id: number;
  username: string;
  tempPassword: string;
}

export interface BatchInviteRow {
  username: string;
  success: boolean;
  id: number | null;
  tempPassword: string | null;
  error: string | null;
}

export interface BatchInviteResponse {
  total: number;
  successCount: number;
  failureCount: number;
  rows: BatchInviteRow[];
}

// One row supplied by the admin to either invite endpoint. firstName +
// lastName are mandatory — backend rejects empty strings.
export interface InviteUserInput {
  username: string;
  firstName: string;
  lastName: string;
}

export const inviteUser = (input: InviteUserInput) =>
  request<InviteUserResponse>("/Admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const inviteUsersBatch = (users: InviteUserInput[]) =>
  request<BatchInviteResponse>("/Admin/users/batch", {
    method: "POST",
    body: JSON.stringify({ users }),
  });

// Re-mints a temp password for a user who is still in 'invited' or
// 'email_pending'. Returns the new plaintext password — admin captures
// it the same way as the initial invite.
export const resetUserTempPassword = (id: number) =>
  request<{ id: number; tempPassword: string }>(
    `/Admin/users/${id}/reset-temp-password`,
    { method: "POST" }
  );

// Cancel an invite. Backend rejects this if the user is already active.
export const cancelUserInvite = (id: number) =>
  request<void>(`/Admin/users/${id}`, { method: "DELETE" });

// Assign a user's access tier. Server-gated to super_admin; enforces the
// last-super_admin / self-demotion lock-out. `role` is one of the AccessRole
// values ("client" | "centrecom_user" | "admin" | "super_admin").
export const setUserRole = (id: number, role: AccessRole) =>
  request<void>(`/Admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

export const setUserPolicies = (id: number, policyIds: number[]) =>
  request<void>(`/Admin/users/${id}/policies`, {
    method: "PUT",
    body: JSON.stringify({ policyIds }),
  });

// ── Access requests (user-initiated request-access flow) ───────────────────
export interface AccessRequestRow {
  id: number;
  email: string | null;
  requestNumber: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  signupStatus: SignupStatus; // 'requested' | 'pending_approval'
  requestedAt: string | null;
}

export const fetchAccessRequests = () =>
  request<AccessRequestRow[]>("/Admin/users/access-requests");

// Approve: assign a role + policies, flipping the user to 'active'. Granting
// admin/super_admin is super-admin-only (enforced server-side).
export const approveAccessRequest = (id: number, role: AccessRole, policyIds: number[]) =>
  request<void>(`/Admin/users/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ role, policyIds }),
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
  // Added in migration 016: each project is owned by exactly one dept and
  // may be assigned to at most one group within that dept.
  departmentId: number;
  groupId: number | null;
}
export interface AdminProjectGroup {
  id: number;
  departmentId: number;
  name: string;
  sortOrder: number;
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

// Direct reports placed under a department (no project layer).
// The department-first counterpart to AdminReportPlacement.
export interface AdminDirectReportPlacement {
  id: number;                // department_reports.id
  departmentId: number;
  reportId: number;
  departmentCode: string;
  departmentName: string;
  reportCode: string;
  reportName: string;
}

// Module catalog entry (from the `modules` table). The admin UI renders one
// toggle per module on each dept; ticking adds a department_modules row.
export interface AdminModule {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
}
export interface AdminDepartmentModule {
  departmentId: number;
  moduleCode: string;
  sortOrder: number;
}

export interface AdminStructureSnapshot {
  projects: AdminStructureProject[];
  projectDepartments: AdminProjectDepartment[];
  placements: AdminReportPlacement[];
  allReports: AdminReportRow[];
  // Added in the department-first transition:
  departments: AdminDepartment[];                  // full dept list for the master column
  directReports: AdminDirectReportPlacement[];     // reports placed directly under departments
  // Added with the module registry:
  modules: AdminModule[];                          // all modules the app supports
  departmentModules: AdminDepartmentModule[];      // which modules each dept has enabled
  // Added in migration 016:
  projectGroups: AdminProjectGroup[];              // per-department project groups
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

// Department-first additions ───────────────────────────────────────────────

// Replaces the project set attached to a single department. Complements the
// legacy setProjectDepartments (which operates per-project).
export const setDepartmentProjects = (departmentId: number, projectIds: number[]) =>
  request<void>(`/Admin/structure/departments/${departmentId}/projects`, {
    method: "PUT",
    body: JSON.stringify({ projectIds }),
  });

// Replaces the direct-report set placed under a department. Used by
// departments without a project layer (HR, IT, Finance).
export const setDepartmentDirectReports = (departmentId: number, reportIds: number[]) =>
  request<void>(`/Admin/structure/departments/${departmentId}/direct-reports`, {
    method: "PUT",
    body: JSON.stringify({ reportIds }),
  });

// Replaces the module set enabled on a department. Driving list for what
// renders on the department landing page (projects section, direct reports
// section, templates section, …). Does NOT touch module content tables —
// disabling a module hides its UI; re-enabling restores it with prior content.
export const setDepartmentModules = (departmentId: number, moduleCodes: string[]) =>
  request<void>(`/Admin/structure/departments/${departmentId}/modules`, {
    method: "PUT",
    body: JSON.stringify({ moduleCodes }),
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

// Direct-report grant on a policy (department-first addition).
// Granted via the new policy_department_reports junction.
export interface AdminPolicyDirectReportGrant {
  departmentReportId: number;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  reportId: number;
  reportCode: string;
  reportName: string;
}

// Whole-department grant on a policy. A row here means "this policy grants
// access to the entire department as an entity" — all current content AND
// any future content added later (new reports, templates, records, etc.)
// without needing to re-tick anything in the editor.
export interface AdminPolicyDepartmentGrant {
  departmentId: number;
  departmentCode: string;
  departmentName: string;
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
  directReports: AdminPolicyDirectReportGrant[];   // department-first grants
  departments: AdminPolicyDepartmentGrant[];       // whole-department grants
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

// Replaces the direct-report grant set on a policy. Mirrors setPolicyReports
// but for the department-first path (no project context).
export const setPolicyDirectReports = (
  id: number,
  departmentReportIds: number[],
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Admin/policies/${id}/department-reports`, {
    method: "PUT",
    body: JSON.stringify({ departmentReportIds }),
    ifMatch,
  });

// Replaces the whole-department grant set on a policy. Top-level ticks in
// the department-first editor flow through here.
export const setPolicyDepartments = (
  id: number,
  departmentIds: number[],
  ifMatch: string | null
) =>
  requestWithEtag<void>(`/Admin/policies/${id}/departments`, {
    method: "PUT",
    body: JSON.stringify({ departmentIds }),
    ifMatch,
  });

