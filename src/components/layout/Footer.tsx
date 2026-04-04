interface FooterProps {
  variant?: "auth" | "dashboard";
}

export default function Footer({ variant = "dashboard" }: FooterProps) {
  if (variant === "auth") {
    return (
      <footer className="absolute bottom-0 w-full py-6 flex justify-between items-center px-10 z-10">
        <span className="text-[11px] tracking-wide text-white/30 font-medium">
          &copy; 2024 Centercom &amp; Servizz.gov
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
    <footer className="w-full py-10 flex flex-col md:flex-row justify-between items-center px-6 lg:px-12 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4 md:mb-0">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[14px]">
            hub
          </span>
        </div>
        <span className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/60">
          &copy; 2024 Centercom &amp; Servizz.gov. Unified Gateway.
        </span>
      </div>
      <div className="flex gap-8 items-center">
        {["Privacy", "Terms", "Contact"].map((link) => (
          <a
            key={link}
            className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 hover:text-primary transition-colors"
            href="#"
          >
            {link}
          </a>
        ))}
      </div>
    </footer>
  );
}
