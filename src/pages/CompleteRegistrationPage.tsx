import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";
import AuthScreen, { AuthField, AuthSubmit, AuthError } from "../components/auth/AuthScreen";

// Reached after a 'requested' user logs in with their PIN (ProtectedRoute
// routes them here). They set their name + a real password; this moves them to
// 'pending_approval', clears the session, and sends them back to sign in.
export default function CompleteRegistrationPage() {
  const { user, isAuthenticated, completeRegistration } = useAuth();
  const navigate = useNavigate();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) return <Navigate to="/" replace />;
  // Only meaningful for 'requested'; other states are handled by ProtectedRoute.
  if (user && user.signupStatus !== "requested") return <Navigate to="/dashboard" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!first.trim() || !last.trim()) { setError("First and last name are required."); return; }
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== confirm) { setError("Passwords don't match."); return; }
    if (!/^\d{4}$/.test(pin)) { setError("Choose a 4-digit PIN (numbers only)."); return; }
    try {
      setLoading(true);
      await completeRegistration(first.trim(), last.trim(), pw, confirm, pin);
      // completeRegistration logs out; bounce to sign-in.
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete registration.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen eyebrow="Complete your account">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">Almost there</h1>
        <p className="text-on-surface-variant/60 text-sm">
          Set your name, a password, and a 4-digit PIN. After this, an administrator reviews your access before you can use the portal.
        </p>
      </div>
      {error && <AuthError message={error} />}
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <AuthField label="First name" icon="person" value={first} onChange={setFirst} autoFocus />
          <AuthField label="Last name" value={last} onChange={setLast} />
        </div>
        <AuthField label="Password" type="password" icon="lock" value={pw} onChange={setPw} placeholder="At least 8 characters" autoComplete="new-password" />
        <AuthField label="Confirm password" type="password" icon="lock" value={confirm} onChange={setConfirm} placeholder="Re-enter your password" autoComplete="new-password" />
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">4-digit PIN</label>
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">pin</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Choose a 4-digit PIN"
              className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm tracking-[0.3em] focus:outline-none focus:border-primary/30 focus:bg-white transition-all"
            />
          </div>
          <p className="text-[11px] text-on-surface-variant/40 px-1">
            You'll use this PIN to quickly unlock the app after it locks from inactivity.
          </p>
        </div>
        <AuthSubmit loading={loading} label="Finish registration" />
      </form>
    </AuthScreen>
  );
}
