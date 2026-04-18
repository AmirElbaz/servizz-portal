interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

// Low-level skeleton primitive. Uses Tailwind's animate-pulse to match the
// existing app's soft editorial tone without adding a shimmer library.
//
// Compose into higher-level skeletons (SkeletonRow, SkeletonCard, etc.) or
// use inline with explicit Tailwind classes for arbitrary shapes.
export default function Skeleton({
  className = "",
  style,
  "aria-label": ariaLabel = "Loading",
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={`animate-pulse bg-surface-container-high/70 rounded ${className}`}
      style={style}
    />
  );
}

// Skeleton of a table row with configurable column widths.
// Widths are Tailwind width classes so the caller can roughly match their
// table layout (e.g. ["w-28", "w-40", "w-full", "w-16"]).
export function SkeletonTableRow({ widths }: { widths: string[] }) {
  return (
    <tr>
      {widths.map((w, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className={`h-4 ${w}`} />
        </td>
      ))}
    </tr>
  );
}

// Skeleton card for grid layouts (e.g. the Policies page).
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full mb-1.5" />
      <Skeleton className="h-3 w-5/6 mb-4" />
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-on-surface-variant/8">
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </div>
  );
}
