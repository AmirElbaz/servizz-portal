import { useEffect, useState, type ReactNode } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import ErrorBanner from "../../components/admin/ErrorBanner";
import { useAuth, roleAtLeast, type AccessRole } from "../../services/auth";
import {
  fetchAccessRequests,
  approveAccessRequest,
  listPolicies,
  type AccessRequestRow,
  type AdminPolicyListItem,
} from "../../services/admin";

const ROLE_OPTIONS: { value: AccessRole; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "centrecom_user", label: "Centrecom user" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super admin" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminRequestsPage() {
  const { user } = useAuth();
  // Only super admins can grant admin / super-admin (server enforces it too).
  const canGrantAdmin = roleAtLeast(user?.role, "super_admin");
  const roleChoices = ROLE_OPTIONS.filter(
    (r) => canGrantAdmin || (r.value !== "admin" && r.value !== "super_admin"),
  );

  const [rows, setRows] = useState<AccessRequestRow[] | null>(null);
  const [policies, setPolicies] = useState<AdminPolicyListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [approving, setApproving] = useState<AccessRequestRow | null>(null);
  const [role, setRole] = useState<AccessRole>("client");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      const [r, p] = await Promise.all([fetchAccessRequests(), listPolicies()]);
      setRows(r);
      setPolicies(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load access requests");
    }
  }
  useEffect(() => { reload(); }, []);

  function openApprove(row: AccessRequestRow) {
    setApproving(row);
    setRole("client");
    setSelected(new Set());
    setActionError(null);
  }

  async function doApprove() {
    if (!approving) return;
    setSaving(true);
    setActionError(null);
    try {
      await approveAccessRequest(approving.id, role, [...selected]);
      setApproving(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not approve the request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-extrabold font-headline text-on-surface tracking-tight">Access requests</h1>
        <p className="text-sm text-on-surface-variant/60 mt-0.5">
          People who requested access. Approving a request assigns a role and policies — that's what actually lets them in.
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low/60">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
              <th className="px-5 py-3 w-[12%]">Request</th>
              <th className="px-5 py-3 w-[26%]">Email</th>
              <th className="px-5 py-3 w-[20%]">Name</th>
              <th className="px-5 py-3 w-[16%]">Status</th>
              <th className="px-5 py-3 w-[14%]">Requested</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-on-surface-variant/8">
            {rows === null ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant/50">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant/50">No pending access requests.</td></tr>
            ) : (
              rows.map((r) => {
                const ready = r.signupStatus === "pending_approval";
                return (
                  <tr key={r.id} className="hover:bg-surface-container-low/40">
                    <td className="px-5 py-3 font-black tabular-nums text-primary">{r.requestNumber ?? "—"}</td>
                    <td className="px-5 py-3 text-on-surface truncate" title={r.email ?? ""}>{r.email ?? "—"}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{r.fullName ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        ready ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700"
                      }`}>
                        {ready ? "Ready to approve" : "Awaiting registration"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant/70 text-xs">{fmtDate(r.requestedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openApprove(r)}
                        disabled={!ready}
                        title={ready ? undefined : "User hasn't finished registering yet"}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Approve
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {approving && (
        <Overlay onClose={() => setApproving(null)}>
          <h2 className="text-lg font-extrabold text-on-surface mb-1">Approve {approving.fullName || approving.email}</h2>
          <p className="text-xs text-on-surface-variant/55 mb-4">Assign a role and the policies that grant their data access.</p>

          <label className="block mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AccessRole)}
              className="w-full h-[38px] px-3 bg-surface-container-high/50 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary"
            >
              {roleChoices.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>

          <div className="mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">Policies</span>
            {policies.length === 0 ? (
              <p className="text-xs text-on-surface-variant/50">No policies defined yet.</p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-xl border border-on-surface-variant/10 divide-y divide-on-surface-variant/8">
                {policies.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-container-low/50">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id); else next.delete(p.id);
                        return next;
                      })}
                    />
                    <span className="text-sm text-on-surface">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[11px] text-on-surface-variant/45 mt-1.5">
              Centrecom staff see all data unscoped — policies are mainly for client users.
            </p>
          </div>

          {actionError && <p className="text-xs text-error mb-3">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setApproving(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Cancel</button>
            <button onClick={doApprove} disabled={saving} className="btn-brand px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
              {saving ? "Approving…" : "Approve & grant"}
            </button>
          </div>
        </Overlay>
      )}
    </AdminLayout>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">{children}</div>
    </div>
  );
}
