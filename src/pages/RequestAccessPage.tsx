import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../services/auth";
import AuthScreen, { AuthField, AuthSubmit, AuthError } from "../components/auth/AuthScreen";

// Public: a prospective user requests access with their email. The backend
// emails a 16-char PIN; they then sign in with email + that PIN to finish
// registering. Response is intentionally generic (no email enumeration).
export default function RequestAccessPage() {
  const { requestAccess } = useAuth();
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (email.trim().toLowerCase() !== confirm.trim().toLowerCase()) {
      setError("Emails don't match.");
      return;
    }
    try {
      setLoading(true);
      const msg = await requestAccess(email.trim());
      setDone(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthScreen eyebrow="Request access">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[28px]">mark_email_read</span>
          </div>
          <h1 className="text-2xl font-extrabold text-on-surface font-headline mb-2">Check your email</h1>
          <p className="text-on-surface-variant/60 text-sm mb-6">
            {done} It's valid for 24 hours. To finish setting up, sign in on the
            <span className="font-semibold text-on-surface"> Username &amp; Password</span> tab
            with your email and that one-time password.
          </p>
          <Link to="/" className="text-primary font-semibold text-sm hover:text-primary-dim">Go to sign in →</Link>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen eyebrow="Request access">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">Request access</h1>
        <p className="text-on-surface-variant/60 text-sm">
          Enter your email and we'll send you a one-time password. Sign in with your
          email and that password to finish setting up your account.
        </p>
      </div>
      {error && <AuthError message={error} />}
      <form onSubmit={submit} className="space-y-5">
        <AuthField label="Email address" type="email" icon="mail" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus autoComplete="email" />
        <AuthField label="Confirm email" type="email" icon="mail" value={confirm} onChange={setConfirm} placeholder="Re-enter your email" />
        <AuthSubmit loading={loading} label="Send one-time password" />
      </form>
      <div className="mt-6 text-center text-xs">
        <Link to="/" className="text-on-surface-variant/60 hover:text-on-surface font-semibold transition-colors">
          Already have an account? Sign in
        </Link>
      </div>
    </AuthScreen>
  );
}
