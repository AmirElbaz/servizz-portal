import { useState } from "react";

const VARIANTS = [
  { key: "A", label: "Classic" },
  { key: "B", label: "Horizon" },
  { key: "C", label: "Prism" },
];

interface VariantSwitcherProps {
  active: string;
  onChange: (variant: string) => void;
}

export default function VariantSwitcher({ active, onChange }: VariantSwitcherProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {expanded ? (
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/15 border border-on-surface-variant/10 p-2 flex flex-col gap-1 animate-card-rise">
          <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50 px-2 pt-1 pb-0.5">
            Layout
          </p>
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              onClick={() => { onChange(v.key); setExpanded(false); }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                active === v.key
                  ? "bg-primary text-white"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black ${
                active === v.key ? "bg-white/20" : "bg-surface-container-high"
              }`}>
                {v.key}
              </span>
              {v.label}
            </button>
          ))}
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] text-on-surface-variant/40 hover:text-on-surface-variant text-center pt-1 transition-colors"
          >
            Close
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="w-12 h-12 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-110 transition-transform"
        >
          <span className="material-symbols-outlined text-xl">palette</span>
        </button>
      )}
    </div>
  );
}
