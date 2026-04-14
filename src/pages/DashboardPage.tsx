import { useState, lazy, Suspense } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
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

  function handleVariantChange(v: string) {
    setVariant(v);
    localStorage.setItem("dashboard-variant", v);
  }

  if (data.isLoading || !data.featuredProject) {
    return (
      <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center">
        <p className="text-on-surface-variant/60 text-sm">Loading...</p>
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
