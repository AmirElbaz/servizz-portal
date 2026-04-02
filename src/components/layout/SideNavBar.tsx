import { Link } from "react-router-dom";
import { sidebarDepartments } from "../../data/departments";

interface SideNavBarProps {
  activeDepartment?: string;
  showLogout?: boolean;
}

export default function SideNavBar({
  activeDepartment = "social",
  showLogout = false,
}: SideNavBarProps) {
  return (
    <aside className="bg-slate-50 w-64 border-r border-slate-200 flex flex-col py-6 fixed left-0 top-16 h-[calc(100vh-4rem)] overflow-y-auto scrollbar-hide">
      <div className="px-6 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1 font-headline">
          Departments
        </h2>
        <p className="text-[10px] text-outline leading-tight">
          Unified Services Portal
        </p>
      </div>
      <nav className="flex-1">
        <div className="space-y-1">
          {sidebarDepartments.map((dept) => {
            const isActive = dept.id === activeDepartment;
            return (
              <a
                key={dept.id}
                href="#"
                className={
                  isActive
                    ? "flex items-center gap-3 px-4 py-2.5 bg-white text-primary shadow-sm rounded-lg mb-1 mx-2 transition-all"
                    : "flex items-center gap-3 px-4 py-2.5 text-slate-500 hover:bg-slate-100 mx-2 mb-1 rounded-lg transition-transform duration-200"
                }
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={
                    isActive
                      ? { fontVariationSettings: "'FILL' 1" }
                      : undefined
                  }
                >
                  {dept.icon}
                </span>
                <span className="text-sm font-medium font-sans">
                  {dept.name}
                </span>
              </a>
            );
          })}
        </div>
      </nav>
      <div className="mt-auto px-4 py-4">
        {showLogout ? (
          <Link
            to="/"
            className="w-full py-2 bg-primary text-on-primary text-xs font-bold uppercase rounded-lg hover:opacity-90 transition-opacity block text-center"
          >
            Logout
          </Link>
        ) : (
          <Link
            to="/"
            className="w-full py-2 bg-primary text-white text-xs font-bold uppercase rounded-lg hover:opacity-90 transition-opacity block text-center"
          >
            Secure Login
          </Link>
        )}
      </div>
    </aside>
  );
}
