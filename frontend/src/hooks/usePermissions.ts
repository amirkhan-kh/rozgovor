import { useEffect, useState } from "react";
import { permissionsService, PermissionMatrix } from "../services/permissions.service";

interface PermissionsState {
  role: "boss" | "rop" | "manager" | "company";
  matrix: PermissionMatrix;
  isSuperAdmin: boolean;
  loading: boolean;
  can: (pageKey: string, actionKey?: string) => boolean;
}

// ─── Module-level cache (auth global bo'lgani kabi) ────────────────────
let cached: Omit<PermissionsState, "can"> | null = null;
const subscribers = new Set<(s: Omit<PermissionsState, "can">) => void>();
let fetching = false;

const DEFAULT_STATE: Omit<PermissionsState, "can"> = {
  role: "manager",
  matrix: {} as PermissionMatrix,
  isSuperAdmin: false,
  loading: true,
};

function notify(state: Omit<PermissionsState, "can">): void {
  cached = state;
  subscribers.forEach((fn) => fn(state));
}

async function fetchPermissions(): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const resp = await permissionsService.getMyPermissions();
    notify({
      role: resp.role,
      matrix: resp.matrix,
      isSuperAdmin: resp.isSuperAdmin,
      loading: false,
    });
  } catch {
    // xato bo'lsa default holat (hech narsa ochiq emas, loading tugadi)
    notify({ ...DEFAULT_STATE, loading: false });
  } finally {
    fetching = false;
  }
}

export function usePermissions(): PermissionsState {
  const [state, setState] = useState<Omit<PermissionsState, "can">>(
    cached || DEFAULT_STATE
  );

  useEffect(() => {
    subscribers.add(setState);
    if (!cached) fetchPermissions();
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  const can = (pageKey: string, actionKey?: string): boolean => {
    // Super admin (kompaniya login) doim ruxsatli
    if (state.isSuperAdmin) return true;
    // Ma'lumot hali yuklanmagan — ehtiyotkorlik uchun false
    if (state.loading) return false;
    const action = actionKey || "view";
    const pageMap = state.matrix[pageKey as keyof PermissionMatrix];
    if (!pageMap) return false;
    return pageMap[action] === true;
  };

  return { ...state, can };
}

/**
 * Login/logout dan keyin cache ni qayta yuklash.
 */
export function refreshPermissions(): void {
  cached = null;
  fetchPermissions();
}
