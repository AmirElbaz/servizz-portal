// Render a duration in seconds as `mm:ss` for table display.
// Returns "—" for null/undefined so callers don't have to special-case
// divide-by-zero metrics. Server values are rounded; sub-second precision
// from the API is intentionally dropped here — `mm:ss` is the readable form.
//
// Negative values can occur if a derived metric (e.g. ATT = handling - hold)
// hits unusual data; we render with a leading `-` rather than producing
// nonsense like `-1:-08`.
export function formatSecondsAsMmSs(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value < 0 ? "-" : "";
  const total = Math.round(Math.abs(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${sign}${mins}:${secs.toString().padStart(2, "0")}`;
}
