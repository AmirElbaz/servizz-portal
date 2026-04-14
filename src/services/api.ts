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

export type GroupMode = "interval" | "daily" | "weekly" | "monthly";

export interface GroupedRow {
  SkillsetName: string | null;
  Period: string | null;
  Date: string | null;
  Interval: string | null;
  Offered: number;
  Answered: number;
  Abandoned: number;
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
  serviceLevel: number;
}

export function fetchRawData(
  dateFrom: string,
  dateTo: string,
  page: number,
  pageSize: number,
  project?: string
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const p = project ? `&project=${project}` : "";
  return request(
    `/SkillsetReport/raw?dateFrom=${dateFrom}&dateTo=${dateTo}&page=${page}&pageSize=${pageSize}${p}`
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
  intervalWidth = 15
): Promise<PaginatedResponse<GroupedRow>> {
  const p = project ? `&project=${project}` : "";
  return request(
    `/SkillsetReport/grouped?dateFrom=${dateFrom}&dateTo=${dateTo}&mode=${mode}&page=${page}&pageSize=${pageSize}${p}&groupBySkillset=${groupBySkillset}&intervalWidth=${intervalWidth}`
  );
}

export function fetchChartData(
  dateFrom: string,
  dateTo: string,
  project?: string,
  mode = "daily",
  intervalWidth = 15
): Promise<ChartPoint[]> {
  const p = project ? `&project=${project}` : "";
  return request(`/SkillsetReport/chart?dateFrom=${dateFrom}&dateTo=${dateTo}${p}&mode=${mode}&intervalWidth=${intervalWidth}`);
}

export function fetchSummary(
  dateFrom: string,
  dateTo: string,
  project?: string
): Promise<SummaryData> {
  const p = project ? `&project=${project}` : "";
  return request(`/SkillsetReport/summary?dateFrom=${dateFrom}&dateTo=${dateTo}${p}`);
}

export interface DashboardSummaryData {
  offered: number;
  answered: number;
  serviceLevel: number;
}

export function fetchDashboardSummary(
  dateFrom: string,
  dateTo: string,
  project?: string
): Promise<DashboardSummaryData> {
  const p = project ? `&project=${project}` : "";
  return request(`/SkillsetReport/dashboard-summary?dateFrom=${dateFrom}&dateTo=${dateTo}${p}`);
}

export async function downloadExport(
  dateFrom: string,
  dateTo: string,
  mode: string,
  project?: string,
  groupBySkillset = true,
  intervalWidth = 15,
  format: "excel" | "pdf" = "excel",
  projectName?: string,
  projectLogo?: string
): Promise<void> {
  const p = project ? `&project=${project}` : "";
  const pn = projectName ? `&projectName=${encodeURIComponent(projectName)}` : "";
  const pl = projectLogo ? `&projectLogo=${encodeURIComponent(projectLogo)}` : "";
  const url = `${BASE_URL}/SkillsetReport/export?dateFrom=${dateFrom}&dateTo=${dateTo}&mode=${mode}${p}&groupBySkillset=${groupBySkillset}&intervalWidth=${intervalWidth}&format=${format}${pn}${pl}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Report_${mode}_${dateFrom}_${dateTo}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
