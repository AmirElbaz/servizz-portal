import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider } from "./services/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminOnly from "./components/admin/AdminOnly";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import CompleteSignupPage from "./pages/CompleteSignupPage";
import DashboardPage from "./pages/DashboardPage";
import DepartmentDetailPage from "./pages/DepartmentDetailPage";
import HrTemplateRecordsPage from "./pages/hr/HrTemplateRecordsPage";
import HrTemplateDesignerPage from "./pages/hr/HrTemplateDesignerPage";
import HrRecordDetailPage from "./pages/hr/HrRecordDetailPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ReportViewPage from "./pages/ReportViewPage";

// Admin pages are lazy-loaded — they ship a separate chunk so non-admins
// never download the code.
const AdminPoliciesPage    = lazy(() => import("./pages/admin/AdminPoliciesPage"));
const AdminPolicyEditorPage = lazy(() => import("./pages/admin/AdminPolicyEditorPage"));
const AdminUsersPage       = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminDepartmentsPage = lazy(() => import("./pages/admin/AdminDepartmentsPage"));
const AdminStructurePage   = lazy(() => import("./pages/admin/AdminStructurePage"));

function AdminFallback() {
  return (
    <div className="bg-surface min-h-screen flex items-center justify-center">
      <p className="text-sm text-on-surface-variant/60">Loading admin panel…</p>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname.startsWith("/project/") || pathname.startsWith("/department/")) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

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
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/complete-signup" element={<ProtectedRoute><CompleteSignupPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

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
                  <Navigate to="/admin/policies" replace />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
