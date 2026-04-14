import type { Project } from "../data/projects";
import { getLogoUrl, type CatalogProject } from "../services/catalog";

export function adaptProject(p: CatalogProject): Project {
  return {
    id: p.code,
    code: p.shortLabel,
    name: p.displayName,
    description: p.description ?? "",
    fullDescription: p.fullDescription ?? "",
    icon: p.icon ?? "",
    logo: getLogoUrl(p.logoFilename),
    color: p.colorHex,
    hoverBorderColor: "",
  };
}
