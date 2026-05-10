import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import BackLink from "../components/ui/BackLink";
import DepartmentIcon from "../components/DepartmentIcon";
import Skeleton from "../components/admin/Skeleton";
import {
  fetchCatalogDepartment,
  fetchCatalogDepartmentProjects,
  fetchCatalogDepartmentDirectReports,
  getLogoUrl,
  onProjectLogoError,
  type CatalogDepartmentSummary,
  type CatalogProject,
  type CatalogReportSummary,
} from "../services/catalog";
import { departmentColorHex } from "../utils/departmentColor";
import { pushRecentItem } from "../hooks/useRecentItems";
import { useAuth } from "../services/auth";
import {
  listHrTemplates,
  createHrTemplate,
  type HrTemplate,
} from "../services/hr";
import { IvrCategorySection } from "../components/reports/IvrCategorySection";

// Landing for a single department. Top-level in the department-first catalog.
//
// Which sections render is driven by the dept's enabled modules (from the
// `department_modules` junction, surfaced as `dept.modules: string[]`). The
// admin toggles modules on/off in Admin → Structure. Each module renders as
// a dedicated section below the hero:
//
//   'projects'       → Projects grid (for depts like Operation)
//   'direct_reports' → Reports grid  (for depts like HR / IT / Finance)
//   'templates'      → Templates entry card (lands in Step 5)
//
// If a dept has no enabled modules, the empty-state card fires. If a module
// is enabled but has no content attached yet (e.g., HR with templates
// enabled before any template exists), each section handles its own empty
// state.
export default function DepartmentDetailPage() {
  const { deptCode } = useParams<{ deptCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [directReports, setDirectReports] = useState<CatalogReportSummary[]>([]);
  const [templates, setTemplates] = useState<HrTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (deptCode) localStorage.setItem("last-department", deptCode);
  }, [deptCode]);

  useEffect(() => {
    if (!deptCode) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchCatalogDepartment(deptCode),
      fetchCatalogDepartmentProjects(deptCode),
      fetchCatalogDepartmentDirectReports(deptCode),
    ])
      .then(([d, ps, rs]) => {
        setDept(d);
        setProjects(ps);
        setDirectReports(rs);
        pushRecentItem({
          kind: "department",
          id: d.code,
          label: d.name,
          icon: d.icon && !d.icon.includes(".") ? d.icon : "domain",
          href: `/department/${d.code}`,
        });
        // Group metadata comes in on each project row (groupId, groupName,
        // groupSortOrder — see CatalogController.GetDepartmentProjects), so
        // non-admin users see the grouping without needing access to the
        // admin-only /Admin/project-groups endpoint.
        //
        // Load templates only when the dept hosts that module. The HR
        // endpoint is department-scoped on the backend, so we only call it
        // for HR; other depts getting templates later = generalize here.
        if (d.code.toUpperCase() === "HR" && d.modules.includes("templates")) {
          listHrTemplates(false)
            .then(setTemplates)
            .catch(() => setTemplates([]));
        } else {
          setTemplates([]);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [deptCode]);

  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateError, setNewTemplateError] = useState<string | null>(null);
  const [newTemplateBusy, setNewTemplateBusy] = useState(false);

  async function createNewTemplate() {
    if (!deptCode || !newTemplateName.trim()) return;
    const name = newTemplateName.trim();
    // Slugify the name into a URL-safe code; add a short random suffix to
    // avoid collisions when two templates share a name.
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "template";
    const code = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      setNewTemplateBusy(true);
      setNewTemplateError(null);
      const { data } = await createHrTemplate({
        code,
        name,
        description: null,
        icon: "checklist",
      });
      setShowNewTemplate(false);
      setNewTemplateName("");
      navigate(`/department/${deptCode}/templates/${data.id}/design`);
    } catch (e) {
      setNewTemplateError(e instanceof Error ? e.message : "Failed to create template");
    } finally {
      setNewTemplateBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Skeleton className="h-48 rounded-3xl mb-8" />
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !dept) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Department not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  const color = departmentColorHex(dept.code);

  return (
    <DashboardLayout>
      <div style={{ "--accent": color } as React.CSSProperties}>
        <BackLink to="/dashboard" label="Back to Dashboard" />

        {/* ── Hero ── */}
        <section
          className="relative rounded-3xl mb-8 sm:mb-12 overflow-hidden px-6 sm:px-12 lg:px-16 py-10 sm:py-14 lg:py-16"
          style={{
            background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 70%, #000) 100%)`,
          }}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-[30%] -right-[15%] w-[50%] h-[70%] rounded-full bg-white/[0.07] blur-[100px]" />
            <div className="absolute -bottom-[20%] -left-[10%] w-[35%] h-[50%] rounded-full bg-black/10 blur-[80px]" />
          </div>
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
          />
          <div className="relative z-10">
            <nav className="flex items-center gap-2 mb-6 eyebrow-sm text-white/40">
              <Link to="/dashboard" className="hover:text-white/70 transition-colors no-underline text-white/40">
                Dashboard
              </Link>
              <span className="material-symbols-outlined text-xs">chevron_right</span>
              <span className="text-white/70">{dept.name}</span>
            </nav>
            <div className="flex items-start gap-5">
              <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white">
                <DepartmentIcon icon={dept.icon} size={32} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tighter font-headline leading-[0.95] text-white mb-3">
                  {dept.name}
                </h1>
                {dept.description && (
                  <p className="text-white/60 text-sm sm:text-base max-w-2xl leading-relaxed">
                    {dept.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Projects ── */}
        {dept.modules.includes("projects") && (
          <section className="mb-10">
            <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
              Projects
            </h2>
            {projects.length === 0 ? (
              <div className="prism-surface rounded-2xl p-10 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 mb-2">folder_off</span>
                <p className="text-sm text-on-surface-variant/60">
                  No projects in {dept.name} yet.
                </p>
              </div>
            ) : (() => {
              // Partition projects by group using the group metadata that
              // already ships on each project row (`groupId`, `groupName`,
              // `groupSortOrder`). No separate fetch needed — every user who
              // can see the projects sees the grouping too.
              type Bucket = { name: string; sortOrder: number; items: CatalogProject[] };
              const byGroup = new Map<number | null, Bucket>();
              for (const p of projects) {
                const k = p.groupId ?? null;
                let b = byGroup.get(k);
                if (!b) {
                  b = {
                    name: k === null ? "Other" : (p.groupName ?? "Group"),
                    sortOrder: p.groupSortOrder ?? 0,
                    items: [],
                  };
                  byGroup.set(k, b);
                }
                b.items.push(p);
              }
              // Named groups in sort_order, then name; "Other" bucket pinned last.
              const namedEntries = [...byGroup.entries()].filter(([k]) => k !== null) as Array<[number, Bucket]>;
              namedEntries.sort(
                (a, b) => a[1].sortOrder - b[1].sortOrder || a[1].name.localeCompare(b[1].name)
              );
              const sections: Array<{ id: number | null; name: string; items: CatalogProject[] }> =
                namedEntries.map(([id, b]) => ({ id, name: b.name, items: b.items }));
              const other = byGroup.get(null);
              // Only append "Other" when there are also named groups. If there
              // are no groups at all, fall through to the flat grid below so
              // a phantom "Other" label doesn't show up.
              if (namedEntries.length > 0 && other && other.items.length > 0) {
                sections.push({ id: null, name: "Other", items: other.items });
              }
              const flatGrid = namedEntries.length === 0;

              const renderCard = (p: CatalogProject) => (
                <Link
                  key={p.code}
                  to={`/department/${deptCode}/project/${p.code}`}
                  className="group prism-surface relative block rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                >
                  <div
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ boxShadow: `0 0 40px ${p.colorHex}20` }}
                  />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${p.colorHex}15, ${p.colorHex}05)`,
                          border: `1px solid ${p.colorHex}20`,
                        }}
                      >
                        {/* getLogoUrl returns the generic fallback SVG when
                            logoFilename is null. onProjectLogoError catches
                            runtime 404s (filename set in DB but missing on
                            disk) and swaps to the same fallback. */}
                        <img
                          src={getLogoUrl(p.logoFilename)}
                          onError={onProjectLogoError}
                          alt={p.displayName}
                          className="w-8 h-8 object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow-sm mb-0.5" style={{ color: p.colorHex }}>
                          {p.shortLabel}
                        </p>
                        <h3 className="text-sm font-black text-on-surface leading-tight truncate">
                          {p.displayName}
                        </h3>
                      </div>
                    </div>
                    {p.description && (
                      <p className="text-[11px] text-on-surface-variant/60 leading-relaxed line-clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>
                </Link>
              );

              if (flatGrid) {
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {projects.map(renderCard)}
                  </div>
                );
              }

              // Flat render: one continuous rhythm of `heading → grid` blocks
              // with no per-group panel. The heading is a small colored dot +
              // name + count — just enough indication to signal the group
              // boundary without fracturing the page into separate cards.
              return (
                <div className="flex flex-col gap-8">
                  {sections.map((sec) => (
                    <div key={sec.id ?? "other"}>
                      {/* Group heading — bumped from whisper-eyebrow (11px
                          uppercase) to a proper sub-headline because the old
                          treatment read as decoration, not structure. Dot
                          slightly larger for better visual anchor against
                          the heading weight. */}
                      <div className="flex items-center gap-3 mb-4">
                        <span
                          aria-hidden
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: sec.id === null ? "#74787D" : color }}
                        />
                        <h3 className="text-lg font-black font-headline text-on-surface tracking-tight">
                          {sec.name}
                        </h3>
                        <span className="eyebrow-sm text-on-surface-variant/50">
                          {sec.items.length} {sec.items.length === 1 ? "project" : "projects"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {sec.items.map(renderCard)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        )}

        {/* ── Templates ── */}
        {dept.modules.includes("templates") && dept.code.toUpperCase() === "HR" && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
              <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
                Templates
              </h2>
              {/* Template design is admin-only — the backend also gates this
                  but hiding the button avoids a confusing 403 on click. */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => { setNewTemplateName(""); setNewTemplateError(null); setShowNewTemplate(true); }}
                  className="btn-brand inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  New template
                </button>
              )}
            </div>
            {templates.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-on-surface-variant/15 p-10 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 mb-2">
                  checklist
                </span>
                <p className="text-sm text-on-surface-variant/60">
                  No templates yet. Create your first template to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => (
                  <Link
                    key={t.id}
                    to={`/department/${deptCode}/templates/${t.id}/records`}
                    className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-primary"
                        style={{ background: `${color}12` }}
                      >
                        <span className="material-symbols-outlined text-[22px]">
                          {t.icon || "checklist"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black text-on-surface leading-tight truncate">
                          {t.name}
                        </h3>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50 mt-0.5">
                          {t.fieldCount} field{t.fieldCount === 1 ? "" : "s"} ·{" "}
                          {t.recordCount} record{t.recordCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-on-surface-variant/60 leading-relaxed line-clamp-2">
                        {t.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Direct reports ── */}
        {/* Reports are split by category. The IVR & Queue Analytics group
            renders via a dedicated component (so it can interleave the live
            report with hardcoded placeholders for the not-yet-built
            siblings). Everything else stays in the default "Reports" grid.
            Operation also renders the IVR group on the dept-direct page so
            users can land on the trend-comparison preview from there.
            //
            On a project-aware dept (Operation), the IVR section also lives
            on each project's detail page (see ProjectDetailPage). */}
        {(() => {
          const ivrReports = directReports.filter((r) => r.category === "ivr");
          const otherReports = directReports.filter((r) => r.category !== "ivr");
          const showIvr = dept.code.toUpperCase() === "OPS" || ivrReports.length > 0;

          return (
            <>
              {showIvr && (
                <IvrCategorySection
                  realReports={ivrReports}
                  linkBuilder={(code) => `/department/${deptCode}/report/${code}`}
                />
              )}

              {dept.modules.includes("direct_reports") && otherReports.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
                    {projects.length > 0 ? "Reports" : "Available Reports"}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherReports.map((r) => (
                      <Link
                        key={r.code}
                        to={`/department/${deptCode}/report/${r.code}`}
                        className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                      >
                        <div
                          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{ boxShadow: `0 0 40px ${color}15` }}
                        />
                        <div className="relative">
                          <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center mb-3 text-on-surface-variant group-hover:bg-accent group-hover:text-white transition-all duration-300">
                            <span className="material-symbols-outlined text-[22px]">
                              {r.icon || "bar_chart"}
                            </span>
                          </div>
                          <h5 className="font-bold text-on-surface text-sm mb-1">{r.name}</h5>
                          {r.description && (
                            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                              {r.description}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </>
          );
        })()}

        {/* Empty state — no module is enabled with matching visible content. */}
        {(() => {
          const projectsVisible = dept.modules.includes("projects") && projects.length > 0;
          const directReportsVisible = dept.modules.includes("direct_reports") && directReports.length > 0;
          // Templates section renders its own empty state (with "New template"
          // button), so when templates is enabled we never show the global
          // empty card.
          const templatesEnabled = dept.modules.includes("templates") && dept.code.toUpperCase() === "HR";
          if (projectsVisible || directReportsVisible || templatesEnabled) return null;
          return (
            <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 mb-2">
                inventory_2
              </span>
              <p className="text-sm text-on-surface-variant/60">
                {dept.modules.length === 0
                  ? `${dept.name} has no modules enabled yet. Ask an admin to turn some on.`
                  : `Nothing to show in ${dept.name} for your access level yet.`}
              </p>
            </div>
          );
        })()}
      </div>

      {/* ── New template modal ── */}
      {showNewTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowNewTemplate(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-on-surface-variant/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-extrabold font-headline text-on-surface mb-2">
              New template
            </h3>
            <p className="text-sm text-on-surface-variant/70 mb-4">
              Give your template a name. You'll add fields on the next screen.
            </p>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1.5">
              Template name
            </label>
            <input
              type="text"
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createNewTemplate(); }}
              placeholder="e.g. Training Completion Checklist"
              className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
            />
            {newTemplateError && (
              <p className="mt-2 text-xs text-error">{newTemplateError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewTemplate(false)}
                disabled={newTemplateBusy}
                className="px-4 py-2 text-xs font-bold text-on-surface-variant/70 hover:text-on-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createNewTemplate}
                disabled={!newTemplateName.trim() || newTemplateBusy}
                className="btn-brand px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {newTemplateBusy ? "Creating…" : "Create & design"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
