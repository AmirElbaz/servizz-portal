// Centralised number formatting. Always use this — never call `.toLocaleString()`
// on a number directly. Locked to `en-US` so the output is always
// thousand-separated with ASCII digits, regardless of browser locale.
//
//   fmt.int(1234)         → "1,234"
//   fmt.dec(95.234)       → "95.2"        (1 decimal place by default)
//   fmt.dec(95.234, 2)    → "95.23"
//   fmt.pct(0.952)        → "95.2%"       (input is a ratio 0..1)
//   fmt.pctFromPercent(95.2) → "95.2%"    (input is already a percent value)
//   fmt.compact(12345)    → "12.3K"       (only for chart axes; full digits everywhere else)
//
// Null / undefined / NaN / non-finite → "—" so callers never have to
// special-case empty cells. This matches the convention already used by
// formatSecondsAsMmSs and the IVR trend pages.

const LOCALE = "en-US";

const INT_FMT = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const COMPACT_FMT = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export const fmt = {
  int(v: unknown): string {
    return isFiniteNum(v) ? INT_FMT.format(v) : "—";
  },

  dec(v: unknown, places = 1): string {
    if (!isFiniteNum(v)) return "—";
    return v.toLocaleString(LOCALE, {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
  },

  pct(ratio: unknown, places = 1): string {
    if (!isFiniteNum(ratio)) return "—";
    return ratio.toLocaleString(LOCALE, {
      style: "percent",
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
  },

  pctFromPercent(percent: unknown, places = 1): string {
    return isFiniteNum(percent) ? `${fmt.dec(percent, places)}%` : "—";
  },

  compact(v: unknown): string {
    return isFiniteNum(v) ? COMPACT_FMT.format(v) : "—";
  },

  // Format any value that *might* be numeric (e.g. a generic table cell).
  // Integers get `int`, non-integers get `dec` with the given precision.
  // Non-numeric values are returned unchanged via String().
  auto(v: unknown, decPlaces = 1): string {
    if (v == null) return "—";
    if (isFiniteNum(v)) {
      return Number.isInteger(v) ? fmt.int(v) : fmt.dec(v, decPlaces);
    }
    return String(v);
  },
};
