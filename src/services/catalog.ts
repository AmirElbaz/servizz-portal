import { API_BASE_URL as BASE_URL } from "./config";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, { headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface CatalogProject {
  code: string;
  projectName: string;
  displayName: string;
  shortLabel: string;
  description: string | null;
  fullDescription: string | null;
  colorHex: string;
  logoFilename: string | null;
  icon: string | null;
}

export interface CatalogDepartment {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export interface CatalogReport {
  code: string;
  name: string;
  description: string | null;
  reportType: string;
  icon: string | null;
}

export function fetchCatalogProjects(): Promise<CatalogProject[]> {
  return request("/Catalog/projects");
}

export function fetchCatalogProject(code: string): Promise<CatalogProject> {
  return request(`/Catalog/projects/${encodeURIComponent(code)}`);
}

export function fetchCatalogDepartments(projectCode: string): Promise<CatalogDepartment[]> {
  return request(`/Catalog/projects/${encodeURIComponent(projectCode)}/departments`);
}

export function fetchCatalogReports(projectCode: string, departmentCode: string): Promise<CatalogReport[]> {
  return request(`/Catalog/projects/${encodeURIComponent(projectCode)}/departments/${encodeURIComponent(departmentCode)}/reports`);
}

export function fetchCatalogReport(code: string): Promise<CatalogReport> {
  return request(`/Catalog/reports/${encodeURIComponent(code)}`);
}

// Resolves a logo filename (e.g. "DSS.png") to its served URL.
export function getLogoUrl(filename: string | null | undefined): string {
  if (!filename) return "";
  return `/logos/${filename}`;
}
