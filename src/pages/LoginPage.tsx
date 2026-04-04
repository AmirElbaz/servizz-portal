import { type FormEvent, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Footer from "../components/layout/Footer";

export default function LoginPage() {
  const navigate = useNavigate();
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  function handlePinInput(index: number, value: string) {
    if (value.length === 1 && index < 3) {
      pinRefs[index + 1].current?.focus();
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && index > 0) {
      const current = pinRefs[index].current;
      if (current && current.value === "") {
        pinRefs[index - 1].current?.focus();
      }
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    navigate("/dashboard");
  }

  return (
    <div className="bg-surface min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* ── Animated Gradient Blobs ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/8 blur-[150px] animate-blob1" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[45%] h-[55%] rounded-full bg-tertiary/8 blur-[130px] animate-blob2" />
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

      {/* ── Branding ── */}
      <div className="absolute top-8 left-10 z-20 flex items-center gap-3">
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
            Centercom | Servizz
          </div>
          <div className="text-on-surface-variant/50 text-[10px] tracking-[0.2em] uppercase font-medium">
            Unified Portal
          </div>
        </div>
      </div>

      {/* ── Login Card ── */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-3xl p-10 relative overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-on-surface-variant/5">
          {/* Card inner glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />

          <div className="relative">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-on-surface font-headline tracking-tight mb-2">
                Welcome back.
              </h1>
              <p className="text-on-surface-variant/60 text-sm">
                Sign in to access your government services
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Username */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">
                  Username
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                    person
                  </span>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(29,95,168,0.08)] transition-all"
                    placeholder="Enter your ID or email"
                    type="text"
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
                    className="w-full pl-12 pr-12 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(29,95,168,0.08)] transition-all"
                    placeholder="••••••••"
                    type="password"
                  />
                  <button
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      visibility
                    </span>
                  </button>
                </div>
              </div>

              {/* PIN */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-grow bg-on-surface-variant/8" />
                  <span className="text-[10px] font-bold text-on-surface-variant/35 uppercase tracking-[0.15em]">
                    Security PIN
                  </span>
                  <div className="h-px flex-grow bg-on-surface-variant/8" />
                </div>
                <div className="flex gap-3 justify-between">
                  {pinRefs.map((ref, i) => (
                    <input
                      key={i}
                      ref={ref}
                      className="w-14 h-14 text-center text-xl font-bold bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-primary placeholder:text-on-surface-variant/20 focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(29,95,168,0.08)] transition-all"
                      maxLength={1}
                      placeholder="•"
                      type="password"
                      onChange={(e) => handlePinInput(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                    />
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                className="w-full bg-gradient-to-r from-primary to-primary-dim text-white py-4 rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:opacity-95 transition-all flex items-center justify-center gap-2 group mt-2"
                type="submit"
              >
                <span>Secure Login</span>
                <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </button>
            </form>

            {/* Bottom */}
            <div className="mt-8 text-center">
              <p className="text-sm text-on-surface-variant/50">
                New to the portal?{" "}
                <a className="text-primary font-semibold hover:text-primary-dim transition-colors" href="#">
                  Request Access
                </a>
              </p>
            </div>

            {/* Trust Badges */}
            <div className="mt-8 pt-6 border-t border-on-surface-variant/8 flex justify-center gap-8">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-primary/50 text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
                <span className="text-[10px] text-on-surface-variant/40 font-medium uppercase tracking-wider">
                  Trusted
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-primary/50 text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  encrypted
                </span>
                <span className="text-[10px] text-on-surface-variant/40 font-medium uppercase tracking-wider">
                  Encrypted
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-primary/50 text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  shield
                </span>
                <span className="text-[10px] text-on-surface-variant/40 font-medium uppercase tracking-wider">
                  ISO 27001
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="absolute bottom-0 w-full py-6 flex justify-between items-center px-10 z-10">
        <span className="text-[11px] tracking-wide text-on-surface-variant/30 font-medium">
          &copy; 2024 Centercom &amp; Servizz
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
