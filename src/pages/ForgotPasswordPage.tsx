import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/layout/Footer";

export default function ForgotPasswordPage() {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-slate-50/90 backdrop-blur-xl flex justify-between items-center px-8 h-16 max-w-full">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="text-xl font-bold tracking-tighter text-slate-900 font-headline"
          >
            Centercom | Servizz
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-4">
            <span className="material-symbols-outlined text-slate-600 hover:bg-slate-200/50 transition-colors p-2 rounded-full cursor-pointer">
              help
            </span>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex items-center justify-center pt-16 px-4">
        {/* Background Decorative */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full opacity-10 brand-gradient blur-[120px]"></div>
          <div className="absolute -bottom-[10%] -left-[5%] w-[40%] h-[40%] rounded-full opacity-10 bg-tertiary blur-[100px]"></div>
        </div>

        <div className="relative z-10 w-full max-w-[480px]">
          {/* Hero Messaging */}
          <div className="mb-10 text-left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3 font-headline">
              Security &amp; Access
            </p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-on-surface font-headline leading-none">
              Recover your <br />
              <span className="text-primary">account.</span>
            </h1>
            <p className="mt-4 text-on-surface-variant max-w-sm">
              Enter your credentials below and we'll send a secure verification
              link to regain access to your portal.
            </p>
          </div>

          {/* Card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_40px_80px_-20px_rgba(42,52,57,0.06)] overflow-hidden">
            {/* Branding Header */}
            <div className="bg-surface-container px-8 py-6 flex justify-between items-center border-b border-outline-variant/10">
              <div className="flex flex-col">
                <span className="text-sm font-bold font-headline text-on-surface">
                  Unified Portal
                </span>
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Identity Management
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-white text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    security
                  </span>
                </div>
              </div>
            </div>

            <div className="p-8">
              <form className="space-y-6" onSubmit={handleSubmit}>
                {/* Input Group */}
                <div className="space-y-2">
                  <label
                    className="block text-sm font-semibold text-on-surface-variant ml-1"
                    htmlFor="identity"
                  >
                    Email Address or Username
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-outline text-lg group-focus-within:text-primary transition-colors">
                        alternate_email
                      </span>
                    </div>
                    <input
                      className="block w-full pl-11 pr-4 py-4 bg-surface-container-high border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all text-on-surface placeholder:text-outline/60 focus:outline-none"
                      id="identity"
                      name="identity"
                      placeholder="e.g. john.doe@example.com"
                      type="text"
                    />
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-2 px-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">
                      info
                    </span>
                    Ensure this is the email associated with your Servizz
                    account.
                  </p>
                </div>

                {/* CTA */}
                <div className="pt-2">
                  <button
                    className="w-full brand-gradient text-on-primary font-bold py-4 px-6 rounded-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                    type="submit"
                  >
                    <span>Send Reset Link</span>
                    <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </form>

              {/* Back to Login */}
              <div className="mt-8 pt-8 border-t border-outline-variant/10 text-center">
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

          {/* Contextual Support */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low p-4 rounded-lg flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary">
                support_agent
              </span>
              <div>
                <h4 className="text-xs font-bold text-on-surface">
                  Need Help?
                </h4>
                <p className="text-[10px] text-on-surface-variant leading-tight">
                  Contact our 24/7 support line for identity verification.
                </p>
              </div>
            </div>
            <div className="bg-surface-container-low p-4 rounded-lg flex items-start gap-3">
              <span className="material-symbols-outlined text-secondary">
                verified_user
              </span>
              <div>
                <h4 className="text-xs font-bold text-on-surface">Privacy</h4>
                <p className="text-[10px] text-on-surface-variant leading-tight">
                  Your data is encrypted following ISO 27001 standards.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer variant="auth" />
    </div>
  );
}
