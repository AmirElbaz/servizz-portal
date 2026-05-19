import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";

// Gates authenticated routes.
//
//   - Not authenticated → send to /
//   - Authenticated but mid-onboarding (signupStatus !== "active")
//     → send to /complete-signup unless already there (avoid redirect loop)
//   - Otherwise → render the children
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (
    user?.signupStatus &&
    user.signupStatus !== "active" &&
    location.pathname !== "/complete-signup"
  ) {
    return <Navigate to="/complete-signup" replace />;
  }

  return <>{children}</>;
}
