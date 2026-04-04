import type { ReactNode } from "react";
import TopNavBar from "./TopNavBar";
import Footer from "./Footer";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <TopNavBar />
      <main className="pt-28 pb-16 px-6 lg:px-12 max-w-7xl mx-auto">
        {children}
      </main>
      <Footer />
    </div>
  );
}
