// A two-select period control (unit + year) with an optional colour dot that
// maps the picker to its series colour on a chart. Used by the IVR trend
// page's comparison mode (Period A = accent, Period B = grey baseline).
// Selects are fixed at 38px to line up with the segmented controls beside them.

export default function PeriodPicker({
  label,
  dotColor,
  year,
  unit,
  yearOptions,
  unitOptions,
  onYear,
  onUnit,
}: {
  label: string;
  dotColor?: string;
  year: number;
  unit: number;
  yearOptions: number[];
  unitOptions: { value: number; label: string }[];
  onYear: (y: number) => void;
  onUnit: (u: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-1.5 flex items-center gap-1.5">
        {dotColor && (
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
        )}
        {label}
      </label>
      <div className="flex gap-1.5">
        <select
          value={unit}
          onChange={(e) => onUnit(parseInt(e.target.value, 10))}
          className="h-[38px] px-2.5 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent"
        >
          {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={year}
          onChange={(e) => onYear(parseInt(e.target.value, 10))}
          className="h-[38px] px-2.5 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-accent tabular-nums"
        >
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}
