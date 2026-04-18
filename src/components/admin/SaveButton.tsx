import { useState, type ReactNode } from "react";

type SaveState = "idle" | "saving" | "success";

interface SaveButtonProps {
  onSave: () => Promise<void>;
  children?: ReactNode;       // label when idle (default: "Save")
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  /**
   * Called when `onSave` throws. Parent should render a user-visible error
   * (e.g. set an actionError state that feeds an ErrorBanner).
   * If `onError` is omitted, the error is logged to console and the button
   * still returns to idle — but the user sees nothing, which is a UX hazard,
   * so every caller should pass `onError`.
   *
   * Validation errors (a thrown Error whose message is "validation" or starts
   * with "validation:") are silently swallowed and NOT passed to onError —
   * inline field errors are expected to be shown by the parent already.
   */
  onError?: (error: Error) => void;
}

// Save button with an inline state machine:
//   idle    → primary gradient, custom label
//   saving  → primary gradient, "Saving…" + spinning icon
//   success → emerald gradient, "✓ Saved" for 1.6s, then back to idle
//
// Errors thrown by onSave flow to the `onError` callback so the parent can
// render them inline. Without onError they are logged to console.
export default function SaveButton({
  onSave,
  children = "Save",
  disabled,
  className = "",
  size = "md",
  onError,
}: SaveButtonProps) {
  const [state, setState] = useState<SaveState>("idle");

  async function handleClick() {
    if (disabled || state !== "idle") return;
    setState("saving");
    try {
      await onSave();
      setState("success");
      setTimeout(() => setState("idle"), 1600);
    } catch (e) {
      setState("idle");
      const err = e instanceof Error ? e : new Error(String(e));
      const msg = err.message ?? "";
      const isValidation = msg === "validation" || msg.startsWith("validation:");
      if (isValidation) return;
      if (onError) {
        onError(err);
      } else {
        console.error("SaveButton: unhandled save error", err);
      }
    }
  }

  const sizeClass =
    size === "sm"
      ? "px-4 py-2 text-sm"
      : "px-5 py-2.5 text-sm";

  const stateClass =
    state === "success"
      ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25"
      : "bg-gradient-to-r from-primary to-primary-dim shadow-lg shadow-primary/25 hover:opacity-95";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state !== "idle"}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${stateClass} ${className}`}
    >
      {state === "saving" && (
        <>
          <span className="material-symbols-outlined text-[18px] animate-spin">
            progress_activity
          </span>
          Saving…
        </>
      )}
      {state === "success" && (
        <>
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          Saved
        </>
      )}
      {state === "idle" && children}
    </button>
  );
}
