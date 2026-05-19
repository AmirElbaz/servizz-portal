import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../services/auth";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import Modal from "../../components/admin/Modal";
import SaveButton from "../../components/admin/SaveButton";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import ErrorBanner from "../../components/admin/ErrorBanner";
import Skeleton, { SkeletonTableRow } from "../../components/admin/Skeleton";
import Paginator from "../../components/ui/Paginator";
import {
  listUsers,
  setUserAdmin,
  setUserPolicies,
  listPolicies,
  inviteUser,
  inviteUsersBatch,
  resetUserTempPassword,
  cancelUserInvite,
  type AdminUser,
  type AdminPolicyListItem,
  type BatchInviteRow,
  type InviteUserInput,
  type SignupStatus,
} from "../../services/admin";
import RequiredMark from "../../components/admin/RequiredMark";

// One issued credential payload — surfaced to the admin once after an
// invite or temp-password reset. Plain temp passwords never get stored
// (only the bcrypt hash on the server), so this is the admin's only
// chance to capture them.
interface IssuedCredential {
  username: string;
  tempPassword: string;
}

// Username validation mirrors the backend regex exactly (CLAUDE.md says
// keep server as source of truth, but failing fast client-side is good UX).
const USERNAME_RE = /^[A-Za-z0-9._-]{3,64}$/;

const BATCH_MAX_ROWS = 100;

// Default-shape rows for the batch-invite list — opens with N empty rows so
// the form reads as "fill these in" instead of an empty area with one row.
function makeEmptyBatchRows(count: number): InviteUserInput[] {
  return Array.from({ length: count }, () => ({ username: "", firstName: "", lastName: "" }));
}

function isBatchRowBlank(row: InviteUserInput): boolean {
  return !row.username.trim() && !row.firstName.trim() && !row.lastName.trim();
}

// Pretty labels for the signup_status enum. 'active' is the steady state
// and doesn't need a chip; 'invited' / 'email_pending' are the actionable
// ones the admin cares about.
function statusChipProps(status: SignupStatus): { label: string; icon: string; tone: string } | null {
  switch (status) {
    case "invited":
      return {
        label: "Invited",
        icon: "schedule",
        tone: "bg-amber-50 text-amber-700 border border-amber-200/70",
      };
    case "email_pending":
      return {
        label: "Verifying email",
        icon: "mark_email_unread",
        tone: "bg-primary/8 text-primary border border-primary/20",
      };
    case "active":
    default:
      return null;
  }
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [policies, setPolicies] = useState<AdminPolicyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Policy edit modal ──
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── Invite modals ──
  // Single-invite modal collects username + first/last name and shows the
  // issued temp password on success. Admin owns the name fields at invite
  // time — there's no user-side "complete profile" step.
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleUsername, setSingleUsername] = useState("");
  const [singleFirstName, setSingleFirstName] = useState("");
  const [singleLastName, setSingleLastName] = useState("");
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleIssued, setSingleIssued] = useState<IssuedCredential | null>(null);

  // Batch-invite modal: a per-row form (3 input fields per user) with an
  // "Add row" button so the admin can build the list directly. On submit
  // we render a result table inline and offer a .txt export. Splitting
  // the modal into "input" and "results" sub-states keeps the focus
  // model simple. Start with 3 empty rows so the form reads as a list
  // from the moment it opens.
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<InviteUserInput[]>(() => makeEmptyBatchRows(3));
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<BatchInviteRow[] | null>(null);

  // ── Confirm dialogs ──
  const [confirmResetUser, setConfirmResetUser] = useState<AdminUser | null>(null);
  const [confirmCancelUser, setConfirmCancelUser] = useState<AdminUser | null>(null);

  // ── Table state ──
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState("");

  const adminCount = useMemo(
    () => users.filter((u) => u.isAdmin).length,
    [users]
  );

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
      const maxPage = Math.max(1, Math.ceil(u.length / pageSize));
      if (currentPage > maxPage) setCurrentPage(maxPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return users;
    return users.filter(
      (u) =>
        (u.username ?? "").toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // ── Invite (single) ─────────────────────────────────────────────────
  function openSingleInvite() {
    setSingleUsername("");
    setSingleFirstName("");
    setSingleLastName("");
    setSingleError(null);
    setSingleIssued(null);
    setSingleOpen(true);
  }

  async function runSingleInvite() {
    const username = singleUsername.trim();
    const firstName = singleFirstName.trim();
    const lastName = singleLastName.trim();
    if (!USERNAME_RE.test(username)) {
      setSingleError(
        "Username must be 3–64 characters: letters, digits, dot, underscore, or hyphen."
      );
      throw new Error("validation");
    }
    if (!firstName) {
      setSingleError("First name is required.");
      throw new Error("validation");
    }
    if (!lastName) {
      setSingleError("Last name is required.");
      throw new Error("validation");
    }
    setSingleError(null);
    const result = await inviteUser({ username, firstName, lastName });
    setSingleIssued({ username: result.username, tempPassword: result.tempPassword });
    await reload();
  }

  // ── Invite (batch) ──────────────────────────────────────────────────
  function openBatchInvite() {
    setBatchRows(makeEmptyBatchRows(3));
    setBatchError(null);
    setBatchResults(null);
    setBatchOpen(true);
  }

  function addBatchRow() {
    if (batchRows.length >= BATCH_MAX_ROWS) return;
    setBatchRows([...batchRows, { username: "", firstName: "", lastName: "" }]);
    if (batchError) setBatchError(null);
  }

  function removeBatchRow(idx: number) {
    // Keep at least one row so the form never collapses to an empty area —
    // clear-instead-of-delete when the last row would be removed.
    if (batchRows.length === 1) {
      setBatchRows([{ username: "", firstName: "", lastName: "" }]);
      return;
    }
    setBatchRows(batchRows.filter((_, i) => i !== idx));
  }

  function updateBatchRow(idx: number, field: keyof InviteUserInput, value: string) {
    setBatchRows(batchRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    if (batchError) setBatchError(null);
  }

  async function runBatchInvite() {
    // Drop fully-blank rows; partially-filled rows are kept so the backend
    // can flag them as per-row errors (admin sees exactly what to fix).
    const inputs = batchRows.filter((r) => !isBatchRowBlank(r));
    if (inputs.length === 0) {
      setBatchError("Add at least one user before submitting.");
      throw new Error("validation");
    }
    if (inputs.length > BATCH_MAX_ROWS) {
      setBatchError(`Maximum ${BATCH_MAX_ROWS} rows per batch. Please split the list.`);
      throw new Error("validation");
    }
    setBatchError(null);
    const result = await inviteUsersBatch(inputs);
    setBatchResults(result.rows);
    await reload();
  }

  // Export successful batch rows as a .txt file. Format is one row per
  // user, tab-separated: "username<TAB>temp-password\n". Easy to paste
  // into a spreadsheet or share with the user.
  function exportBatchSuccessesAsTxt() {
    if (!batchResults) return;
    const ok = batchResults.filter((r) => r.success && r.tempPassword);
    if (ok.length === 0) return;
    const header = "username\ttemp_password\n";
    const body = ok.map((r) => `${r.username}\t${r.tempPassword}`).join("\n");
    const blob = new Blob([header + body + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invited-users-${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Reset temp password ─────────────────────────────────────────────
  // Same one-shot reveal panel as a single invite — the credential lives
  // here only until the admin closes the modal.
  const [resetIssued, setResetIssued] = useState<IssuedCredential | null>(null);
  async function confirmResetTempPassword() {
    if (!confirmResetUser) return;
    try {
      const result = await resetUserTempPassword(confirmResetUser.id);
      setResetIssued({ username: confirmResetUser.username, tempPassword: result.tempPassword });
      setConfirmResetUser(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reset temp password.");
      setConfirmResetUser(null);
    }
  }

  // ── Cancel invite ───────────────────────────────────────────────────
  async function confirmCancelInvite() {
    if (!confirmCancelUser) return;
    try {
      await cancelUserInvite(confirmCancelUser.id);
      setSuccessMessage(`Cancelled invite for ${confirmCancelUser.username}.`);
      setConfirmCancelUser(null);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to cancel invite.");
      setConfirmCancelUser(null);
    }
  }

  // ── Existing actions ────────────────────────────────────────────────
  async function toggleAdmin(user: AdminUser) {
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
        description="Invite single users or batches by username, manage admin access, and attach policies."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openBatchInvite}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">group_add</span>
              Batch invite
            </button>
            <button
              type="button"
              onClick={openSingleInvite}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dim text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Add user
            </button>
          </div>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      <ErrorBanner
        message={successMessage}
        onDismiss={() => setSuccessMessage(null)}
        tone="success"
      />

      {/* ── Search bar ── */}
      {!loading && users.length > 0 && (
        <div className="mb-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[18px] pointer-events-none">
              search
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search users by name, username, or email…"
              className="w-full py-2.5 pl-10 pr-3 bg-surface-container-high/40 rounded-xl border border-on-surface-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          {search.trim().length > 0 && (
            <p className="text-[11px] text-on-surface-variant/60 mt-1.5 ml-1">
              {filteredUsers.length === 0
                ? `No users match "${search}".`
                : `${filteredUsers.length} of ${users.length} users match.`}
            </p>
          )}
        </div>
      )}

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
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Admin</th>
                    <th className="px-6 py-3">Policies</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface-variant/8">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow
                      key={i}
                      widths={["w-24", "w-32", "w-40", "w-20", "w-16", "w-28", "w-24"]}
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
          <div className="p-10 text-center">
            <span className="material-symbols-outlined block text-[40px] text-on-surface-variant/30 mb-2">
              group
            </span>
            <p className="text-sm text-on-surface-variant/60">No users found.</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-symbols-outlined block text-[40px] text-on-surface-variant/30 mb-2">
              search_off
            </span>
            <p className="text-sm text-on-surface-variant/60">
              No users match &ldquo;{search}&rdquo;. Try a different name, username, or email.
            </p>
          </div>
        ) : (
          <>
            {/* ── Desktop / tablet ── */}
            <div className="hidden md:block">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-surface-container-low/60">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    <th className="px-6 py-3 w-[12%]">Username</th>
                    <th className="px-6 py-3 w-[14%]">Full Name</th>
                    <th className="px-6 py-3 w-[18%]">Email</th>
                    <th className="px-6 py-3 w-[12%]">Status</th>
                    <th className="px-6 py-3 w-[10%]">Admin</th>
                    <th className="px-6 py-3 w-[16%]">Policies</th>
                    <th className="px-6 py-3 w-[18%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface-variant/8">
                  {pagedUsers.map((u) => {
                    const disabledReason = toggleDisabledReason(u);
                    const isSelf = currentUser?.id === u.id;
                    const chip = statusChipProps(u.signupStatus);
                    const isOnboarding = u.signupStatus !== "active";
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-surface-container-low/40 transition-colors"
                      >
                        <td className="px-6 py-4 font-semibold text-on-surface truncate" title={u.username}>
                          {u.username}
                          {isSelf && (
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-primary/70">
                              (you)
                            </span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 text-on-surface-variant truncate"
                          title={u.fullName ?? ""}
                        >
                          {u.fullName ?? "—"}
                        </td>
                        <td className="px-6 py-4 text-on-surface-variant truncate" title={u.email ?? ""}>
                          {u.email ?? "—"}
                        </td>
                        <td className="px-6 py-4">
                          {chip ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${chip.tone}`}
                              title={chip.label}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {chip.icon}
                              </span>
                              {chip.label}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant/40 text-xs">—</span>
                          )}
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
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openPolicyEditor(u)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                            >
                              Policies
                            </button>
                            {isOnboarding && (
                              <>
                                <button
                                  onClick={() => setConfirmResetUser(u)}
                                  title="Generate a fresh temporary password"
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors inline-flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[14px]">key</span>
                                  Reset
                                </button>
                                <button
                                  onClick={() => setConfirmCancelUser(u)}
                                  title="Cancel this invite and remove the user row"
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-error hover:bg-error/8 transition-colors inline-flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[14px]">close</span>
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards ── */}
            <ul className="md:hidden divide-y divide-on-surface-variant/8">
              {pagedUsers.map((u) => {
                const disabledReason = toggleDisabledReason(u);
                const isSelf = currentUser?.id === u.id;
                const chip = statusChipProps(u.signupStatus);
                const isOnboarding = u.signupStatus !== "active";
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
                        {chip && (
                          <span
                            className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${chip.tone}`}
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              {chip.icon}
                            </span>
                            {chip.label}
                          </span>
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openPolicyEditor(u)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors"
                      >
                        Edit policies
                      </button>
                      {isOnboarding && (
                        <>
                          <button
                            onClick={() => setConfirmResetUser(u)}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-on-surface-variant bg-surface-container-high hover:bg-surface-container-highest transition-colors inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">key</span>
                            Reset
                          </button>
                          <button
                            onClick={() => setConfirmCancelUser(u)}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-error bg-error/8 hover:bg-error/15 transition-colors inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {!loading && filteredUsers.length > 0 && (
          <div className="border-t border-on-surface-variant/8 px-4 py-4">
            <Paginator
              totalItems={filteredUsers.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      {/* ── Policy editor modal ── */}
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
                      <p className="text-xs text-on-surface-variant/70 mt-0.5">
                        {p.description}
                      </p>
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

      {/* ── Single invite modal ── */}
      <Modal
        open={singleOpen}
        title={singleIssued ? "Invitation created" : "Invite new user"}
        onClose={() => {
          setSingleOpen(false);
          setSingleIssued(null);
        }}
        width="sm"
        footer={
          singleIssued ? (
            <button
              type="button"
              onClick={() => {
                setSingleOpen(false);
                setSingleIssued(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSingleOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <SaveButton
                onSave={runSingleInvite}
                size="sm"
                onError={(err) => setSingleError(err.message)}
              >
                Create user
              </SaveButton>
            </>
          )
        }
      >
        {singleIssued ? (
          <IssuedCredentialPanel
            issued={singleIssued}
            note="Copy these credentials now — the temporary password cannot be retrieved later. Share them with the user securely."
          />
        ) : (
          <>
            <ErrorBanner
              message={singleError}
              onDismiss={() => setSingleError(null)}
            />
            <p className="text-sm text-on-surface-variant/70 mb-4">
              The user is created in a partial state. They sign in with the
              temporary password, verify an email, and pick their own permanent
              password.
            </p>

            <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
              Username <RequiredMark />
            </label>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              value={singleUsername}
              onChange={(e) => {
                setSingleUsername(e.target.value);
                if (singleError) setSingleError(null);
              }}
              placeholder="e.g. j.doe"
              className={`w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border text-on-surface text-sm focus:outline-none focus:bg-white transition-all ${
                singleError
                  ? "border-error/50 focus:border-error/60"
                  : "border-on-surface-variant/8 focus:border-primary/30"
              }`}
            />
            <p className="text-[11px] text-on-surface-variant/50 mt-2 mb-4">
              3–64 characters. Letters, digits, dot, underscore, or hyphen.
              Case is preserved for display; uniqueness is case-insensitive.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  First name <RequiredMark />
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={singleFirstName}
                  onChange={(e) => {
                    setSingleFirstName(e.target.value);
                    if (singleError) setSingleError(null);
                  }}
                  placeholder="e.g. Jane"
                  className="w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:bg-white focus:border-primary/30 transition-all"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-2">
                  Last name <RequiredMark />
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={singleLastName}
                  onChange={(e) => {
                    setSingleLastName(e.target.value);
                    if (singleError) setSingleError(null);
                  }}
                  placeholder="e.g. Doe"
                  className="w-full px-4 py-2.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:bg-white focus:border-primary/30 transition-all"
                />
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* ── Batch invite modal ── */}
      <Modal
        open={batchOpen}
        title={batchResults ? "Batch invite results" : "Batch invite users"}
        onClose={() => {
          setBatchOpen(false);
          setBatchResults(null);
        }}
        width="lg"
        footer={
          batchResults ? (
            <>
              <button
                type="button"
                onClick={exportBatchSuccessesAsTxt}
                disabled={!batchResults.some((r) => r.success)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Export .txt
              </button>
              <button
                type="button"
                onClick={() => {
                  setBatchOpen(false);
                  setBatchResults(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim transition-colors"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setBatchOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <SaveButton
                onSave={runBatchInvite}
                size="sm"
                onError={(err) => setBatchError(err.message)}
              >
                Create users
              </SaveButton>
            </>
          )
        }
      >
        {batchResults ? (
          <BatchResultsPanel rows={batchResults} />
        ) : (
          <>
            <ErrorBanner
              message={batchError}
              onDismiss={() => setBatchError(null)}
            />
            <p className="text-sm text-on-surface-variant/70 mb-4">
              Enter one user per row. All three fields are required for each
              user. Up to {BATCH_MAX_ROWS} users per batch — completely empty
              rows are ignored.
            </p>

            {/* Column header */}
            <div className="grid grid-cols-[1.1fr_1fr_1fr_36px] gap-2 mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/55">
              <div>
                Username <RequiredMark />
              </div>
              <div>
                First name <RequiredMark />
              </div>
              <div>
                Last name <RequiredMark />
              </div>
              <div />
            </div>

            {/* Row list */}
            <div className="space-y-2">
              {batchRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1.1fr_1fr_1fr_36px] gap-2 items-center"
                >
                  <input
                    autoFocus={idx === 0}
                    type="text"
                    value={row.username}
                    onChange={(e) => updateBatchRow(idx, "username", e.target.value)}
                    placeholder="j.doe"
                    className="w-full px-3 py-2 bg-surface-container-high/60 rounded-lg border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary/30 focus:bg-white transition-all"
                  />
                  <input
                    type="text"
                    value={row.firstName}
                    onChange={(e) => updateBatchRow(idx, "firstName", e.target.value)}
                    placeholder="Jane"
                    className="w-full px-3 py-2 bg-surface-container-high/60 rounded-lg border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary/30 focus:bg-white transition-all"
                  />
                  <input
                    type="text"
                    value={row.lastName}
                    onChange={(e) => updateBatchRow(idx, "lastName", e.target.value)}
                    placeholder="Doe"
                    className="w-full px-3 py-2 bg-surface-container-high/60 rounded-lg border border-on-surface-variant/8 text-on-surface text-sm focus:outline-none focus:border-primary/30 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => removeBatchRow(idx)}
                    aria-label={`Remove row ${idx + 1}`}
                    title={batchRows.length === 1 ? "Clear row" : "Remove row"}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-on-surface-variant/50 hover:text-error hover:bg-error/8 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {batchRows.length === 1 ? "backspace" : "close"}
                    </span>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer: add-row + count */}
            <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-on-surface-variant/8">
              <button
                type="button"
                onClick={addBatchRow}
                disabled={batchRows.length >= BATCH_MAX_ROWS}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add row
              </button>
              <span className="text-[11px] text-on-surface-variant/50 tabular-nums">
                {batchRows.filter((r) => !isBatchRowBlank(r)).length} / {BATCH_MAX_ROWS} users
              </span>
            </div>
          </>
        )}
      </Modal>

      {/* ── Reset temp password (success modal w/ credentials) ── */}
      <Modal
        open={!!resetIssued}
        title="Temporary password reset"
        onClose={() => setResetIssued(null)}
        width="sm"
        footer={
          <button
            type="button"
            onClick={() => setResetIssued(null)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim transition-colors"
          >
            Done
          </button>
        }
      >
        {resetIssued && (
          <IssuedCredentialPanel
            issued={resetIssued}
            note="The previous temporary password no longer works. Share these credentials securely; they can't be retrieved later."
          />
        )}
      </Modal>

      {/* ── Confirm: reset temp password ── */}
      <ConfirmDialog
        open={!!confirmResetUser}
        title="Reset temporary password?"
        message={
          confirmResetUser
            ? `Generate a fresh temporary password for ${confirmResetUser.username}? Their existing temp password will stop working immediately, and any in-progress signup state is discarded.`
            : ""
        }
        confirmLabel="Reset password"
        onConfirm={confirmResetTempPassword}
        onCancel={() => setConfirmResetUser(null)}
      />

      {/* ── Confirm: cancel invite ── */}
      <ConfirmDialog
        open={!!confirmCancelUser}
        title="Cancel invitation?"
        message={
          confirmCancelUser
            ? `Remove ${confirmCancelUser.username} from the system? This deletes the user row entirely. Use this only if the invitation was a mistake.`
            : ""
        }
        confirmLabel="Cancel invite"
        destructive
        onConfirm={confirmCancelInvite}
        onCancel={() => setConfirmCancelUser(null)}
      />
    </AdminLayout>
  );
}

// ── Small components ─────────────────────────────────────────────────────

// Renders a username + temp-password pair with copy-all buttons. Used by
// the single-invite success state and the reset-temp-password modal. The
// "Copy both" button puts a "user TAB pass" line on the clipboard, which
// pastes cleanly into a spreadsheet.
function IssuedCredentialPanel({
  issued,
  note,
}: {
  issued: IssuedCredential;
  note: string;
}) {
  const [copiedField, setCopiedField] = useState<"user" | "pass" | "both" | null>(null);

  function copy(value: string, field: "user" | "pass" | "both") {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1600);
    });
  }

  return (
    <div>
      <p className="text-sm text-on-surface-variant/80 mb-4 flex items-start gap-2">
        <span className="material-symbols-outlined text-amber-600 text-[18px] mt-0.5 shrink-0">
          warning
        </span>
        <span>{note}</span>
      </p>

      <div className="space-y-3">
        <CredField
          label="Username"
          value={issued.username}
          copied={copiedField === "user"}
          onCopy={() => copy(issued.username, "user")}
        />
        <CredField
          label="Temporary password"
          value={issued.tempPassword}
          copied={copiedField === "pass"}
          onCopy={() => copy(issued.tempPassword, "pass")}
          mono
        />
      </div>

      <button
        type="button"
        onClick={() => copy(`${issued.username}\t${issued.tempPassword}`, "both")}
        className="mt-4 w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary/8 text-primary hover:bg-primary/15 transition-colors inline-flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]">
          {copiedField === "both" ? "check" : "content_copy"}
        </span>
        {copiedField === "both" ? "Copied both" : "Copy username + password"}
      </button>
    </div>
  );
}

function CredField({
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 block mb-1.5">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <div
          className={`flex-1 px-4 py-2.5 bg-surface-container-high/60 rounded-xl border border-on-surface-variant/8 text-on-surface text-sm select-all ${
            mono ? "font-mono tracking-wider" : "font-semibold"
          }`}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 px-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[18px]">
            {copied ? "check" : "content_copy"}
          </span>
        </button>
      </div>
    </div>
  );
}

function BatchResultsPanel({ rows }: { rows: BatchInviteRow[] }) {
  const successes = rows.filter((r) => r.success);
  const failures = rows.filter((r) => !r.success);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          {successes.length} created
        </span>
        {failures.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-error/10 text-error border border-error/20">
            <span className="material-symbols-outlined text-[14px]">error</span>
            {failures.length} skipped
          </span>
        )}
      </div>

      <div className="rounded-xl border border-on-surface-variant/8 overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low/60 sticky top-0">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                <th className="px-4 py-2.5">Username</th>
                <th className="px-4 py-2.5">Temp password</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-on-surface-variant/8">
              {rows.map((r, i) => (
                <tr
                  key={`${r.username}-${i}`}
                  className={r.success ? "" : "bg-error/3"}
                >
                  <td className="px-4 py-2.5 font-semibold text-on-surface align-top">
                    {r.username || <span className="italic text-on-surface-variant/40">empty</span>}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {r.success && r.tempPassword ? (
                      <span className="font-mono text-on-surface select-all">
                        {r.tempPassword}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {r.success ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        Created
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-error">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        {r.error ?? "Failed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {successes.length > 0 && (
        <p className="text-[11px] text-on-surface-variant/60 mt-3 flex items-start gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-amber-600 mt-0.5">
            info
          </span>
          <span>
            Temporary passwords are shown once and cannot be retrieved later.
            Use <span className="font-semibold">Export .txt</span> to save them,
            or copy individual rows.
          </span>
        </p>
      )}
    </div>
  );
}
