import { API_BASE_URL as BASE_URL } from "./config";
import type { CatalogProject } from "./catalog";

// API client for the Billing → "Raw Data" report. Two views, same eight
// columns (the backend varies the SQL grain):
//   "call"     → one row per offered call
//   "skillset" → monthly aggregate per skillset
// Rows are keyed by the SQL column alias; the policy layer may drop columns the
// caller can't see, so every field is optional — the page renders whatever keys
// the response carries.

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type BillingView = "call" | "skillset";

export type BillingRawRow = Record<string, string | number | null>;

export interface BillingRawResponse {
  rows: BillingRawRow[];
  total: number;
  page: number;
  pageSize: number;
  view: BillingView;
}

// The projects this report covers (the four Billing projects), for the page's
// project dropdown. Junction-based on the backend, so it lists them regardless
// of which department owns each project.
export async function fetchBillingProjects(): Promise<CatalogProject[]> {
  const res = await fetch(`${BASE_URL}/BillingRawData/projects`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface FetchBillingRawParams {
  dateFrom: string;
  dateTo: string;
  view: BillingView;
  /** Project URL code, or undefined for all (allowed) Billing projects. */
  project?: string;
  page: number;
  pageSize: number;
}

export async function fetchBillingRawData(p: FetchBillingRawParams): Promise<BillingRawResponse> {
  const qs = new URLSearchParams({
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
    view: p.view,
    page: String(p.page),
    pageSize: String(p.pageSize),
  });
  if (p.project) qs.set("project", p.project);

  const res = await fetch(`${BASE_URL}/BillingRawData/rows?${qs.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface BillingExportParams {
  format: "excel" | "pdf";
  view: BillingView;
  dateFrom: string;
  dateTo: string;
  project?: string;
  projectName?: string;
  projectLogo?: string;
  projectAccent?: string;
}

// POST (multipart, matching the other reports' export contract — this report
// has no charts, so the body is empty). Triggers a browser download.
export async function downloadBillingRawDataExport(p: BillingExportParams): Promise<void> {
  const qs = new URLSearchParams({
    format: p.format,
    view: p.view,
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
  });
  if (p.project) qs.set("project", p.project);
  if (p.projectName) qs.set("projectName", p.projectName);
  if (p.projectLogo) qs.set("projectLogo", p.projectLogo);
  if (p.projectAccent) qs.set("projectAccent", p.projectAccent);

  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/BillingRawData/export?${qs.toString()}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: new FormData(),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);

  const blob = await res.blob();
  const filename =
    res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
    `billing-raw-data.${p.format === "pdf" ? "pdf" : "xlsx"}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
