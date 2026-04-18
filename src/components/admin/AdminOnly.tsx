import { Navigate } from "react-router-dom";
import { useAuth } from "../../services/auth";

// Route guard: redirects to /dashboard if the current user is not an admin.
// Should be wrapped inside ProtectedRoute so auth is already verified.
export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
