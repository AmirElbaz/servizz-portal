import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";

// Shown to admin-invited users on their first login. They land here
// automatically because ProtectedRoute redirects anyone with
// requiresSignupCompletion=true here on every route.
export default function CompleteSignupPage() {
  const { user, isAuthenticated, completeSignup } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  // If someone navigates here without the flag, send them home.
  useEffect(() => {
    if (isAuthenticated && user && !user.requiresSignupCompletion) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function validate(): boolean {
    const errs: { [k: string]: string } = {};
    if (!firstName.trim()) errs.firstName = "First name is required.";
    if (!lastName.trim()) errs.lastName = "Last name is required.";
    if (password.length < 8) errs.password = "Must be at least 8 characters.";
    if (password && confirm && password !== confirm)
      errs.confirm = "Passwords don't match.";
    if (!confirm) errs.confirm = "Please re-enter your password.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    try {
      setLoading(true);
      await completeSignup(firstName.trim(), lastName.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete signup");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/8 blur-[150px] animate-blob1" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[45%] h-[55%] rounded-full bg-tertiary/8 blur-[130px] animate-blob2" />
      </div>

      <div className="absolute top-6 left-4 md:top-8 md:left-10 z-20 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
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
            <div className="mb-6">
              <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
                Welcome
              </h1>
              <p className="text-on-surface-variant/60 text-sm">
                Finish setting up your account for{" "}
                <span className="font-semibold text-on-surface">
                  {user?.email ?? user?.username}
                </span>
                .
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

            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                    First name <span className="text-error">*</span>
                  </label>
                  <input
                    className={`w-full px-4 py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
                      errors.firstName
                        ? "border-error/50 focus:border-error/60"
                        : "border-on-surface-variant/8 focus:border-primary/30"
                    }`}
                    placeholder="Your first name"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName)
                        setErrors({ ...errors, firstName: "" });
                    }}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-error flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">error</span>
                      {errors.firstName}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                    Last name <span className="text-error">*</span>
                  </label>
                  <input
                    className={`w-full px-4 py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
                      errors.lastName
                        ? "border-error/50 focus:border-error/60"
                        : "border-on-surface-variant/8 focus:border-primary/30"
                    }`}
                    placeholder="Your last name"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName) setErrors({ ...errors, lastName: "" });
                    }}
                  />
                  {errors.lastName && (
                    <p className="text-xs text-error flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">error</span>
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                  New password <span className="text-error">*</span>
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`w-full pl-12 pr-12 py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
                      errors.password
                        ? "border-error/50 focus:border-error/60"
                        : "border-on-surface-variant/8 focus:border-primary/30"
                    }`}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors({ ...errors, password: "" });
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-error flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                  Confirm password <span className="text-error">*</span>
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
                      errors.confirm
                        ? "border-error/50 focus:border-error/60"
                        : "border-on-surface-variant/8 focus:border-primary/30"
                    }`}
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (errors.confirm) setErrors({ ...errors, confirm: "" });
                    }}
                  />
                </div>
                {errors.confirm && (
                  <p className="text-xs text-error flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {errors.confirm}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-primary-dim text-white py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-primary/25 hover:shadow-xl hover:opacity-95 transition-all flex items-center justify-center gap-2 group mt-2 disabled:opacity-60"
              >
                <span>{loading ? "Setting up…" : "Complete sign-up"}</span>
                {!loading && (
                  <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
