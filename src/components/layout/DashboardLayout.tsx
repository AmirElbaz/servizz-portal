import type { ReactNode } from "react";
import TopNavBar from "./TopNavBar";
import SideNavBar from "./SideNavBar";
import Footer from "./Footer";

interface DashboardLayoutProps {
  children: ReactNode;
  showLogout?: boolean;
}

export default function DashboardLayout({
  children,
  showLogout = false,
}: DashboardLayoutProps) {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <TopNavBar />
      <div className="flex pt-16 min-h-screen">
        <SideNavBar showLogout={showLogout} />
        <main className="flex-1 ml-64 p-8 lg:p-12 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
