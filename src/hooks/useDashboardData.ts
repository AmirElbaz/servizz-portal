import { useState, useEffect, useMemo } from "react";
import { fetchDashboardSummary, type DashboardSummaryData } from "../services/api";
import {
  fetchCatalogDepartmentList,
  type CatalogDepartmentSummary,
} from "../services/catalog";
import { departmentColorHex } from "../utils/departmentColor";

// Department-first featured entity. Shape-compatible with the legacy `Project`
// interface the variants consume, so a dept can be passed straight into the
// existing hero templates with minimal variant churn. `logo` is an empty
// string for departments — variants render a Material Symbols fallback when
// it's empty.
export interface FeaturedDepartment {
  // Project-compatible fields (variants read these):
  id: string;                 // department code — used as the route segment
  code: string;               // for the top-of-hero uppercase label
  name: string;
  description: string;
  fullDescription: string;
  icon: string;               // Material Symbols name
  logo: string;               // empty string — variants fall back to the icon
  color: string;              // derived hex from code hash
  hoverBorderColor: string;

  // Department-only metadata:
  numericId: number;          // departments.id (for API lookups)
  projectCount: number;
  directReportCount: number;
  totalReportCount: number;   // distinct reports via direct OR project attachment
  enabledModules: string[];   // enabled module codes (e.g. ['projects', 'templates'])
}

export interface DashboardData {
  departments: FeaturedDepartment[];
  featuredDepartment: FeaturedDepartment | null;
  heroStats: DashboardSummaryData | null;
  isLoading: boolean;
  error: string | null;
}

function adaptDepartment(d: CatalogDepartmentSummary): FeaturedDepartment {
  const description = d.description ?? "";
  return {
    id: d.code,
    code: d.code.toUpperCase().slice(0, 4),
    name: d.name,
    description,
    fullDescription:
      description ||
      `The ${d.name} department in the Servizz.gov unified catalog.`,
    icon: d.icon ?? "domain",
    logo: "",                  // no project-style PNG; variants render the icon
    color: departmentColorHex(d.code),
    hoverBorderColor: "",
    numericId: d.id,
    projectCount: d.projectCount,
    directReportCount: d.directReportCount,
    totalReportCount: d.totalReportCount ?? d.directReportCount,
    enabledModules: d.modules ?? [],
  };
}

export function useDashboardData(): DashboardData {
  const [departments, setDepartments] = useState<FeaturedDepartment[]>([]);
  const [heroStats, setHeroStats] = useState<DashboardSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalogDepartmentList()
      .then((list) => {
        setDepartments(list.map(adaptDepartment));
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load departments:", err);
        setError(err instanceof Error ? err.message : "Failed to load departments");
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Pick the featured department: prefer the last one the user was viewing,
  // otherwise prefer one that has projects (Operation-style), otherwise the
  // first in the list.
  const featuredDepartment = useMemo(() => {
    if (departments.length === 0) return null;
    const lastCode = localStorage.getItem("last-department");
    if (lastCode) {
      const found = departments.find((d) => d.code === lastCode);
      if (found) return found;
    }
    const withProjects = departments.find((d) => d.projectCount > 0);
    return withProjects ?? departments[0];
  }, [departments]);

  // Hero stats are meaningful only for project-scoped departments (Operation).
  // Direct-report departments aggregate different data — when the backend
  // exposes those aggregations we'll branch here. For now, fetch per-project
  // stats only when the featured department has projects.
  useEffect(() => {
    if (!featuredDepartment || featuredDepartment.projectCount === 0) {
      setHeroStats(null);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    // Aggregate across all projects by passing an empty project filter — the
    // backend already constrains to the caller's allowed project names when
    // no explicit project is specified.
    fetchDashboardSummary(today, today, undefined)
      .then(setHeroStats)
      .catch(() => {
        // Non-fatal — variant handles null heroStats gracefully.
      });
  }, [featuredDepartment]);

  return { departments, featuredDepartment, heroStats, isLoading, error };
}
