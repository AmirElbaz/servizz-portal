import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import ErrorBanner from "../../components/admin/ErrorBanner";
import {
  fetchReportIndex,
  createReportIndexEntry,
  updateReportIndexEntry,
  deleteReportIndexEntry,
  setReportIndexLinks,
  type ReportIndexEntry,
  type ReportIndexLink,
  type ReportIndexEntryInput,
} from "../../services/reportIndex";

type EntryDraft = ReportIndexEntryInput & { id: number | null };

const EMPTY_ENTRY: EntryDraft = {
  id: null, reportNumber: "", title: "", covers: "", frequency: "", status: "planned", sortOrder: 100,
};

export default function AdminReportIndexPage() {
  const [entries, setEntries] = useState<ReportIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [linksEntry, setLinksEntry] = useState<ReportIndexEntry | null>(null);
  const [linksDraft, setLinksDraft] = useState<ReportIndexLink[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<ReportIndexEntry | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      setEntries(await fetchReportIndex());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the report index");
    }
  }
  useEffect(() => { reload(); }, []);

  async function saveEntry() {
    if (!entryDraft) return;
    setSaving(true);
    setActionError(null);
    try {
      const input: ReportIndexEntryInput = {
        reportNumber: entryDraft.reportNumber.trim(),
        title: entryDraft.title.trim(),
        covers: entryDraft.covers?.trim() || null,
        frequency: entryDraft.frequency?.trim() || null,
        status: entryDraft.status,
        sortOrder: entryDraft.sortOrder,
      };
      if (entryDraft.id == null) await createReportIndexEntry(input);
      else await updateReportIndexEntry(entryDraft.id, input);
      setEntryDraft(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteReportIndexEntry(confirmDelete.id);
      setConfirmDelete(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete entry");
    } finally {
      setSaving(false);
    }
  }

  function openLinks(entry: ReportIndexEntry) {
    setLinksEntry(entry);
    setLinksDraft(entry.links.map((l) => ({ ...l })));
  }
  async function saveLinks() {
    if (!linksEntry) return;
    setSaving(true);
    setActionError(null);
    try {
      const clean = linksDraft
        .filter((l) => l.label.trim() && l.url.trim())
        .map((l, i) => ({
          label: l.label.trim(),
          url: l.url.trim(),
          reportCode: l.reportCode?.trim() || null,
          sortOrder: l.sortOrder || (i + 1) * 10,
        }));
      await setReportIndexLinks(linksEntry.id, clean);
      setLinksEntry(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save links");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-xl font-extrabold font-headline text-on-surface tracking-tight">Report Index</h1>
          <p className="text-sm text-on-surface-variant/60 mt-0.5">
            Map each client report number to the report(s) on the portal. Seeded from the requirements document — edit freely.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEntryDraft({ ...EMPTY_ENTRY }); setActionError(null); }}
          className="btn-brand inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          New entry
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
              <th className="px-5 py-3 w-[10%]">#</th>
              <th className="px-5 py-3 w-[28%]">Report</th>
              <th className="px-5 py-3 w-[12%]">Status</th>
              <th className="px-5 py-3 w-[12%]">Links</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-on-surface-variant/8">
            {entries === null ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant/50">Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant/50">No entries yet.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-surface-container-low/40">
                  <td className="px-5 py-3 font-black tabular-nums text-primary">{e.reportNumber}</td>
                  <td className="px-5 py-3">
                    <p className="font-bold text-on-surface">{e.title}</p>
                    {e.frequency && <p className="text-[11px] text-on-surface-variant/50">{e.frequency}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      e.status === "live" ? "bg-success/12 text-success" : "bg-surface-container-high text-on-surface-variant/60"
                    }`}>
                      {e.status === "live" ? "Available" : "Planned"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => openLinks(e)} className="text-xs font-semibold text-primary hover:underline">
                      {e.links.length} link{e.links.length === 1 ? "" : "s"} ›
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setEntryDraft({ id: e.id, reportNumber: e.reportNumber, title: e.title, covers: e.covers ?? "", frequency: e.frequency ?? "", status: e.status, sortOrder: e.sortOrder }); setActionError(null); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(e)}
                      className="ml-2 px-2.5 py-1 rounded-lg text-xs font-semibold text-error bg-error/8 hover:bg-error/15 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Entry modal ── */}
      {entryDraft && (
        <Overlay onClose={() => setEntryDraft(null)}>
          <h2 className="text-lg font-extrabold text-on-surface mb-4">{entryDraft.id == null ? "New entry" : "Edit entry"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Report number">
              <input value={entryDraft.reportNumber} onChange={(e) => setEntryDraft({ ...entryDraft, reportNumber: e.target.value })} className={inputCls} placeholder="1.47" />
            </Field>
            <Field label="Sort order">
              <input type="number" value={entryDraft.sortOrder} onChange={(e) => setEntryDraft({ ...entryDraft, sortOrder: parseInt(e.target.value, 10) || 0 })} className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="Title">
                <input value={entryDraft.title} onChange={(e) => setEntryDraft({ ...entryDraft, title: e.target.value })} className={inputCls} placeholder="IVR & Queue Analytics" />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="What it covers">
                <textarea value={entryDraft.covers ?? ""} onChange={(e) => setEntryDraft({ ...entryDraft, covers: e.target.value })} rows={3} className={inputCls} />
              </Field>
            </div>
            <Field label="Frequency">
              <input value={entryDraft.frequency ?? ""} onChange={(e) => setEntryDraft({ ...entryDraft, frequency: e.target.value })} className={inputCls} placeholder="Monthly" />
            </Field>
            <Field label="Status">
              <select value={entryDraft.status} onChange={(e) => setEntryDraft({ ...entryDraft, status: e.target.value })} className={inputCls}>
                <option value="planned">Planned</option>
                <option value="live">Available</option>
              </select>
            </Field>
          </div>
          {actionError && <p className="text-xs text-error mt-3">{actionError}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setEntryDraft(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Cancel</button>
            <button onClick={saveEntry} disabled={saving} className="btn-brand px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </Overlay>
      )}

      {/* ── Links modal ── */}
      {linksEntry && (
        <Overlay onClose={() => setLinksEntry(null)} wide>
          <h2 className="text-lg font-extrabold text-on-surface mb-1">Links — {linksEntry.reportNumber} {linksEntry.title}</h2>
          <p className="text-xs text-on-surface-variant/55 mb-4">
            Each link is a button on the index. Set a <b>report code</b> (e.g. <code>skillset-historical</code>) to access-filter it; leave it blank for department landings or preview pages.
          </p>
          <div className="flex flex-col gap-2">
            {linksDraft.map((l, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid grid-cols-12 gap-2 flex-1">
                  <input value={l.label} onChange={(e) => updateLink(setLinksDraft, i, { label: e.target.value })} placeholder="Label" className={`${inputCls} col-span-3`} />
                  <input value={l.url} onChange={(e) => updateLink(setLinksDraft, i, { url: e.target.value })} placeholder="/department/OPS/report/…" className={`${inputCls} col-span-5`} />
                  <input value={l.reportCode ?? ""} onChange={(e) => updateLink(setLinksDraft, i, { reportCode: e.target.value })} placeholder="report-code (opt)" className={`${inputCls} col-span-3`} />
                  <input type="number" value={l.sortOrder} onChange={(e) => updateLink(setLinksDraft, i, { sortOrder: parseInt(e.target.value, 10) || 0 })} className={`${inputCls} col-span-1`} />
                </div>
                <button onClick={() => setLinksDraft(linksDraft.filter((_, j) => j !== i))} className="shrink-0 mt-1 p-1.5 rounded-lg text-error hover:bg-error/8" aria-label="Remove link">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setLinksDraft([...linksDraft, { label: "", reportCode: null, url: "", sortOrder: (linksDraft.length + 1) * 10 }])}
            className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15"
          >
            <span className="material-symbols-outlined text-[16px]">add</span> Add link
          </button>
          {actionError && <p className="text-xs text-error mt-3">{actionError}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setLinksEntry(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Cancel</button>
            <button onClick={saveLinks} disabled={saving} className="btn-brand px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">{saving ? "Saving…" : "Save links"}</button>
          </div>
        </Overlay>
      )}

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <Overlay onClose={() => setConfirmDelete(null)}>
          <h2 className="text-lg font-extrabold text-on-surface mb-2">Delete entry?</h2>
          <p className="text-sm text-on-surface-variant/70 mb-5">
            Remove <b>{confirmDelete.reportNumber} {confirmDelete.title}</b> and its links from the index? This can't be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Cancel</button>
            <button onClick={doDelete} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-error shadow-lg shadow-error/25 hover:opacity-90 disabled:opacity-50">Delete</button>
          </div>
        </Overlay>
      )}
    </AdminLayout>
  );
}

const inputCls =
  "w-full h-[38px] px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function updateLink(
  setLinksDraft: React.Dispatch<React.SetStateAction<ReportIndexLink[]>>,
  i: number,
  patch: Partial<ReportIndexLink>,
) {
  setLinksDraft((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
}

function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={`relative bg-white rounded-2xl shadow-2xl p-6 w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[85vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}
