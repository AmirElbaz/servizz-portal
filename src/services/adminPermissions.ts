import { API_BASE_URL as BASE_URL } from "./config";

// Admin-only API client for the Architecture B grant model. Used by the
// Policy Editor "Permissions" tab.

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...getAuthHeaders(),
    },
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

export interface PermissionCatalogEntry {
  code: string;
  description: string;
  category: string;
  sort_order: number;
}

export interface ScopeOptionModule { code: string; name: string; }
export interface ScopeOptionGroup {
  id: number; code: string; name: string;
  moduleCode: string; moduleName: string;
  departmentId: number; departmentCode: string; departmentName: string;
}
export interface ScopeOptionDepartment { id: number; code: string; name: string; }

export interface GrantScopes {
  modules: ScopeOptionModule[];
  groups: ScopeOptionGroup[];
  departments: ScopeOptionDepartment[];
}

export interface PolicyGrant {
  id: number;
  permissionCode: string;
  permissionDescription: string;
  permissionCategory: string;
  resourceKind: string;
  resourceId: string;
  createdAt: string;
}

export function listPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  return request("/Admin/permissions");
}

export function listGrantScopes(): Promise<GrantScopes> {
  return request("/Admin/grant-scopes");
}

export function listPolicyGrants(policyId: number): Promise<PolicyGrant[]> {
  return request(`/Admin/policies/${policyId}/grants`);
}

export function addPolicyGrant(policyId: number, body: {
  permissionCode: string; resourceKind: string; resourceId: string;
}): Promise<{ id: number }> {
  return request(`/Admin/policies/${policyId}/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function removePolicyGrant(policyId: number, grantId: number): Promise<void> {
  return request(`/Admin/policies/${policyId}/grants/${grantId}`, {
    method: "DELETE",
  });
}
