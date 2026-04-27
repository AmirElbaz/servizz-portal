import { useEffect, useRef, useState } from "react";

// Reusable in-app confirmation dialog. Replaces window.confirm / window.prompt
// so destructive warnings render in full (multi-line, formatted) inside the
// app's rounded-2xl modal aesthetic.
//
// Modes:
//   - Simple: OK / Cancel. Pass `variant="danger"` for red confirm button.
//   - Typed:  user must type an exact string (e.g. "DELETE") to enable the
//             confirm button. Use for hard-delete flows where a single
//             misclick can't be allowed to destroy data.
//
// When `open` is false the modal unmounts (no leftover DOM / backdrop).
// Cancel fires on: Cancel button, Escape, or backdrop click.

type ConfirmVariant = "default" | "danger";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  requireTyped?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  requireTyped = null,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    // autofocus the typed input or the cancel button for keyboard users
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !requireTyped || typed === requireTyped;

  async function handleConfirm() {
    if (!canConfirm || busy) return;
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  const confirmCls =
    variant === "danger"
      ? "bg-error text-white hover:bg-error/90 disabled:opacity-40"
      : "bg-primary text-white hover:bg-primary-dim disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full border border-on-surface-variant/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              variant === "danger" ? "bg-error/10 text-error" : "bg-primary/10 text-primary"
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {variant === "danger" ? "warning" : "help"}
            </span>
          </div>
          <h3
            id="confirm-modal-title"
            className="text-lg font-extrabold font-headline text-on-surface pt-1.5 flex-1 min-w-0"
          >
            {title}
          </h3>
        </div>

        <div className="text-sm text-on-surface-variant leading-relaxed mb-4 whitespace-pre-line">
          {message}
        </div>

        {requireTyped && (
          <div className="mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1.5">
              Type <span className="font-mono text-on-surface">{requireTyped}</span> to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleConfirm(); }}
              className="w-full px-3 py-2 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/10 text-sm font-mono focus:outline-none focus:border-error/40 focus:bg-white"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-xs font-bold text-on-surface-variant/70 hover:text-on-surface transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${confirmCls}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
