import type { FormEvent } from "react";
import { Link } from "react-router-dom";

export default function ForgotPasswordPage() {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="bg-surface min-h-screen relative overflow-hidden flex flex-col">
      {/* ── Animated Brand-Blue Blobs (monochromatic, on-palette) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/10 blur-[150px] animate-blob1" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[45%] h-[55%] rounded-full bg-primary/6 blur-[130px] animate-blob2" />
        <div className="absolute top-[30%] left-[20%] w-[30%] h-[40%] rounded-full bg-primary-container/40 blur-[120px] animate-blob3" />
      </div>

      {/* ── Subtle Grid ── */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Centered Single-Card Composition ── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[520px]">
          {/* Wordmark above the card */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/centrecom-logo.svg"
              alt="Centrecom"
              className="h-9 md:h-10 w-auto mb-4"
            />
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/15">
              <span
                className="material-symbols-outlined text-primary text-[14px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                lock_reset
              </span>
              <span className="eyebrow text-primary">Account Recovery</span>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl p-8 md:p-10 relative overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-on-surface-variant/5">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />

            <div className="relative">
              <div className="mb-6 text-center">
                <h1 className="text-3xl md:text-4xl font-extrabold text-on-surface font-headline tracking-tight mb-2 leading-tight">
                  Forgot password?
                </h1>
                <p className="text-on-surface-variant/60 text-sm max-w-sm mx-auto">
                  Enter the email linked to your Servizz.gov account — we'll send
                  you a secure reset link.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="eyebrow-sm block text-on-surface-variant/60">
                    Email Address or Username
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                      alternate_email
                    </span>
                    <input
                      className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(46,178,255,0.08)] transition-all"
                      placeholder="you@centrecom.eu"
                      type="text"
                    />
                  </div>
                </div>

                <button
                  className="btn-brand w-full py-4 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 group mt-2"
                  type="submit"
                >
                  <span>Send Reset Link</span>
                  <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </button>
              </form>

              <div className="mt-7 pt-6 border-t border-on-surface-variant/8 text-center">
                <Link
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dim transition-colors group"
                  to="/"
                >
                  <span className="material-symbols-outlined text-lg group-hover:-translate-x-1 transition-transform">
                    arrow_back
                  </span>
                  Back to Secure Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 w-full py-4 flex flex-col sm:flex-row justify-between items-center gap-2 px-4 md:px-10">
        <span className="eyebrow-sm tracking-[0.18em] text-on-surface-variant/35">
          &copy; 2024 Centrecom &amp; Servizz.gov
        </span>
        <div className="flex gap-6">
          {["Privacy", "Terms", "Accessibility"].map((link) => (
            <a
              key={link}
              className="eyebrow-sm tracking-[0.18em] text-on-surface-variant/35 hover:text-on-surface-variant/70 transition-colors"
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
