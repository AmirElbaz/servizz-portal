import { Link } from "react-router-dom";
import {
  IVR_CATEGORY_META,
  IVR_PLACEHOLDERS,
  type IvrPlaceholder,
} from "../../data/ivrPlaceholders";
import type { CatalogReportSummary } from "../../services/catalog";

// Renders the "IVR & Queue Analytics" group on a dept / project detail page.
//
// Inputs:
//   - `realReports`  — reports the user actually has access to with
//                      category === 'ivr'. They render as full-color real cards.
//   - `linkBuilder`  — given a report code, returns the navigation href
//                      (project-scoped vs dept-direct shape lives in the caller).
//
// Composition rule: a hardcoded placeholder is shown for every code in
// `IVR_PLACEHOLDERS` except those already represented by a real `realReports`
// entry. So when a real report is added to the catalog, the placeholder
// silently vanishes and the live card takes its place — no edit to this
// component required (it lives entirely in the data file).
export function IvrCategorySection({
  realReports,
  linkBuilder,
}: {
  realReports: CatalogReportSummary[];
  linkBuilder: (reportCode: string) => string;
}) {
  const accent = IVR_CATEGORY_META.accent;
  const realByCode = new Map(realReports.map((r) => [r.code, r]));
  const placeholdersToRender: IvrPlaceholder[] = IVR_PLACEHOLDERS.filter(
    (p) => !realByCode.has(p.code),
  );

  // No real reports AND no placeholders configured → render nothing rather
  // than an empty section (defensive — shouldn't happen in practice).
  if (realReports.length === 0 && placeholdersToRender.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-2">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          <span className="material-symbols-outlined text-lg">
            {IVR_CATEGORY_META.icon}
          </span>
        </span>
        <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
          {IVR_CATEGORY_META.label}
        </h2>
      </div>
      <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mb-5 max-w-2xl pl-12">
        {IVR_CATEGORY_META.blurb}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Real reports first, placeholders after. Both share the same card
            shape so the eye flows continuously across the row. */}
        {realReports.map((r) => (
          <Link
            key={r.code}
            to={linkBuilder(r.code)}
            className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
          >
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ boxShadow: `0 0 40px ${accent}15` }}
            />
            <div className="relative">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300"
                style={{ backgroundColor: `${accent}15`, color: accent }}
              >
                <span className="material-symbols-outlined text-[22px]">
                  {r.icon || "bar_chart"}
                </span>
              </div>
              <h5 className="font-bold text-on-surface text-sm mb-1">
                {r.name}
              </h5>
              {r.description && (
                <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                  {r.description}
                </p>
              )}
            </div>
          </Link>
        ))}

        {placeholdersToRender.map((p) => {
          const card = (
            <div
              className="relative rounded-2xl p-6 overflow-hidden border border-dashed bg-white/40"
              style={{ borderColor: `${accent}40` }}
              title={
                p.previewHref
                  ? "Live preview · backend ready"
                  : "Planned — coming in a future release"
              }
            >
              <span
                className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md"
                style={{ backgroundColor: `${accent}18`, color: accent }}
              >
                {p.previewHref ? "Live preview" : "Coming soon"}
              </span>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 opacity-70"
                style={{ backgroundColor: `${accent}10`, color: accent }}
              >
                <span className="material-symbols-outlined text-[22px]">
                  {p.icon}
                </span>
              </div>
              <h5
                className={`font-bold text-sm mb-1 ${
                  p.previewHref ? "text-on-surface" : "text-on-surface/70"
                }`}
              >
                {p.name}
              </h5>
              <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                {p.description}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 mt-3 font-bold">
                {p.metricsCovered}
              </p>
            </div>
          );

          // Trend-comparison gets a clickable link to the live preview.
          // The other placeholders render as inert <div>s.
          return p.previewHref ? (
            <Link
              key={p.code}
              to={p.previewHref}
              className="block no-underline card-lift"
            >
              {card}
            </Link>
          ) : (
            <div key={p.code} className="opacity-95">
              {card}
            </div>
          );
        })}
      </div>
    </section>
  );
}
