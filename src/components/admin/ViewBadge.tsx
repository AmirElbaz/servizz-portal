// Small colored pill that labels a "view" (raw / grouped / summary / interval / ...).
// Colors are picked deterministically from a fixed palette via a string hash, so:
//   - the same view name always gets the same color within a report
//   - future reports with arbitrary view names (e.g. "daily", "weekly", "pivot")
//     get distinct colors automatically — no hard-coded mapping required.
//
// The palette uses Tailwind's default color scales. Make sure each class string
// appears as a literal below so Tailwind's JIT scanner picks them up.

// Darker text on the same light backgrounds for better contrast — *-800 on
// *-100 passes WCAG AA at small sizes. Keep borders at *-200 for softness.
const PALETTE = [
  { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-200" },
  { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-200" },
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  { bg: "bg-violet-100",  text: "text-violet-800",  border: "border-violet-200" },
  { bg: "bg-rose-100",    text: "text-rose-800",    border: "border-rose-200" },
  { bg: "bg-cyan-100",    text: "text-cyan-800",    border: "border-cyan-200" },
  { bg: "bg-orange-100",  text: "text-orange-800",  border: "border-orange-200" },
  { bg: "bg-teal-100",    text: "text-teal-800",    border: "border-teal-200" },
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getViewPalette(view: string) {
  return PALETTE[hashString(view) % PALETTE.length];
}

interface ViewBadgeProps {
  view: string;
  size?: "xs" | "sm";
}

export default function ViewBadge({ view, size = "xs" }: ViewBadgeProps) {
  const { bg, text, border } = getViewPalette(view);
  // Bumped sizes in Pass 2 for WCAG AA compliance: xs was 9px (too small),
  // now 10px; sm was 10px, now 11px.
  const sizeClass =
    size === "sm"
      ? "px-2 py-0.5 text-[11px]"
      : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded font-bold uppercase tracking-wider border ${bg} ${text} ${border} ${sizeClass}`}
    >
      {view}
    </span>
  );
}
