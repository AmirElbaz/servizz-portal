import { API_BASE_URL as BASE_URL } from "./config";
import { fmt } from "../utils/fmt";

// HR Attrition report API client. Mirrors the bespoke /api/Attrition backend
// (see AttritionController). `pct` arrays are length 13: index 0..11 = Jan..Dec,
// index 12 = the "Yearly" column. Percentages are fractions (0.05 = 5%).

function authHeaders(withJson = false): Record<string, string> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: { ...authHeaders(!!init?.body), ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (res.status === 403) throw new Error("Forbidden");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────
export const ATTR_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const ATTR_LEVELS = ["Level 3", "Level 2", "SITES"];

export interface AttrProjectRow { id: number; name: string; level: string | null; sortOrder: number; pct: (number | null)[]; }
export interface AttrLevelRow { level: string; pct: (number | null)[]; }
export interface AttrYtdRow { level: string; headcount: number | null; left: number | null; joined: number | null; ytdAttr: number | null; }
export interface AttritionReport {
  year: number;
  projects: AttrProjectRow[];
  levelMonthly: AttrLevelRow[];
  levelYtd: AttrYtdRow[];
  total: AttrYtdRow;
}

export interface AttrProject { id: number; name: string; level: string | null; sortOrder: number; hidden: boolean; }
export interface AttrMonthProjectCell { projectId: number; name: string; level: string | null; sortOrder: number; pct: number | null; headcount: number | null; joined: number | null; left: number | null; }
export interface AttrMonthLevelCell { level: string; pct: number | null; headcount: number | null; joined: number | null; left: number | null; }
export interface AttrMonthSlice { year: number; month: number; projects: AttrMonthProjectCell[]; levels: AttrMonthLevelCell[]; }

// Payloads (null = leave blank / clear).
export interface ProjectCellPatch { projectId: number; pct?: number | null; headcount?: number | null; joined?: number | null; left?: number | null; }
export interface LevelCellPatch { level: string; pct?: number | null; headcount?: number | null; joined?: number | null; left?: number | null; }
export interface YtdRowPatch { level: string; headcount?: number | null; left?: number | null; joined?: number | null; ytdAttr?: number | null; }

export interface AttrImportResult {
  committed: boolean;
  matchedProjects: number;
  sheetProjects: number;        // projects found in the file
  coveragePercent: number;      // matched ÷ found in file
  unmatchedSheetProjects: string[];
  missingFromSheet: string[];
  projectCells: number;
  levelRows: number;
  levelCells: number;
  ytdRows: number;
  tablesFound: { attrPct: boolean; perLevel: boolean; ytd: boolean };
  warnings: string[];
}

// ── Reads ──────────────────────────────────────────────────────────────────
export const listAttritionYears = () => req<{ years: number[] }>("/Attrition/years").then((r) => r.years);
export const getAttritionYear = (year: number) => req<AttritionReport>(`/Attrition/${year}`);
export const getAttritionMonth = (year: number, month: number) => req<AttrMonthSlice>(`/Attrition/${year}/month/${month}`);
export const listAttritionProjects = (year: number) => req<AttrProject[]>(`/Attrition/${year}/projects`);

// ── Writes ─────────────────────────────────────────────────────────────────
export const upsertAttritionMonth = (year: number, month: number, body: { projects?: ProjectCellPatch[]; levels?: LevelCellPatch[] }) =>
  req<void>(`/Attrition/${year}/month/${month}`, { method: "POST", body: JSON.stringify(body) });
export const upsertAttritionYtd = (year: number, rows: YtdRowPatch[]) =>
  req<void>(`/Attrition/${year}/ytd`, { method: "PUT", body: JSON.stringify({ rows }) });
// Upload the workbook. commit=false is a dry-run preview; commit=true writes.
// FormData must NOT carry a JSON Content-Type — the browser sets the multipart
// boundary itself, so we use authHeaders without the JSON flag.
export const importAttrition = async (year: number, file: File, commit: boolean): Promise<AttrImportResult> => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/Attrition/${year}/import?commit=${commit}`, {
    method: "POST", headers: authHeaders(false), body: fd,
  });
  if (res.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/"; throw new Error("Session expired"); }
  if (res.status === 403) throw new Error("Forbidden");
  if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.message ?? `Import failed: ${res.status}`); }
  return res.json();
};
export const createAttritionProject = (year: number, body: { name: string; level?: string | null; sortOrder?: number | null }) =>
  req<AttrProject>(`/Attrition/${year}/projects`, { method: "POST", body: JSON.stringify(body) });
export const updateAttritionProject = (id: number, body: { name: string; level?: string | null; sortOrder?: number | null }) =>
  req<void>(`/Attrition/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteAttritionProject = (id: number) =>
  req<void>(`/Attrition/projects/${id}`, { method: "DELETE" });
// Soft-hide / un-hide: removes a project from the report view without deleting
// its numbers. Still shown in Manage projects so it can be brought back.
export const setAttritionProjectHidden = (id: number, hidden: boolean) =>
  req<void>(`/Attrition/projects/${id}/hidden`, { method: "PATCH", body: JSON.stringify({ hidden }) });

// ── Exports (download as blob — keeps the bearer-token flow) ────────────────
async function download(url: string, filename: string) {
  const res = await fetch(`${BASE_URL}${url}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
export const exportAttritionExcel = (year: number) => download(`/Attrition/${year}/export/xlsx`, `Attrition ${year}.xlsx`);
export const exportAttritionPdf = (year: number) => download(`/Attrition/${year}/export/pdf`, `Attrition ${year}.pdf`);

// Format a fraction as a percent string for display ("5%"). Routes through the
// app's `fmt` (en-US, ASCII digits — never Arabic-Indic on an Arabic-locale
// host). Blank (not "—") for null, since in this sparse grid an empty cell is
// meaningfully different from a real value.
export const fmtPct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "" : fmt.pct(v, 0);
