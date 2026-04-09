import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import type { Project } from "../data/projects";
import {
  fetchCatalogProject,
  fetchCatalogDepartments,
  getLogoUrl,
  type CatalogDepartment,
} from "../services/catalog";

export default function ProjectDetailPage() {
  const { projectCode } = useParams<{ projectCode: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [departments, setDepartments] = useState<CatalogDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (projectCode) localStorage.setItem("last-project", projectCode);
  }, [projectCode]);

  useEffect(() => {
    if (!projectCode) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchCatalogProject(projectCode),
      fetchCatalogDepartments(projectCode),
    ])
      .then(([p, depts]) => {
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
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [projectCode]);

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
        {/* ── Hero Banner: gradient + white logo panel ── */}
        <section className="rounded-3xl mb-12 overflow-hidden flex">
          {/* Gradient side (4/5) */}
          <div
            className="relative flex-1 px-10 lg:px-16 py-14 lg:py-18 overflow-hidden"
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
              <nav className="flex items-center gap-2 mb-6 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
                <Link to="/dashboard" className="hover:text-white/70 transition-colors no-underline text-white/40">
                  Servizz.gov
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-white/60">{project.name}</span>
              </nav>
              <h1 className="text-4xl lg:text-6xl font-black tracking-tighter font-headline leading-[0.95] text-white mb-4">
                {project.name} <span className="text-white/50">Portal</span>
              </h1>
              <p className="text-white/45 text-base max-w-2xl leading-relaxed">
                {project.fullDescription}
              </p>
            </div>
          </div>
          {/* White logo panel (1/5) */}
          <div className="w-56 lg:w-64 bg-white flex items-center justify-center shrink-0 p-8 relative">
            {/* Bookmark ribbon */}
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
            <img src={project.logo} alt={project.name} className="w-28 lg:w-36 object-contain relative z-10" />
          </div>
        </section>

        {/* ── Departments ── */}
        <section>
          <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
            Departments
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {departments.map((dept) => (
              <Link
                key={dept.code}
                to={`/project/${projectCode}/department/${dept.code}`}
                className="group relative bg-white rounded-2xl p-7 text-center no-underline card-lift overflow-hidden border border-transparent hover:border-accent-50"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    boxShadow: `0 0 40px ${project.color}15`,
                  }}
                />
                <div className="relative">
                  <div className="w-14 h-14 bg-surface-container-high rounded-2xl flex items-center justify-center mx-auto mb-4 text-on-surface-variant group-hover:bg-accent group-hover:text-white transition-all duration-300 group-hover:scale-110">
                    <span className="material-symbols-outlined text-[24px]">
                      {dept.icon}
                    </span>
                  </div>
                  <h5 className="font-bold text-on-surface text-sm">{dept.name}</h5>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
