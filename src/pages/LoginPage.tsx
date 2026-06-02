import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../services/auth";

// Two tabs: normal credentials (username/email + password — or the emailed
// one-time password on the first login), and a 4-digit PIN that quick-unlocks
// an inactivity-locked session while its token is still valid.
const SHOW_PIN_TAB = true;

type LoginMode = "credentials" | "pincode";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, pinLogin, locked, user } = useAuth();
  // Default to the PIN tab when the session is inactivity-locked (a valid
  // token + a known user are held); otherwise the normal credentials tab.
  const [mode, setMode] = useState<LoginMode>(locked ? "pincode" : "credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function routeByStatus(u: { signupStatus?: string }) {
    const status = u.signupStatus;
    if (status && status !== "active") {
      navigate(
        status === "requested" ? "/complete-registration"
        : status === "pending_approval" ? "/pending-approval"
        : "/complete-signup",
      );
    } else {
      navigate("/dashboard");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "pincode") {
        // Quick-unlock with the 4-digit PIN, riding the still-valid token.
        routeByStatus(await pinLogin(pin.trim()));
      } else {
        // Username/email + password (or the emailed one-time password on the
        // first login). Backend matches username OR email, case-insensitive.
        routeByStatus(await login(username.trim(), password));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      // A failed/expired PIN attempt clears the token (forced full login) —
      // drop the user back to the credentials tab.
      if (mode === "pincode" && !localStorage.getItem("token")) {
        setMode("credentials");
        setPin("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface min-h-screen relative overflow-hidden">
      {/* ── Animated Brand-Blue Blobs (monochromatic, on-palette) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/10 blur-[150px] animate-blob1" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[45%] h-[55%] rounded-full bg-primary/6 blur-[130px] animate-blob2" />
        <div className="absolute top-[30%] left-[20%] w-[30%] h-[40%] rounded-full bg-primary-container/40 blur-[120px] animate-blob3" />
      </div>

      {/* ── Subtle Grid Pattern ── */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Cohesive Two-Column Composition ── */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8 md:px-8 lg:py-10">
        <div className="w-full max-w-6xl grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-0 items-stretch">

          {/* ── LEFT: Branding ── */}
          <div className="relative flex flex-col justify-between lg:pr-10 xl:pr-14 lg:py-6">
            {/* Top: Centrecom logo */}
            <div className="flex items-center gap-3">
              <img
                src="/centrecom-logo.svg"
                alt="Centrecom"
                className="h-16 md:h-20 w-auto"
              />
            </div>

            {/* Middle: big typography */}
            <div className="py-8 lg:py-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-primary/8 border border-primary/15">
                <span
                  className="material-symbols-outlined text-primary text-[14px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-primary">
                  Unified Portal
                </span>
              </div>

              <h1 className="font-headline font-extrabold tracking-tight leading-[0.95] text-on-surface">
                <span className="block text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem] text-primary">
                  Centrecom
                </span>
                <span className="block mt-2 text-3xl md:text-4xl lg:text-5xl xl:text-[3.5rem] text-black">
                  Reporting Portal {/* for Servizz.gov */}
                </span>
              </h1>

              <p className="mt-6 max-w-lg text-base md:text-lg text-on-surface-variant/70 font-medium leading-relaxed">
                One secure gateway {/*to every government service you operate — reports, dashboards, and teams, unified.*/}
              </p>

              {/* Trust badges */}
              <div className="mt-7 flex flex-wrap gap-5">
                {[
                  { icon: "verified_user", label: "Trusted" },
                  { icon: "encrypted", label: "Encrypted" },
                  { icon: "shield", label: "ISO 27001" },
                ].map((b) => (
                  <div key={b.label} className="flex items-center gap-2">
                    <span
                      className="material-symbols-outlined text-primary/60 text-[20px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {b.icon}
                    </span>
                    <span className="text-[11px] text-on-surface-variant/50 font-semibold uppercase tracking-wider">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom: footer (desktop) */}
            <div className="hidden lg:flex items-center justify-between text-[11px] tracking-wide text-on-surface-variant/40 font-medium">
              <span>
                &copy; 2026{" "}
                <a
                  href="https://www.centrecom.eu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-on-surface-variant/70 transition-colors"
                >
                  Centrecom
                </a>
              </span>
              <div className="flex gap-5">
                {["Privacy", "Terms", "Accessibility"].map((link) => (
                  <a
                    key={link}
                    className="hover:text-on-surface-variant/70 transition-colors"
                    href="#"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── Vertical connector (desktop only) ── */}
          <div className="hidden lg:block absolute left-1/2 top-8 bottom-8 w-px -translate-x-1/2 pointer-events-none" style={{ left: "calc(50% + 3rem)" }}>
            <div className="h-full w-full bg-gradient-to-b from-transparent via-on-surface-variant/10 to-transparent" />
          </div>

          {/* ── RIGHT: Login Card ── */}
          <div className="relative flex items-center justify-center lg:justify-start lg:pl-10 xl:pl-14">
            <div className="w-full max-w-[440px]">
              <div className="bg-white rounded-3xl p-7 md:p-9 relative overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-on-surface-variant/5">
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />

                <div className="relative">
                  {/* Header */}
                  <div className="mb-6">
                    <h2 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
                      Welcome back.
                    </h2>
                    <p className="text-on-surface-variant/60 text-sm">
                      Sign in to access your reporting services
                    </p>
                  </div>

                  {/* ── Tab Switcher (PIN tab hidden until feature ships) ── */}
                  {SHOW_PIN_TAB && (
                    <div className="grid grid-cols-2 gap-2 mb-7">
                      <button
                        type="button"
                        onClick={() => setMode("credentials")}
                        className={`flex flex-col items-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                          mode === "credentials"
                            ? "bg-primary/8 text-primary border-2 border-primary/20"
                            : "bg-surface-container-high/40 text-on-surface-variant/50 border-2 border-transparent hover:bg-surface-container-high/70"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[22px]" style={mode === "credentials" ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                          passkey
                        </span>
                        Username &amp; Password
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("pincode")}
                        className={`flex flex-col items-center gap-1.5 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                          mode === "pincode"
                            ? "bg-primary/8 text-primary border-2 border-primary/20"
                            : "bg-surface-container-high/40 text-on-surface-variant/50 border-2 border-transparent hover:bg-surface-container-high/70"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[22px]" style={mode === "pincode" ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                          pin
                        </span>
                        PIN
                      </button>
                    </div>
                  )}

                  {/* Error message */}
                  {error && (
                    <div className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      {error}
                    </div>
                  )}

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    {/* Fixed-height form area so card doesn't jump */}
                    <div className="min-h-[290px]">
                    {mode === "credentials" ? (
                      <div className="space-y-5">
                        {/* Username or email */}
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                            Username or Email
                          </label>
                          <div className="relative group">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                              person
                            </span>
                            <input
                              className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(46,178,255,0.08)] transition-all"
                              placeholder="Username or Email"
                              type="text"
                              autoComplete="username"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                              Password
                            </label>
                            <Link
                              to="/forgot-password"
                              tabIndex={-1}
                              className="text-[11px] font-semibold text-primary hover:text-primary-dim transition-colors"
                            >
                              Forgot?
                            </Link>
                          </div>
                          <div className="relative group">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                              lock
                            </span>
                            <input
                              className="w-full pl-12 pr-12 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(46,178,255,0.08)] transition-all"
                              placeholder="Enter your password"
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors"
                              type="button"
                              tabIndex={-1}
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility_off" : "visibility"}</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="space-y-5">
                        {locked && user ? (
                          <div className="space-y-2">
                            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                              Quick unlock
                            </label>
                            <p className="text-[11px] text-on-surface-variant/40 px-1 flex items-start gap-1.5">
                              <span className="material-symbols-outlined text-[13px] mt-0.5">lock_open</span>
                              <span>
                                Welcome back, {user.firstName || user.fullName || user.username}. Enter your
                                4-digit PIN to resume your session.
                              </span>
                            </p>
                            <div className="relative group">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                                pin
                              </span>
                              <input
                                className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface text-center text-2xl font-bold tracking-[0.5em] placeholder:tracking-normal placeholder:text-sm placeholder:font-medium placeholder:text-on-surface-variant/25 focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(46,178,255,0.08)] transition-all"
                                placeholder="Enter PIN"
                                type="password"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={4}
                                autoFocus
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => { setMode("credentials"); setError(""); }}
                              className="text-[11px] font-semibold text-primary hover:text-primary-dim transition-colors"
                            >
                              Use password instead
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-surface-container-high/40 border border-on-surface-variant/8 p-5 text-center">
                            <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40 mb-2 block">lock</span>
                            <p className="text-sm font-semibold text-on-surface mb-1">PIN unlock isn't available</p>
                            <p className="text-[12px] text-on-surface-variant/55">
                              The 4-digit PIN only resumes an active session. Sign in with your username and
                              password first.
                            </p>
                            <button
                              type="button"
                              onClick={() => { setMode("credentials"); setError(""); }}
                              className="mt-3 text-[12px] font-bold text-primary hover:text-primary-dim transition-colors"
                            >
                              Go to sign in →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    </div>

                    {/* Submit */}
                    <button
                      className="btn-brand w-full py-4 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 group mt-2 disabled:opacity-60"
                      type="submit"
                      disabled={loading || (mode === "pincode" && (!locked || pin.length !== 4))}
                    >
                      <span>
                        {loading
                          ? (mode === "pincode" ? "Unlocking..." : "Signing in...")
                          : (mode === "pincode" ? "Unlock" : "Secure Login")}
                      </span>
                      {!loading && (
                        <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">
                          arrow_forward
                        </span>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 pt-5 border-t border-on-surface-variant/8 text-center">
                    <p className="text-xs text-on-surface-variant/55">
                      New here?{" "}
                      <Link to="/request-access" className="font-semibold text-primary hover:text-primary-dim transition-colors">
                        Request access
                      </Link>
                    </p>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Footer ── */}
      <footer className="lg:hidden w-full py-4 flex flex-col sm:flex-row justify-between items-center gap-2 px-4 md:px-10 relative z-10">
        <span className="text-[11px] tracking-wide text-on-surface-variant/30 font-medium">
          &copy; 2026{" "}
          <a
            href="https://www.centrecom.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-on-surface-variant/60 transition-colors"
          >
            Centrecom
          </a>
        </span>
        <div className="flex gap-6">
          {["Privacy", "Terms", "Accessibility"].map((link) => (
            <a
              key={link}
              className="text-[11px] tracking-wide text-on-surface-variant/30 hover:text-on-surface-variant/60 transition-colors"
              href="#"
            >
              {link}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
