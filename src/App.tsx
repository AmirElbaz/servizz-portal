import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./services/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ReportsPage from "./pages/ReportsPage";
import ReportViewPage from "./pages/ReportViewPage";

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
