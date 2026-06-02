import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";

// Single-step onboarding for admin-invited users.
//
// The admin creates the account and hands the user a username + temporary
// password out-of-band. The user logs in with those, lands here, and in ONE
// form provides:
//   - an OPTIONAL email address (no verification / OTP),
//   - a MANDATORY new password,
//   - a confirmation of that password.
//
// Submitting flips the account to 'active' (backend returns 204, no JWT) and
// we clear local state and bounce to /login for a fresh sign-in.
//
// ProtectedRoute already redirects any non-active invite (invited /
// email_pending) here on every authenticated route.

export default function CompleteSignupPage() {
  const { user, isAuthenticated, completeSignup } = useAuth();
  const navigate = useNavigate();

  // Bounce active users straight to the dashboard.
  useEffect(() => {
    if (isAuthenticated && user && user.signupStatus === "active") {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-surface min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/8 blur-[150px] animate-blob1" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[45%] h-[55%] rounded-full bg-tertiary/8 blur-[130px] animate-blob2" />
      </div>

      <div className="absolute top-6 left-4 md:top-8 md:left-10 z-20 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center shadow-lg shadow-primary/20">
          <span
            className="material-symbols-outlined text-white text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            hub
          </span>
        </div>
        <div>
          <div className="text-on-surface font-headline font-bold text-sm tracking-tight">
            Centrecom | Servizz.gov
          </div>
          <div className="text-on-surface-variant/50 text-[10px] tracking-[0.2em] uppercase font-medium">
            Complete your account
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-3xl p-10 relative overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-on-surface-variant/5">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />

          <div className="relative">
            <CompleteForm
              username={user?.username ?? null}
              onSubmit={async (email, newPassword, confirmPassword) => {
                await completeSignup(email, newPassword, confirmPassword);
                navigate("/", { replace: true });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Single combined form ───────────────────────────────────────────────────

function CompleteForm({
  username,
  onSubmit,
}: {
  username: string | null;
  onSubmit: (
    email: string | null,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errs: { [k: string]: string } = {};
    // Email is optional — only validate the shape when something was typed.
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Must be at least 8 characters.";
    if (!confirm) errs.confirm = "Please re-enter your password.";
    else if (password !== confirm) errs.confirm = "Passwords don't match.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    try {
      setLoading(true);
      await onSubmit(email.trim() ? email.trim() : null, password, confirm);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Could not complete your account.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
          Welcome
        </h1>
        <p className="text-on-surface-variant/60 text-sm">
          Signed in as{" "}
          <span className="font-semibold text-on-surface">{username ?? "—"}</span>.
          Add an email if you'd like, then choose a permanent password. Once
          you finish, you'll sign in fresh using your username (or email) and
          this new password.
        </p>
      </div>

      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-start gap-2"
        >
          <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <FieldEmail
          label="Email address"
          optional
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (errors.email) setErrors({ ...errors, email: "" });
          }}
          error={errors.email}
          placeholder="you@example.com"
          autoFocus
        />
        <FieldPassword
          label="New password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password) setErrors({ ...errors, password: "" });
          }}
          show={show}
          onToggleShow={() => setShow((s) => !s)}
          error={errors.password}
          placeholder="At least 8 characters"
        />
        <FieldPassword
          label="Confirm password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            if (errors.confirm) setErrors({ ...errors, confirm: "" });
          }}
          show={show}
          onToggleShow={() => setShow((s) => !s)}
          error={errors.confirm}
          placeholder="Re-enter your new password"
        />

        <PrimaryButton loading={loading} label="Finish and sign in" />
      </form>
    </>
  );
}

// ── Field primitives ─────────────────────────────────────────────────────

function FieldEmail({
  label,
  value,
  onChange,
  error,
  placeholder,
  autoFocus,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  autoFocus?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
        {label}{" "}
        {optional ? (
          <span className="text-on-surface-variant/40 normal-case tracking-normal font-medium">
            (optional)
          </span>
        ) : (
          <span className="text-error" aria-hidden="true">*</span>
        )}
      </label>
      <div className="relative group">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
          mail
        </span>
        <input
          type="email"
          autoComplete="email"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-required={optional ? undefined : "true"}
          aria-invalid={!!error}
          className={`w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
            error
              ? "border-error/50 focus:border-error/60"
              : "border-on-surface-variant/8 focus:border-primary/30"
          }`}
        />
      </div>
      {error && (
        <p className="text-xs text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

function FieldPassword({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  error,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  error?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
        {label} <span className="text-error" aria-hidden="true">*</span>
      </label>
      <div className="relative group">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
          lock
        </span>
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-required="true"
          aria-invalid={!!error}
          className={`w-full pl-12 pr-12 py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
            error
              ? "border-error/50 focus:border-error/60"
              : "border-on-surface-variant/8 focus:border-primary/30"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">
            {show ? "visibility_off" : "visibility"}
          </span>
        </button>
      </div>
      {error && (
        <p className="text-xs text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

function PrimaryButton({
  loading,
  label,
  disabled,
}: {
  loading: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full bg-gradient-to-r from-primary to-primary-dim text-white py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-primary/25 hover:shadow-xl hover:opacity-95 transition-all flex items-center justify-center gap-2 group mt-2 disabled:opacity-60"
    >
      <span>{loading ? "Working…" : label}</span>
      {!loading && (
        <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">
          arrow_forward
        </span>
      )}
    </button>
  );
}
