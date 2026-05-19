import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE_URL as BASE_URL } from "./config";
import { useAuth } from "./auth";

// Architecture B permission model on the frontend:
//   - PermissionProvider fetches /api/Me/permissions once after login.
//   - The cached snapshot is { [permCode]: ResourceScope[] }.
//   - <Can permission="bdf:upload" resource={["group", "12"]}/> renders its
//     children only when the cached snapshot matches.
//
// IMPORTANT: this is COSMETIC gating only. The server re-checks every action.
// A user editing the cached state can render hidden controls but every
// request still hits the policy gate server-side.

export interface ResourceScope {
  kind: string;
  id: string;
}

export type PermissionMap = Record<string, ResourceScope[]>;

interface PermissionContextValue {
  permissions: PermissionMap | null; // null while loading
  /** Was the initial load successful? */
  loaded: boolean;
  /** Force a refetch (e.g. after admin updates policies). */
  refresh: () => Promise<void>;
  /** Imperative check — for code paths that can't use <Can/>. */
  has: (code: string, scopes?: Array<[string, string]>) => boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: null,
  loaded: false,
  refresh: async () => {},
  has: () => false,
});

function matches(grants: ResourceScope[], scopes: Array<[string, string]>): boolean {
  // Wildcard grant: matches anything.
  if (grants.some((g) => g.kind === "*" && g.id === "*")) return true;
  if (scopes.length === 0) return false;
  for (const [kind, id] of scopes) {
    if (grants.some((g) => g.kind === kind && g.id === id)) return true;
  }
  return false;
}

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuth();
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions(null);
      setLoaded(false);
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/Me/permissions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        // 401 will already have triggered logout via the global fetch path
        // used elsewhere; here we just silence and leave permissions null.
        setPermissions({});
        setLoaded(true);
        return;
      }
      const data = (await res.json()) as PermissionMap;
      setPermissions(data);
      setLoaded(true);
    } catch {
      setPermissions({});
      setLoaded(true);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const has = useCallback(
    (code: string, scopes: Array<[string, string]> = []) => {
      if (!permissions) return false;
      const grants = permissions[code];
      if (!grants || grants.length === 0) return false;
      return matches(grants, scopes);
    },
    [permissions],
  );

  const value = useMemo<PermissionContextValue>(
    () => ({ permissions, loaded, refresh, has }),
    [permissions, loaded, refresh, has],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionContext);
}

// <Can permission="bdf:upload" resource={["group", "12"]} fallback={...}>
//   <UploadButton />
// </Can>
//
// `resource` is a tuple [kind, id]. Pass an array of tuples to OR multiple
// scopes (typical pattern: a specific group + the parent module).
interface CanProps {
  permission: string;
  resource?: [string, string] | Array<[string, string]>;
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, resource, fallback = null, children }: CanProps) {
  const { has, loaded } = usePermissions();
  if (!loaded) return null;
  const scopes: Array<[string, string]> = !resource
    ? []
    : Array.isArray(resource[0])
      ? (resource as Array<[string, string]>)
      : [resource as [string, string]];
  return has(permission, scopes) ? <>{children}</> : <>{fallback}</>;
}
