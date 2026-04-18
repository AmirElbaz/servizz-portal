import { NavLink } from "react-router-dom";

interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
}

const items: AdminNavItem[] = [
  { to: "/admin/policies",    label: "Policies",         icon: "shield_person" },
  { to: "/admin/users",       label: "Users",            icon: "group" },
  { to: "/admin/departments", label: "Departments",      icon: "domain" },
  { to: "/admin/structure",   label: "Project Structure", icon: "account_tree" },
];

interface AdminSidebarProps {
  /** Called when a NavLink is clicked — used by mobile drawer to auto-close. */
  onNavigate?: () => void;
}

export default function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  return (
    <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-3 lg:sticky lg:top-24">
      <div className="px-3 py-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
          Administration
        </p>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors no-underline ${
                isActive
                  ? "bg-primary/8 text-primary border border-primary/15"
                  : "text-on-surface-variant hover:bg-surface-container-high/60 hover:text-on-surface border border-transparent"
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
