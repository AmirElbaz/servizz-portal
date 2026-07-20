import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider } from "./services/auth";
import { PermissionProvider } from "./services/permissions";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminOnly from "./components/admin/AdminOnly";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import CompleteSignupPage from "./pages/CompleteSignupPage";
import RequestAccessPage from "./pages/RequestAccessPage";
import CompleteRegistrationPage from "./pages/CompleteRegistrationPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import DashboardPage from "./pages/DashboardPage";
import DepartmentDetailPage from "./pages/DepartmentDetailPage";
import HrTemplateRecordsPage from "./pages/hr/HrTemplateRecordsPage";
import AttritionReportPage from "./pages/hr/AttritionReportPage";
import HrTemplateDesignerPage from "./pages/hr/HrTemplateDesignerPage";
import HrRecordDetailPage from "./pages/hr/HrRecordDetailPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ReportViewPage from "./pages/ReportViewPage";
import AbandonedWithin5sReportPage from "./pages/AbandonedWithin5sReportPage";
import ChannelReportPage from "./pages/ChannelReportPage";
import BillingRawDataPage from "./pages/BillingRawDataPage";
import IvrTrendComparisonPreviewPage from "./pages/IvrTrendComparisonPreviewPage";
import RepeatCallersPreviewPage from "./pages/RepeatCallersPreviewPage";
import IvrFunnelPreviewPage from "./pages/IvrFunnelPreviewPage";
import HourlyDistributionPreviewPage from "./pages/HourlyDistributionPreviewPage";
import ModuleFileUploadsPage from "./pages/ModuleFileUploadsPage";
import ReportIndexPage from "./pages/ReportIndexPage";

// Admin pages are lazy-loaded — they ship a separate chunk so non-admins
// never download the code.
const AdminPoliciesPage    = lazy(() => import("./pages/admin/AdminPoliciesPage"));
const AdminPolicyEditorPage = lazy(() => import("./pages/admin/AdminPolicyEditorPage"));
const AdminUsersPage       = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminDepartmentsPage = lazy(() => import("./pages/admin/AdminDepartmentsPage"));
const AdminStructurePage   = lazy(() => import("./pages/admin/AdminStructurePage"));
const AdminReportIndexPage = lazy(() => import("./pages/admin/AdminReportIndexPage"));
const AdminRequestsPage    = lazy(() => import("./pages/admin/AdminRequestsPage"));
const AdminAuditLogPage    = lazy(() => import("./pages/admin/AdminAuditLogPage"));

function AdminFallback() {
  return (
    <div className="bg-surface min-h-screen flex items-center justify-center">
      <p className="text-sm text-on-surface-variant/60">Loading admin panel…</p>
    </div>
  );
}

// /admin landing — the Admin Tab is super-admin-only, so every visitor here is
// a super admin; send them straight to Policies.
function AdminLanding() {
  return <Navigate to="/admin/policies" replace />;
}

// Browser-back / forward should land the user where they were, not at
// the top. Behavior (Amir 2026-05-13, applies to every page in the app):
//   - PUSH / REPLACE (forward nav, link click) → scroll to top.
//   - POP (browser back/forward) → restore the saved scroll position for
//     that history entry, or 0 if we never saved one.
//
// Positions are keyed by `location.key`, which is unique per history
// entry. SessionStorage is the backing store so positions survive a
// full-page reload of the same tab but not a new tab.
//
// We disable the browser's native scroll restoration on mount because
// it competes with this one and re-introduces the same "jumps to top"
// behavior on certain Vite/HMR reloads.
function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();

  // Disable native restoration once, on mount.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // React to navigation. Run after layout so the new page has rendered.
  useEffect(() => {
    const key = `scroll:${location.key}`;
    if (navigationType === "POP") {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) {
        const y = parseInt(saved, 10);
        if (!Number.isNaN(y)) {
          requestAnimationFrame(() => window.scrollTo(0, y));
          return;
        }
      }
    }
    window.scrollTo(0, 0);
  }, [location.key, navigationType]);

  // Persist the scroll position for the current history entry on every
  // scroll. Passive listener — never blocks scroll performance.
  useEffect(() => {
    const onScroll = () => {
      sessionStorage.setItem(`scroll:${location.key}`, String(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.key]);

  return null;
}

// Legacy redirects for the project-first URL shape. The old URLs encoded
// both project and department, so we can translate them directly to the
// new department-first shape without any backend lookup.
import { useParams } from "react-router-dom";

function LegacyReportRedirect() {
  const { projectCode, departmentCode, reportCode } = useParams();
  return (
    <Navigate
      to={`/department/${departmentCode}/project/${projectCode}/report/${reportCode}`}
      replace
    />
  );
}

function LegacyDepartmentRedirect() {
  const { projectCode, departmentCode } = useParams();
  return (
    <Navigate to={`/department/${departmentCode}/project/${projectCode}`} replace />
  );
}

// /project/:projectCode has no dept in the URL to redirect to, so we send
// the user to the dashboard and let them re-navigate. Rare case; internal
// tool; acceptable.
function LegacyProjectRedirect() {
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <PermissionProvider>
      <BrowserRouter>
        <ScrollRestoration />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/request-access" element={<RequestAccessPage />} />
          <Route path="/complete-signup" element={<ProtectedRoute><CompleteSignupPage /></ProtectedRoute>} />
          <Route path="/complete-registration" element={<ProtectedRoute><CompleteRegistrationPage /></ProtectedRoute>} />
          <Route path="/pending-approval" element={<ProtectedRoute><PendingApprovalPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportIndexPage /></ProtectedRoute>} />

          {/* ── Department-first navigation ── */}
          <Route
            path="/department/:deptCode"
            element={<ProtectedRoute><DepartmentDetailPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode"
            element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/:reportCode"
            element={<ProtectedRoute><ReportViewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/report/:reportCode"
            element={<ProtectedRoute><ReportViewPage /></ProtectedRoute>}
          />

          {/* HR Attrition Report — bespoke 3-table year view (not a generic
              SQL report; its own page + /api/Attrition backend). */}
          <Route
            path="/department/:deptCode/attrition"
            element={<ProtectedRoute><AttritionReportPage /></ProtectedRoute>}
          />

          {/* ── Abandoned Calls Within 5 Seconds of Reaching Queue ──
                Dedicated page (no pie, 4-col table, hourly/daily/monthly/
                yearly). Two URL shapes mirror the generic report routes;
                React Router's static-segment ranking makes these win over
                the generic /report/:reportCode above so ReportViewPage
                never renders this report. */}
          <Route
            path="/department/:deptCode/report/abandoned-within-5s"
            element={<ProtectedRoute><AbandonedWithin5sReportPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/abandoned-within-5s"
            element={<ProtectedRoute><AbandonedWithin5sReportPage /></ProtectedRoute>}
          />

          {/* ── Digital-channel reports (Email; Chats/Facebook/Walk-Ins) ──
                Per-project interactive reports fed from the scraped CRM tables.
                Email is its own report; "digital-channels" stacks Chats +
                Facebook + Walk-Ins. Two URL shapes each (dept-direct +
                project-scoped); same static-segment-wins pattern as above. */}
          <Route
            path="/department/:deptCode/report/email"
            element={<ProtectedRoute><ChannelReportPage reportKind="email" /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/email"
            element={<ProtectedRoute><ChannelReportPage reportKind="email" /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/report/digital-channels"
            element={<ProtectedRoute><ChannelReportPage reportKind="digital" /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/digital-channels"
            element={<ProtectedRoute><ChannelReportPage reportKind="digital" /></ProtectedRoute>}
          />

          {/* ── Billing → Raw Data ──
                Dedicated page (Per call / Per skillset toggle, fixed 8-column
                table, scoped to the Billing department's projects). Same
                static-segment-wins pattern as the routes above. */}
          <Route
            path="/department/:deptCode/report/billing-raw-data"
            element={<ProtectedRoute><BillingRawDataPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/billing-raw-data"
            element={<ProtectedRoute><BillingRawDataPage /></ProtectedRoute>}
          />

          {/* ── IVR Trend & Comparison ── */}
          {/* Three URL shapes all render the same page:                  */}
          {/*   - /preview/ivr-trend-comparison (legacy preview alias)    */}
          {/*   - /department/:deptCode/report/ivr-trend-comparison       */}
          {/*       → dept-direct: project filter is a dropdown           */}
          {/*   - /department/:deptCode/project/:projectCode/             */}
          {/*       report/ivr-trend-comparison                           */}
          {/*       → project-locked: dropdown hidden, project pinned     */}
          {/* These specific routes win over the generic                  */}
          {/* /report/:reportCode below by React Router's static-segment  */}
          {/* ranking, so ReportViewPage never renders the IVR report.    */}
          <Route
            path="/preview/ivr-trend-comparison"
            element={<ProtectedRoute><IvrTrendComparisonPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/report/ivr-trend-comparison"
            element={<ProtectedRoute><IvrTrendComparisonPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/ivr-trend-comparison"
            element={<ProtectedRoute><IvrTrendComparisonPreviewPage /></ProtectedRoute>}
          />

          {/* ── Repeat-Caller Analytics (72h window) — SKETCH/PREVIEW ──
                Mock-data layout to agree wording + layout with the business
                before any backend exists. Three URL shapes mirror the IVR
                pages (preview alias, dept-direct, project-locked).            */}
          <Route
            path="/preview/repeat-callers"
            element={<ProtectedRoute><RepeatCallersPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/report/repeat-callers"
            element={<ProtectedRoute><RepeatCallersPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/repeat-callers"
            element={<ProtectedRoute><RepeatCallersPreviewPage /></ProtectedRoute>}
          />

          {/* ── IVR Funnel — three URL shapes (mirrors trend-comparison) ──
                - /preview/ivr-funnel (legacy preview alias, no context)
                - /department/:deptCode/report/ivr-funnel (dept-direct)
                - /department/:deptCode/project/:projectCode/report/ivr-funnel
              The page reads the URL params so it can render the project logo
              when reached via the project-scoped link.                       */}
          <Route
            path="/preview/ivr-funnel"
            element={<ProtectedRoute><IvrFunnelPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/report/ivr-funnel"
            element={<ProtectedRoute><IvrFunnelPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/ivr-funnel"
            element={<ProtectedRoute><IvrFunnelPreviewPage /></ProtectedRoute>}
          />

          {/* ── Hourly Distribution — same 3-route shape as IVR Funnel. ── */}
          <Route
            path="/preview/hourly-distribution"
            element={<ProtectedRoute><HourlyDistributionPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/report/hourly-distribution"
            element={<ProtectedRoute><HourlyDistributionPreviewPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/project/:projectCode/report/hourly-distribution"
            element={<ProtectedRoute><HourlyDistributionPreviewPage /></ProtectedRoute>}
          />

          {/* ── Generic file_uploads module (BDF Reports etc.) ── */}
          <Route
            path="/department/:deptCode/module/:moduleCode"
            element={<ProtectedRoute><ModuleFileUploadsPage /></ProtectedRoute>}
          />

          {/* ── Templates module (HR) ── */}
          <Route
            path="/department/:deptCode/templates/:templateId/records"
            element={<ProtectedRoute><HrTemplateRecordsPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/templates/:templateId/records/:recordId"
            element={<ProtectedRoute><HrRecordDetailPage /></ProtectedRoute>}
          />
          <Route
            path="/department/:deptCode/templates/:templateId/design"
            element={<ProtectedRoute><HrTemplateDesignerPage /></ProtectedRoute>}
          />

          {/* ── Legacy redirects for project-first bookmarks ── */}
          <Route
            path="/project/:projectCode/department/:departmentCode/report/:reportCode"
            element={<ProtectedRoute><LegacyReportRedirect /></ProtectedRoute>}
          />
          <Route
            path="/project/:projectCode/department/:departmentCode"
            element={<ProtectedRoute><LegacyDepartmentRedirect /></ProtectedRoute>}
          />
          <Route
            path="/project/:projectCode"
            element={<ProtectedRoute><LegacyProjectRedirect /></ProtectedRoute>}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <AdminLanding />
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/policies"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminPoliciesPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/policies/new"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminPolicyEditorPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/policies/:id"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminPolicyEditorPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminUsersPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminDepartmentsPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/structure"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminStructurePage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/report-index"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminReportIndexPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminAuditLogPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/requests"
            element={
              <ProtectedRoute>
                <AdminOnly>
                  <Suspense fallback={<AdminFallback />}>
                    <AdminRequestsPage />
                  </Suspense>
                </AdminOnly>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </PermissionProvider>
    </AuthProvider>
  );
}
