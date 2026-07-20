import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import TopNavBar from "../layout/TopNavBar";
import Footer from "../layout/Footer";
import AdminSidebar from "./AdminSidebar";

interface AdminLayoutProps {
  children: ReactNode;
}

// Page shell for /admin routes. Reuses the existing TopNavBar so the brand,
// search, notifications, and logout stay identical to the rest of the app.
//
// Layout rules:
//   - Desktop (≥lg): sidebar is an inline sticky column on the left, content
//     on the right. Flex layout pins the footer to the viewport bottom when
//     content is short.
//   - Mobile (<lg): sidebar is hidden by default; a floating "Admin sections"
//     button at the bottom-right opens an off-canvas drawer from the left.
//     The drawer auto-closes when a NavLink is clicked or when the route
//     changes. Body scroll is locked while the drawer is open.
export default function AdminLayout({ children }: AdminLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Auto-close the drawer when the URL changes (either via NavLink click or
  // browser back button).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Body scroll lock while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      <TopNavBar />
      <main className="flex-1 w-full pt-20 sm:pt-28 pb-10 sm:pb-16 px-4 sm:px-6 lg:px-12 mx-auto max-w-[1800px]">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Desktop sidebar (inline column) */}
          <aside className="hidden lg:block w-60 shrink-0">
            <AdminSidebar />
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </main>
      <Footer />

      {/* ── Mobile: floating button that opens the sidebar drawer ── */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open admin sections"
        aria-expanded={drawerOpen}
        className="lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-dim text-white shadow-lg shadow-primary/30 flex items-center justify-center hover:opacity-95 transition-opacity"
      >
        <span className="material-symbols-outlined text-[24px]">menu</span>
      </button>

      {/* ── Mobile: off-canvas sidebar drawer ── */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[90]"
          role="dialog"
          aria-modal="true"
          aria-label="Admin sections"
        >
          <div
            className="absolute inset-0 bg-on-surface/30 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-[80%] max-w-xs bg-surface shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-4 py-4 border-b border-on-surface-variant/8">
              <h2 className="text-sm font-extrabold text-on-surface font-headline tracking-tight">
                Administration
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close admin sections"
                className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                  close
                </span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <AdminSidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
