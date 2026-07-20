// Client for the per-project digital-channel reports (Email; Chats/Facebook/
// Walk-Ins). Backend: Controllers/ChannelReportsController.cs (api/ChannelReports).
// Data is monthly; the (year, month) filter drives a year-to-date trend + table.
import { API_BASE_URL as BASE_URL } from "./config";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type ChannelReportKind = "email" | "digital";

export interface ChannelKpi {
  label: string;
  value: string;
  accentHex?: string | null;
}

export interface ChannelMetric {
  key: string;
  label: string;
  colorHex?: string | null;
}

// One product in a Top Products breakdown (case counts by Servizz case type).
export interface ChannelProduct {
  product: string;
  rfi: number;
  rfs: number;
  sug: number;
  com: number;
}

// One physical site (Servizz.gov branch) and its walk-in count for the month.
// Walk-ins only; diacritic/casing variants of a branch are folded server-side.
export interface ChannelSiteCount {
  site: string;
  count: number;
}

export interface ChannelSection {
  channel: string; // "email" | "chats" | "facebook" | "walkins"
  title: string;
  kpis: ChannelKpi[];
  series: ChannelMetric[];
  // Each row: { label: "Jan", [seriesKey]: number | null }
  trend: Array<Record<string, unknown>>;
  tableHeaders: string[];
  // Each row keyed by header.
  tableRows: Array<Record<string, unknown>>;
  note?: string | null;
  // Optional "Top Products" breakdown (email today).
  products?: ChannelProduct[] | null;
  // When set, the table is a NON-monthly breakdown (col0 = label, col1 = value)
  // rendered as prominent cards under this heading (e.g. Workflow channel split).
  tableTitle?: string | null;
  // Walk-ins only: per-site (branch) counts for the selected month, highest
  // first. Rendered as a "Walk-ins per Site" table.
  sites?: ChannelSiteCount[] | null;
}

export interface ChannelReport {
  report: ChannelReportKind;
  projectName: string;
  year: number;
  month: number;
  sections: ChannelSection[];
}

export async function fetchChannelReport(
  project: string,
  year: number,
  month: number,
  report: ChannelReportKind,
): Promise<ChannelReport> {
  const url = `${BASE_URL}/ChannelReports/report?project=${encodeURIComponent(project)}&year=${year}&month=${month}&report=${report}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// Excel or PDF export. PDF carries the chart-card PNGs (captured via
// html-to-image) as multipart, same pattern as downloadAbandoned5sExport.
export async function downloadChannelExport(
  report: ChannelReportKind,
  project: string,
  year: number,
  month: number,
  format: "excel" | "pdf",
  projectName?: string,
  projectLogo?: string,
  chartImages?: Blob[],
  // Resolved logo-plate background (utils/logoPlate.ts) — PDF only.
  projectAccent?: string,
): Promise<void> {
  const pn = projectName ? `&projectName=${encodeURIComponent(projectName)}` : "";
  const pl = projectLogo ? `&projectLogo=${encodeURIComponent(projectLogo)}` : "";
  const pa = projectAccent ? `&projectAccent=${encodeURIComponent(projectAccent)}` : "";
  const url = `${BASE_URL}/ChannelReports/export?project=${encodeURIComponent(project)}&year=${year}&month=${month}&report=${report}&format=${format}${pn}${pl}${pa}`;

  const body = new FormData();
  if (format === "pdf" && chartImages && chartImages.length > 0) {
    chartImages.forEach((img, i) => body.append("chartImages", img, `chart-${i}.png`));
  }

  const res = await fetch(url, { method: "POST", headers: getAuthHeaders(), body });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const mm = String(month).padStart(2, "0");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${report}-report_${project}_${year}-${mm}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
