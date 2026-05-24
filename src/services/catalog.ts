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
  // Present on dept-landing responses (needed for the move-to-group PATCH);
  // may be absent on older callers that only queried by code. Treat as
  // optional throughout.
  id?: number;
  code: string;
  projectName: string;
  displayName: string;
  shortLabel: string;
  description: string | null;
  fullDescription: string | null;
  colorHex: string;
  logoFilename: string | null;
  // Per-project logo-tile override. 'dark' / 'light' force the plate;
  // null = use the brightness auto-analysis (utils/logoPlate.ts).
  logoPlateMode?: "dark" | "light" | null;
  icon: string | null;
  // Group assignment — nullable. Set by /Admin/projects/{id}/group PATCH.
  // When null the project renders in the "Other" bucket on the dept
  // landing page. Only present on the `/Catalog/departments/{code}/projects`
  // response; may be undefined when the same type is reused elsewhere.
  //
  // Every user who can see the project also sees these fields — grouping
  // is read-only metadata, not a permission. Only admins can mutate groups
  // (separate Admin endpoints).
  groupId?: number | null;
  groupName?: string | null;
  groupSortOrder?: number | null;
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
  category: string | null;
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

// Universal fallback for projects without a logo (or whose logo 404s at
// runtime). Lives in /public/logos/ so it's served by the same handler as
// the real logos. The image is a brand-blue folder tile that works at 32px
// and 128px alike. If a project ever needs its own logo, just drop a file
// into the logos folder and set `avaya_projects.logo_filename`.
export const PROJECT_LOGO_FALLBACK = "/logos/generic-project.svg";

// Resolves a logo filename (e.g. "DSS.png") to its served URL. Missing /
// empty filename → generic fallback so `<img src>` never ends up on "".
export function getLogoUrl(filename: string | null | undefined): string {
  if (!filename) return PROJECT_LOGO_FALLBACK;
  return `/logos/${filename}`;
}

// Use as `<img onError={onProjectLogoError}>` on every project-logo <img>.
// Swaps the source to the generic fallback when the real logo 404s (the
// file was promised in the DB but never uploaded, or its name drifted).
// Guards against recursion: if the fallback itself fails, we stop.
export function onProjectLogoError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallback === "true") return;
  img.dataset.fallback = "true";
  img.src = PROJECT_LOGO_FALLBACK;
}

// ── Department-first catalog ───────────────────────────────────────────────

export interface CatalogDepartmentSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  projectCount: number;
  directReportCount: number;
  // Distinct reports reachable from this dept via EITHER direct attachment OR
  // project attachment. Example: the Operation dept with 14 projects all
  // pinning the same `skillset-historical` report → totalReportCount = 1.
  totalReportCount: number;
  // Codes of the modules enabled on this department (e.g.
  // ['projects'], ['templates'], ['projects', 'direct_reports']).
  // The dept landing page iterates this list and renders each enabled module.
  modules: string[];
}

// Reports exposed to a user — used both for project-scoped and direct reports.
//
// `category` is an optional grouping code (e.g. "ivr") set by the report's
// registration in `Program.cs` and surfaced through `CatalogController`.
// When non-null the frontend groups same-category reports under a single
// section header (see `IVR_CATEGORY_META` in `data/ivrPlaceholders.ts`).
// Null = the report renders in the default "All reports" bucket.
export interface CatalogReportSummary {
  code: string;
  name: string;
  description: string | null;
  reportType: string;
  icon: string | null;
  category: string | null;
}

export const fetchCatalogDepartmentList = () =>
  request<CatalogDepartmentSummary[]>("/Catalog/departments");

export const fetchCatalogDepartment = (code: string) =>
  request<CatalogDepartmentSummary>(`/Catalog/departments/${encodeURIComponent(code)}`);

export const fetchCatalogDepartmentProjects = (departmentCode: string) =>
  request<CatalogProject[]>(
    `/Catalog/departments/${encodeURIComponent(departmentCode)}/projects`
  );

export const fetchCatalogDepartmentDirectReports = (departmentCode: string) =>
  request<CatalogReportSummary[]>(
    `/Catalog/departments/${encodeURIComponent(departmentCode)}/reports`
  );

export const fetchCatalogDepartmentProjectReports = (
  departmentCode: string,
  projectCode: string
) =>
  request<CatalogReportSummary[]>(
    `/Catalog/departments/${encodeURIComponent(departmentCode)}/projects/${encodeURIComponent(projectCode)}/reports`
  );

// ── Project groups (admin only) ────────────────────────────────────────────
// Groups are per-department organizational metadata. They carry no policy
// weight — moving a project between groups does not change who can access it.

export interface ProjectGroup {
  id: number;
  departmentId: number;
  name: string;
  sortOrder: number;
  createdAt?: string;
}

export const fetchProjectGroups = (departmentId: number) =>
  request<ProjectGroup[]>(`/Admin/departments/${departmentId}/project-groups`);

export async function createProjectGroup(departmentId: number, name: string, sortOrder?: number): Promise<ProjectGroup> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/Admin/departments/${departmentId}/project-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ name, sortOrder }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Failed to create group: ${res.status}`);
  }
  return res.json();
}

export async function updateProjectGroup(id: number, patch: { name?: string; sortOrder?: number }): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/Admin/project-groups/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Failed to update group: ${res.status}`);
  }
}

export async function deleteProjectGroup(id: number): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/Admin/project-groups/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to delete group: ${res.status}`);
}

export async function moveProjectToGroup(projectId: number, groupId: number | null): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/Admin/projects/${projectId}/group`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ groupId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Failed to move project: ${res.status}`);
  }
}

// Resolves a stored department icon value to an <img> src URL when the value
// looks like an uploaded filename (contains a `.`). Returns null when the
// value is empty or looks like a Material Symbols icon name — in which case
// the caller should render it as `<span className="material-symbols-outlined">`
// instead. Used by ProjectDetailPage, ReportsPage, and the admin panel.
export function departmentIconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  if (!icon.includes(".")) return null;
  return `${BASE_URL}/Catalog/department-icons/${encodeURIComponent(icon)}`;
}
