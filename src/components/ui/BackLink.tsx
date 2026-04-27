import { Link } from "react-router-dom";

interface BackLinkProps {
  to: string;
  label: string;
}

/**
 * Explicit, Fitts's-friendly back affordance for detail pages.
 *
 * Breadcrumbs inside colored heroes aren't discoverable enough — this sits
 * above the hero at normal body contrast with a 20px arrow so users can
 * return to the parent context without fishing for a 10px link.
 */
export default function BackLink({ to, label }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 mb-4 sm:mb-5 text-[13px] font-semibold text-on-surface-variant/70 hover:text-primary transition-colors no-underline"
    >
      <span className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-0.5">
        arrow_back
      </span>
      <span>{label}</span>
    </Link>
  );
}
