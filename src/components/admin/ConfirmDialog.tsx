import Modal from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width="sm"
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 ${
              destructive
                ? "bg-error shadow-lg shadow-error/25"
                : "bg-gradient-to-r from-primary to-primary-dim shadow-lg shadow-primary/25"
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-on-surface-variant">{message}</p>
    </Modal>
  );
}
