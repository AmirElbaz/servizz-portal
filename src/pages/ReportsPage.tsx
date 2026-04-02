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
      <DashboardLayout showLogout>
        <div className="flex items-center justify-center h-64">
          <p className="text-on-surface-variant text-lg">Not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout showLogout>
      <div style={{ "--accent": project.color } as React.CSSProperties}>
        {/* Header Section */}
        <header className="mb-12">
          <nav className="flex items-center gap-2 mb-6 text-[10px] font-bold text-accent uppercase tracking-widest">
            <Link to="/dashboard" className="hover:underline">
              Portals
            </Link>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <Link to={`/project/${projectId}`} className="hover:underline">
              {project.name}
            </Link>
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

        {/* Department Grid */}
        <section className="mb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {departments.map((dept) => {
              const isSelected = dept.id === departmentId;
              if (isSelected) {
                return (
                  <div
                    key={dept.id}
                    className="p-8 rounded-xl bg-white border-2 border-accent shadow-sm relative transition-colors text-center"
                  >
                    <div className="absolute top-4 right-4">
                      <span
                        className="material-symbols-outlined text-accent text-lg"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        check_circle
                      </span>
                    </div>
                    <div className="w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined">
                        {dept.icon}
                      </span>
                    </div>
                    <h5 className="font-bold text-accent text-sm">
                      {dept.name}
                    </h5>
                  </div>
                );
              }

              return (
                <Link
                  key={dept.id}
                  to={`/project/${projectId}/department/${dept.id}`}
                  className="p-8 rounded-xl bg-white border border-slate-200 hover:border-accent-50 transition-colors group cursor-pointer text-center no-underline"
                >
                  <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-accent group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined">
                      {dept.icon}
                    </span>
                  </div>
                  <h5 className="font-bold text-on-surface text-sm">
                    {dept.name}
                  </h5>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Reports Section */}
        <section className="max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-2xl font-bold font-headline text-on-surface">
                {selectedDept.name} Reports
              </h3>
              <p className="text-on-surface-variant text-sm mt-1">
                Project #{project.color.replace("#", "")} Fiscal Year 2024
              </p>
            </div>
            <button className="bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity editorial-shadow">
              <span className="material-symbols-outlined text-sm">
                download
              </span>
              Export Data
            </button>
          </div>

          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white border border-slate-100 p-6 rounded-2xl editorial-shadow hover:border-accent-20 transition-all group flex items-center justify-between"
              >
                <div className="flex items-center gap-6">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${project.color} 10%, transparent)`,
                      color: project.color,
                    }}
                  >
                    <span className="material-symbols-outlined text-2xl">
                      {report.icon}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface group-hover:text-accent transition-colors">
                      {report.title}
                    </h4>
                    <div className="flex gap-4 mt-1">
                      <span className="text-xs text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">
                          calendar_today
                        </span>{" "}
                        {report.date}
                      </span>
                      <span className="text-xs text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">
                          {report.metaIcon}
                        </span>{" "}
                        {report.meta}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 rounded-lg text-xs font-bold text-accent bg-accent-5 hover:bg-accent-10 transition-colors uppercase tracking-wider">
                  Download
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
