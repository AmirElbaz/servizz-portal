import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../services/auth";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Modal from "../../components/admin/Modal";
import SaveButton from "../../components/admin/SaveButton";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton, { SkeletonTableRow } from "../../components/admin/Skeleton";
import Paginator from "../../components/ui/Paginator";
import {
  listUsers,
  setUserAdmin,
  setUserPolicies,
  listPolicies,
  inviteUser,
  type AdminUser,
  type AdminPolicyListItem,
} from "../../services/admin";
import RequiredMark from "../../components/admin/RequiredMark";

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [policies, setPolicies] = useState<AdminPolicyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Invite-user modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Used by both the desktop table and the mobile card list to decide
  // whether the admin-toggle button should be disabled for a given user.
  //
  //   - You can never demote yourself (the loaded-out admin problem).
  //   - You can never demote the last remaining admin (even a different
  //     user). If we ever let this happen, the deployment has zero admins
  //     and there's no UI path back — only a DB row update.
  //
  // The backend enforces the same two rules, so a crafted PATCH request is
  // blocked regardless. These checks just make the UI state honest.
  const adminCount = useMemo(() => users.filter((u) => u.isAdmin).length, [users]);

  function toggleDisabledReason(u: AdminUser): string | null {
    if (currentUser && u.id === currentUser.id) {
      return "You cannot remove your own admin access. Ask another administrator to do it for you.";
    }
    if (u.isAdmin && adminCount === 1) {
      return "At least one administrator must remain. Promote another user to admin first.";
    }
    return null;
  }

  async function reload() {
    try {
      setLoading(true);
      const [u, p] = await Promise.all([listUsers(), listPolicies()]);
      setUsers(u);
      setPolicies(p);
      setError(null);
      // Clamp current page in case the list shrank below our current offset.
      const maxPage = Math.max(1, Math.ceil(u.length / pageSize));
      if (currentPage > maxPage) setCurrentPage(maxPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  // Slice the full user list for the current page. Cheap — we already have
  // every row client-side from listUsers(). If the user count grows past a
  // few thousand, move this to server-side pagination.
  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, currentPage, pageSize]);

  // Called by the "Sync users" SaveButton in the page header. Forces an
  // immediate pull from the source DB on top of the hourly background tick.
  // On success, shows a success banner with insert/update counts and
  // reloads the list so any new rows appear.
  function openInviteModal() {
    setInviteEmail("");
    setInviteError(null);
    setInviteOpen(true);
  }

  async function runInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Email is required.");
      throw new Error("validation");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError("Please enter a valid email address.");
      throw new Error("validation");
    }
    setInviteError(null);
    await inviteUser(email);
    setInviteMessage(
      `Invitation email sent to ${email}. They'll receive a temporary password to complete their sign-up.`
    );
    setInviteOpen(false);
    await reload();
  }

  useEffect(() => {
    reload();
  }, []);

  async function toggleAdmin(user: AdminUser) {
    // Defense-in-depth: the buttons are already disabled, but we also refuse
    // to fire the request if something slipped through (e.g., keyboard Enter
    // on a stale focus state).
    if (toggleDisabledReason(user)) return;
    try {
      await setUserAdmin(user.id, !user.isAdmin);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isAdmin: !u.isAdmin } : u))
      );
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  function openPolicyEditor(user: AdminUser) {
    setEditing(user);
    setSelectedIds(new Set(user.policies.map((p) => p.id)));
    setModalError(null);
  }

  async function savePolicies() {
    if (!editing) return;
    await setUserPolicies(editing.id, Array.from(selectedIds));
    await reload();
    // Small delay so the SaveButton's emerald "Saved" flash is visible before close.
    setTimeout(() => setEditing(null), 900);
  }

  function togglePolicy(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Users"
        description="Manage user access. Invite new users by email, toggle the admin flag, or attach policies that grant read access to projects, departments, reports, and columns."
        action={
          <button
            type="button"
            onClick={openInviteModal}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dim text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Add user
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      <ErrorBanner
        message={inviteMessage}
        onDismiss={() => setInviteMessage(null)}
        tone="success"
      />

      <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 overflow-hidden">
        {loading ? (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low/60">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    <th className="px-6 py-3">Username</th>
                    <th className="px-6 py-3">Full Name</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Admin</th>
                    <th className="px-6 py-3">Policies</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface-variant/8">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow
                      key={i}
                      widths={["w-24", "w-32", "w-40", "w-16", "w-28", "w-20"]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-on-surface-variant/8">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="p-4">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24 mb-3" />
                  <Skeleton className="h-8 w-full rounded-lg" />
                </li>
              ))}
            </ul>
          </>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-on-surface-variant/60 text-sm">No users found.</div>
        ) : (
          <>
            {/* ── Desktop / tablet: full table ── */}
            {/* table-fixed + explicit widths on each column keeps long emails
                from pushing the action column off-screen. The email cell uses
                truncate + title so the full value still shows on hover. */}
            <div className="hidden md:block">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-surface-container-low/60">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    <th className="px-6 py-3 w-[14%]">Username</th>
                    <th className="px-6 py-3 w-[18%]">Full Name</th>
                    <th className="px-6 py-3 w-[22%]">Email</th>
                    <th className="px-6 py-3 w-[12%]">Admin</th>
                    <th className="px-6 py-3 w-[20%]">Policies</th>
                    <th className="px-6 py-3 w-[14%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface-variant/8">
                  {pagedUsers.map((u) => {
                    const disabledReason = toggleDisabledReason(u);
                    const isSelf = currentUser?.id === u.id;
                    return (
                    <tr key={u.id} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-on-surface truncate" title={u.username}>
                        {u.username}
                        {isSelf && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-primary/70">
                            (you)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant truncate" title={u.fullName ?? ""}>
                        {u.fullName ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant truncate" title={u.email ?? ""}>
                        {u.email ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleAdmin(u)}
                          disabled={!!disabledReason}
                          title={disabledReason ?? undefined}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                            disabledReason ? "opacity-50 cursor-not-allowed" : ""
                          } ${
                            u.isAdmin
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "bg-surface-container-high text-on-surface-variant/70 border border-on-surface-variant/10 hover:bg-surface-container-highest"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {u.isAdmin ? "check_circle" : "radio_button_unchecked"}
                          </span>
                          {u.isAdmin ? "Admin" : "Standard"}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        {u.policies.length === 0 ? (
                          <span className="text-on-surface-variant/40 text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.policies.slice(0, 3).map((p) => (
                              <span
                                key={p.id}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/8 text-primary"
                              >
                                {p.name}
                              </span>
                            ))}
                            {u.policies.length > 3 && (
                              <span className="text-[10px] text-on-surface-variant/50 font-medium">
                                +{u.policies.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openPolicyEditor(u)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                        >
                          Edit policies
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile: stacked card list ── */}
            <ul className="md:hidden divide-y divide-on-surface-variant/8">
              {pagedUsers.map((u) => {
                const disabledReason = toggleDisabledReason(u);
                const isSelf = currentUser?.id === u.id;
                return (
                <li key={u.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-sm text-on-surface truncate">
                        {u.fullName || u.username}
                        {isSelf && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-primary/70">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] font-semibold text-on-surface-variant/70 uppercase tracking-wider mt-0.5">
                        {u.username}
                      </p>
                      {u.email && (
                        <p className="text-[11px] text-on-surface-variant/60 truncate mt-0.5">
                          {u.email}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={!!disabledReason}
                      title={disabledReason ?? undefined}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                        disabledReason ? "opacity-50 cursor-not-allowed" : ""
                      } ${
                        u.isAdmin
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-surface-container-high text-on-surface-variant/70 border border-on-surface-variant/10"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        {u.isAdmin ? "check_circle" : "radio_button_unchecked"}
                      </span>
                      {u.isAdmin ? "Admin" : "Standard"}
                    </button>
                  </div>
                  {u.policies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {u.policies.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/8 text-primary"
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => openPolicyEditor(u)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                  >
                    Edit policies
                  </button>
                </li>
                );
              })}
            </ul>
          </>
        )}
        {!loading && users.length > 0 && (
          <div className="border-t border-on-surface-variant/8 px-4 py-4">
            <Paginator
              totalItems={users.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing ? `Policies for ${editing.username}` : ""}
        onClose={() => setEditing(null)}
        width="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              onSave={savePolicies}
              size="sm"
              onError={(err) => setModalError(err.message)}
            >
              Save
            </SaveButton>
          </>
        }
      >
        <ErrorBanner message={modalError} onDismiss={() => setModalError(null)} />
        {policies.length === 0 ? (
          <p className="text-sm text-on-surface-variant/60 text-center py-4">
            No policies exist yet. Create one on the Policies page first.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {policies.map((p) => {
              const checked = selectedIds.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                    checked
                      ? "bg-primary/5 border-primary/25"
                      : "bg-surface-container-low/40 border-on-surface-variant/8 hover:bg-surface-container-low/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePolicy(p.id)}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-on-surface">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-on-surface-variant/70 mt-0.5">{p.description}</p>
                    )}
                    <p className="text-[10px] text-on-surface-variant/40 mt-1 uppercase tracking-wider">
                      {p.code}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── Invite new user modal ── */}
      <Modal
        open={inviteOpen}
        title="Invite new user"
        onClose={() => setInviteOpen(false)}
        width="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <SaveButton
              onSave={runInvite}
              size="sm"
              onError={(err) => setInviteError(err.message)}
            >
              Send invitation
            </SaveButton>
          </>
        }
      >
        <ErrorBanner
          message={inviteError}
          onDismiss={() => setInviteError(null)}
        />
        <p className="text-sm text-on-surface-variant/70 mb-4">
          Enter the new user's email address. We'll generate a temporary
          password and email it to them. They'll choose a permanent password
          when they sign in for the first time.
        </p>
        <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
          Email <RequiredMark />
        </label>
        <input
          type="email"
          autoFocus
          value={inviteEmail}
          onChange={(e) => {
            setInviteEmail(e.target.value);
            if (inviteError) setInviteError(null);
          }}
          placeholder="name@centrecom.eu"
          className={`w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border text-on-surface text-sm focus:outline-none focus:bg-white transition-all ${
            inviteError
              ? "border-error/50 focus:border-error/60"
              : "border-on-surface-variant/8 focus:border-primary/30"
          }`}
        />
      </Modal>
    </AdminLayout>
  );
}
