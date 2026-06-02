import { useState, type ReactNode } from "react";

// Shared shell for the logged-out / onboarding screens (login-style centered
// card on the blob background). Mirrors CompleteSignupPage's look.
export default function AuthScreen({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
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
          <div className="text-on-surface font-headline font-bold text-sm tracking-tight">Centrecom | Servizz.gov</div>
          <div className="text-on-surface-variant/50 text-[10px] tracking-[0.2em] uppercase font-medium">{eyebrow}</div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-3xl p-10 relative overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] border border-on-surface-variant/5">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-[60px] pointer-events-none" />
          <div className="relative">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="assertive" className="mb-4 px-4 py-3 bg-error/8 border border-error/20 rounded-xl text-error text-sm font-medium flex items-start gap-2">
      <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
      <span>{message}</span>
    </div>
  );
}

export function AuthField({
  label, value, onChange, type = "text", icon, placeholder, error, autoFocus, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password";
  icon?: string;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  const inputType = isPw ? (show ? "text" : "password") : type;
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block">{label}</label>
      <div className="relative group">
        {icon && (
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 group-focus-within:text-primary transition-colors text-[20px]">
            {icon}
          </span>
        )}
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={`w-full ${icon ? "pl-12" : "pl-4"} ${isPw ? "pr-12" : "pr-4"} py-3.5 bg-surface-container-high/60 rounded-xl border text-on-surface placeholder:text-on-surface-variant/30 font-medium text-sm focus:outline-none focus:bg-white transition-all ${
            error ? "border-error/50 focus:border-error/60" : "border-on-surface-variant/8 focus:border-primary/30"
          }`}
        />
        {isPw && (
          <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined text-[20px]">{show ? "visibility_off" : "visibility"}</span>
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>{error}
        </p>
      )}
    </div>
  );
}

export function AuthSubmit({ loading, label, disabled }: { loading: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full btn-brand py-4 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 group mt-2 disabled:opacity-60"
    >
      <span>{loading ? "Working…" : label}</span>
      {!loading && (
        <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span>
      )}
    </button>
  );
}
