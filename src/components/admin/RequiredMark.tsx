// Renders a small red asterisk next to a form label to indicate a required field.
export default function RequiredMark() {
  return (
    <span className="text-error ml-0.5" aria-hidden="true">
      *
    </span>
  );
}
