import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartmentProjectReports,
  onProjectLogoError,
  type CatalogReportSummary,
} from "../services/catalog";
import { adaptProject } from "../utils/adaptProject";
import { pushRecentItem } from "../hooks/useRecentItems";
import BackLink from "../components/ui/BackLink";
import { useLogoPlate } from "../utils/logoPlate";
import { IvrCategorySection } from "../components/reports/IvrCategorySection";

// Department-first adaptation: the URL now carries BOTH a department code and
// a project code (/department/:deptCode/project/:projectCode). The departments
// grid is gone — a project's detail page shows its reports directly. The
// intermediate "department inside project" concept doesn't exist in the new
// model.
export default function ProjectDetailPage() {
  const { deptCode, projectCode } = useParams<{
    deptCode: string;
    projectCode: string;
  }>();
  const [project, setProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<CatalogReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Tile is chosen from the logo's own brightness, never the accent. A
  // per-project DB override (avaya_projects.logo_plate_mode) wins when set.
  const logoPlate = useLogoPlate(project?.logo, project?.logoPlateMode);
  // Which channel card is expanded inline (null = all collapsed).
  const [openChannel, setOpenChannel] = useState<"voice" | "digital" | null>(
    null,
  );

  useEffect(() => {
    if (projectCode) localStorage.setItem("last-project", projectCode);
    if (deptCode) localStorage.setItem("last-department", deptCode);
  }, [projectCode, deptCode]);

  useEffect(() => {
    if (!projectCode || !deptCode) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchCatalogProject(projectCode),
      fetchCatalogDepartmentProjectReports(deptCode, projectCode),
    ])
      .then(([p, rpts]) => {
        // adaptProject preserves logoPlateMode so the DB override flows into
        // the hero plate. Inlining the mapping drops the field (see Locus
        // regression 2026-05-20).
        setProject(adaptProject(p));
        setReports(rpts);
        if (deptCode) {
          pushRecentItem({
            kind: "project",
            id: `${deptCode}/${p.code}`,
            label: p.displayName,
            sublabel: p.shortLabel,
            icon: p.icon || "folder",
            href: `/department/${deptCode}/project/${p.code}`,
          });
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [projectCode, deptCode]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant/60 text-sm">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !project) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Project not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ "--accent": project.color } as React.CSSProperties}>
        <BackLink
          to={deptCode ? `/department/${deptCode}` : "/dashboard"}
          label="Back to Department"
        />

        {/* ── Hero Banner ── */}
        <section className="rounded-3xl mb-8 sm:mb-12 overflow-hidden flex">
          <div
            className="relative flex-1 px-5 sm:px-10 lg:px-16 py-8 sm:py-14 lg:py-18 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${project.color} 0%, color-mix(in srgb, ${project.color} 70%, #000) 100%)`,
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
                <Link
                  to={`/department/${deptCode}`}
                  className="hover:text-white/70 transition-colors no-underline text-white/40"
                >
                  {deptCode}
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-white/70">{project.name}</span>
              </nav>
              <h1 className="text-2xl sm:text-4xl lg:text-6xl font-black tracking-tighter font-headline leading-[0.95] text-white mb-4">
                {project.name} <span className="text-white/50">Portal</span>
              </h1>
              <p className="text-white/45 text-base max-w-2xl leading-relaxed">
                {project.fullDescription}
              </p>
            </div>
          </div>
          {/* Logo block: filled with the project's own DB color via the
              shared plate helper (was bg-white — white logos vanished). */}
          <div
            className={`hidden sm:flex w-40 md:w-56 lg:w-64 items-center justify-center shrink-0 p-6 sm:p-8 relative ${
              logoPlate.border ? "ring-1 ring-inset ring-on-surface-variant/15" : ""
            }`}
            style={{ backgroundColor: logoPlate.bg }}
          >
            <svg
              className="absolute top-0 right-5 w-9 h-14 drop-shadow-md"
              viewBox="0 0 36 56"
              fill="none"
            >
              <path
                d="M0 0H36V48L18 40L0 48V0Z"
                style={{ fill: `color-mix(in srgb, ${project.color} 70%, black)` }}
              />
            </svg>
            <img src={project.logo} onError={onProjectLogoError} alt={project.name} className="w-28 lg:w-36 object-contain relative z-10" />
          </div>
        </section>

        {/* ── Reports ── */}
        {/* Three category buckets render in this fixed order:
              1. Skillset reports (header + grid; project's --accent)
              2. IVR & Queue Analytics (delegated to IvrCategorySection)
              3. Other reports (catch-all, hidden when empty)
            Skillset comes first because it's the primary operational lens —
            historical service-level / agent performance is the daily-read
            report. The IVR bundle is secondary depth and "Other" is for
            anything outside both categories. */}
        {(() => {
          const skillsetReports = reports.filter((r) => r.category === "skillset");
          const ivrReports = reports.filter((r) => r.category === "ivr");
          const otherReports = reports.filter(
            (r) => r.category !== "skillset" && r.category !== "ivr",
          );
          const accent = project.color;

          const reportCardClass =
            "group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50";

          const renderReportCard = (r: CatalogReportSummary) => (
            <Link
              key={r.code}
              to={`/department/${deptCode}/project/${projectCode}/report/${r.code}`}
              className={reportCardClass}
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
                <h5 className="font-bold text-on-surface text-sm mb-1">{r.name}</h5>
                {r.description && (
                  <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                    {r.description}
                  </p>
                )}
              </div>
            </Link>
          );

          return (
            <>
              {skillsetReports.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${accent}15`, color: accent }}
                    >
                      <span className="material-symbols-outlined text-lg">
                        groups
                      </span>
                    </span>
                    <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
                      Skillset reports
                    </h2>
                  </div>
                  <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mb-5 max-w-2xl pl-12">
                    Historical service-level and agent-performance views per skillset.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {skillsetReports.map(renderReportCard)}
                  </div>
                </section>
              )}

              {/* Monthly Reports — channel cards. Voice expands inline to
                  the IVR & Queue Analytics reports; digital is parked. */}
              <section className="mb-10">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${accent}15`, color: accent }}
                  >
                    <span className="material-symbols-outlined text-lg">
                      calendar_month
                    </span>
                  </span>
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">
                    Monthly Reports
                  </h2>
                </div>
                <p className="text-[12px] text-on-surface-variant/60 leading-relaxed mb-5 max-w-2xl pl-12">
                  Monthly reporting by channel. Voice opens the Inbound &amp; Queue
                  Analytics reports; digital channels are coming soon.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Voice — live. Expands inline to the IVR reports. */}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenChannel(openChannel === "voice" ? null : "voice")
                    }
                    aria-expanded={openChannel === "voice"}
                    className="group prism-surface relative rounded-2xl p-6 text-left overflow-hidden card-lift hover:border-accent-50"
                  >
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ boxShadow: `0 0 40px ${accent}15` }}
                    />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                          style={{ backgroundColor: `${accent}15`, color: accent }}
                        >
                          <span className="material-symbols-outlined text-[22px]">
                            headset_mic
                          </span>
                        </div>
                        <h5 className="font-bold text-on-surface text-sm mb-1">
                          Voice reports
                        </h5>
                        <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
                          Inbound &amp; Queue Analytics
                        </p>
                      </div>
                      <span
                        className={`material-symbols-outlined text-on-surface-variant/50 transition-transform duration-300 ${
                          openChannel === "voice" ? "rotate-180" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </div>
                  </button>

                  {/* Email / Chat / Social — parked (stub pattern). */}
                  <div
                    aria-disabled="true"
                    title="Coming soon"
                    className="prism-surface relative rounded-2xl p-6 overflow-hidden cursor-default select-none"
                  >
                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant/70">
                          <span className="material-symbols-outlined text-[22px]">
                            forum
                          </span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant/60">
                          Coming soon
                        </span>
                      </div>
                      <h5 className="font-bold text-on-surface/80 text-sm mb-1">
                        Email, Chat, SM &amp; Walkins Report
                      </h5>
                      <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">
                        Planned — not available yet.
                      </p>
                    </div>
                  </div>

                  {/* Monthly Ops Reports — parked (stub pattern). */}
                  <div
                    aria-disabled="true"
                    title="Coming soon"
                    className="prism-surface relative rounded-2xl p-6 overflow-hidden cursor-default select-none"
                  >
                    <div className="relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant/70">
                          <span className="material-symbols-outlined text-[22px]">
                            insights
                          </span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant/60">
                          Coming soon
                        </span>
                      </div>
                      <h5 className="font-bold text-on-surface/80 text-sm mb-1">
                        Monthly Ops Reports
                      </h5>
                      <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">
                        Planned — not available yet.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Voice expanded → the IVR & Queue Analytics reports. */}
                {openChannel === "voice" && (
                  <div className="mt-6">
                    <IvrCategorySection
                      realReports={ivrReports}
                      linkBuilder={(code) =>
                        `/department/${deptCode}/project/${projectCode}/report/${code}`
                      }
                    />
                  </div>
                )}
              </section>

              {otherReports.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
                    Other reports
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherReports.map(renderReportCard)}
                  </div>
                </section>
              )}

              {skillsetReports.length === 0 &&
                ivrReports.length === 0 &&
                otherReports.length === 0 && (
                  <div className="prism-surface rounded-2xl p-10 text-center">
                    <p className="text-sm text-on-surface-variant/60">
                      No reports are available in this project for your access level.
                    </p>
                  </div>
                )}
            </>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
