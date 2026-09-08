import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Checks whether the current user has a specific permission for a module.
 * Admins always have full access.
 *
 * @param {string} module - Module key e.g. "tasks", "work_orders"
 * @param {string} permKey - Permission key e.g. "can_edit", "can_view"
 * @returns {{ allowed: boolean, loading: boolean }}
 */
export function usePermission(module, permKey) {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me) { if (!cancelled) { setAllowed(false); setLoading(false); } return; }

        // Admin always has full access
        if (me.role === "admin") { if (!cancelled) { setAllowed(true); setLoading(false); } return; }

        // Find the employee linked to this user
        const employees = await base44.entities.Employee.filter({ user_id: me.id });
        const employee = employees?.[0];
        if (!employee?.role) { if (!cancelled) { setAllowed(false); setLoading(false); } return; }

        // Find the EmployeeRole by name to get its key
        const roles = await base44.entities.EmployeeRole.list("name", 100);
        const role = roles.find(r => r.name === employee.role) || roles.find(r => r.key === employee.role);
        if (!role?.key) { if (!cancelled) { setAllowed(false); setLoading(false); } return; }

        // Check RolePermission for this role + module
        const perms = await base44.entities.RolePermission.filter({ role: role.key, module });
        const perm = perms?.[0];
        if (!cancelled) { setAllowed(!!perm?.[permKey]); setLoading(false); }
      } catch {
        if (!cancelled) { setAllowed(false); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [module, permKey]);

  return { allowed, loading };
}