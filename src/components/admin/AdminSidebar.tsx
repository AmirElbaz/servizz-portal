import { NavLink } from "react-router-dom";
import { useAuth, roleAtLeast, type AccessRole } from "../../services/auth";

interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
  // Minimum tier that may open this section — mirrors the route guards in
  // App.tsx and the server's [MinRole]. Items above the user's tier are
  // hidden so staff don't see governance links they can't use.
  minRole: AccessRole;
}

// The whole Admin Tab is super-admin-only (2026-06-01) — every section, incl.
// Departments / Project Structure (now classed as governance). minRole is kept
// per-item so the structure is obvious and easy to re-tier later if needed.
const items: AdminNavItem[] = [
  { to: "/admin/requests",    label: "Access Requests",   icon: "how_to_reg",    minRole: "super_admin" },
  { to: "/admin/policies",    label: "Policies",          icon: "shield_person", minRole: "super_admin" },
  { to: "/admin/users",       label: "Users",             icon: "group",         minRole: "super_admin" },
  { to: "/admin/departments", label: "Departments",       icon: "domain",        minRole: "super_admin" },
  { to: "/admin/structure",   label: "Project Structure", icon: "account_tree",  minRole: "super_admin" },
  { to: "/admin/report-index", label: "Report Index",     icon: "menu_book",     minRole: "super_admin" },
  { to: "/admin/audit",       label: "Audit Log",         icon: "history",       minRole: "super_admin" },
];

interface AdminSidebarProps {
  /** Called when a NavLink is clicked — used by mobile drawer to auto-close. */
  onNavigate?: () => void;
}

export default function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const { user } = useAuth();
  const visibleItems = items.filter((item) => roleAtLeast(user?.role, item.minRole));
  return (
    <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-3 lg:sticky lg:top-24">
      <div className="px-3 py-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
          Administration
        </p>
      </div>
      <nav className="flex flex-col gap-1">
        {visibleItems.map((item) => (
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
