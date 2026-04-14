import centrcomLogo from "../../assets/logos/Centrcom-logo-2.svg";

interface FooterProps {
  variant?: "auth" | "dashboard";
}

export default function Footer({ variant = "dashboard" }: FooterProps) {
  if (variant === "auth") {
    return (
      <footer className="absolute bottom-0 w-full py-6 flex justify-between items-center px-10 z-10">
        <span className="text-[11px] tracking-wide text-white/30 font-medium">
          &copy; 2024{" "}
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
    <footer className="w-full py-10 flex justify-center items-center px-6 lg:px-12 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <img src={centrcomLogo} alt="Centrecom" className="h-6 w-auto" />
        <span className="text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant/60">
          &copy; 2024{" "}
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
    </footer>
  );
}
