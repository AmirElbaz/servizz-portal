import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { AuthProvider } from "./services/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminOnly from "./components/admin/AdminOnly";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ReportsPage from "./pages/ReportsPage";
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
    if (pathname.startsWith("/project/")) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/project/:projectCode" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
          <Route
            path="/project/:projectCode/department/:departmentCode"
            element={<ProtectedRoute><ReportsPage /></ProtectedRoute>}
          />
          <Route
            path="/project/:projectCode/department/:departmentCode/report/:reportCode"
            element={<ProtectedRoute><ReportViewPage /></ProtectedRoute>}
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
