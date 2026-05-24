import { useLogoPlate, type LogoPlateOverride } from "../utils/logoPlate";
import { onProjectLogoError } from "../services/catalog";

// The ONE place a project logo is allowed to render. Every site (project
// card, project page header, chart brand strip, and the PDF via the export
// param) puts the logo on a tile chosen from the logo's own brightness —
// dark slate for light/white logos, white for dark logos. Never the accent
// color, so it can never blend into the mark.
//
// Presentational only. Callers control the tile box (size / rounding /
// padding) via `className` and the logo size via `imgClassName`.

interface ProjectLogoPlateProps {
  /** Resolved logo URL (already passed through getLogoUrl). */
  src: string;
  alt: string;
  /** Tile box classes: dimensions, rounding, padding. */
  className?: string;
  /** Logo classes inside the tile (object-contain is always applied). */
  imgClassName?: string;
  title?: string;
  /** Per-project DB override (avaya_projects.logo_plate_mode). */
  override?: LogoPlateOverride;
}

export default function ProjectLogoPlate({
  src,
  alt,
  className = "",
  imgClassName = "",
  title,
  override,
}: ProjectLogoPlateProps) {
  const plate = useLogoPlate(src, override);
  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-hidden ${
        plate.border ? "ring-1 ring-on-surface-variant/15" : ""
      } ${className}`}
      style={{ backgroundColor: plate.bg }}
      title={title}
    >
      <img
        src={src}
        onError={onProjectLogoError}
        alt={alt}
        className={`object-contain ${imgClassName}`}
      />
    </div>
  );
}
