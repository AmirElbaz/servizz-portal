interface FooterProps {
  variant?: "auth" | "dashboard";
}

export default function Footer({ variant = "dashboard" }: FooterProps) {
  if (variant === "auth") {
    return (
      <footer className="bg-slate-100 w-full py-8 mt-auto flex flex-col md:flex-row justify-between items-center px-12 border-t border-slate-200">
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
          <span className="font-bold text-slate-400 font-headline uppercase text-xs">
            Centercom | Servizz
          </span>
          <p className="text-xs font-sans tracking-wide uppercase text-slate-500">
            &copy; 2024 Centercom &amp; Servizz. All rights reserved.
          </p>
        </div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a
            className="text-xs font-sans tracking-wide uppercase text-slate-500 hover:text-blue-500 transition-colors"
            href="#"
          >
            Privacy Policy
          </a>
          <a
            className="text-xs font-sans tracking-wide uppercase text-slate-500 hover:text-blue-500 transition-colors"
            href="#"
          >
            Terms of Service
          </a>
          <a
            className="text-xs font-sans tracking-wide uppercase text-slate-500 hover:text-blue-500 transition-colors"
            href="#"
          >
            Accessibility
          </a>
          <a
            className="text-xs font-sans tracking-wide uppercase text-slate-500 hover:text-blue-500 transition-colors"
            href="#"
          >
            Contact
          </a>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-white w-full py-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center px-12 z-20 relative">
      <div className="mb-4 md:mb-0">
        <div className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">
          &copy; 2024 Centercom &amp; Servizz. Unified Gateway.
        </div>
      </div>
      <div className="flex gap-8 items-center">
        <a
          className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-primary transition-colors"
          href="#"
        >
          Privacy
        </a>
        <a
          className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-primary transition-colors"
          href="#"
        >
          Terms
        </a>
        <a
          className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-primary transition-colors"
          href="#"
        >
          Contact
        </a>
      </div>
    </footer>
  );
}
