import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function AdminPageHeader({ title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface font-headline tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-on-surface-variant/70 mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
