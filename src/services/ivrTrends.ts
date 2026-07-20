import { API_BASE_URL as BASE_URL } from "./config";

// API client for the IVR & Queue Analytics → Trend & Comparison report.
// Mirrors the response shape returned by `IvrTrendsController.GetComparison`
// in the backend. Null cells mean "no data" (project has no routes / no
// matching skillset rows in that bucket); zero means a real measured zero.

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

export type IvrLaneCode = "current" | "yoy1" | "yoy2" | "yoy3";
export type IvrComparison = "yoy1" | "yoy2" | "yoy3";

export interface IvrMonthlyEntry {
  month: number; // 1-12
  offered: number | null;
  answered: number | null;
  auto: number | null;
}

export interface IvrDailyEntry {
  day: number; // 1..daysInMonth
  offered: number | null;
  auto: number | null;
}

export interface IvrWeeklyEntry {
  week: number; // ISO 8601 week number (1..53)
  offered: number | null;
  answered: number | null;
  auto: number | null;
}

export interface IvrLaneData {
  code: IvrLaneCode;
  year: number;
  monthly: IvrMonthlyEntry[]; // always 12 entries Jan..Dec
  daily: IvrDailyEntry[];     // current month only
  weekly: IvrWeeklyEntry[];   // populated only when granularity="week"
  totalOffered: number | null;
  totalAnswered: number | null;
  totalAuto: number | null;
}

export interface IvrTrendComparisonResponse {
  currentYear: number;
  currentMonth: number; // 1-12
  lanes: IvrLaneData[];
}

export type IvrGranularity = "month" | "year" | "week";

export interface FetchIvrTrendsParams {
  /** Project URL code; null/undefined means "all allowed projects". */
  project?: string | null;
  /** Anchor month 1-12. Defaults to current month server-side. */
  month?: number;
  /** Anchor year. Defaults to current year server-side. */
  year?: number;
  /** Comparison lanes to include alongside the current period. */
  comparisons?: IvrComparison[];
  /**
   * Drives the response shape:
   *   "month" (default) — fetch monthly + daily; UI shows day-level chart
   *                       and a days-as-columns pivot table per month.
   *   "year"            — fetch monthly only; UI shows months-as-columns pivot.
   *                       Skips the per-day SQL queries server-side.
   */
  granularity?: IvrGranularity;
  /**
   * Hours window applied to ALL series (Offered / Answered / Auto):
   *   "all" (default) — entire day.
   *   "working"       — peak hours only (each project's working-hours window).
   * The 2025 comparison lane is static monthly data with no time-of-day, so it
   * always reflects all hours regardless of this flag.
   */
  hours?: "all" | "working";
}

function buildQueryString(params: FetchIvrTrendsParams): string {
  const qs = new URLSearchParams();
  if (params.project) qs.set("project", params.project);
  if (params.month != null) qs.set("month", params.month.toString());
  if (params.year != null) qs.set("year", params.year.toString());
  if (params.comparisons && params.comparisons.length > 0) {
    qs.set("comparisons", params.comparisons.join(","));
  }
  if (params.granularity) qs.set("granularity", params.granularity);
  // Only send the flag for the non-default (peak) case; "all" is the default.
  if (params.hours === "working") qs.set("hours", "working");
  return qs.toString();
}

export function fetchIvrTrendComparison(
  params: FetchIvrTrendsParams,
): Promise<IvrTrendComparisonResponse> {
  const query = buildQueryString(params);
  return request(`/IvrTrends/comparison${query ? `?${query}` : ""}`);
}

// A comparison period: a year plus a from–to SPAN whose units are month
// numbers (1-12) in monthly view or ISO week numbers in weekly view.
export interface IvrRangeRef {
  year: number;
  from: number;
  to: number;
}

export interface IvrExportParams {
  format: "excel" | "pdf";
  project?: string | null;
  mode: "trend" | "comparison";
  view: "monthly" | "weekly";
  /** Trend-mode anchor year. */
  year?: number;
  /** Comparison-mode periods (each a from–to span in the current grain). */
  rangeA?: IvrRangeRef;
  rangeB?: IvrRangeRef;
  projectName?: string;
  projectLogo?: string;
  // Resolved logo-plate background (utils/logoPlate.ts) — matches the
  // on-screen tile. NOT the accent. PDF-only.
  projectAccent?: string;
  // Hours window — "working" = peak hours only; else all hours. Matches the
  // on-screen toggle so the export reflects what's shown.
  hours?: "all" | "working";
  // Rendered chart-card PNG snapshots. PDF-only; the backend embeds them
  // unmodified. Excel ignores them.
  chartImages?: Blob[];
}

// Triggers a browser download of the rendered report. POSTs as multipart so
// the PDF path can carry chart snapshots; the auth header is attached the
// same way as the JSON fetcher so non-admin users get a proper 403 if their
// policy grants are missing.
export async function downloadIvrTrendExport(params: IvrExportParams): Promise<void> {
  const qs = new URLSearchParams();
  if (params.project) qs.set("project", params.project);
  qs.set("mode", params.mode);
  qs.set("view", params.view);
  if (params.year != null) qs.set("year", params.year.toString());
  // Comparison is always a from–to span. aFromMonth/aToMonth carry unit
  // numbers in the current grain (months monthly, ISO weeks weekly).
  if (params.mode === "comparison") qs.set("compareMode", "range");
  if (params.rangeA) {
    qs.set("aYear", params.rangeA.year.toString());
    qs.set("aFromMonth", params.rangeA.from.toString());
    qs.set("aToMonth", params.rangeA.to.toString());
  }
  if (params.rangeB) {
    qs.set("bYear", params.rangeB.year.toString());
    qs.set("bFromMonth", params.rangeB.from.toString());
    qs.set("bToMonth", params.rangeB.to.toString());
  }
  if (params.projectName) qs.set("projectName", params.projectName);
  if (params.projectLogo) qs.set("projectLogo", params.projectLogo);
  if (params.projectAccent) qs.set("projectAccent", params.projectAccent);
  if (params.hours === "working") qs.set("hours", "working");
  qs.set("format", params.format);

  const body = new FormData();
  if (params.format === "pdf" && params.chartImages && params.chartImages.length > 0) {
    params.chartImages.forEach((img, i) => body.append("chartImages", img, `chart-${i}.png`));
  }

  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}/IvrTrends/export?${qs.toString()}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);

  const blob = await res.blob();
  const filename =
    res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
    `ivr-trend.${params.format === "pdf" ? "pdf" : "xlsx"}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
