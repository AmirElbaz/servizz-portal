import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartmentProjectReports,
  getLogoUrl,
  onProjectLogoError,
  type CatalogReportSummary,
} from "../services/catalog";
import { pushRecentItem } from "../hooks/useRecentItems";
import BackLink from "../components/ui/BackLink";
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
        setProject({
          id: p.code,
          code: p.shortLabel,
          name: p.displayName,
          description: p.description ?? "",
          fullDescription: p.fullDescription ?? "",
          icon: p.icon ?? "",
          logo: getLogoUrl(p.logoFilename),
          color: p.colorHex,
          hoverBorderColor: "",
        });
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
          <div className="hidden sm:flex w-40 md:w-56 lg:w-64 bg-white items-center justify-center shrink-0 p-6 sm:p-8 relative">
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
        {/* Project pages always render the IVR group (Operation owns the
            inbound voice analytics bundle, and every operation project
            inherits the same set). The "Other" section below collects
            anything outside the IVR category — e.g., the existing
            skillset-historical report. */}
        {(() => {
          const ivrReports = reports.filter((r) => r.category === "ivr");
          const otherReports = reports.filter((r) => r.category !== "ivr");

          return (
            <>
              <IvrCategorySection
                realReports={ivrReports}
                linkBuilder={(code) =>
                  `/department/${deptCode}/project/${projectCode}/report/${code}`
                }
              />

              <section>
                <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
                  {ivrReports.length > 0 ? "Other reports" : "Reports"}
                </h2>
                {otherReports.length === 0 ? (
                  <div className="prism-surface rounded-2xl p-10 text-center">
                    <p className="text-sm text-on-surface-variant/60">
                      No additional reports are available in this project for your access level.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherReports.map((r) => (
                      <Link
                        key={r.code}
                        to={`/department/${deptCode}/project/${projectCode}/report/${r.code}`}
                        className="group prism-surface relative rounded-2xl p-6 no-underline card-lift overflow-hidden hover:border-accent-50"
                      >
                        <div
                          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{ boxShadow: `0 0 40px ${project.color}15` }}
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
                )}
              </section>
            </>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
