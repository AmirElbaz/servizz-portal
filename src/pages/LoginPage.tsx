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
    <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
      {/* Header */}
      <header className="w-full py-8 px-12 flex justify-between items-center bg-transparent z-10">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-2xl font-bold tracking-tighter text-on-surface-variant font-headline leading-none">
              Centercom
            </span>
            <div className="h-1 w-8 bg-primary mt-1"></div>
          </div>
          <div className="h-8 w-[1px] bg-outline-variant/30 mx-2"></div>
          <div className="flex flex-col">
            <span className="text-xl font-extrabold tracking-tight text-primary font-headline leading-none uppercase">
              Servizz
            </span>
            <span className="text-[10px] font-label tracking-widest text-on-surface-variant uppercase mt-1">
              Unified Portal
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center relative px-6 py-12">
        {/* Background Accents */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -right-[5%] w-[40%] h-[60%] rounded-full bg-primary/5 blur-[120px]"></div>
          <div className="absolute -bottom-[10%] -left-[5%] w-[30%] h-[50%] rounded-full bg-tertiary/5 blur-[100px]"></div>
        </div>

        <div className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-12 gap-0 relative z-20 overflow-hidden rounded-xl editorial-shadow bg-surface-container-lowest">
          {/* Information Panel */}
          <div className="lg:col-span-5 bg-surface-container p-12 lg:p-16 flex flex-col justify-between">
            <div>
              <span className="font-label font-semibold text-primary uppercase tracking-[0.2em] mb-8 block text-sm">
                Identity Management
              </span>
              <h1 className="font-headline text-4xl lg:text-5xl font-bold text-on-surface leading-[1.1] mb-6 tracking-tight">
                Secure access to <br />
                <span className="text-primary-dim">National Services.</span>
              </h1>
              <p className="text-on-surface-variant text-lg leading-relaxed max-w-md font-body">
                Your single point of entry for government departments, financial
                portals, and education resources. Powered by enterprise-grade
                encryption.
              </p>
            </div>
            <div className="mt-12 lg:mt-0">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-xl">
                    verified_user
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-on-surface">
                    Trusted Identity
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    Validated through secure protocols
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-tertiary text-xl">
                    encrypted
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-on-surface">Data Privacy</p>
                  <p className="text-sm text-on-surface-variant">
                    Compliant with international standards
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Login Form Panel */}
          <div className="lg:col-span-7 bg-surface-container-lowest p-12 lg:p-20">
            <div className="max-w-md mx-auto">
              <div className="mb-10">
                <h2 className="text-2xl font-bold font-headline text-on-surface mb-2">
                  Sign In
                </h2>
                <p className="text-on-surface-variant">
                  Please enter your credentials to continue
                </p>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                {/* Username Field */}
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant block ml-1"
                    htmlFor="username"
                  >
                    Username
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
                      person
                    </span>
                    <input
                      className="w-full pl-12 pr-4 py-4 bg-surface-container-high rounded-xl border-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 transition-all text-on-surface placeholder:text-outline-variant font-medium focus:outline-none"
                      id="username"
                      name="username"
                      placeholder="Enter your ID or email"
                      type="text"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label
                      className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant block ml-1"
                      htmlFor="password"
                    >
                      Password
                    </label>
                    <Link
                      className="text-xs font-semibold text-primary hover:text-primary-dim transition-colors"
                      to="/forgot-password"
                    >
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
                      lock
                    </span>
                    <input
                      className="w-full pl-12 pr-12 py-4 bg-surface-container-high rounded-xl border-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 transition-all text-on-surface placeholder:text-outline-variant font-medium focus:outline-none"
                      id="password"
                      name="password"
                      placeholder="••••••••"
                      type="password"
                    />
                    <button
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-outline"
                      type="button"
                    >
                      <span className="material-symbols-outlined">
                        visibility
                      </span>
                    </button>
                  </div>
                </div>

                {/* 4-Digit PIN Field */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="h-[1px] flex-grow bg-outline-variant/20"></div>
                    <span className="text-[10px] font-bold text-outline uppercase tracking-widest">
                      Enhanced Security
                    </span>
                    <div className="h-[1px] flex-grow bg-outline-variant/20"></div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant block ml-1">
                      Secure 4-Digit PIN
                    </label>
                    <div className="flex gap-4 justify-between">
                      {pinRefs.map((ref, i) => (
                        <input
                          key={i}
                          ref={ref}
                          className="w-16 h-16 text-center text-2xl font-bold bg-surface-container-high rounded-xl border-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 transition-all text-primary focus:outline-none"
                          maxLength={1}
                          placeholder="•"
                          type="password"
                          onChange={(e) => handlePinInput(i, e.target.value)}
                          onKeyDown={(e) => handlePinKeyDown(i, e)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Login Button */}
                <button
                  className="w-full bg-gradient-to-r from-primary to-primary-dim text-on-primary py-5 rounded-xl font-bold text-lg tracking-tight editorial-shadow hover:opacity-95 transition-all flex items-center justify-center gap-3 group mt-4"
                  type="submit"
                >
                  <span>Secure Login</span>
                  <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </button>

                {/* Secondary Links */}
                <div className="pt-8 text-center space-y-4">
                  <p className="text-sm text-on-surface-variant">
                    New to the portal?{" "}
                    <a
                      className="text-primary font-semibold hover:underline"
                      href="#"
                    >
                      Request Access
                    </a>
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer variant="auth" />
    </div>
  );
}
