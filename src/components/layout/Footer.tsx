interface FooterProps {
  variant?: "auth" | "dashboard";
}

export default function Footer({ variant = "dashboard" }: FooterProps) {
  if (variant === "auth") {
    return (
      <footer className="absolute bottom-0 w-full py-6 flex justify-between items-center px-10 z-10">
        <span className="text-[11px] tracking-wide text-white/30 font-medium">
          &copy; 2026{" "}
          <a
            href="https://www.centrecom.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 transition-colors"
          >
            Centrecom
          </a>
        </span>
        <div className="flex gap-6">
          {["Privacy", "Terms", "Accessibility"].map((link) => (
            <a
              key={link}
              className="text-[11px] tracking-wide text-white/30 hover:text-white/60 transition-colors"
              href="#"
            >
              {link}
            </a>
          ))}
        </div>
      </footer>
    );
  }

  return (
    <footer className="w-full py-5 px-6 lg:px-12 max-w-[90rem] mx-auto flex justify-between items-center gap-6">
      <div className="flex items-center gap-3 min-w-0">
        <img src="/centrecom-logo.svg" alt="Centrecom" className="h-5 w-auto shrink-0" />
        <span className="text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant/50 truncate">
          &copy; 2026{" "}
          <a
            href="https://www.centrecom.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Centrecom
          </a>
          . Unified Gateway.
        </span>
      </div>
      <div className="flex gap-5 shrink-0">
        {["Privacy", "Terms", "Accessibility"].map((link) => (
          <a
            key={link}
            className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/40 hover:text-on-surface-variant/80 transition-colors"
            href="#"
          >
            {link}
          </a>
        ))}
      </div>
    </footer>
  );
}
