import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import BackLink from "../components/ui/BackLink";
import DepartmentIcon from "../components/DepartmentIcon";
import Skeleton from "../components/admin/Skeleton";
import ProjectLogoPlate from "../components/ProjectLogoPlate";
import {
  fetchCatalogDepartment,
  fetchCatalogDepartmentProjects,
  fetchCatalogDepartmentDirectReports,
  getLogoUrl,
  type CatalogDepartmentSummary,
  type CatalogProject,
  type CatalogReportSummary,
} from "../services/catalog";
import { departmentColorHex } from "../utils/departmentColor";
import { fmt } from "../utils/fmt";
import { pushRecentItem } from "../hooks/useRecentItems";
import { useAuth, roleAtLeast } from "../services/auth";
import { Can } from "../services/permissions";
import {
  listHrTemplates,
  listHrTemplateGroups,
  createHrTemplate,
  type HrTemplate,
  type HrTemplateGroup,
} from "../services/hr";
// import { IvrCategorySection } from "../components/reports/IvrCategorySection";
//   ^ re-add when re-enabling the dept-level IVR section below.
import { getModule, type ModuleGroupSummary } from "../services/modules";

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

// HR report cards. A card with a `to` is a real, wired page; the rest are
// UI-only STUBS (no data pipeline yet). To wire a stub up, give it a `to`
// (and build its page). Delete the whole block + section when HR has only
// real reports. (QA's stubs were retired once real QA templates shipped.)
// `reportCode` gates the card via the policy system (reports:view on that
// direct HR report) — only users whose policy grants it see the card.
const HR_STUB_REPORTS: { name: string; icon: string; cadence: string; to?: string; reportCode?: string }[] = [
  { name: "Attrition Report", icon: "trending_down", cadence: "Monthly", to: "/department/HR/attrition", reportCode: "hr-attrition" },
  { name: "Attrition & Retention Report", icon: "groups", cadence: "Bi-annually" },
];

export default function DepartmentDetailPage() {
  const { deptCode } = useParams<{ deptCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // "Staff or higher": HR template design is a centrecom_user capability.
  const isAdmin = roleAtLeast(user?.role, "centrecom_user");
  const [dept, setDept] = useState<CatalogDepartmentSummary | null>(null);
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [directReports, setDirectReports] = useState<CatalogReportSummary[]>([]);
  const [templates, setTemplates] = useState<HrTemplate[]>([]);
  // Template sections (HR / Non Servizz / …) the caller may see. Fetched
  // alongside templates so an empty gated section still renders (with its
  // "New template" CTA) for admins. Non-admins only ever receive the default
  // 'hr' section from the backend.
  const [templateGroups, setTemplateGroups] = useState<HrTemplateGroup[]>([]);
  // BDF Reports module groups (when dept hosts the file_uploads-kind module).
  // Loaded lazily after the main dept payload arrives so the dept page paints
  // immediately — empty array until resolved.
  const [bdfGroups, setBdfGroups] = useState<ModuleGroupSummary[]>([]);
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
        // Load templates for any dept that hosts the templates module (HR
        // checklists, QA Quality & Training reports, …). Both the template and
        // group endpoints are department-scoped on the backend, so we pass the
        // dept code to keep HR's and QA's sections from bleeding into each
        // other.
        if (d.modules.includes("templates")) {
          listHrTemplates(false, d.code)
            .then(setTemplates)
            .catch(() => setTemplates([]));
          listHrTemplateGroups(d.code)
            // Operations monthly reports live under each PROJECT (ProjectDetailPage),
            // not on the department page — hide that section here.
            .then((gs) => setTemplateGroups(gs.filter((g) => g.code !== "ops-monthly-reports")))
            .catch(() => setTemplateGroups([]));
        } else {
          setTemplates([]);
          setTemplateGroups([]);
        }
        // BDF Reports module is currently the only file_uploads-kind module
        // we render groups for on the dept landing. When the dept hosts it,
        // fetch the active groups so we can render one card per report type
        // (Incident Reports / System Uptime / Service Continuity, etc.) —
        // matches the IT team's mental model of "click the type, see PDFs."
        if (d.modules.includes("bdf-reports")) {
          // Scope groups to THIS dept — after migration 028, each dept owns
          // its own report types under the shared module kind. Without the
          // department query, we'd see HR's groups bleed into IT's landing
          // (and vice versa) the first time another dept adopts BDF.
          getModule("bdf-reports", d.code)
            .then((res) => setBdfGroups(res.groups))
            .catch(() => setBdfGroups([]));
        } else {
          setBdfGroups([]);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [deptCode]);

  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateError, setNewTemplateError] = useState<string | null>(null);
  const [newTemplateBusy, setNewTemplateBusy] = useState(false);
  // Which section the New-template modal will create into. Set when the modal
  // is opened from a section's "New template" button.
  const [newTemplateGroup, setNewTemplateGroup] = useState<HrTemplateGroup | null>(null);
  // Operations templates are project-scoped — the modal collects a project.
  const [newTemplateProjectId, setNewTemplateProjectId] = useState<number | null>(null);

  function openNewTemplate(group: HrTemplateGroup) {
    setNewTemplateName("");
    setNewTemplateError(null);
    setNewTemplateGroup(group);
    setNewTemplateProjectId(null);
    setShowNewTemplate(true);
  }

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
        // Create into the section whose button was clicked (defaults to 'hr'
        // server-side if somehow null).
        groupId: newTemplateGroup?.id ?? null,
        // Operations templates are scoped to one project; HR/QA stay null.
        projectId: deptCode.toUpperCase() === "OPS" ? newTemplateProjectId : null,
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
                      {/* Logo always sits on the project's own DB color via
                          the shared plate — never bare on the white card.
                          getLogoUrl → generic fallback when logoFilename is
                          null; ProjectLogoPlate handles runtime 404s too. */}
                      <ProjectLogoPlate
                        src={getLogoUrl(p.logoFilename)}
                        alt={p.displayName}
                        className="w-12 h-12 rounded-xl p-1.5"
                        imgClassName="w-full h-full"
                        override={p.logoPlateMode}
                      />
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

        {/* ── Templates (one section per template group) ── */}
        {/* Sections (HR / Non Servizz / …) come from the backend, which only
            returns the ones the caller's role may see — so a non-admin gets
            just the default "Templates" section exactly as before, while an
            admin additionally sees "Non Servizz". Visibility is config-driven
            (group.minRole), never keyed off template names. */}
        {dept.modules.includes("templates") && (() => {
          // Bucket templates by their section code. A template whose section
          // is unknown to this user or null falls back to the first/default
          // section so it can never silently disappear. (HR's default is 'hr';
          // QA's is 'qa-reports' — both resolve via the same first-match rule.)
          const defaultGroupCode =
            templateGroups.find((g) => g.code === "hr")?.code ?? templateGroups[0]?.code;
          const byGroup = new Map<string, HrTemplate[]>();
          for (const t of templates) {
            const known = templateGroups.some((g) => g.code === t.groupCode);
            const key = (known ? t.groupCode : defaultGroupCode) ?? defaultGroupCode;
            if (!key) continue;
            let arr = byGroup.get(key);
            if (!arr) { arr = []; byGroup.set(key, arr); }
            arr.push(t);
          }
          // Manage = create/design. Any section the backend returned is at
          // least viewable; creating needs staff+ (centrecom_user). Gated
          // sections are only returned to roles that clear the gate, so this
          // single check is sufficient for every section.
          const canManage = isAdmin;

          const sections = templateGroups.map((group) => {
            const groupTemplates = byGroup.get(group.code) ?? [];
            return (
              <section key={group.id} className="mb-10">
                <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
                    {group.name}
                  </h2>
                  {/* Template design is staff-only — the backend also gates
                      this, but hiding the button avoids a confusing 403. */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openNewTemplate(group)}
                      className="btn-brand inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      New template
                    </button>
                  )}
                </div>
                {groupTemplates.length === 0 ? (
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
                    {groupTemplates.map((t) => (
                      <Link
                        key={t.id}
                        to={`/department/${deptCode}/templates/${t.id}/records`}
                        className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: `${color}12`, color }}
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
                              {fmt.int(t.fieldCount)} field{t.fieldCount === 1 ? "" : "s"} ·{" "}
                              {fmt.int(t.recordCount)} record{t.recordCount === 1 ? "" : "s"}
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
            );
          });
          // HR Templates are independently policy-grantable (the "HR Templates"
          // grant) so they can be separated from other HR content like the
          // Attrition report. Hide the whole section unless the user holds the
          // grant. QA/OPS templates are unaffected.
          return dept.code.toUpperCase() === "HR" ? (
            <Can permission="reports:view" resource={[["report", "hr-templates"], ["department", "HR"]]}>
              {sections}
            </Can>
          ) : sections;
        })()}

        {/* ── HR placeholder reports — UI-only stubs, not wired to data yet. ── */}
        {dept.code.toUpperCase() === "HR" && (
          <section className="mb-10">
            <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
              Reports
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {HR_STUB_REPORTS.map((r) =>
                r.to ? (
                  <Can
                    key={r.name}
                    permission="reports:view"
                    resource={[["report", r.reportCode ?? ""], ["department", "HR"]]}
                  >
                    <Link
                      to={r.to}
                      className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                    >
                      <div className="relative">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center mb-3 text-on-surface-variant group-hover:bg-accent group-hover:text-white transition-all duration-300">
                          <span className="material-symbols-outlined text-[22px]">{r.icon}</span>
                        </div>
                        <h5 className="font-bold text-on-surface text-sm mb-1">{r.name}</h5>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
                          {r.cadence}
                        </p>
                      </div>
                    </Link>
                  </Can>
                ) : (
                  <div
                    key={r.name}
                    aria-disabled="true"
                    title="Coming soon"
                    className="prism-surface relative rounded-2xl p-6 overflow-hidden cursor-default select-none"
                  >
                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant/70">
                          <span className="material-symbols-outlined text-[22px]">{r.icon}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant/60">
                          Coming soon
                        </span>
                      </div>
                      <h5 className="font-bold text-on-surface text-sm mb-1">{r.name}</h5>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50 mb-1">
                        {r.cadence}
                      </p>
                      <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">
                        Planned HR report — not available yet.
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
        )}

        {/* ── Direct reports ── */}
        {/* Reports are split by category. The IVR & Queue Analytics group
            is intentionally hidden here — it now only lives on the per-
            project detail page (see ProjectDetailPage). Amir 2026-05-13:
            "I want to access it under projects only. I don't want them
            under the department anymore." The filtering / rendering
            block is kept commented for fast re-enable when needed.
            Everything else stays in the default "Reports" grid. */}
        {(() => {
          // const ivrReports = directReports.filter((r) => r.category === "ivr");
          // const showIvr = dept.code.toUpperCase() === "OPS" || ivrReports.length > 0;
          const otherReports = directReports.filter((r) => r.category !== "ivr");

          return (
            <>
              {/* IVR section hidden on dept page — re-enable by restoring
                  the ivrReports/showIvr filters above and uncommenting:
                  {showIvr && (
                    <IvrCategorySection
                      realReports={ivrReports}
                      linkBuilder={(code) => `/department/${deptCode}/report/${code}`}
                    />
                  )} */}

              {dept.modules.includes("bdf-reports") && bdfGroups.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
                    {dept.code.toUpperCase() === "IT" ? "IT reports" : "BDF Reports"}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bdfGroups.map((g) => (
                      <Link
                        key={g.id}
                        to={`/department/${deptCode}/module/bdf-reports?group=${encodeURIComponent(g.code)}`}
                        className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                      >
                        <div
                          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{ boxShadow: `0 0 40px ${color}15` }}
                        />
                        <div className="relative">
                          <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center mb-3 text-on-surface-variant group-hover:bg-accent group-hover:text-white transition-all duration-300">
                            <span className="material-symbols-outlined text-[22px]">{g.icon || "description"}</span>
                          </div>
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-on-surface text-sm">{g.name}</h5>
                            <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant">
                              {g.fileCount}
                            </span>
                          </div>
                          {g.description && (
                            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                              {g.description}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* QA reports are now real templates rendered by the Templates
                  section above (the 'qa-reports' group). The old "Coming soon"
                  stub cards were removed once the QA templates shipped. */}

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
          const templatesEnabled = dept.modules.includes("templates");
          const bdfEnabled = dept.modules.includes("bdf-reports");
          // HR still shows its stub report cards, so it's never "empty".
          const hrStubsVisible = dept.code.toUpperCase() === "HR";
          if (projectsVisible || directReportsVisible || templatesEnabled || bdfEnabled || hrStubsVisible) return null;
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
              New template{newTemplateGroup ? ` · ${newTemplateGroup.name}` : ""}
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
            {deptCode?.toUpperCase() === "OPS" && (
              <div className="mt-3">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1.5">
                  Project
                </label>
                <select
                  value={newTemplateProjectId ?? ""}
                  onChange={(e) => setNewTemplateProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2.5 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm focus:outline-none focus:border-primary/30 focus:bg-white"
                >
                  <option value="">— Select a project —</option>
                  {projects.filter((p) => p.id != null).map((p) => (
                    <option key={p.id} value={p.id}>{p.displayName}</option>
                  ))}
                </select>
              </div>
            )}
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
                disabled={
                  !newTemplateName.trim() ||
                  newTemplateBusy ||
                  (deptCode?.toUpperCase() === "OPS" && !newTemplateProjectId)
                }
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
