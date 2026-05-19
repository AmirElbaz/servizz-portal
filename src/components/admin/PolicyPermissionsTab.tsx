// Permissions tab for the Policy Editor.
// Renders a verb-by-report-type grid per module so admins choose what a
// policy lets users do without seeing raw codes, kinds, or wildcards.

import { useEffect, useMemo, useState } from "react";
import Skeleton from "./Skeleton";
import {
  addPolicyGrant,
  listGrantScopes,
  listPermissionCatalog,
  listPolicyGrants,
  removePolicyGrant,
  type GrantScopes,
  type PermissionCatalogEntry,
  type PolicyGrant,
  type ScopeOptionGroup,
  type ScopeOptionModule,
} from "../../services/adminPermissions";

interface Props {
  policyId: number;
}

// The four user-facing verbs in column order. View covers browsing AND
// downloading bytes. Replace overwrites the bytes of an existing row in
// place. Delete soft-removes a file. Module-management verbs (admin) sit
// in their own section below the grid.
const VERBS = ["view", "upload", "replace", "delete"] as const;
type Verb = (typeof VERBS)[number];

const VERB_LABEL: Record<Verb, string> = {
  view: "View",
  upload: "Upload",
  replace: "Replace",
  delete: "Delete",
};

const VERB_ICON: Record<Verb, string> = {
  view: "visibility",
  upload: "upload",
  replace: "swap_horiz",
  delete: "delete",
};

// Map a category string to the module code that hosts its groups.
// `bdf` -> `bdf-reports`. Anything else: try direct match, else fall back to
// the category itself.
function moduleCodeForCategory(
  category: string,
  modules: ScopeOptionModule[],
): string | null {
  if (category === "bdf") return "bdf-reports";
  const direct = modules.find((m) => m.code === category);
  if (direct) return direct.code;
  const stem = modules.find((m) => m.code.startsWith(`${category}-`));
  return stem ? stem.code : null;
}

// Build a stable lookup for grants: "code|kind|id" -> grant row.
function indexGrants(grants: PolicyGrant[]): Map<string, PolicyGrant> {
  const m = new Map<string, PolicyGrant>();
  for (const g of grants) {
    m.set(`${g.permissionCode}|${g.resourceKind}|${g.resourceId}`, g);
  }
  return m;
}

interface ModuleSection {
  category: string;
  prefix: string;
  module: ScopeOptionModule;
  // After migration 028 each dept owns its own groups. Each section now
  // pairs a module with a single department; if the same module is hosted
  // by multiple depts, we render one section per (module, dept) so admins
  // pick grants under the dept they mean.
  departmentCode: string;
  departmentName: string;
  groups: ScopeOptionGroup[];
  // Verbs actually present in the catalog for this prefix. We expect the
  // 3 codes after migration 025 (view / upload / admin), but if some are
  // missing we just hide those columns rather than rendering broken checkboxes.
  availableVerbs: Verb[];
  hasAdmin: boolean;
}

export default function PolicyPermissionsTab({ policyId }: Props) {
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[] | null>(null);
  const [scopes, setScopes] = useState<GrantScopes | null>(null);
  const [grants, setGrants] = useState<PolicyGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cells currently in flight — keyed the same way as `indexGrants` so we
  // can both spinner-the-cell and prevent double-clicks.
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listPermissionCatalog(),
      listGrantScopes(),
      listPolicyGrants(policyId),
    ])
      .then(([cat, scs, grs]) => {
        if (cancelled) return;
        setCatalog(cat);
        setScopes(scs);
        setGrants(grs);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load permissions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [policyId]);

  // Build one section per module that actually has at least one of our 5
  // verbs in the catalog AND a corresponding module entry in scopes.
  const sections = useMemo<ModuleSection[]>(() => {
    if (!catalog || !scopes) return [];
    const byCategory = new Map<string, PermissionCatalogEntry[]>();
    for (const c of catalog) {
      const list = byCategory.get(c.category) ?? [];
      list.push(c);
      byCategory.set(c.category, list);
    }

    const out: ModuleSection[] = [];
    for (const [category, entries] of byCategory) {
      const codes = new Set(entries.map((e) => e.code));
      const prefix = category;
      const availableVerbs = VERBS.filter((v) => codes.has(`${prefix}:${v}`));
      const hasAdmin = codes.has(`${prefix}:admin`);
      if (availableVerbs.length === 0 && !hasAdmin) continue;

      const moduleCode = moduleCodeForCategory(category, scopes.modules);
      if (!moduleCode) continue;
      const module = scopes.modules.find((m) => m.code === moduleCode);
      if (!module) continue;

      // Bucket the module's groups by department so each (module, dept)
      // pair becomes its own section. Departments without groups in this
      // module still show a section IF the catalog has admin grants on it,
      // so admins can grant module-wide admin without first creating a group.
      const groupsByDept = new Map<string, { name: string; groups: ScopeOptionGroup[] }>();
      for (const g of scopes.groups) {
        if (g.moduleCode !== moduleCode) continue;
        const bucket = groupsByDept.get(g.departmentCode);
        if (bucket) {
          bucket.groups.push(g);
        } else {
          groupsByDept.set(g.departmentCode, { name: g.departmentName, groups: [g] });
        }
      }

      for (const [departmentCode, { name: departmentName, groups }] of groupsByDept) {
        groups.sort((a, b) => a.name.localeCompare(b.name));
        out.push({
          category, prefix, module,
          departmentCode, departmentName,
          groups, availableVerbs, hasAdmin,
        });
      }
    }
    out.sort((a, b) =>
      a.module.name.localeCompare(b.module.name) ||
      a.departmentName.localeCompare(b.departmentName));
    return out;
  }, [catalog, scopes]);

  const grantIndex = useMemo(() => indexGrants(grants), [grants]);

  function keyFor(code: string, kind: string, id: string): string {
    return `${code}|${kind}|${id}`;
  }

  // Toggle a single (permission, scope) cell. Optimistic — we update state
  // immediately and roll back on error.
  async function toggleCell(
    permissionCode: string,
    resourceKind: string,
    resourceId: string,
  ): Promise<void> {
    const k = keyFor(permissionCode, resourceKind, resourceId);
    if (pending.has(k)) return;
    const existing = grantIndex.get(k);

    setPending((prev) => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
    setError(null);

    if (existing) {
      // Optimistic remove.
      const snapshot = grants;
      setGrants((prev) => prev.filter((g) => g.id !== existing.id));
      try {
        await removePolicyGrant(policyId, existing.id);
      } catch (e) {
        setGrants(snapshot);
        setError(e instanceof Error ? e.message : "Failed to remove grant");
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
    } else {
      // Optimistic add. We don't have a real id yet; use a temp negative
      // value so the row renders as checked. Once the server returns we
      // refetch this policy's grants to pick up the real id.
      const tempId = -Date.now();
      const optimistic: PolicyGrant = {
        id: tempId,
        permissionCode,
        permissionDescription: "",
        permissionCategory: permissionCode.split(":")[0] ?? "",
        resourceKind,
        resourceId,
        createdAt: new Date().toISOString(),
      };
      setGrants((prev) => [...prev, optimistic]);
      try {
        const { id } = await addPolicyGrant(policyId, {
          permissionCode,
          resourceKind,
          resourceId,
        });
        setGrants((prev) =>
          prev.map((g) => (g.id === tempId ? { ...g, id } : g)),
        );
      } catch (e) {
        setGrants((prev) => prev.filter((g) => g.id !== tempId));
        setError(e instanceof Error ? e.message : "Failed to add grant");
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
    }
  }

  // Bulk-apply: for each (code, kind, id) tuple, ensure it matches `target`.
  // Skips ones already in the desired state and runs the rest sequentially
  // so the UI stays consistent if one fails midway.
  async function bulkApply(
    cells: Array<{ code: string; kind: string; id: string }>,
    target: boolean,
  ): Promise<void> {
    for (const c of cells) {
      const k = keyFor(c.code, c.kind, c.id);
      const has = grantIndex.has(k);
      if (has === target) continue;
      // Sequential — toggleCell mutates state, and parallel calls would
      // race the optimistic updates.
      // eslint-disable-next-line no-await-in-loop
      await toggleCell(c.code, c.kind, c.id);
    }
  }

  function cellsForRow(section: ModuleSection, group: ScopeOptionGroup) {
    return section.availableVerbs.map((v) => ({
      code: `${section.prefix}:${v}`,
      kind: "group",
      id: group.id.toString(),
    }));
  }

  function cellsForColumn(section: ModuleSection, verb: Verb) {
    return section.groups.map((g) => ({
      code: `${section.prefix}:${verb}`,
      kind: "group",
      id: g.id.toString(),
    }));
  }

  function cellsForSection(section: ModuleSection) {
    const out: Array<{ code: string; kind: string; id: string }> = [];
    for (const g of section.groups) {
      for (const v of section.availableVerbs) {
        out.push({
          code: `${section.prefix}:${v}`,
          kind: "group",
          id: g.id.toString(),
        });
      }
    }
    if (section.hasAdmin) {
      out.push({
        code: `${section.prefix}:admin`,
        kind: "module",
        id: section.module.code,
      });
    }
    return out;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
          <div className="flex items-center justify-between mb-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-7 w-32 rounded-xl" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
        <h3 className="text-base font-bold text-on-surface">Permissions</h3>
        <p className="text-xs text-on-surface-variant/70 mt-0.5">
          Choose what users on this policy can do for each report type. Click a
          column header to toggle every row, or a row label to toggle every
          column.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/50 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <p className="font-bold mb-1">Something went wrong</p>
          <p className="text-[12px] text-rose-600/80">{error}</p>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center">
          <span className="material-symbols-outlined block text-[40px] text-on-surface-variant/30 mb-2">
            lock
          </span>
          <p className="text-sm text-on-surface-variant/60">
            No permission-aware modules are configured yet. Once a module
            exposes report-type permissions, they appear here.
          </p>
        </div>
      ) : (
        sections.map((section) => (
          <ModuleSectionCard
            key={`${section.module.code}|${section.departmentCode}`}
            section={section}
            grantIndex={grantIndex}
            pending={pending}
            onToggleCell={toggleCell}
            onBulkApply={bulkApply}
            cellsForRow={cellsForRow}
            cellsForColumn={cellsForColumn}
            cellsForSection={cellsForSection}
          />
        ))
      )}
    </div>
  );
}

// ─── One module's grid ────────────────────────────────────────────────────

interface ModuleSectionCardProps {
  section: ModuleSection;
  grantIndex: Map<string, PolicyGrant>;
  pending: Set<string>;
  onToggleCell: (code: string, kind: string, id: string) => Promise<void>;
  onBulkApply: (
    cells: Array<{ code: string; kind: string; id: string }>,
    target: boolean,
  ) => Promise<void>;
  cellsForRow: (
    section: ModuleSection,
    group: ScopeOptionGroup,
  ) => Array<{ code: string; kind: string; id: string }>;
  cellsForColumn: (
    section: ModuleSection,
    verb: Verb,
  ) => Array<{ code: string; kind: string; id: string }>;
  cellsForSection: (
    section: ModuleSection,
  ) => Array<{ code: string; kind: string; id: string }>;
}

function ModuleSectionCard({
  section,
  grantIndex,
  pending,
  onToggleCell,
  onBulkApply,
  cellsForRow,
  cellsForColumn,
  cellsForSection,
}: ModuleSectionCardProps) {
  function isOn(code: string, kind: string, id: string): boolean {
    return grantIndex.has(`${code}|${kind}|${id}`);
  }

  function isPending(code: string, kind: string, id: string): boolean {
    return pending.has(`${code}|${kind}|${id}`);
  }

  const adminCellOn = section.hasAdmin
    ? isOn(`${section.prefix}:admin`, "module", section.module.code)
    : false;
  const adminCellPending = section.hasAdmin
    ? isPending(`${section.prefix}:admin`, "module", section.module.code)
    : false;

  // Section is "everything" granted iff every verb-cell across every group
  // is on AND admin is on (or admin verb doesn't exist).
  const allCells = cellsForSection(section);
  const allGranted =
    allCells.length > 0 && allCells.every((c) => isOn(c.code, c.kind, c.id));

  async function handleGrantEverything() {
    await onBulkApply(allCells, !allGranted);
  }

  async function handleColumnHeaderClick(verb: Verb) {
    const cells = cellsForColumn(section, verb);
    const everyOn = cells.every((c) => isOn(c.code, c.kind, c.id));
    await onBulkApply(cells, !everyOn);
  }

  async function handleRowLabelClick(group: ScopeOptionGroup) {
    const cells = cellsForRow(section, group);
    const everyOn = cells.every((c) => isOn(c.code, c.kind, c.id));
    await onBulkApply(cells, !everyOn);
  }

  return (
    <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-[18px] text-primary">
              folder_managed
            </span>
            <h4 className="text-base font-bold text-on-surface font-headline truncate">
              {section.module.name}
            </h4>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary"
              title={`Department · ${section.departmentName}`}
            >
              <span className="material-symbols-outlined text-[12px]">domain</span>
              {section.departmentCode}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant/70 mt-0.5">
            What users on this policy can do for each report type in
            {" "}<span className="font-semibold">{section.departmentName}</span>'s
            {" "}{section.module.name}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGrantEverything}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
            allGranted
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-white border-on-surface-variant/15 text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {allGranted ? "remove_done" : "done_all"}
          </span>
          {allGranted ? "Revoke everything" : "Grant everything"}
        </button>
      </div>

      {section.groups.length === 0 ? (
        <p className="text-sm text-on-surface-variant/60 italic">
          No report types configured in this module yet.
        </p>
      ) : (
        <div className="rounded-xl border border-on-surface-variant/10 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-high/40">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                  Report type
                </th>
                {section.availableVerbs.map((v) => (
                  <th
                    key={v}
                    className="px-2 py-3 text-center"
                    style={{ width: 110 }}
                  >
                    <button
                      type="button"
                      onClick={() => handleColumnHeaderClick(v)}
                      title={`Toggle ${VERB_LABEL[v]} for every report type`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70 hover:bg-primary/8 hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {VERB_ICON[v]}
                      </span>
                      {VERB_LABEL[v]}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.groups.map((group, idx) => (
                <tr
                  key={group.id}
                  className={`hover:bg-surface-container-low/40 transition-colors ${
                    idx > 0 ? "border-t border-on-surface-variant/8" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleRowLabelClick(group)}
                      title={`Toggle every column for ${group.name}`}
                      className="text-sm font-semibold text-on-surface text-left hover:text-primary transition-colors"
                    >
                      {group.name}
                    </button>
                  </td>
                  {section.availableVerbs.map((v) => {
                    const code = `${section.prefix}:${v}`;
                    const id = group.id.toString();
                    const on = isOn(code, "group", id);
                    const busy = isPending(code, "group", id);
                    return (
                      <td key={v} className="px-2 py-2.5 text-center">
                        <CheckCell
                          checked={on}
                          busy={busy}
                          onChange={() => onToggleCell(code, "group", id)}
                          ariaLabel={`${VERB_LABEL[v]} ${group.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.hasAdmin && (
        <div className="mt-4 rounded-xl border border-dashed border-on-surface-variant/15 bg-surface-container-low/40 px-4 py-3 flex items-center gap-3">
          <CheckCell
            checked={adminCellOn}
            busy={adminCellPending}
            onChange={() =>
              onToggleCell(
                `${section.prefix}:admin`,
                "module",
                section.module.code,
              )
            }
            ariaLabel={`Manage report types in ${section.module.name}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-on-surface">
              Manage report types in this module
            </p>
            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
              Admin verb. Lets the user create, rename, and remove report types
              inside {section.module.name} — across every department that hosts
              it. Most users do not need this.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single check cell ────────────────────────────────────────────────────

interface CheckCellProps {
  checked: boolean;
  busy: boolean;
  onChange: () => void;
  ariaLabel: string;
}

function CheckCell({ checked, busy, onChange, ariaLabel }: CheckCellProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={busy}
      onClick={onChange}
      className={`relative inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all ${
        checked
          ? "bg-primary border-primary text-white shadow-sm"
          : "bg-white border-on-surface-variant/25 hover:border-primary/40 hover:bg-primary/5"
      } ${busy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      {busy ? (
        <span className="material-symbols-outlined text-[16px] animate-spin">
          progress_activity
        </span>
      ) : checked ? (
        <span
          className="material-symbols-outlined text-[18px]"
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}
        >
          check
        </span>
      ) : null}
    </button>
  );
}
