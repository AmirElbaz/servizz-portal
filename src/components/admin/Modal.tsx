import { type ReactNode, useEffect, useId, useRef } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
  /**
   * Optional gate invoked before close (ESC, backdrop click, X button).
   * Return `true` to proceed with closing, `false` to cancel.
   * Parent uses this to show a secondary "Discard unsaved changes?" dialog
   * when the modal's form is dirty.
   */
  onBeforeClose?: () => boolean;
}

// Modal — accessible dialog primitive for the admin panel.
//
// A11y contract:
//   - role="dialog" + aria-modal="true" + aria-labelledby pointing at the title
//   - Focus moves into the modal on open (first focusable element, or fallback
//     to the close button), and returns to the previously-focused element on close
//   - Tab / Shift+Tab cycles within the modal (focus trap)
//   - ESC closes via the same path as the X button and backdrop click
//   - Body scroll locked while open
//   - Close button has an aria-label
//
// onBeforeClose lets the parent intercept any close attempt (dirty-check pattern).
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "md",
  onBeforeClose,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Centralized close gate — every close path goes through this.
  function attemptClose() {
    if (onBeforeClose && !onBeforeClose()) return;
    onClose();
  }

  // Focus management + body scroll lock
  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog. Prefer the first focusable element;
    // fall back to the dialog container itself (tabindex=-1).
    const focusables = getFocusableElements(dialogRef.current);
    const first = focusables[0] ?? dialogRef.current;
    first?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      // Restore focus to whatever had it before the modal opened.
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Key handling: ESC + Tab focus trap
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        attemptClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialogRef.current?.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onBeforeClose]);

  if (!open) return null;

  const widthClass =
    width === "sm" ? "max-w-sm" : width === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={attemptClose}
    >
      <div
        className="absolute inset-0 bg-on-surface/30 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${widthClass} bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)] border border-on-surface-variant/5 overflow-hidden animate-fade-in focus:outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-on-surface-variant/8 flex items-center justify-between">
          <h2
            id={titleId}
            className="text-lg font-extrabold text-on-surface font-headline tracking-tight"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close dialog"
            className="p-1.5 hover:bg-surface-container-high rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              close
            </span>
          </button>
        </div>
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 py-4 bg-surface-container-low border-t border-on-surface-variant/8 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Query DOM for all focusable elements inside a container.
// Used for the focus trap and for initial focus on open.
function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
  );
}
