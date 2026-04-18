import { departmentIconUrl } from "../services/catalog";

interface DepartmentIconProps {
  icon: string | null | undefined;
  /** Pixel size for both <img> width/height and Material Symbols font-size. */
  size?: number;
  /** Extra classes (color, margin, etc.) applied to either the <img> or the <span>. */
  className?: string;
  /** Material Symbols icon name to fall back to when icon is empty/null. */
  fallback?: string;
  /** Extra style for the Material Symbols span (e.g. `fontVariationSettings`). */
  symbolStyle?: React.CSSProperties;
}

// Renders a department icon in one of two ways:
//
//   - If `icon` looks like an uploaded filename (contains a dot) → renders
//     <img> from /api/Catalog/department-icons/{filename}.
//   - Otherwise → renders as a Material Symbols Outlined icon name.
//
// Use this anywhere a department icon needs to be displayed outside the admin
// panel so the two rendering modes stay consistent across the app.
export default function DepartmentIcon({
  icon,
  size = 22,
  className = "",
  fallback = "domain",
  symbolStyle,
}: DepartmentIconProps) {
  const url = departmentIconUrl(icon);

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size, ...symbolStyle }}
    >
      {icon || fallback}
    </span>
  );
}
