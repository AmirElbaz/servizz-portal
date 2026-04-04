import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { projects } from "../data/projects";
import { departments } from "../data/departments";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
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
        {/* ── Hero Banner ── */}
        <section className="relative overflow-hidden rounded-3xl mb-12 px-10 lg:px-16 py-14 lg:py-18"
          style={{
            background: `linear-gradient(135deg, ${project.color} 0%, color-mix(in srgb, ${project.color} 70%, #000) 100%)`,
          }}
        >
          {/* Decorative elements */}
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
          {/* Large faded icon */}
          <div className="absolute top-6 right-10 pointer-events-none">
            <span
              className="material-symbols-outlined text-white/[0.08]"
              style={{ fontSize: "140px", fontVariationSettings: "'FILL' 1" }}
            >
              {project.icon}
            </span>
          </div>

          <div className="relative z-10">
            <nav className="flex items-center gap-2 mb-6 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
              <Link to="/dashboard" className="hover:text-white/70 transition-colors no-underline text-white/40">
                Portals
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
        </section>

        {/* ── Departments ── */}
        <section>
          <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight mb-6">
            Departments
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {departments.map((dept) => (
              <Link
                key={dept.id}
                to={`/project/${projectId}/department/${dept.id}`}
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
