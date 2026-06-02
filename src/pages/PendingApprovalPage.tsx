import { Navigate } from "react-router-dom";
import { useAuth } from "../services/auth";
import AuthScreen from "../components/auth/AuthScreen";

// Where 'pending_approval' users land: registration done, waiting for an admin
// to approve + assign a policy/role. They can sign in, but see nothing else.
export default function PendingApprovalPage() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (user && user.signupStatus === "active") return <Navigate to="/dashboard" replace />;

  return (
    <AuthScreen eyebrow="Pending approval">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-[28px]">hourglass_top</span>
        </div>
        <h1 className="text-2xl font-extrabold text-on-surface font-headline mb-2">Awaiting approval</h1>
        <p className="text-on-surface-variant/60 text-sm mb-6">
          Thanks{user?.firstName ? `, ${user.firstName}` : ""}! Your registration is complete. An administrator
          needs to approve your access before you can use the portal — you'll be able to sign in normally once approved.
        </p>
        <button onClick={logout} className="text-primary font-semibold text-sm hover:text-primary-dim transition-colors">
          Sign out
        </button>
      </div>
    </AuthScreen>
  );
}
