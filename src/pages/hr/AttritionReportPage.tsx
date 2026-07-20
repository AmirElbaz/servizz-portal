import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Modal from "../../components/admin/Modal";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton from "../../components/admin/Skeleton";
import { fmt } from "../../utils/fmt";
import { useAuth, roleAtLeast } from "../../services/auth";
import {
  ATTR_LEVELS, ATTR_MONTHS, fmtPct,
  getAttritionYear, getAttritionMonth, listAttritionYears,
  createAttritionProject, updateAttritionProject, deleteAttritionProject,
  listAttritionProjects, setAttritionProjectHidden,
  upsertAttritionMonth, upsertAttritionYtd, importAttrition,
  exportAttritionExcel, exportAttritionPdf,
  type AttritionReport, type AttrMonthSlice, type AttrProject,
  type ProjectCellPatch, type LevelCellPatch, type AttrImportResult,
} from "../../services/attrition";

// HR Attrition Report — the year-spanning, three-table view that mirrors the
// HR team's Attrition workbook (see AttritionController / migration 067). Year
// selector + optional month filter; staff can enter a month's numbers ("Add
// Attrition", with overwritable calc suggestions), manage the per-year project
// list, and export Excel / PDF that look like the source sheet.

// Parse a count input -> int|null; a percent input -> fraction|null.
const toInt = (s: string): number | null => { const t = s.trim(); if (t === "") return null; const n = parseInt(t, 10); return Number.isFinite(n) ? n : null; };
const toFrac = (s: string): number | null => { const t = s.trim(); if (t === "") return null; const n = parseFloat(t); return Number.isFinite(n) ? Math.round((n / 100) * 10000) / 10000 : null; };
const pctInput = (frac: number | null): string => frac === null ? "" : `${Math.round(frac * 1000) / 10}`;
const intInput = (n: number | null): string => n === null ? "" : fmt.int(n).replace(/,/g, "");

export default function AttritionReportPage() {
  const { user } = useAuth();
  const canEdit = roleAtLeast(user?.role, "centrecom_user");

  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [report, setReport] = useState<AttritionReport | null>(null);
  const [monthFilter, setMonthFilter] = useState<"all" | number>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [ytdOpen, setYtdOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    listAttritionYears()
      .then((ys) => {
        const list = ys.length ? ys : [new Date().getFullYear()];
        setYears(list);
        setYear((y) => y ?? list[0]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load years"));
  }, []);

  const reload = useCallback(async () => {
    if (year === null) return;
    setLoading(true);
    try {
      setReport(await getAttritionYear(year));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void reload(); }, [reload]);

  const monthCols = useMemo(
    () => (monthFilter === "all" ? Array.from({ length: 12 }, (_, i) => i) : [monthFilter]),
    [monthFilter],
  );
  const showYear = monthFilter === "all";
  const t1Cols = 1 + monthCols.length + (showYear ? 1 : 0);
  const t2Cols = 1 + monthCols.length + (showYear ? 1 : 0);

  // Highest-attrition project by Year figure — derived from existing data only
  // (no new fields), powers the KPI strip.
  const topProject = useMemo(() => {
    if (!report) return null;
    let best: { name: string; v: number } | null = null;
    for (const p of report.projects) {
      const y = p.pct[12];
      if (y != null && (!best || y > best.v)) best = { name: p.name, v: y };
    }
    return best;
  }, [report]);

  async function runExport(kind: "pdf" | "xlsx") {
    if (year === null) return;
    setBusy(kind);
    try {
      await (kind === "pdf" ? exportAttritionPdf(year) : exportAttritionExcel(year));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link
          to="/department/HR"
          className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant/70 hover:text-primary transition-colors no-underline mb-3"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to department
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tighter font-headline text-on-surface mb-1">
              Attrition Report
            </h1>
            <p className="text-sm text-on-surface-variant/70 max-w-2xl">
              Monthly staff attrition by project and level, with year-to-date totals.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => runExport("pdf")} disabled={busy !== null || !report}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors disabled:opacity-50">
              <span className={`material-symbols-outlined text-[16px] ${busy === "pdf" ? "animate-spin" : ""}`}>{busy === "pdf" ? "progress_activity" : "picture_as_pdf"}</span>
              {busy === "pdf" ? "Exporting…" : "PDF"}
            </button>
            <button type="button" onClick={() => runExport("xlsx")} disabled={busy !== null || !report}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors disabled:opacity-50">
              <span className={`material-symbols-outlined text-[16px] ${busy === "xlsx" ? "animate-spin" : ""}`}>{busy === "xlsx" ? "progress_activity" : "table_view"}</span>
              {busy === "xlsx" ? "Exporting…" : "Excel"}
            </button>
            {canEdit && (
              <>
                <button type="button" onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  Import
                </button>
                <button type="button" onClick={() => setManageOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high/60 text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-[16px]">tune</span>
                  Manage projects
                </button>
                <button type="button" onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-colors">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add Attrition
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-on-surface-variant/5 p-4 mb-4 flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/8">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Year</span>
          <select aria-label="Year" value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-transparent text-sm font-semibold text-on-surface outline-none">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/8">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Month</span>
          <select aria-label="Month filter" value={monthFilter === "all" ? "all" : String(monthFilter)}
            onChange={(e) => setMonthFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="bg-transparent text-sm font-semibold text-on-surface outline-none">
            <option value="all">All months</option>
            {ATTR_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </div>

        {/* Heat legend — keeps the colour scale in sync with heat() / HEAT_BANDS. */}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/45">Attrition</span>
          {HEAT_BANDS.map((b) => (
            <span key={b.label} title={b.name}
              className="px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums"
              style={{ color: b.color, backgroundColor: heatFill(b) }}>
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : !report ? null : (
        <div className="space-y-6">
          {/* ── KPI strip — year-level context derived from the data ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiTile label="Company YTD attrition" value={fmtPct(report.total.ytdAttr)} pct={report.total.ytdAttr} />
            <KpiTile label="Highest project · Year" value={topProject ? fmtPct(topProject.v) : "—"} sub={topProject?.name} pct={topProject?.v ?? null} />
            <KpiTile label="Projects tracked" value={fmt.int(report.projects.length)} />
          </div>

          {/* ── Table 1: Attr% (project x month) ── */}
          <TableCard title="Attrition %" action={monthFilter !== "all" ? <MonthPill month={monthFilter} /> : undefined}>
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col" className="tbl-th tbl-sticky-0">HC Type</th>
                  {monthCols.map((i) => <th key={i} scope="col" className="tbl-th text-right">{ATTR_MONTHS[i]}</th>)}
                  {showYear && <th scope="col" className="tbl-th text-right border-l border-on-surface-variant/10">Year</th>}
                </tr>
              </thead>
              <tbody>
                {report.projects.length === 0 ? (
                  <tr><td className="tbl-td text-on-surface-variant/50" colSpan={t1Cols}>No projects for {year} yet — add them in “Manage projects”.</td></tr>
                ) : report.projects.map((p) => (
                  <tr key={p.id} className="tbl-tr">
                    <td className="tbl-td tbl-td-strong tbl-sticky-0">{p.name}</td>
                    {monthCols.map((i) => {
                      const h = heat(p.pct[i]);
                      return <td key={i} className="tbl-td tbl-td-num" style={h.style}
                        title={h.band ? `${p.name} · ${ATTR_MONTHS[i]}: ${h.band}` : undefined}>{fmtPct(p.pct[i])}</td>;
                    })}
                    {showYear && (() => {
                      const h = heat(p.pct[12], true);
                      return <td className="tbl-td tbl-td-num font-bold border-l border-on-surface-variant/10" style={h.style}
                        title={h.band ? `${p.name} · Year: ${h.band}` : undefined}>{fmtPct(p.pct[12])}</td>;
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          {/* ── Table 2: Attr Per Level ── */}
          <TableCard title="Attrition Per Level" action={monthFilter !== "all" ? <MonthPill month={monthFilter} /> : undefined}>
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col" className="tbl-th">Level</th>
                  {monthCols.map((i) => <th key={i} scope="col" className="tbl-th text-right">{ATTR_MONTHS[i]}</th>)}
                  {showYear && <th scope="col" className="tbl-th text-right border-l border-on-surface-variant/10">Year</th>}
                </tr>
              </thead>
              <tbody>
                {report.levelMonthly.length === 0 ? (
                  <tr><td className="tbl-td text-on-surface-variant/50" colSpan={t2Cols}>No level figures for {year} yet.</td></tr>
                ) : report.levelMonthly.map((l) => (
                  <tr key={l.level} className="tbl-tr">
                    <td className="tbl-td tbl-td-strong">{l.level}</td>
                    {monthCols.map((i) => {
                      const h = heat(l.pct[i]);
                      return <td key={i} className="tbl-td tbl-td-num" style={h.style}
                        title={h.band ? `${l.level} · ${ATTR_MONTHS[i]}: ${h.band}` : undefined}>{fmtPct(l.pct[i])}</td>;
                    })}
                    {showYear && (() => {
                      const h = heat(l.pct[12], true);
                      return <td className="tbl-td tbl-td-num font-bold border-l border-on-surface-variant/10" style={h.style}
                        title={h.band ? `${l.level} · Year: ${h.band}` : undefined}>{fmtPct(l.pct[12])}</td>;
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          {/* ── Table 3: Attr YTD ── */}
          <TableCard title={`${year} Attrition YTD`} action={canEdit ? (
            <button type="button" onClick={() => setYtdOpen(true)} className="text-xs font-bold text-primary hover:underline">Edit totals</button>
          ) : undefined}>
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col" className="tbl-th">Level</th>
                  <th scope="col" className="tbl-th text-right">HC</th>
                  <th scope="col" className="tbl-th text-right">Out</th>
                  <th scope="col" className="tbl-th text-right">In</th>
                  <th scope="col" className="tbl-th text-right">YTD Attr</th>
                </tr>
              </thead>
              <tbody>
                {report.levelYtd.length === 0 ? (
                  <tr><td className="tbl-td text-on-surface-variant/50" colSpan={5}>No year-to-date totals for {year} yet.</td></tr>
                ) : [...report.levelYtd, report.total].map((v) => {
                  const total = v.level === report.total.level;
                  return (
                    <tr key={v.level} className="tbl-tr">
                      <td className={`tbl-td tbl-td-strong ${total ? "font-black" : ""}`}>{v.level}</td>
                      <td className={`tbl-td tbl-td-num ${total ? "font-bold" : ""}`}>{v.headcount == null ? "" : fmt.int(v.headcount)}</td>
                      <td className={`tbl-td tbl-td-num ${total ? "font-bold" : ""}`}>{v.left == null ? "" : fmt.int(v.left)}</td>
                      <td className={`tbl-td tbl-td-num ${total ? "font-bold" : ""}`}>{v.joined == null ? "" : fmt.int(v.joined)}</td>
                      {(() => {
                        const h = heat(v.ytdAttr, total);
                        return <td className={`tbl-td tbl-td-num ${total ? "font-bold" : ""}`} style={h.style}
                          title={h.band ? `${v.level}: ${h.band}` : undefined}>{fmtPct(v.ytdAttr)}</td>;
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        </div>
      )}

      {addOpen && year !== null && (
        <AddAttritionModal year={year} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); void reload(); }} />
      )}
      {manageOpen && year !== null && (
        <ManageProjectsModal year={year} onClose={() => setManageOpen(false)} onSaved={() => { void reload(); }} />
      )}
      {ytdOpen && year !== null && report && (
        <YtdModal year={year} initial={report.levelYtd} onClose={() => setYtdOpen(false)} onSaved={() => { setYtdOpen(false); void reload(); }} />
      )}
      {importOpen && year !== null && (
        <ImportModal year={year} onClose={() => setImportOpen(false)} onSaved={() => { setImportOpen(false); void reload(); }} />
      )}
    </DashboardLayout>
  );
}

// KPI tile for the year-level summary strip. The big number is tinted by the
// attrition heat scale when a percentage is supplied, so it ties into the table.
function KpiTile({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct?: number | null }) {
  const h = pct !== null && pct !== undefined ? heat(pct, true) : undefined;
  return (
    <div className="prism-surface rounded-2xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/55">{label}</div>
      <div className="mt-0.5 text-2xl font-black tabular-nums text-on-surface" style={h ? { color: h.style?.color } : undefined}>{value}</div>
      <div className="text-xs font-semibold text-on-surface-variant/60 truncate">{sub ?? " "}</div>
    </div>
  );
}

// Pill shown in a table header when the view is narrowed to one month, so the
// collapsed (single-month) layout reads as intentional rather than broken.
function MonthPill({ month }: { month: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/8 text-primary text-[11px] font-bold whitespace-nowrap">
      <span className="material-symbols-outlined text-[13px]">filter_alt</span>
      {ATTR_MONTHS[month]}
    </span>
  );
}

// ── Card wrapper (prism surface, bordered header, headline title) ──
function TableCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="prism-surface rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-on-surface-variant/8">
        <h3 className="text-sm font-bold text-on-surface font-headline whitespace-nowrap">{title}</h3>
        {action}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

// ═══════════════════════════ Add Attrition ═══════════════════════════
interface EditRow { pct: string; hc: string; in: string; out: string; pctTouched: boolean; }
const blankRow = (): EditRow => ({ pct: "", hc: "", in: "", out: "", pctTouched: false });

function AddAttritionModal({ year, onClose, onSaved }: { year: number; onClose: () => void; onSaved: () => void }) {
  const [month, setMonth] = useState<number>(() => Math.min(new Date().getMonth() + 1, 12));
  const [slice, setSlice] = useState<AttrMonthSlice | null>(null);
  const [proj, setProj] = useState<Record<number, EditRow>>({});
  const [lvl, setLvl] = useState<Record<string, EditRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAttritionMonth(year, month)
      .then((s) => {
        setSlice(s);
        const pr: Record<number, EditRow> = {};
        s.projects.forEach((c) => { pr[c.projectId] = { pct: pctInput(c.pct), hc: intInput(c.headcount), in: intInput(c.joined), out: intInput(c.left), pctTouched: c.pct !== null }; });
        setProj(pr);
        const lv: Record<string, EditRow> = {};
        ATTR_LEVELS.forEach((lname) => {
          const c = s.levels.find((x) => x.level === lname);
          lv[lname] = c ? { pct: pctInput(c.pct), hc: intInput(c.headcount), in: intInput(c.joined), out: intInput(c.left), pctTouched: c.pct !== null } : blankRow();
        });
        setLvl(lv);
        setDirty(false);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load month"))
      .finally(() => setLoading(false));
  }, [year, month]);

  // Suggestion: when HC or Out changes and the % wasn't manually set, fill
  // % = Out / HC (the user can still overwrite it).
  function editCount(row: EditRow, field: "hc" | "in" | "out", value: string): EditRow {
    const next = { ...row, [field]: value };
    if (!next.pctTouched && (field === "hc" || field === "out")) {
      const hc = toInt(next.hc); const out = toInt(next.out);
      if (hc && hc > 0 && out !== null) next.pct = `${Math.round((out / hc) * 1000) / 10}`;
    }
    return next;
  }

  function requestClose() { if (dirty) setShowDiscard(true); else onClose(); }
  function guardClose() { if (dirty) { setShowDiscard(true); return false; } return true; }

  async function save() {
    if (!slice) return;
    setSaving(true);
    try {
      const projects: ProjectCellPatch[] = slice.projects.map((c) => {
        const r = proj[c.projectId] ?? blankRow();
        return { projectId: c.projectId, pct: toFrac(r.pct), headcount: toInt(r.hc), joined: toInt(r.in), left: toInt(r.out) };
      });
      const levels: LevelCellPatch[] = ATTR_LEVELS.map((lname) => {
        const r = lvl[lname] ?? blankRow();
        return { level: lname, pct: toFrac(r.pct), headcount: toInt(r.hc), joined: toInt(r.in), left: toInt(r.out) };
      });
      await upsertAttritionMonth(year, month, { projects, levels });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <>
      <Modal open title={`Add / update attrition — ${year}`} onClose={onClose} onBeforeClose={guardClose} width="lg"
        footer={
          <>
            <button type="button" onClick={requestClose} className="px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-high/60">Cancel</button>
            <button type="button" onClick={save} disabled={saving || loading}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-dim disabled:opacity-50">
              {saving ? "Saving…" : "Save month"}
            </button>
          </>
        }>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-high/50 border border-on-surface-variant/8">
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Month</span>
            <select aria-label="Entry month" value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-on-surface outline-none">
              {ATTR_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <span className="text-xs text-on-surface-variant/60">Enter HC / Out / In — the % is suggested and can be overwritten.</span>
        </div>
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-3" />
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 rounded-lg" />)}</div>
        ) : slice && (
          <div className="space-y-4">
            <EntryTable title="Per project" labelCol="Project"
              rows={slice.projects.map((c) => ({ key: c.projectId, label: c.name, sub: c.level ?? "—", row: proj[c.projectId] ?? blankRow() }))}
              onChange={(key, field, value) => { setDirty(true); setProj((m) => ({ ...m, [key as number]: field === "pct" ? { ...(m[key as number] ?? blankRow()), pct: value, pctTouched: true } : editCount(m[key as number] ?? blankRow(), field, value) })); }} />
            <EntryTable title="Per level" labelCol="Level"
              rows={ATTR_LEVELS.map((l) => ({ key: l, label: l, sub: "", row: lvl[l] ?? blankRow() }))}
              onChange={(key, field, value) => { setDirty(true); setLvl((m) => ({ ...m, [key as string]: field === "pct" ? { ...(m[key as string] ?? blankRow()), pct: value, pctTouched: true } : editCount(m[key as string] ?? blankRow(), field, value) })); }} />
          </div>
        )}
      </Modal>
      <ConfirmDialog open={showDiscard} title="Discard unsaved changes?"
        message="Your typed numbers for this month haven’t been saved yet." confirmLabel="Discard"
        onConfirm={() => { setShowDiscard(false); onClose(); }} onCancel={() => setShowDiscard(false)} />
    </>
  );
}

function EntryTable({ title, labelCol, rows, onChange }: {
  title: string; labelCol: string;
  rows: { key: number | string; label: string; sub: string; row: EditRow }[];
  onChange: (key: number | string, field: "pct" | "hc" | "in" | "out", value: string) => void;
}) {
  const cell = "w-16 px-2 py-1 rounded border border-on-surface-variant/20 text-sm text-right tabular-nums focus:border-primary outline-none";
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-1.5">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] font-bold text-on-surface-variant/60">
              <th scope="col" className="text-left py-1 pr-2">{labelCol}</th>
              <th scope="col" className="px-1">HC</th><th scope="col" className="px-1">Out</th><th scope="col" className="px-1">In</th><th scope="col" className="px-1">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, sub, row }) => {
              const suggested = !row.pctTouched && row.pct !== "";
              return (
                <tr key={String(key)} className="border-t border-on-surface-variant/5">
                  <td className="py-1 pr-2 text-sm">
                    <span className="font-semibold text-on-surface">{label}</span>
                    {sub && <span className="ml-2 text-[11px] text-on-surface-variant/50">{sub}</span>}
                  </td>
                  <td className="px-1"><input className={cell} value={row.hc} onChange={(e) => onChange(key, "hc", e.target.value)} inputMode="numeric" aria-label={`${label} headcount`} /></td>
                  <td className="px-1"><input className={cell} value={row.out} onChange={(e) => onChange(key, "out", e.target.value)} inputMode="numeric" aria-label={`${label} left`} /></td>
                  <td className="px-1"><input className={cell} value={row.in} onChange={(e) => onChange(key, "in", e.target.value)} inputMode="numeric" aria-label={`${label} joined`} /></td>
                  <td className="px-1"><input className={`${cell} w-14 ${suggested ? "italic text-on-surface-variant/70" : ""}`} value={row.pct} onChange={(e) => onChange(key, "pct", e.target.value)} inputMode="decimal" aria-label={`${label} attrition percent`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════ Manage projects ═══════════════════════════
// Auto-saves per row (explicit Save / Hide / Delete buttons), so it is exempt
// from the modal dirty-check per the frontend rules. Fetches the FULL list
// (including hidden projects, which the report view omits) so they can be
// brought back.
function ManageProjectsModal({ year, onClose, onSaved }: {
  year: number; onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<AttrProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<string>(ATTR_LEVELS[0]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<AttrProject | null>(null);

  useEffect(() => {
    listAttritionProjects(year)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  }, [year]);

  const setRow = (id: number, patch: Partial<AttrProject>) => setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));

  async function saveRow(r: AttrProject) {
    try { await updateAttritionProject(r.id, { name: r.name, level: r.level }); setError(null); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  }
  async function toggleHidden(r: AttrProject) {
    try { await setAttritionProjectHidden(r.id, !r.hidden); setRow(r.id, { hidden: !r.hidden }); setError(null); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to update visibility"); }
  }
  async function add() {
    if (!newName.trim()) return;
    try {
      const created = await createAttritionProject(year, { name: newName.trim(), level: newLevel });
      setRows((rs) => [...rs, created]); setNewName(""); setError(null); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Add failed"); }
  }
  async function doDelete(r: AttrProject) {
    try { await deleteAttritionProject(r.id); setRows((rs) => rs.filter((x) => x.id !== r.id)); setConfirmDel(null); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); setConfirmDel(null); }
  }

  const inp = "px-2 py-1 rounded border border-on-surface-variant/20 text-sm focus:border-primary outline-none";
  const iconBtn = "p-1.5 rounded-lg shrink-0";
  return (
    <>
      <Modal open title={`Manage projects — ${year}`} onClose={onClose} width="lg"
        footer={<button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-dim">Done</button>}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-3" />
        <p className="text-xs text-on-surface-variant/60 mb-3">Rename, re-level, hide, add or remove projects. Hiding keeps the numbers but removes the project from the report; deleting removes them.</p>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 ${r.hidden ? "opacity-55" : ""}`}>
                <input className={`${inp} flex-1 min-w-0`} value={r.name} aria-label="Project name" onChange={(e) => setRow(r.id, { name: e.target.value })} />
                {r.hidden && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant/60">Hidden</span>}
                <select className={`${inp} shrink-0`} aria-label="Level" value={r.level ?? ""} onChange={(e) => setRow(r.id, { level: e.target.value || null })}>
                  <option value="">—</option>
                  {ATTR_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button type="button" onClick={() => saveRow(r)} className="px-2.5 py-1 rounded-lg bg-surface-container-high/60 text-xs font-bold hover:bg-surface-container-high shrink-0">Save</button>
                <button type="button" onClick={() => toggleHidden(r)} className={`${iconBtn} text-on-surface-variant hover:bg-surface-container-high`} aria-label={r.hidden ? `Show ${r.name}` : `Hide ${r.name}`} title={r.hidden ? "Show in report" : "Hide from report"}>
                  <span className="material-symbols-outlined text-[18px]">{r.hidden ? "visibility" : "visibility_off"}</span>
                </button>
                <button type="button" onClick={() => setConfirmDel(r)} className={`${iconBtn} text-error hover:bg-error/10`} aria-label={`Delete ${r.name}`} title="Delete">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-on-surface-variant/10">
          <input className={`${inp} flex-1 min-w-0`} placeholder="New project name" aria-label="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select className={`${inp} shrink-0`} aria-label="New project level" value={newLevel} onChange={(e) => setNewLevel(e.target.value)}>
            {ATTR_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="button" onClick={add} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dim shrink-0">Add</button>
        </div>
      </Modal>
      <ConfirmDialog open={confirmDel !== null} title="Delete project?"
        message={confirmDel ? `Delete “${confirmDel.name}” and all its attrition numbers for ${year}? This can’t be undone.` : ""}
        confirmLabel="Delete" destructive onConfirm={() => confirmDel && doDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
    </>
  );
}

// ═══════════════════════════ Edit YTD totals ═══════════════════════════
function YtdModal({ year, initial, onClose, onSaved }: {
  year: number; initial: { level: string; headcount: number | null; left: number | null; joined: number | null; ytdAttr: number | null }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<Record<string, EditRow>>(() => {
    const m: Record<string, EditRow> = {};
    ATTR_LEVELS.forEach((l) => {
      const c = initial.find((x) => x.level === l);
      m[l] = c ? { hc: intInput(c.headcount), out: intInput(c.left), in: intInput(c.joined), pct: pctInput(c.ytdAttr), pctTouched: c.ytdAttr !== null } : blankRow();
    });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  function edit(level: string, field: "hc" | "in" | "out" | "pct", value: string) {
    setDirty(true);
    setRows((m) => {
      const cur = m[level] ?? blankRow();
      if (field === "pct") return { ...m, [level]: { ...cur, pct: value, pctTouched: true } };
      const next = { ...cur, [field]: value };
      if (!next.pctTouched && (field === "hc" || field === "out")) {
        const hc = toInt(next.hc); const out = toInt(next.out);
        if (hc && hc > 0 && out !== null) next.pct = `${Math.round((out / hc) * 1000) / 10}`;
      }
      return { ...m, [level]: next };
    });
  }

  function requestClose() { if (dirty) setShowDiscard(true); else onClose(); }
  function guardClose() { if (dirty) { setShowDiscard(true); return false; } return true; }

  async function save() {
    setSaving(true);
    try {
      await upsertAttritionYtd(year, ATTR_LEVELS.map((l) => {
        const r = rows[l] ?? blankRow();
        return { level: l, headcount: toInt(r.hc), left: toInt(r.out), joined: toInt(r.in), ytdAttr: toFrac(r.pct) };
      }));
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); setSaving(false); }
  }

  const cell = "w-20 px-2 py-1 rounded border border-on-surface-variant/20 text-sm text-right tabular-nums focus:border-primary outline-none";
  return (
    <>
      <Modal open title={`${year} Attr YTD — edit totals`} onClose={onClose} onBeforeClose={guardClose} width="md"
        footer={<>
          <button type="button" onClick={requestClose} className="px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-high/60">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-dim disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </>}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-3" />
        <table className="w-full">
          <thead><tr className="text-[11px] font-bold text-on-surface-variant/60"><th scope="col" className="text-left py-1">Level</th><th scope="col">HC</th><th scope="col">Out</th><th scope="col">In</th><th scope="col">YTD %</th></tr></thead>
          <tbody>
            {ATTR_LEVELS.map((l) => {
              const r = rows[l] ?? blankRow();
              const suggested = !r.pctTouched && r.pct !== "";
              return (
                <tr key={l} className="border-t border-on-surface-variant/5">
                  <td className="py-1 text-sm font-semibold">{l}</td>
                  <td className="px-1"><input className={cell} value={r.hc} onChange={(e) => edit(l, "hc", e.target.value)} inputMode="numeric" aria-label={`${l} headcount`} /></td>
                  <td className="px-1"><input className={cell} value={r.out} onChange={(e) => edit(l, "out", e.target.value)} inputMode="numeric" aria-label={`${l} left`} /></td>
                  <td className="px-1"><input className={cell} value={r.in} onChange={(e) => edit(l, "in", e.target.value)} inputMode="numeric" aria-label={`${l} joined`} /></td>
                  <td className="px-1"><input className={`${cell} ${suggested ? "italic text-on-surface-variant/70" : ""}`} value={r.pct} onChange={(e) => edit(l, "pct", e.target.value)} inputMode="decimal" aria-label={`${l} YTD percent`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Modal>
      <ConfirmDialog open={showDiscard} title="Discard unsaved changes?"
        message="Your edits to the YTD totals haven’t been saved yet." confirmLabel="Discard"
        onConfirm={() => { setShowDiscard(false); onClose(); }} onCancel={() => setShowDiscard(false)} />
    </>
  );
}

// ═══════════════════════════ Excel import ═══════════════════════════
// Assisted: selecting a file runs a DRY RUN (preview); "Apply" commits. The
// parser detects the three tables by title, so no manual mapping is needed.
function ImportModal({ year, onClose, onSaved }: { year: number; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttrImportResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "previewing" | "applying">("idle");
  const [error, setError] = useState<string | null>(null);

  async function pick(f: File | null) {
    setFile(f); setPreview(null); setError(null);
    if (!f) return;
    setPhase("previewing");
    try { setPreview(await importAttrition(year, f, false)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read the file"); }
    finally { setPhase("idle"); }
  }
  async function apply() {
    if (!file) return;
    setPhase("applying");
    try { await importAttrition(year, file, true); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Import failed"); setPhase("idle"); }
  }

  return (
    <Modal open title={`Import attrition — ${year}`} onClose={onClose} width="md"
      footer={<>
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-high/60">Cancel</button>
        <button type="button" onClick={apply} disabled={!preview || phase !== "idle" || preview.matchedProjects === 0}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-dim disabled:opacity-50">
          {phase === "applying" ? "Importing…" : "Apply import"}
        </button>
      </>}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-3" />
      <p className="text-xs text-on-surface-variant/60 mb-3">
        Upload the Attrition workbook (.xlsx or .xlsm). The three tables are detected automatically by their titles — projects are matched by name to {year}’s list. Re-importing is safe (it overwrites the same cells).
      </p>
      <label className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Workbook</span>
        <input type="file" accept=".xlsx,.xlsm" aria-label="Attrition workbook"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-primary file:text-white file:text-xs file:font-bold file:cursor-pointer" />
      </label>

      {phase === "previewing" && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 rounded-lg" />)}</div>}

      {preview && (
        <div className="rounded-xl border border-on-surface-variant/10 p-3 space-y-3">
          {/* Coverage: how much of the file we could extract into this year.
              Colour-coded per Amir (explicit override of the no-ad-hoc-colour
              theme rule for this success indicator): green = full extraction,
              amber = partial (≥50%), red = low (<50%). */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className={`text-2xl font-black tabular-nums ${coverageText(preview.coveragePercent)}`}>{preview.coveragePercent}%</span>
              <span className="text-xs text-on-surface-variant/60">
                {fmt.int(preview.matchedProjects)} of {fmt.int(preview.sheetProjects)} file projects extracted
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div className={`h-full rounded-full transition-all ${coverageBar(preview.coveragePercent)}`} style={{ width: `${preview.coveragePercent}%` }} />
            </div>
          </div>
          {/* Per-table extraction status. */}
          <div className="flex flex-wrap gap-2">
            <TableChip ok={preview.tablesFound.attrPct} label={`Attr % · ${fmt.int(preview.matchedProjects)} projects`} />
            <TableChip ok={preview.tablesFound.perLevel} label={`Attr Per Level · ${fmt.int(preview.levelRows)} rows`} />
            <TableChip ok={preview.tablesFound.ytd} label={`Attr YTD · ${fmt.int(preview.ytdRows)} rows`} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm pt-1 border-t border-on-surface-variant/8">
            <Stat label="% cells" value={preview.projectCells} />
            <Stat label="level cells" value={preview.levelCells} />
            <Stat label="skipped" value={preview.unmatchedSheetProjects.length} />
          </div>
          {preview.unmatchedSheetProjects.length > 0 && (
            <Note tone="warn" title={`${preview.unmatchedSheetProjects.length} project(s) in the file aren’t in ${year} — they’ll be skipped`}>
              {preview.unmatchedSheetProjects.join(", ")}. Add or rename them in “Manage projects”, then re-import.
            </Note>
          )}
          {preview.missingFromSheet.length > 0 && (
            <Note tone="info" title={`${preview.missingFromSheet.length} project(s) have no row in the file`}>
              {preview.missingFromSheet.join(", ")}. Their existing numbers stay unchanged.
            </Note>
          )}
          {preview.warnings.map((w, i) => <Note key={i} tone="warn" title={w} />)}
          {preview.matchedProjects === 0 && <Note tone="warn" title="No projects matched — nothing would be imported." />}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="font-bold text-on-surface tabular-nums">{fmt.int(value)}</span>
      <span className="ml-1 text-[11px] text-on-surface-variant/60">{label}</span>
    </div>
  );
}
// Coverage colour bands (Amir 2026-06-14): green = full, amber ≥50%, red <50%.
// Tailwind colour scales used deliberately here — an explicit, user-requested
// exception to the "theme tokens only" rule, like ViewBadge.
function coverageText(pct: number): string {
  return pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-500" : "text-red-600";
}
function coverageBar(pct: number): string {
  return pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
}

// Attrition heat scale (Amir 2026-06-16: "color coding back, make it cool").
// A calm green(low) → amber → red(high) ramp keyed to severity only. Inline
// colours are the sanctioned exception to the theme-token rule — same as
// coverageText/coverageBar / ViewBadge — and inline style also guarantees the
// tint wins over .tbl-td-num's default ink. Low-alpha fills keep the number
// readable (passes AA); 0% is muted, a blank cell stays blank. `emphatic`
// (Year / Total) deepens the fill slightly since it summarises the row.
// Bands: <5% Low · 5–10% Moderate · 10–20% Elevated · 20–35% High · 35%+ Severe.
// Thresholds + fill intensities are tuned here in ONE place — bump an alpha to
// make a band pop more, or shift a heatBand() cutoff to move where a colour
// starts. Fills strengthened 2026-06-16 (Amir: more pop) while staying AA-
// contrast with the dark band text.
const HEAT_BANDS: { label: string; name: string; rgb?: string; alpha: number; color: string }[] = [
  { label: "0%",     name: "No attrition", alpha: 0,    color: "#475569" },
  { label: "<5%",    name: "Low",      rgb: "16 185 129", alpha: 0.16, color: "#047857" },
  { label: "5–10%",  name: "Moderate", rgb: "245 158 11", alpha: 0.22, color: "#b45309" },
  { label: "10–20%", name: "Elevated", rgb: "245 158 11", alpha: 0.32, color: "#92400e" },
  { label: "20–35%", name: "High",     rgb: "239 68 68",  alpha: 0.34, color: "#b91c1c" },
  { label: "35%+",   name: "Severe",   rgb: "239 68 68",  alpha: 0.48, color: "#991b1b" },
];
function heatBand(pct: number): number {
  if (pct <= 0) return 0;
  if (pct < 0.05) return 1;
  if (pct < 0.10) return 2;
  if (pct < 0.20) return 3;
  if (pct < 0.35) return 4;
  return 5;
}
function heatFill(b: { rgb?: string; alpha: number }, emphatic = false): string | undefined {
  return b.rgb ? `rgb(${b.rgb} / ${Math.min(0.5, b.alpha * (emphatic ? 1.3 : 1))})` : undefined;
}
function heat(pct: number | null | undefined, emphatic = false): { style?: React.CSSProperties; band: string } {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return { band: "" };
  const b = HEAT_BANDS[heatBand(pct)];
  const style: React.CSSProperties = { color: b.color, backgroundColor: heatFill(b, emphatic) };
  if (b.name === "Severe") style.fontWeight = 700;
  return { style, band: b.name };
}
function TableChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${ok ? "bg-primary/8 text-primary" : "bg-error/8 text-error"}`}>
      <span className="material-symbols-outlined text-[15px]">{ok ? "check_circle" : "cancel"}</span>
      {label}
    </span>
  );
}
function Note({ tone, title, children }: { tone: "warn" | "info"; title: string; children?: React.ReactNode }) {
  const cls = tone === "warn" ? "bg-error/6 border-error/20 text-error" : "bg-primary/6 border-primary/20 text-on-surface-variant";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-0.5 opacity-80">{children}</p>}
    </div>
  );
}
