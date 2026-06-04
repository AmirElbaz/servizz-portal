import { API_BASE_URL as BASE_URL } from "./config";

// API client for the Repeat-Caller Analytics report (IVR & Queue metrics 3-5).
// Mirrors the response shape returned by `RepeatCallersController.Get`.
//
// Rows are keyed by the canonical `projectName` (e.g. "MTCA"), the same value
// stored on catalog projects — join on it to map a row to a catalog project.
// Projects with no calls in the period are simply absent from `rows`.

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

export interface RepeatCallerRow {
  projectName: string; // canonical project_name (join key)
  totalCalls: number; // distinct calls with a caller ID
  uniqueContacts: number; // distinct caller numbers (= oneTime + repeat)
  oneTime: number; // didn't ring back within 72h
  repeat: number; // rang back within 72h of a prior call
}

export interface RepeatCallersResponse {
  year: number;
  month: number; // 1-12
  rows: RepeatCallerRow[];
}

export interface FetchRepeatCallersParams {
  project?: string | null; // catalog project code; null/omitted = all allowed
  year: number;
  month: number; // 1-12
}

export function fetchRepeatCallers(
  { project, year, month }: FetchRepeatCallersParams,
): Promise<RepeatCallersResponse> {
  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  qs.set("year", String(year));
  qs.set("month", String(month));
  return request<RepeatCallersResponse>(`/RepeatCallers?${qs.toString()}`);
}

// ── Drill-down (card-as-filter) ────────────────────────────────────────────
export type ContactFilter = "all" | "once" | "repeat";

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CallRecord {
  projectName: string;
  caller: string;
  callTime: string; // ISO timestamp
  skillset: string | null;
}

export interface ContactRecord {
  projectName: string;
  caller: string;
  callCount: number;
  isRepeat: boolean;
  firstCall: string;
  lastCall: string;
}

export interface DrillParams {
  project?: string | null;
  year: number;
  month: number;
  page: number;
  pageSize: number;
}

export function fetchRepeatCallerCalls(p: DrillParams): Promise<Paged<CallRecord>> {
  const qs = new URLSearchParams();
  if (p.project) qs.set("project", p.project);
  qs.set("year", String(p.year));
  qs.set("month", String(p.month));
  qs.set("page", String(p.page));
  qs.set("pageSize", String(p.pageSize));
  return request<Paged<CallRecord>>(`/RepeatCallers/calls?${qs.toString()}`);
}

export function fetchRepeatCallerContacts(
  p: DrillParams & { filter: ContactFilter },
): Promise<Paged<ContactRecord>> {
  const qs = new URLSearchParams();
  if (p.project) qs.set("project", p.project);
  qs.set("year", String(p.year));
  qs.set("month", String(p.month));
  qs.set("filter", p.filter);
  qs.set("page", String(p.page));
  qs.set("pageSize", String(p.pageSize));
  return request<Paged<ContactRecord>>(`/RepeatCallers/contacts?${qs.toString()}`);
}

export interface RepeatCallersExportParams {
  format: "excel" | "pdf";
  project?: string | null;
  year: number;
  month: number; // 1-12
  // Which table the page is showing — the export mirrors it.
  view?: "summary" | "calls" | "contacts";
  filter?: ContactFilter; // contacts view only
  projectName?: string;
  projectLogo?: string;
  // Resolved logo-plate background (utils/logoPlate.ts) — matches the
  // on-screen tile. NOT the accent. PDF-only.
  projectAccent?: string;
  // Rendered chart-card PNG snapshot. PDF-only; backend embeds it unmodified.
  // Excel ignores it.
  chartImages?: Blob[];
}

// Triggers a browser download of the rendered report. POSTs as multipart so
// the PDF path can carry the chart snapshot; auth header attached the same way
// as the JSON fetcher so a missing grant yields a clean 403.
export async function downloadRepeatCallersExport(params: RepeatCallersExportParams): Promise<void> {
  const qs = new URLSearchParams();
  if (params.project) qs.set("project", params.project);
  qs.set("year", String(params.year));
  qs.set("month", String(params.month));
  if (params.view) qs.set("view", params.view);
  if (params.filter) qs.set("filter", params.filter);
  if (params.projectName) qs.set("projectName", params.projectName);
  if (params.projectLogo) qs.set("projectLogo", params.projectLogo);
  if (params.projectAccent) qs.set("projectAccent", params.projectAccent);
  qs.set("format", params.format);

  const body = new FormData();
  if (params.format === "pdf" && params.chartImages && params.chartImages.length > 0) {
    params.chartImages.forEach((img, i) => body.append("chartImages", img, `chart-${i}.png`));
  }

  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/RepeatCallers/export?${qs.toString()}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);

  const blob = await res.blob();
  const filename =
    res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
    `repeat-callers.${params.format === "pdf" ? "pdf" : "xlsx"}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
