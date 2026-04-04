import type { ReactNode } from "react";
import TopNavBar from "./TopNavBar";
import Footer from "./Footer";

interface DashboardLayoutProps {
  children: ReactNode;
  onPortalsClick?: () => void;
  onServizzClick?: () => void;
}

export default function DashboardLayout({ children, onPortalsClick, onServizzClick }: DashboardLayoutProps) {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <TopNavBar onPortalsClick={onPortalsClick} onServizzClick={onServizzClick} />
      <main className="pt-28 pb-16 px-6 lg:px-12 max-w-7xl mx-auto">
        {children}
      </main>
      <Footer />
    </div>
  );
}
