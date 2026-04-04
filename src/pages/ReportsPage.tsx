import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { projects } from "../data/projects";
import { departments } from "../data/departments";
import { reports } from "../data/reports";

export default function ReportsPage() {
  const { projectId, departmentId } = useParams<{
    projectId: string;
    departmentId: string;
  }>();
  const project = projects.find((p) => p.id === projectId);
  const selectedDept = departments.find((d) => d.id === departmentId);

  if (!project || !selectedDept) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ "--accent": project.color } as React.CSSProperties}>
        {/* ── Hero Banner ── */}
        <section
          className="relative overflow-hidden rounded-3xl mb-12 px-10 lg:px-16 py-12 lg:py-16"
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
          <div className="absolute top-8 right-12 pointer-events-none opacity-[0.12]">
            <img src={project.logo} alt="" className="h-28 lg:h-36 object-contain brightness-0 invert" />
          </div>

          <div className="relative z-10">
            <nav className="flex items-center gap-2 mb-5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
              <Link to="/dashboard" className="hover:text-white/70 transition-colors no-underline text-white/40">
                Portals
              </Link>
              <span className="material-symbols-outlined text-xs">chevron_right</span>
              <Link to={`/project/${projectId}`} className="hover:text-white/70 transition-colors no-underline text-white/40">
                {project.name}
              </Link>
              <span className="material-symbols-outlined text-xs">chevron_right</span>
              <span className="text-white/60">{selectedDept.name}</span>
            </nav>
            <h1 className="text-3xl lg:text-5xl font-black tracking-tighter font-headline leading-[0.95] text-white">
              {project.name} <span className="text-white/50">Portal</span>
            </h1>
          </div>
        </section>

        {/* ── Department Pills ── */}
        <section className="mb-10">
          <div className="flex flex-wrap gap-2">
            {departments.map((dept) => {
              const isSelected = dept.id === departmentId;
              return (
                <Link
                  key={dept.id}
                  to={`/project/${projectId}/department/${dept.id}`}
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
            {reports.map((report) => (
              <div
                key={report.id}
                className="group bg-white rounded-2xl p-5 flex items-center justify-between card-lift border border-transparent hover:border-accent-20"
                style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              >
                <div className="flex items-center gap-5">
                  <div
                    className="w-13 h-13 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      width: "52px",
                      height: "52px",
                      backgroundColor: `${project.color}10`,
                      color: project.color,
                    }}
                  >
                    <span className="material-symbols-outlined text-2xl">
                      {report.icon}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface group-hover:text-accent transition-colors text-[15px]">
                      {report.title}
                    </h4>
                    <div className="flex gap-4 mt-1.5">
                      <span className="text-xs text-on-surface-variant/60 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">
                          calendar_today
                        </span>
                        {report.date}
                      </span>
                      <span className="text-xs text-on-surface-variant/60 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">
                          {report.metaIcon}
                        </span>
                        {report.meta}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 rounded-xl text-xs font-bold text-accent bg-accent-5 hover:bg-accent-10 transition-colors uppercase tracking-wider flex items-center gap-1.5">
                  View Report
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
