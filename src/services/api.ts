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

export interface PaginatedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type GroupMode = "hourly" | "daily" | "weekly" | "monthly";

export interface GroupedRow {
  SkillsetName: string | null;
  Period: string | null;
  Date: string | null;
  Hour: string | null;
  Offered: number;
  Answered: number;
  Abandoned: number;
  // Derived metrics. Server returns null when the bucket has no Offered (PCA, GOS)
  // or no Answered (ATT/AWT/AHT) rows — UI renders "—" for null cells.
  // PCA = Percentage of Calls Answered (formerly "Service Level").
  PCA: number | null;
  GOS: number | null;
  ATT: number | null;
  AWT: number | null;
  AHT: number | null;
  WaitTime: number;
  PCPTime: number;
  PresentingTime: number;
  NumberOfTimesOnHold: number;
  HoldTime: number;
  ConsultTime: number;
  HandlingTime: number;
  SksAbandonDelay: number;
  SksAcceptedDelay: number;
  RecordCount: number;
}

export interface ChartPoint {
  Date: string;
  Answered: number;
  Abandoned: number;
}

export interface SummaryData {
  offered: number;
  answered: number;
  abandoned: number;
  // PCA (Percentage of Calls Answered) — same math as legacy "Service Level".
  pca: number;
}

export function fetchRawData(
  dateFrom: string,
  dateTo: string,
  page: number,
  pageSize: number,
  project?: string,
  workingHoursOnly = false
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(
    `/SkillsetReport/raw?dateFrom=${dateFrom}&dateTo=${dateTo}&page=${page}&pageSize=${pageSize}${p}${wh}`
  );
}

export function fetchGroupedData(
  dateFrom: string,
  dateTo: string,
  mode: GroupMode,
  page: number,
  pageSize: number,
  project?: string,
  groupBySkillset = true,
  workingHoursOnly = false
): Promise<PaginatedResponse<GroupedRow>> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(
    `/SkillsetReport/grouped?dateFrom=${dateFrom}&dateTo=${dateTo}&mode=${mode}&page=${page}&pageSize=${pageSize}${p}&groupBySkillset=${groupBySkillset}${wh}`
  );
}

export function fetchChartData(
  dateFrom: string,
  dateTo: string,
  project?: string,
  mode = "daily",
  workingHoursOnly = false
): Promise<ChartPoint[]> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(`/SkillsetReport/chart?dateFrom=${dateFrom}&dateTo=${dateTo}${p}&mode=${mode}${wh}`);
}

export function fetchSummary(
  dateFrom: string,
  dateTo: string,
  project?: string,
  workingHoursOnly = false
): Promise<SummaryData> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(`/SkillsetReport/summary?dateFrom=${dateFrom}&dateTo=${dateTo}${p}${wh}`);
}

export interface DashboardSummaryData {
  offered: number;
  answered: number;
  pca: number;
}

export function fetchDashboardSummary(
  dateFrom: string,
  dateTo: string,
  project?: string,
  workingHoursOnly = false
): Promise<DashboardSummaryData> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(`/SkillsetReport/dashboard-summary?dateFrom=${dateFrom}&dateTo=${dateTo}${p}${wh}`);
}

// ── Abandoned Calls Within 5 Seconds of Reaching Queue ──────────────────────
// Sibling of the skillset endpoints above but a different data slice
// (FinalDisposition = 'AD' AND SksAbandonDelay <= 5), a 4-column table, a
// single trend chart, and hourly/daily/monthly/yearly grouping. Backed by
// the dedicated AbandonedWithin5sReportController.

export type Abandoned5sGroupMode = "hourly" | "daily" | "monthly" | "yearly";

export interface Abandoned5sRow {
  SkillsetName: string | null;
  Date: string | null;
  Period: string | null;
  AbandonedCalls: number;
}

export interface Abandoned5sChartPoint {
  Date: string;
  AbandonedCalls: number;
}

export interface Abandoned5sSummary {
  abandoned: number;
}

export function fetchAbandoned5sGrouped(
  dateFrom: string,
  dateTo: string,
  mode: Abandoned5sGroupMode,
  page: number,
  pageSize: number,
  project?: string,
  groupBySkillset = true,
  workingHoursOnly = false
): Promise<PaginatedResponse<Abandoned5sRow>> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(
    `/AbandonedWithin5sReport/grouped?dateFrom=${dateFrom}&dateTo=${dateTo}&mode=${mode}&page=${page}&pageSize=${pageSize}${p}&groupBySkillset=${groupBySkillset}${wh}`
  );
}

export function fetchAbandoned5sChart(
  dateFrom: string,
  dateTo: string,
  project?: string,
  mode: Abandoned5sGroupMode = "daily",
  workingHoursOnly = false
): Promise<Abandoned5sChartPoint[]> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(
    `/AbandonedWithin5sReport/chart?dateFrom=${dateFrom}&dateTo=${dateTo}${p}&mode=${mode}${wh}`
  );
}

export function fetchAbandoned5sSummary(
  dateFrom: string,
  dateTo: string,
  project?: string,
  workingHoursOnly = false
): Promise<Abandoned5sSummary> {
  const p = project ? `&project=${project}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  return request(
    `/AbandonedWithin5sReport/summary?dateFrom=${dateFrom}&dateTo=${dateTo}${p}${wh}`
  );
}

export async function downloadAbandoned5sExport(
  dateFrom: string,
  dateTo: string,
  mode: Abandoned5sGroupMode,
  project?: string,
  groupBySkillset = true,
  format: "excel" | "pdf" = "excel",
  projectName?: string,
  projectLogo?: string,
  workingHoursOnly = false,
  chartImages?: Blob[],
  // Resolved logo-plate background (see utils/logoPlate.ts) — the same tile
  // the on-screen logo renders on, so the PDF chip matches. NOT the accent;
  // chosen from the logo's brightness. PDF-only; Excel ignores it.
  projectAccent?: string
): Promise<void> {
  const p = project ? `&project=${project}` : "";
  const pn = projectName ? `&projectName=${encodeURIComponent(projectName)}` : "";
  const pl = projectLogo ? `&projectLogo=${encodeURIComponent(projectLogo)}` : "";
  const pa = projectAccent ? `&projectAccent=${encodeURIComponent(projectAccent)}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  const url = `${BASE_URL}/AbandonedWithin5sReport/export?dateFrom=${dateFrom}&dateTo=${dateTo}&mode=${mode}${p}&groupBySkillset=${groupBySkillset}&format=${format}${pn}${pl}${pa}${wh}`;

  const body = new FormData();
  if (format === "pdf" && chartImages && chartImages.length > 0) {
    chartImages.forEach((img, i) => body.append("chartImages", img, `chart-${i}.png`));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body,
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `AbandonedWithin5s_${mode}_${dateFrom}_${dateTo}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadExport(
  dateFrom: string,
  dateTo: string,
  mode: string,
  project?: string,
  groupBySkillset = true,
  format: "excel" | "pdf" = "excel",
  projectName?: string,
  projectLogo?: string,
  workingHoursOnly = false,
  // PDF only: chart cards captured client-side via html2canvas. Excel ignores
  // these. Backend embeds them between the cover page and the data table so
  // the PDF reflects exactly what the user sees on screen — single source of
  // truth for chart styling.
  chartImages?: Blob[],
  // Resolved logo-plate background (see utils/logoPlate.ts) — the same tile
  // the on-screen logo renders on, so the PDF chip matches. NOT the accent;
  // chosen from the logo's brightness. PDF-only; Excel ignores it.
  projectAccent?: string
): Promise<void> {
  const p = project ? `&project=${project}` : "";
  const pn = projectName ? `&projectName=${encodeURIComponent(projectName)}` : "";
  const pl = projectLogo ? `&projectLogo=${encodeURIComponent(projectLogo)}` : "";
  const pa = projectAccent ? `&projectAccent=${encodeURIComponent(projectAccent)}` : "";
  const wh = workingHoursOnly ? `&workingHoursOnly=true` : "";
  const url = `${BASE_URL}/SkillsetReport/export?dateFrom=${dateFrom}&dateTo=${dateTo}&mode=${mode}${p}&groupBySkillset=${groupBySkillset}&format=${format}${pn}${pl}${pa}${wh}`;

  const body = new FormData();
  if (format === "pdf" && chartImages && chartImages.length > 0) {
    chartImages.forEach((img, i) => body.append("chartImages", img, `chart-${i}.png`));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body,
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Report_${mode}_${dateFrom}_${dateTo}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
