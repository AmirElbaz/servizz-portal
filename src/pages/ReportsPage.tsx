import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartments,
  fetchCatalogReports,
  getLogoUrl,
  type CatalogDepartment,
  type CatalogReport,
} from "../services/catalog";

export default function ReportsPage() {
  const { projectCode, departmentCode } = useParams<{
    projectCode: string;
    departmentCode: string;
  }>();

  const [project, setProject] = useState<Project | null>(null);
  const [departments, setDepartments] = useState<CatalogDepartment[]>([]);
  const [reports, setReports] = useState<CatalogReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!projectCode || !departmentCode) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchCatalogProject(projectCode),
      fetchCatalogDepartments(projectCode),
      fetchCatalogReports(projectCode, departmentCode),
    ])
      .then(([p, depts, reps]) => {
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
        setDepartments(depts);
        setReports(reps);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [projectCode, departmentCode]);

  const selectedDept = departments.find((d) => d.code === departmentCode);

  if (loading) {
    return (
      <DashboardLayout featuredProject={project ?? undefined}>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant/60 text-sm">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !project || !selectedDept) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout featuredProject={project}>
      <div style={{ "--accent": project.color } as React.CSSProperties}>
        {/* ── Hero Banner: gradient + white logo panel ── */}
        <section className="rounded-3xl mb-8 sm:mb-12 overflow-hidden flex">
          <div
            className="relative flex-1 px-5 sm:px-10 lg:px-16 py-6 sm:py-10 lg:py-14 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${project.color} 0%, color-mix(in srgb, ${project.color} 70%, #000) 100%)`,
            }}
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-[30%] -right-[15%] w-[50%] h-[70%] rounded-full bg-white/[0.07] blur-[100px]" />
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
              <nav className="flex items-center gap-2 mb-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
                <Link to="/dashboard" className="hover:text-white/70 transition-colors no-underline text-white/40">
                  Servizz.gov
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <Link to={`/project/${projectCode}`} className="hover:text-white/70 transition-colors no-underline text-white/40">
                  {project.name}
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-white/60">{selectedDept.name}</span>
              </nav>
              <h1 className="text-xl sm:text-3xl lg:text-5xl font-black tracking-tighter font-headline leading-[0.95] text-white">
                {project.name} <span className="text-white/50">Portal</span>
              </h1>
            </div>
          </div>
          <div className="hidden sm:flex w-36 md:w-48 lg:w-56 bg-white items-center justify-center shrink-0 p-4 sm:p-6 relative">
            <svg
              className="absolute top-0 right-4 w-8 h-12 drop-shadow-md"
              viewBox="0 0 36 56"
              fill="none"
            >
              <path
                d="M0 0H36V48L18 40L0 48V0Z"
                style={{ fill: `color-mix(in srgb, ${project.color} 70%, black)` }}
              />
            </svg>
            <img src={project.logo} alt={project.name} className="w-24 lg:w-32 object-contain relative z-10" />
          </div>
        </section>

        {/* ── Department Pills ── */}
        <section className="mb-10">
          <div className="flex flex-wrap gap-2">
            {departments.map((dept) => {
              const isSelected = dept.code === departmentCode;
              return (
                <Link
                  key={dept.code}
                  to={`/project/${projectCode}/department/${dept.code}`}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all no-underline ${
                    isSelected
                      ? "bg-accent text-white shadow-lg"
                      : "bg-white text-on-surface-variant hover:bg-surface-container-high border border-on-surface-variant/8"
                  }`}
                  style={
                    isSelected
                      ? { boxShadow: `0 4px 20px ${project.color}30` }
                      : undefined
                  }
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={
                      isSelected
                        ? { fontVariationSettings: "'FILL' 1" }
                        : undefined
                    }
                  >
                    {dept.icon}
                  </span>
                  {dept.name}
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Reports ── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold font-headline text-on-surface">
                {selectedDept.name} Reports
              </h3>
              <p className="text-on-surface-variant/60 text-sm mt-1">
                Fiscal Year 2024
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {reports.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center text-on-surface-variant/60 text-sm" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                No reports available in this department yet.
              </div>
            )}
            {reports.map((report) => (
              <div
                key={report.code}
                className="group bg-white rounded-2xl p-5 flex items-center justify-between card-lift border border-transparent hover:border-accent-20"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <div className="flex items-center gap-5">
                  <div
                    className="rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      width: "52px",
                      height: "52px",
                      backgroundColor: `${project.color}10`,
                      color: project.color,
                    }}
                  >
                    <span className="material-symbols-outlined text-2xl">
                      {report.icon ?? "analytics"}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface group-hover:text-accent transition-colors text-[15px]">
                      {report.name}
                    </h4>
                    {report.description && (
                      <p className="text-xs text-on-surface-variant/60 mt-1.5">
                        {report.description}
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  to={`/project/${projectCode}/department/${departmentCode}/report/${report.code}`}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-accent bg-accent-5 hover:bg-accent-10 transition-colors uppercase tracking-wider flex items-center gap-1.5 no-underline"
                >
                  View Report
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
