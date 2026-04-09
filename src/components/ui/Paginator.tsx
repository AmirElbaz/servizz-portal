interface PaginatorProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  accentColor?: string;
}

export default function Paginator({
  totalItems,
  currentPage,
  pageSize,
  pageSizeOptions = [5, 10, 15, 20],
  onPageChange,
  onPageSizeChange,
  accentColor,
}: PaginatorProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  // Build visible page numbers with ellipsis
  function getPages(): (number | "...")[] {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [1];
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
      {/* Left: page size selector + info */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-on-surface-variant/50">Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="py-1.5 px-2 pr-7 bg-surface-container-high/50 rounded-lg border border-on-surface-variant/8 text-on-surface text-xs font-semibold focus:outline-none focus:border-primary/30 transition-all appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%23566166'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 6px center",
          }}
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <span className="text-[11px] text-on-surface-variant/40">
          {from}–{to} of {totalItems}
        </span>
      </div>

      {/* Right: page buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg text-on-surface-variant/40 hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">first_page</span>
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg text-on-surface-variant/40 hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>

        {getPages().map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1 text-on-surface-variant/30 text-xs">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                p === currentPage
                  ? "text-white shadow-md"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
              style={
                p === currentPage
                  ? {
                      backgroundColor: accentColor ?? "#1d5fa8",
                      boxShadow: `0 2px 8px ${accentColor ?? "#1d5fa8"}30`,
                    }
                  : undefined
              }
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg text-on-surface-variant/40 hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg text-on-surface-variant/40 hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">last_page</span>
        </button>
      </div>
    </div>
  );
}
