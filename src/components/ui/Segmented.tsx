// Shared segmented control for mutually-exclusive options. Matches the report
// filter idiom: a rounded-xl pill group with the active option in accent. Used
// by the IVR trend page (Mode / View) and available for any other report
// filter. `aria-pressed` conveys the toggle state to assistive tech.
//
// Fixed 38px height so it lines up with the native <select>/<input> filters
// it sits beside (which render ~38px at py-2 text-sm).

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex rounded-xl overflow-hidden border border-on-surface-variant/8 shrink-0"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`h-[38px] px-3.5 text-[12px] font-semibold transition-colors ${
              active
                ? "bg-accent text-white"
                : "bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
