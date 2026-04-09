import type { ReactNode } from "react";
import TopNavBar from "./TopNavBar";
import Footer from "./Footer";
import type { Project } from "../../data/projects";

interface DashboardLayoutProps {
  children: ReactNode;
  onPortalsClick?: () => void;
  onServizzClick?: () => void;
  heroCollapsed?: boolean;
  featuredProject?: Project;
  wide?: boolean;
}

export default function DashboardLayout({
  children,
  onPortalsClick,
  onServizzClick,
  heroCollapsed,
  featuredProject,
  wide = false,
}: DashboardLayoutProps) {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <TopNavBar
        onPortalsClick={onPortalsClick}
        onServizzClick={onServizzClick}
        heroCollapsed={heroCollapsed}
        featuredProject={featuredProject}
      />
      <main className={`pt-28 pb-16 px-6 lg:px-12 mx-auto ${wide ? "max-w-[1800px]" : "max-w-7xl"}`}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
