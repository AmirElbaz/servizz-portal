import type { FormEvent } from "react";
import { Link } from "react-router-dom";

export default function ForgotPasswordPage() {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="bg-surface min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* ── Animated Gradient Blobs ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[60%] rounded-full bg-primary/8 blur-[150px] animate-blob1" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[45%] h-[55%] rounded-full bg-tertiary/8 blur-[130px] animate-blob2" />
      </div>

      {/* ── Subtle Grid ── */}
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

      {/* ── Card ── */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Heading above card */}
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 mb-4">
            Account Recovery
          </p>
          <h1 className="text-4xl font-extrabold text-on-surface font-headline tracking-tight leading-[1.1]">
            Recover your{" "}
            <span className="gradient-text-dark">account.</span>
          </h1>
          <p className="mt-4 text-on-surface-variant/55 text-sm leading-relaxed max-w-sm">
            Enter your email below and we'll send a secure verification link to
            regain access to your portal.
          </p>
        </div>

        <div className="bg-white rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-on-surface-variant/5">
          {/* Card Header */}
          <div className="px-8 py-5 border-b border-on-surface-variant/6 flex justify-between items-center bg-surface-container-low/50">
            <div>
              <span className="text-sm font-bold font-headline text-on-surface">
                Unified Portal
              </span>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 block">
                Identity Management
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center shadow-md shadow-primary/20">
              <span
                className="material-symbols-outlined text-white text-[16px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                security
              </span>
            </div>
          </div>

          <div className="p-8">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                  Email Address or Username
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
                    alternate_email
                  </span>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:border-primary/30 focus:bg-white focus:shadow-[0_0_20px_rgba(29,95,168,0.08)] transition-all"
                    placeholder="e.g. john.doe@example.com"
                    type="text"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant/40 mt-2 px-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">info</span>
                  Ensure this is the email associated with your Servizz account.
                </p>
              </div>

              <button
                className="w-full bg-gradient-to-r from-primary to-primary-dim text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:opacity-95 transition-all flex items-center justify-center gap-2 group text-sm"
                type="submit"
              >
                <span>Send Reset Link</span>
                <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-on-surface-variant/8 text-center">
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

        {/* Support Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 flex items-start gap-3 border border-on-surface-variant/5">
            <span className="material-symbols-outlined text-primary/40 text-[20px]">
              support_agent
            </span>
            <div>
              <h4 className="text-[11px] font-bold text-on-surface">Need Help?</h4>
              <p className="text-[10px] text-on-surface-variant/50 leading-tight mt-0.5">
                Contact our 24/7 support line.
              </p>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 flex items-start gap-3 border border-on-surface-variant/5">
            <span className="material-symbols-outlined text-primary/40 text-[20px]">
              verified_user
            </span>
            <div>
              <h4 className="text-[11px] font-bold text-on-surface">Privacy</h4>
              <p className="text-[10px] text-on-surface-variant/50 leading-tight mt-0.5">
                Encrypted with ISO 27001.
              </p>
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
