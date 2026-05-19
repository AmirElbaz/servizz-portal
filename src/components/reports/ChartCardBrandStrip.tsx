import DepartmentIcon from "../DepartmentIcon";
import { onProjectLogoError } from "../../services/catalog";

// Global brand footer for every chart card across the reporting system.
//
// Drop this at the bottom of any card that wraps a Recharts chart and the
// card automatically gains the standard branding: data-owner on the left
// (project logo + name, or dept icon + name on dept-direct pages), Servizz
// platform mark on the right with a "powered by" eyebrow.
//
// The strip sits BELOW the chart with a hairline divider above, so the
// chart itself never gets covered or shrunk. The whole component is purely
// visual — no behaviour, no state.
//
// Convention: every NEW report card must include this strip. Existing cards
// adopt it through the migration that landed alongside this file.

export type BrandScope =
  | { kind: "project"; project: { name: string; logo?: string } }
  | { kind: "dept"; dept: { name: string; icon?: string | null } };

interface ChartCardBrandStripProps {
  scope: BrandScope;
  accentColor?: string;
}

export default function ChartCardBrandStrip({ scope, accentColor }: ChartCardBrandStripProps) {
  const ownerName = scope.kind === "project" ? scope.project.name : scope.dept.name;

  return (
    {/* Logos are deliberately large here. The whole card is captured to a
        wide PNG and then scaled DOWN to A4 width in the PDF, so a small
        on-screen strip becomes illegible in the export (Amir 2026-05-18:
        "i can barely see the logos"). Sizes are ~1.75x the original. */}
    <div className="mt-4 pt-4 border-t border-on-surface-variant/6 flex items-center justify-between gap-3">
      {/* Left cluster: project icon + Servizz logo (no project name) */}
      <div className="flex items-center gap-3 min-w-0">
        {scope.kind === "project" && scope.project.logo ? (
          <img
            src={scope.project.logo}
            onError={onProjectLogoError}
            alt={ownerName}
            title={ownerName}
            className="h-8 w-auto max-w-[120px] object-contain"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
            title={ownerName}
            style={{
              backgroundColor: accentColor
                ? `color-mix(in srgb, ${accentColor} 10%, transparent)`
                : "rgba(46, 178, 255, 0.10)",
            }}
          >
            <DepartmentIcon
              icon={scope.kind === "dept" ? scope.dept.icon ?? null : null}
              size={22}
              symbolStyle={accentColor ? { color: accentColor } : undefined}
            />
          </div>
        )}
        <img
          src="/servizz-logo.png"
          alt="Servizz"
          className="h-7 w-auto shrink-0"
        />
      </div>

      {/* Right: Centrecom platform mark */}
      <img
        src="/centrecom-logo.svg"
        alt="Centrecom"
        className="h-7 w-auto shrink-0"
      />
    </div>
  );
}
