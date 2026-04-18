import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardData } from "../hooks/useDashboardData";
import { useAuth } from "../services/auth";
import VariantSwitcher from "./dashboard/VariantSwitcher";

const DashboardVariantA = lazy(() => import("./dashboard/DashboardVariantA"));
const DashboardVariantB = lazy(() => import("./dashboard/DashboardVariantB"));
const DashboardVariantC = lazy(() => import("./dashboard/DashboardVariantC"));

const VARIANTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  A: DashboardVariantA,
  B: DashboardVariantB,
  C: DashboardVariantC,
};

export default function DashboardPage() {
  const [variant, setVariant] = useState(() => localStorage.getItem("dashboard-variant") || "A");
  const data = useDashboardData();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleVariantChange(v: string) {
    setVariant(v);
    localStorage.setItem("dashboard-variant", v);
  }

  function handleSignOut() {
    logout();
    navigate("/");
  }

  // ── Loading ──
  if (data.isLoading) {
    return (
      <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center">
        <p className="text-on-surface-variant/60 text-sm">Loading...</p>
      </div>
    );
  }

  // ── Error or empty (no granted projects) ──
  // This branch catches three cases that used to all render as "Loading..." forever:
  //   1. API call errored (e.g. 403 / 500)
  //   2. User has no granted projects under their policies
  //   3. featuredProject resolved to null for any other reason
  if (data.error || !data.featuredProject) {
    return (
      <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl editorial-shadow border border-on-surface-variant/5 p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/8 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-primary text-[28px]">
              {data.error ? "cloud_off" : "inventory_2"}
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
            {data.error ? "We couldn't load your dashboard" : "No projects available"}
          </h1>
          <p className="text-sm text-on-surface-variant/70 mb-6">
            {data.error
              ? data.error
              : "Your account is not granted access to any projects yet. Ask your administrator to attach you to a policy with project access."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Retry
            </button>
            {user?.isAdmin && (
              <button
                onClick={() => navigate("/admin/policies")}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-primary to-primary-dim shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity"
              >
                Open Admin
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-error hover:bg-error/10 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const VariantComponent = VARIANTS[variant] ?? DashboardVariantA;

  return (
    <>
      <Suspense fallback={
        <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center">
          <p className="text-on-surface-variant/60 text-sm">Loading...</p>
        </div>
      }>
        <VariantComponent
          projects={data.projects}
          featuredProject={data.featuredProject}
          heroStats={data.heroStats}
        />
      </Suspense>
      <VariantSwitcher active={variant} onChange={handleVariantChange} />
    </>
  );
}
