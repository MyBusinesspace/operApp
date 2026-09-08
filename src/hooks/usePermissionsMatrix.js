import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Loads the current user's role permissions ONCE and exposes a synchronous
 * `can(module, action)` checker. Used by app-shell-level gating (layout +
 * nav) so we don't re-fetch per page navigation.
 *
 * @returns {{ can: (module: string, action?: string) => boolean, loading: boolean, isAdmin: boolean }}
 */
export function usePermissionsMatrix() {
  const [permMap, setPermMap] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me) { if (!cancelled) { setPermMap({}); setLoading(false); } return; }

        // Platform admins bypass the matrix.
        if (me.role === "admin") { if (!cancelled) { setPermMap({ __admin: true }); setLoading(false); } return; }

        const employees = await base44.entities.Employee.filter({ user_id: me.id });
        const employee = employees?.[0];
        if (!employee?.role) { if (!cancelled) { setPermMap({}); setLoading(false); } return; }

        const roles = await base44.entities.EmployeeRole.list("name", 100);
        const role = roles.find(r => r.name === employee.role) || roles.find(r => r.key === employee.role);
        if (!role?.key) { if (!cancelled) { setPermMap({}); setLoading(false); } return; }

        const perms = await base44.entities.RolePermission.filter({ role: role.key });
        const map = {};
        (perms || []).forEach(p => { map[p.module] = p; });
        if (!cancelled) { setPermMap(map); setLoading(false); }
      } catch {
        if (!cancelled) { setPermMap({}); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const can = (module, action = "can_view") => {
    if (!permMap) return false;
    if (permMap.__admin) return true;
    return !!permMap[module]?.[action];
  };

  return { can, loading, isAdmin: !!permMap?.__admin };
}