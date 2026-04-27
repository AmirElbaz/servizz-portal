import type { ReactNode } from "react";
import TopNavBar from "./TopNavBar";
import Footer from "./Footer";

interface DashboardLayoutProps {
  children: ReactNode;
  wide?: boolean;
}

/**
 * Shell for every dashboard-family page (dept detail, project detail, report
 * view, reports list, HR pages).
 *
 * The Prism visual language is applied here globally:
 *   - Fixed radial wash of Centrecom Blue top-center + Dark Blue bottom-left
 *     so the grey surface (`#F8F9FB`) always has chromatic presence behind it.
 *   - Two animated brand-blue blobs in corners for subtle motion.
 *
 * Page-level surfaces (cards, panels) remain on white so they pop against
 * the tinted canvas. Pages that want glass surfaces wrap their own content
 * with `backdrop-blur` / translucent backgrounds (see DashboardVariantC
 * for the pattern).
 */
export default function DashboardLayout({
  children,
  wide = false,
}: DashboardLayoutProps) {
  return (
    <div className="bg-surface text-on-surface min-h-screen relative overflow-x-hidden">
      {/* Prism ambient washes — same tokens as the dashboard landing */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(46,178,255,0.18) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 18% 85%, rgba(45,58,72,0.08) 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-[8%] -right-[10%] w-[40%] h-[50%] rounded-full bg-primary/12 blur-[140px] animate-blob1 pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute top-[35%] -left-[10%] w-[35%] h-[45%] rounded-full bg-primary/6 blur-[130px] animate-blob2 pointer-events-none"
      />

      <TopNavBar />
      <main
        className={`relative pt-20 sm:pt-28 pb-10 sm:pb-16 px-4 sm:px-6 lg:px-12 mx-auto ${
          wide ? "max-w-[1800px]" : "max-w-[90rem]"
        }`}
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
