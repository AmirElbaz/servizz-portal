import { useEffect, useState } from "react";
import { fetchCatalogDepartmentProjects, type CatalogProject } from "../../services/catalog";

// Controlled project switcher for report pages opened WITHOUT a project in the
// URL (e.g. from the Report Index or a department-direct link). It switches the
// report IN PLACE — no navigation/reload — by handing the selected project back
// to the page, which re-scopes the data and identity (header/logo/accent/
// export). Mirrors the IVR pages' dropdown. Render it only on the dept-direct
// view (no projectCode); the page hides it once project-scoped by the URL.
export default function ReportProjectSwitcher({
  deptCode,
  value,
  onChange,
  fetchProjects,
}: {
  deptCode: string;
  value: string; // selected project code, or "all"
  onChange: (value: string, project: CatalogProject | null) => void;
  // Override the project source. Defaults to the department's OWNED projects
  // (`/Catalog/departments/{code}/projects`). Reports whose project set is
  // defined by the department_projects junction rather than ownership (e.g.
  // Billing → Raw Data) pass their own report-scoped fetcher here.
  fetchProjects?: () => Promise<CatalogProject[]>;
}) {
  const [projects, setProjects] = useState<CatalogProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = fetchProjects ?? (() => fetchCatalogDepartmentProjects(deptCode));
    load()
      .then((p) => { if (!cancelled) setProjects(p); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [deptCode, fetchProjects]);

  function handle(v: string) {
    onChange(v, v === "all" ? null : (projects?.find((p) => p.code === v) ?? null));
  }

  return (
    <div className="min-w-[180px]">
      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
        Project
      </label>
      <select
        value={value}
        onChange={(e) => handle(e.target.value)}
        disabled={projects === null}
        className="w-full py-2 sm:py-2.5 px-2 sm:px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-xs sm:text-sm focus:outline-none focus:border-accent disabled:opacity-60 transition-all"
      >
        <option value="all">
          {projects === null
            ? "Loading projects…"
            : `All allowed projects${projects.length > 0 ? ` (${projects.length})` : ""}`}
        </option>
        {(() => {
          if (!projects || projects.length === 0) return null;
          type Bucket = { name: string; sortOrder: number; items: CatalogProject[] };
          const buckets = new Map<string, Bucket>();
          for (const p of projects) {
            const key = p.groupName ?? "__ungrouped__";
            let b = buckets.get(key);
            if (!b) {
              b = { name: p.groupName ?? "Ungrouped", sortOrder: p.groupSortOrder ?? Number.MAX_SAFE_INTEGER, items: [] };
              buckets.set(key, b);
            }
            b.items.push(p);
          }
          return [...buckets.values()]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            .map((bucket) => (
              <optgroup key={bucket.name} label={bucket.name}>
                {bucket.items.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.displayName || p.shortLabel || p.code}
                  </option>
                ))}
              </optgroup>
            ));
        })()}
      </select>
    </div>
  );
}
