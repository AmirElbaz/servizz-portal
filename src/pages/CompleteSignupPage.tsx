import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";

// Three-step onboarding flow for admin-invited users:
//
//   1. Email     — user enters + confirms the email they want to claim.
//                  Backend issues a 6-digit OTP and moves them to
//                  'email_pending'.
//   2. OTP       — user reads the code from their inbox and submits it.
//                  Backend verifies, stores the email on users.email, and
//                  stamps email_verified_at.
//   3. Password  — user picks a permanent password. Backend flips the
//                  user to 'active' and the response is 204 (no JWT).
//                  We clear local state and bounce to /login so the user
//                  signs in fresh with their new credentials.
//
// ProtectedRoute already redirects any non-active user here on every
// authenticated route. We resume from whichever step the server says
// they're on (signupStatus + emailVerified).

type Step = "email" | "otp" | "password";

export default function CompleteSignupPage() {
  const { user, isAuthenticated, submitSignupEmail, resendSignupOtp, verifySignupOtp, setSignupPassword } = useAuth();
  const navigate = useNavigate();

  const initialStep: Step = useMemo(() => {
    if (!user) return "email";
    if (user.signupStatus === "invited") return "email";
    if (user.emailVerified) return "password";
    return "otp";
  }, [user]);

  const [step, setStep] = useState<Step>(initialStep);

  // If the auth state shifts under us (e.g. login refresh), keep the
  // visible step in sync without yanking the user out of the form they're
  // currently filling — only advance.
  useEffect(() => {
    setStep((prev) => {
      const order: Step[] = ["email", "otp", "password"];
      return order.indexOf(initialStep) > order.indexOf(prev) ? initialStep : prev;
    });
  }, [initialStep]);

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
            <StepIndicator step={step} />

            {step === "email" && (
              <EmailStep
                username={user?.username ?? null}
                onSubmit={async (email, confirmEmail) => {
                  await submitSignupEmail(email, confirmEmail);
                  setStep("otp");
                }}
              />
            )}

            {step === "otp" && (
              <OtpStep
                email={user?.email ?? null}
                onResend={async () => {
                  await resendSignupOtp();
                }}
                onVerify={async (code) => {
                  await verifySignupOtp(code);
                  setStep("password");
                }}
                onChangeEmail={() => setStep("email")}
              />
            )}

            {step === "password" && (
              <PasswordStep
                onSubmit={async (newPassword, confirmPassword) => {
                  await setSignupPassword(newPassword, confirmPassword);
                  navigate("/", { replace: true });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "otp", label: "Verify" },
    { key: "password", label: "Password" },
  ];
  const currentIndex = items.findIndex((i) => i.key === step);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        {items.map((item, idx) => {
          const done = idx < currentIndex;
          const current = idx === currentIndex;
          return (
            <div key={item.key} className="flex-1 flex items-center gap-2">
              <div
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                  current
                    ? "bg-primary text-white shadow-md shadow-primary/30"
                    : done
                      ? "bg-primary/15 text-primary"
                      : "bg-surface-container-high text-on-surface-variant/40"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {done ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  current
                    ? "text-on-surface"
                    : done
                      ? "text-primary"
                      : "text-on-surface-variant/40"
                }`}
              >
                {item.label}
              </span>
              {idx < items.length - 1 && (
                <span
                  className={`flex-1 h-0.5 rounded-full ${
                    done ? "bg-primary/40" : "bg-on-surface-variant/10"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 1: email ────────────────────────────────────────────────────────

function EmailStep({
  username,
  onSubmit,
}: {
  username: string | null;
  onSubmit: (email: string, confirmEmail: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errs: { [k: string]: string } = {};
    if (!email.trim()) errs.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = "Enter a valid email address.";
    if (!confirm.trim()) errs.confirm = "Please confirm your email.";
    else if (email.trim().toLowerCase() !== confirm.trim().toLowerCase())
      errs.confirm = "Emails don't match.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    try {
      setLoading(true);
      await onSubmit(email.trim(), confirm.trim());
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not send code.");
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
          Tell us where to send your verification code.
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
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (errors.email) setErrors({ ...errors, email: "" });
          }}
          error={errors.email}
          placeholder="you@example.com"
          autoFocus
        />
        <FieldEmail
          label="Confirm email"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            if (errors.confirm) setErrors({ ...errors, confirm: "" });
          }}
          error={errors.confirm}
          placeholder="Re-enter your email"
        />

        <PrimaryButton loading={loading} label="Send verification code" />
      </form>
    </>
  );
}

// ── Step 2: OTP ──────────────────────────────────────────────────────────

const OTP_LEN = 6;

function OtpStep({
  email,
  onResend,
  onVerify,
  onChangeEmail,
}: {
  email: string | null;
  onResend: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  onChangeEmail: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LEN).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>(Array(OTP_LEN).fill(null));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 60 s server cooldown between sends. Track locally so the button shows
  // a countdown without round-tripping for a 429.
  const [cooldown, setCooldown] = useState<number>(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");
  const canSubmit = code.length === OTP_LEN && /^\d{6}$/.test(code);

  function setDigit(i: number, raw: string) {
    // Strip non-digits and clamp to 1 char per cell. Paste of full code
    // into the first cell is handled here too.
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length === 0) {
      setDigits((prev) => prev.map((d, idx) => (idx === i ? "" : d)));
      return;
    }
    if (cleaned.length === 1) {
      setDigits((prev) => prev.map((d, idx) => (idx === i ? cleaned : d)));
      if (i < OTP_LEN - 1) refs.current[i + 1]?.focus();
      return;
    }
    // Multi-char input — distribute starting at the current index.
    setDigits((prev) => {
      const next = [...prev];
      for (let k = 0; k < cleaned.length && i + k < OTP_LEN; k++) {
        next[i + k] = cleaned[k];
      }
      return next;
    });
    const lastFilled = Math.min(OTP_LEN - 1, i + cleaned.length - 1);
    refs.current[lastFilled]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < OTP_LEN - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    try {
      setLoading(true);
      await onVerify(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
      // Common UX trap: keep the code visible so the user can correct one
      // wrong digit rather than retyping everything.
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError(null);
    setInfo(null);
    try {
      setResending(true);
      await onResend();
      setInfo("A new code is on its way to your inbox.");
      setCooldown(60);
      setDigits(Array(OTP_LEN).fill(""));
      refs.current[0]?.focus();
    } catch (err) {
      // 429 returns a "wait Ns" message — parse out the number and apply
      // it to the local timer so the button reflects reality.
      const message = err instanceof Error ? err.message : "Could not resend the code.";
      const match = message.match(/(\d+)\s*s/i);
      if (match) setCooldown(Number(match[1]));
      setError(message);
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
          Verify your email
        </h1>
        <p className="text-on-surface-variant/60 text-sm">
          We sent a 6-digit code to{" "}
          <span className="font-semibold text-on-surface">{email ?? "your inbox"}</span>.
          It expires in 10 minutes.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-start gap-2"
        >
          <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 px-4 py-3 bg-primary/8 border border-primary/20 rounded-xl text-primary text-sm font-medium flex items-start gap-2"
        >
          <span className="material-symbols-outlined text-[18px] mt-0.5">mark_email_read</span>
          <span>{info}</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
            Verification code
          </label>
          <div className="flex gap-2 sm:gap-3 justify-between">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onFocus={(e) => e.currentTarget.select()}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={OTP_LEN}
                aria-label={`Digit ${i + 1}`}
                className="w-11 sm:w-12 h-14 text-center text-2xl font-bold bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(46,178,255,0.08)] transition-all"
              />
            ))}
          </div>
        </div>

        <PrimaryButton loading={loading} label="Verify" disabled={!canSubmit} />
      </form>

      <div className="mt-6 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-on-surface-variant/60 hover:text-on-surface font-semibold transition-colors"
        >
          Use a different email
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="text-primary font-semibold hover:text-primary-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Resending…" : "Resend code"}
        </button>
      </div>
    </>
  );
}

// ── Step 3: password ─────────────────────────────────────────────────────

function PasswordStep({
  onSubmit,
}: {
  onSubmit: (newPassword: string, confirmPassword: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errs: { [k: string]: string } = {};
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
      await onSubmit(password, confirm);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Could not set your password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
          Choose a password
        </h1>
        <p className="text-on-surface-variant/60 text-sm">
          Pick a permanent password. Once you finish, you'll sign in fresh
          using your username (or email) and this new password.
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
          autoFocus
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
          mail
        </span>
        <input
          type="email"
          autoComplete="email"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-required="true"
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
