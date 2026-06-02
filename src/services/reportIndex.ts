import { API_BASE_URL as BASE_URL } from "./config";

// Client for the Report Index — the report-number → report(s) glossary.
// Reads are open to any authenticated user (the backend access-filters each
// entry's links); writes require admin and are used by the admin editor.

function authHeaders(json = false): HeadersInit {
  const token = localStorage.getItem("token");
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export interface ReportIndexLink {
  id?: number;
  label: string;
  reportCode: string | null;
  url: string;
  sortOrder: number;
}

export interface ReportIndexEntry {
  id: number;
  reportNumber: string;
  title: string;
  covers: string | null;
  frequency: string | null;
  status: "live" | "planned";
  sortOrder: number;
  links: ReportIndexLink[];
}

export interface ReportIndexEntryInput {
  reportNumber: string;
  title: string;
  covers: string | null;
  frequency: string | null;
  status: string;
  sortOrder: number;
}

async function handle(res: Response): Promise<void> {
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? `Request failed: ${res.status}`);
  }
}

export async function fetchReportIndex(): Promise<ReportIndexEntry[]> {
  const res = await fetch(`${BASE_URL}/ReportIndex`, { headers: authHeaders() });
  await handle(res);
  return res.json();
}

export async function createReportIndexEntry(input: ReportIndexEntryInput): Promise<{ id: number }> {
  const res = await fetch(`${BASE_URL}/ReportIndex`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  await handle(res);
  return res.json();
}

export async function updateReportIndexEntry(id: number, input: ReportIndexEntryInput): Promise<void> {
  const res = await fetch(`${BASE_URL}/ReportIndex/${id}`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  await handle(res);
}

export async function deleteReportIndexEntry(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/ReportIndex/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handle(res);
}

export async function setReportIndexLinks(id: number, links: ReportIndexLink[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/ReportIndex/${id}/links`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify({ links }),
  });
  await handle(res);
}
