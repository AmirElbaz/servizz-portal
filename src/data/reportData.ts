export interface ReportRow {
  date: string;
  region: string;
  category: string;
  subcategory: string;
  beneficiaryId: string;
  beneficiaryName: string;
  status: string;
  claimType: string;
  amountRequested: number;
  amountApproved: number;
  amountDisbursed: number;
  currency: string;
  processingDays: number;
  assignedOfficer: string;
  department: string;
  priority: string;
  channel: string;
  verificationStatus: string;
  complianceScore: number;
  notes: string;
}

const regions = ["Valletta", "Birkirkara", "Sliema", "Mosta", "Qormi", "Zabbar", "Rabat", "Gozo"];
const categories = ["Pension", "Disability", "Healthcare", "Education", "Housing", "Unemployment"];
const subcategories = ["New Application", "Renewal", "Amendment", "Appeal", "Transfer"];
const statuses = ["Approved", "Pending", "Under Review", "Escalated", "Completed"];
const claimTypes = ["Individual", "Family", "Institutional", "Emergency"];
const priorities = ["Low", "Medium", "High", "Critical"];
const channels = ["Online", "In-Person", "Phone", "Mail"];
const verifications = ["Verified", "Pending Review", "Requires Documents"];
const officers = ["M. Borg", "J. Camilleri", "S. Vella", "D. Farrugia", "R. Grech", "A. Zammit"];
const names = ["J. Attard", "M. Cassar", "L. Galea", "P. Spiteri", "K. Mifsud", "R. Pace", "T. Bonnici", "C. Debono", "N. Cauchi", "F. Grima"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRows(count: number, startDate: Date): ReportRow[] {
  const rows: ReportRow[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.floor(Math.random() * 365));
    const requested = Math.round((Math.random() * 12000 + 500) * 100) / 100;
    const approved = Math.round(requested * (0.6 + Math.random() * 0.4) * 100) / 100;
    const disbursed = Math.random() > 0.3 ? approved : 0;

    rows.push({
      date: d.toISOString().split("T")[0],
      region: rand(regions),
      category: rand(categories),
      subcategory: rand(subcategories),
      beneficiaryId: `BN-${String(10000 + i).slice(1)}`,
      beneficiaryName: rand(names),
      status: rand(statuses),
      claimType: rand(claimTypes),
      amountRequested: requested,
      amountApproved: approved,
      amountDisbursed: disbursed,
      currency: "EUR",
      processingDays: Math.floor(Math.random() * 45) + 1,
      assignedOfficer: rand(officers),
      department: rand(["Finance", "Operations", "HR", "Legal"]),
      priority: rand(priorities),
      channel: rand(channels),
      verificationStatus: rand(verifications),
      complianceScore: Math.round((70 + Math.random() * 30) * 10) / 10,
      notes: rand(["Standard processing", "Expedited review", "Flagged for audit", "Re-submitted", "First-time applicant", "Senior citizen", "Disability allowance", ""]),
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export const reportRows = generateRows(200, new Date("2024-01-01"));

// Aggregation helpers
export type ChartMetric = "offered" | "answered" | "nonanswered";

function getIntervalKey(date: string, interval: "daily" | "weekly" | "monthly"): string {
  const d = new Date(date);
  if (interval === "daily") return date;
  if (interval === "weekly") {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function aggregateByInterval(
  rows: ReportRow[],
  interval: "daily" | "weekly" | "monthly",
  metric: ChartMetric = "offered"
) {
  const map = new Map<string, { label: string; offered: number; answered: number; nonanswered: number }>();

  for (const row of rows) {
    const key = getIntervalKey(row.date, interval);
    const isAnswered = row.amountDisbursed > 0;

    const existing = map.get(key);
    if (existing) {
      existing.offered += row.amountRequested;
      existing.answered += isAnswered ? row.amountApproved : 0;
      existing.nonanswered += isAnswered ? 0 : row.amountRequested;
    } else {
      map.set(key, {
        label: key,
        offered: row.amountRequested,
        answered: isAnswered ? row.amountApproved : 0,
        nonanswered: isAnswered ? 0 : row.amountRequested,
      });
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));

  // Return with a "value" key matching the selected metric for the chart
  return sorted.map((d) => ({
    ...d,
    value: d[metric],
  }));
}

export function aggregateByCategory(rows: ReportRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.category, (map.get(row.category) ?? 0) + row.amountApproved);
  }
  return Array.from(map.entries()).map(([name, value]) => ({
    name,
    value: Math.round(value * 100) / 100,
  }));
}

export const columns: { key: keyof ReportRow; label: string; width?: string }[] = [
  { key: "date", label: "Date", width: "100px" },
  { key: "region", label: "Region", width: "100px" },
  { key: "category", label: "Category", width: "100px" },
  { key: "subcategory", label: "Sub-Category", width: "120px" },
  { key: "beneficiaryId", label: "Beneficiary ID", width: "120px" },
  { key: "beneficiaryName", label: "Beneficiary", width: "110px" },
  { key: "status", label: "Status", width: "100px" },
  { key: "claimType", label: "Claim Type", width: "100px" },
  { key: "amountRequested", label: "Requested (€)", width: "110px" },
  { key: "amountApproved", label: "Approved (€)", width: "110px" },
  { key: "amountDisbursed", label: "Disbursed (€)", width: "110px" },
  { key: "currency", label: "Currency", width: "80px" },
  { key: "processingDays", label: "Processing Days", width: "120px" },
  { key: "assignedOfficer", label: "Officer", width: "110px" },
  { key: "department", label: "Dept", width: "90px" },
  { key: "priority", label: "Priority", width: "80px" },
  { key: "channel", label: "Channel", width: "90px" },
  { key: "verificationStatus", label: "Verification", width: "120px" },
  { key: "complianceScore", label: "Compliance %", width: "110px" },
  { key: "notes", label: "Notes", width: "160px" },
];
