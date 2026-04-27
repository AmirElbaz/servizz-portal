type Tone = "error" | "success" | "info";

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  className?: string;
  tone?: Tone;
}

// Inline banner for admin pages. Replaces native alert() calls.
// When `message` is null, returns null (nothing rendered).
//
// Tones:
//   - "error"   (default): red, role="alert" aria-live="assertive"
//   - "success": emerald, role="status" aria-live="polite"
//   - "info":    primary blue, role="status" aria-live="polite"
//
// Usage:
//   <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
//   <ErrorBanner message={successMsg} tone="success" onDismiss={...} />
const TONES: Record<Tone, {
  container: string;
  icon: string;
  dismissHover: string;
  role: "alert" | "status";
  ariaLive: "assertive" | "polite";
}> = {
  error: {
    container: "bg-error/8 border-error/20 text-error",
    icon: "error",
    dismissHover: "hover:bg-error/10",
    role: "alert",
    ariaLive: "assertive",
  },
  success: {
    container: "bg-emerald-50 border-emerald-200 text-emerald-800",
    icon: "check_circle",
    dismissHover: "hover:bg-emerald-100",
    role: "status",
    ariaLive: "polite",
  },
  info: {
    container: "bg-primary/5 border-primary/15 text-primary",
    icon: "info",
    dismissHover: "hover:bg-primary/10",
    role: "status",
    ariaLive: "polite",
  },
};

export default function ErrorBanner({
  message,
  onDismiss,
  className = "",
  tone = "error",
}: ErrorBannerProps) {
  if (!message) return null;
  const t = TONES[tone];
  return (
    <div
      role={t.role}
      aria-live={t.ariaLive}
      className={`mb-4 px-4 py-3 border rounded-xl text-sm font-medium flex items-start gap-2 ${t.container} ${className}`}
    >
      <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
        {t.icon}
      </span>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 p-0.5 rounded-md transition-colors ${t.dismissHover}`}
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}
