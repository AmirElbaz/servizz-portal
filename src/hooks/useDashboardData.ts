import { useState, useEffect, useMemo } from "react";
import type { Project } from "../data/projects";
import { fetchDashboardSummary, type DashboardSummaryData } from "../services/api";
import { fetchCatalogProjects } from "../services/catalog";
import { adaptProject } from "../utils/adaptProject";

export interface DashboardData {
  projects: Project[];
  featuredProject: Project | null;
  heroStats: DashboardSummaryData | null;
  isLoading: boolean;
}

export function useDashboardData(): DashboardData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [heroStats, setHeroStats] = useState<DashboardSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCatalogProjects()
      .then((list) => setProjects(list.map(adaptProject)))
      .catch((err) => console.error("Failed to load projects:", err))
      .finally(() => setIsLoading(false));
  }, []);

  const featuredProject = useMemo(() => {
    if (projects.length === 0) return null;
    const lastId = localStorage.getItem("last-project");
    if (lastId) {
      const found = projects.find((p) => p.id === lastId);
      if (found) return found;
    }
    return projects[0];
  }, [projects]);

  useEffect(() => {
    if (!featuredProject) return;
    const today = new Date().toISOString().slice(0, 10);
    fetchDashboardSummary(today, today, featuredProject.id)
      .then(setHeroStats)
      .catch(() => {});
  }, [featuredProject]);

  return { projects, featuredProject, heroStats, isLoading };
}
