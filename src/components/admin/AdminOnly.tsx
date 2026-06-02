import { Navigate } from "react-router-dom";
import { useAuth, roleAtLeast, type AccessRole } from "../../services/auth";

// Route guard: redirects to /dashboard unless the user meets a minimum access
// tier. Defaults to "super_admin" — the entire Admin Tab (governance AND
// departments/structure) is super-admin-only as of 2026-06-01. The admin &
// centrecom_user tiers keep their operational powers on the main app pages but
// can no longer open any /admin route. Wrap inside ProtectedRoute so auth is
// verified. Cosmetic only — the server re-checks every endpoint via [MinRole].
export default function AdminOnly({
  children,
  min = "super_admin",
}: {
  children: React.ReactNode;
  min?: AccessRole;
}) {
  const { user } = useAuth();

  if (!roleAtLeast(user?.role, min)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
