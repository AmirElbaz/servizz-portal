import { API_BASE_URL as BASE_URL } from "./config";

// API client for the generic /api/Modules endpoints. Used by every module
// whose `module_kind = 'file_uploads'` (BDF Reports first).

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...getAuthHeaders() },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export interface ModuleSummary {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  moduleKind: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ModuleGroupSummary {
  id: number;
  moduleCode: string;
  departmentId: number;
  departmentCode: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  fileCount: number;
}

export interface UploadedFileSummary {
  id: number;
  moduleCode: string;
  groupId: number | null;
  groupCode: string | null;
  groupName: string | null;
  departmentId: number;
  uploadedBy: number;
  uploadedByName: string | null;
  uploadedAt: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  currentDecision: "approved" | "rejected" | "pending" | null;
  currentReviewedAt: string | null;
}

export interface FileListResponse {
  rows: UploadedFileSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function listModulesForDepartment(deptCode: string): Promise<ModuleSummary[]> {
  return request(`/Modules?department=${encodeURIComponent(deptCode)}`);
}

export function getModule(moduleCode: string, department?: string): Promise<{
  module: ModuleSummary;
  groups: ModuleGroupSummary[];
}> {
  const qs = department ? `?department=${encodeURIComponent(department)}` : "";
  return request(`/Modules/${encodeURIComponent(moduleCode)}${qs}`);
}

export function listGroups(moduleCode: string, department?: string): Promise<ModuleGroupSummary[]> {
  const qs = department ? `?department=${encodeURIComponent(department)}` : "";
  return request(`/Modules/${encodeURIComponent(moduleCode)}/groups${qs}`);
}

export function createGroup(moduleCode: string, body: {
  code: string; name: string; description?: string; icon?: string; departmentCode: string;
}): Promise<{ id: number }> {
  return request(`/Modules/${encodeURIComponent(moduleCode)}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateGroup(moduleCode: string, groupId: number, body: {
  name?: string; description?: string; icon?: string; sortOrder?: number; isActive?: boolean;
}): Promise<void> {
  return request(`/Modules/${encodeURIComponent(moduleCode)}/groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deactivateGroup(moduleCode: string, groupId: number): Promise<void> {
  return request(`/Modules/${encodeURIComponent(moduleCode)}/groups/${groupId}`, {
    method: "DELETE",
  });
}

export interface ListFilesParams {
  groupId?: number;
  from?: string;
  to?: string;
  q?: string;
  uploadedBy?: number;
  page?: number;
  pageSize?: number;
}

export function listFiles(moduleCode: string, p: ListFilesParams = {}): Promise<FileListResponse> {
  const qs = new URLSearchParams();
  if (p.groupId != null) qs.set("groupId", String(p.groupId));
  if (p.from) qs.set("from", p.from);
  if (p.to) qs.set("to", p.to);
  if (p.q) qs.set("q", p.q);
  if (p.uploadedBy != null) qs.set("uploadedBy", String(p.uploadedBy));
  if (p.page != null) qs.set("page", String(p.page));
  if (p.pageSize != null) qs.set("pageSize", String(p.pageSize));
  return request(`/Modules/${encodeURIComponent(moduleCode)}/files?${qs.toString()}`);
}

export function getFile(moduleCode: string, fileId: number): Promise<UploadedFileSummary> {
  return request(`/Modules/${encodeURIComponent(moduleCode)}/files/${fileId}`);
}

export async function uploadFile(
  moduleCode: string,
  groupId: number,
  file: File,
  metadata?: Record<string, unknown>,
): Promise<{ id: number }> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("groupId", String(groupId));
  if (metadata) fd.set("metadata", JSON.stringify(metadata));

  const res = await fetch(`${BASE_URL}/Modules/${encodeURIComponent(moduleCode)}/files`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: fd,
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export function downloadFileUrl(moduleCode: string, fileId: number): string {
  return `${BASE_URL}/Modules/${encodeURIComponent(moduleCode)}/files/${fileId}/content`;
}

// Fetches the file bytes with the auth header attached. Default response
// uses Content-Disposition: inline so the resulting Blob is safe to render
// in an iframe via URL.createObjectURL. The in-page Preview modal uses this.
//
// The blob is re-wrapped with an explicit application/pdf type as a
// belt-and-braces against browsers that inherit subtle attachment cues
// from the original response (Chromium has done this in past versions).
export async function fetchFileBlob(moduleCode: string, fileId: number): Promise<Blob> {
  const res = await fetch(downloadFileUrl(moduleCode, fileId), { headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const raw = await res.blob();
  return new Blob([raw], { type: raw.type || "application/pdf" });
}

// Triggers a browser download — uses ?download=true so the response carries
// Content-Disposition: attachment, which is the browser's "Save As" trigger.
export async function downloadFile(moduleCode: string, fileId: number, filename: string): Promise<void> {
  const res = await fetch(`${downloadFileUrl(moduleCode, fileId)}?download=true`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// POST a new PDF to replace the bytes of an existing file. The file id
// stays stable; the row's filename / sha256 / size / mime / uploaded_at /
// uploaded_by all update. Old storage blob is preserved on disk for audit.
export async function replaceFile(
  moduleCode: string,
  fileId: number,
  file: File,
): Promise<void> {
  const fd = new FormData();
  fd.set("file", file);

  const token = localStorage.getItem("token");
  const res = await fetch(
    `${BASE_URL}/Modules/${encodeURIComponent(moduleCode)}/files/${fileId}/replace`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    },
  );
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Replace failed: ${res.status}`);
  }
}

export function softDeleteFile(moduleCode: string, fileId: number): Promise<void> {
  return request(`/Modules/${encodeURIComponent(moduleCode)}/files/${fileId}`, {
    method: "DELETE",
  });
}
