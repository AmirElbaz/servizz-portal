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
        {/* Header */}
        <header className="mb-12">
          <nav className="flex items-center gap-2 mb-6 text-[10px] font-bold text-accent uppercase tracking-widest">
            <Link to="/dashboard" className="hover:underline">
              Portals
            </Link>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <span>{project.name}</span>
          </nav>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tighter text-on-surface mb-6 leading-none font-headline">
            {project.name}{" "}
            <span className="text-accent">Portal</span>
          </h1>
          <div className="max-w-2xl">
            <p className="text-lg text-on-surface-variant font-body leading-relaxed">
              {project.fullDescription}
            </p>
          </div>
        </header>

        {/* Departments Grid */}
        <section className="mb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {departments.map((dept) => (
              <Link
                key={dept.id}
                to={`/project/${projectId}/department/${dept.id}`}
                className="p-8 rounded-xl bg-white border border-slate-200 hover:border-accent-50 transition-colors group cursor-pointer text-center no-underline"
              >
                <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-accent group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined">{dept.icon}</span>
                </div>
                <h5 className="font-bold text-on-surface text-sm">
                  {dept.name}
                </h5>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
