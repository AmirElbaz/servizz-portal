import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";

// Gates authenticated routes.
//
//   - Not authenticated → send to /
//   - Authenticated but requires signup completion → send to /complete-signup
//     (unless they're already there, to avoid a redirect loop)
//   - Otherwise → render the children
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (user?.requiresSignupCompletion && location.pathname !== "/complete-signup") {
    return <Navigate to="/complete-signup" replace />;
  }

  return <>{children}</>;
}
