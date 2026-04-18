import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import AdminPageHeader from "../../components/admin/AdminPageHeader";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import ErrorBanner from "../../components/admin/ErrorBanner";
import { SkeletonCard } from "../../components/admin/Skeleton";
import {
  listPolicies,
  deletePolicy,
  type AdminPolicyListItem,
} from "../../services/admin";

export default function AdminPoliciesPage() {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<AdminPolicyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminPolicyListItem | null>(null);

  async function reload() {
    try {
      setLoading(true);
      const rows = await listPolicies();
      setPolicies(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deletePolicy(deleting.id);
      setDeleting(null);
      setActionError(null);
      await reload();
    } catch (e) {
      setDeleting(null);
      setActionError(e instanceof Error ? e.message : "Failed to delete policy");
    }
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Policies"
        description="Rule sets that grant read access to projects, departments, reports, and columns. Users can belong to any number of policies — their effective access is the union."
        action={
          <button
            onClick={() => navigate("/admin/policies/new")}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dim text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Policy
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-10 text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 mb-2">shield</span>
          <p className="text-on-surface-variant/60 text-sm">
            No policies yet. Click "New Policy" to create the first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {policies.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl editorial-shadow border border-on-surface-variant/5 p-5 flex flex-col card-lift"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-on-surface font-headline text-lg tracking-tight truncate">
                    {p.name}
                  </h3>
                  <code className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded mt-1 inline-block">
                    {p.code}
                  </code>
                </div>
                <span className="material-symbols-outlined text-primary/40 text-[22px]">shield_person</span>
              </div>
              {p.description ? (
                <p className="text-xs text-on-surface-variant/70 mb-4 line-clamp-2">{p.description}</p>
              ) : (
                <p className="text-xs text-on-surface-variant/40 italic mb-4">No description</p>
              )}

              <div className="grid grid-cols-3 gap-2 mb-4">
                <Stat icon="group" label="Users" value={p.userCount} />
                <Stat icon="account_tree" label="Scopes" value={p.projectDepartmentCount} />
                <Stat icon="description" label="Reports" value={p.reportCount} />
              </div>

              <div className="flex items-center gap-2 mt-auto pt-3 border-t border-on-surface-variant/8">
                <Link
                  to={`/admin/policies/${p.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-primary to-primary-dim shadow-sm shadow-primary/20 hover:opacity-95 transition-opacity no-underline"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleting(p)}
                  aria-label={`Delete ${p.name}`}
                  title="Delete policy"
                  className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg text-on-surface-variant/60 hover:text-error hover:bg-error/8 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete policy?"
        message={
          deleting
            ? `Are you sure you want to delete "${deleting.name}"? All grants (projects, reports, columns) and user attachments will be removed.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </AdminLayout>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-surface-container-low/60 rounded-xl px-2 py-2 text-center border border-on-surface-variant/5">
      <span className="material-symbols-outlined text-on-surface-variant/60 text-[16px]">{icon}</span>
      <p className="text-base font-extrabold text-on-surface leading-tight">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
        {label}
      </p>
    </div>
  );
}
