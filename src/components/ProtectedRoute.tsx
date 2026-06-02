import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../services/auth";

// Gates authenticated routes, routing each onboarding state to its page:
//   - Not authenticated            → /
//   - invited / email_pending      → /complete-signup  (admin-invite flow)
//   - requested                    → /complete-registration  (request-access)
//   - pending_approval             → /pending-approval  (awaiting admin)
//   - active                       → render children
// (Skip the redirect when already on the destination, to avoid a loop.)
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, locked } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Inactivity soft-lock: kick back to the sign-in screen, which offers PIN
  // quick-unlock (the token is still held). Full logout clears `locked`.
  if (locked) {
    return <Navigate to="/" replace />;
  }

  const status = user?.signupStatus;
  if (status && status !== "active") {
    const dest =
      status === "requested" ? "/complete-registration"
      : status === "pending_approval" ? "/pending-approval"
      : "/complete-signup";
    if (location.pathname !== dest) {
      return <Navigate to={dest} replace />;
    }
  }

  return <>{children}</>;
}
