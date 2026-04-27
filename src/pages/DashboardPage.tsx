import { Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardData } from "../hooks/useDashboardData";
import { useAuth } from "../services/auth";

// Prism is now the only landing variant. Variants A/B were retired after
// the Prism rework shipped — if a new variant is ever needed, reintroduce
// a registry + switcher here.
const DashboardVariantC = lazy(() => import("./dashboard/DashboardVariantC"));

export default function DashboardPage() {
  const data = useDashboardData();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

  // ── Error or empty (no granted departments) ──
  // Catches: (1) API error, (2) user has no departments granted, (3)
  // featuredDepartment resolved to null for any other reason.
  if (data.error || !data.featuredDepartment) {
    return (
      <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl editorial-shadow border border-on-surface-variant/5 p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/8 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-primary text-[28px]">
              {data.error ? "cloud_off" : "inventory_2"}
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
            {data.error ? "We couldn't load your dashboard" : "No departments available"}
          </h1>
          <p className="text-sm text-on-surface-variant/70 mb-6">
            {data.error
              ? data.error
              : "Your account is not granted access to any departments yet. Ask your administrator to attach you to a policy."}
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
                className="btn-brand px-4 py-2 rounded-xl text-sm font-bold"
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

  return (
    <Suspense
      fallback={
        <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center">
          <p className="text-on-surface-variant/60 text-sm">Loading...</p>
        </div>
      }
    >
      <DashboardVariantC projects={data.departments} />
    </Suspense>
  );
}
