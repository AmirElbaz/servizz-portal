import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { fetchReportIndex, type ReportIndexEntry } from "../services/reportIndex";

// Public (any authenticated user) glossary: client report number → our
// report(s), with deep links. Links are already access-filtered by the API, so
// a user only sees destinations they can open.
export default function ReportIndexPage() {
  const [entries, setEntries] = useState<ReportIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchReportIndex()
      .then((e) => { if (!cancelled) setEntries(e); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the report index"); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) =>
      e.reportNumber.toLowerCase().includes(needle) ||
      e.title.toLowerCase().includes(needle) ||
      (e.covers ?? "").toLowerCase().includes(needle)
    );
  }, [entries, q]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black font-headline text-on-surface tracking-tight">
            Report Index
          </h1>
          <p className="text-sm text-on-surface-variant/60 mt-1 max-w-2xl">
            Look up a report by its requirement number. Each entry maps the client's
            reporting-requirements number to the matching report(s) on this portal.
          </p>
        </div>

        <div className="mb-6">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by number, name, or what it covers…"
            className="w-full h-[44px] px-4 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-error/20 bg-error/8 px-5 py-4 text-sm text-error">
            <p className="font-bold mb-1">Couldn't load the report index</p>
            <p className="text-[12px] text-error/80">{error}</p>
          </div>
        )}

        {entries === null && !error && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-surface-container-high/50 h-28 animate-pulse" />
            ))}
          </div>
        )}

        {entries && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-on-surface-variant/15 p-10 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 mb-2">search_off</span>
            <p className="text-sm text-on-surface-variant/60">
              {q ? `No reports match "${q}".` : "No reports in the index yet."}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((e) => <EntryCard key={e.id} entry={e} />)}
        </div>
      </div>
    </DashboardLayout>
  );
}

function EntryCard({ entry }: { entry: ReportIndexEntry }) {
  const live = entry.status === "live";
  return (
    <div className="prism-surface rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <span className="inline-flex items-center justify-center min-w-[3.25rem] px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-sm font-black tabular-nums">
            {entry.reportNumber}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-on-surface">{entry.title}</h3>
            {entry.frequency && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/45">
                {entry.frequency}
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                live ? "bg-success/12 text-success" : "bg-surface-container-high text-on-surface-variant/60"
              }`}
            >
              {live ? "Available" : "Planned"}
            </span>
          </div>
          {entry.covers && (
            <p className="text-[13px] text-on-surface-variant/70 leading-relaxed mt-1.5">{entry.covers}</p>
          )}
          {entry.links.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {entry.links.map((l, i) => (
                <Link
                  key={i}
                  to={l.url}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold no-underline hover:opacity-90 transition-opacity"
                >
                  {l.label}
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              ))}
            </div>
          ) : (
            !live && (
              <p className="text-[11px] text-on-surface-variant/40 mt-2 italic">
                Not yet available on the portal.
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
