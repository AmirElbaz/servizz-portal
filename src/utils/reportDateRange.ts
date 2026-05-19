// Single source of truth for the earliest date any report's date / year
// filter can accept. Locked at 2026-01-01 — there is no production data
// before this point, and letting users pick earlier dates returns empty
// reports that look like a bug. Every report page imports REPORT_MIN_DATE
// (or REPORT_MIN_YEAR) and wires it into its date / year inputs as `min=`.
//
// When raising the floor in a future year, edit this file only.

export const REPORT_MIN_DATE = "2026-01-01";
export const REPORT_MIN_YEAR = 2026;
