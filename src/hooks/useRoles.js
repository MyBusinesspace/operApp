import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { withRetry } from "@/lib/apiHelpers";
import { mergeDbRole } from "@/lib/rolePermissionsConfig";

// Module-level cache so all components share a single fetch.
let _rolesCache = null;       // { data, time }
let _rolesPromise = null;
const ROLES_TTL = 60_000;

function _fetchRoles() {
  if (_rolesCache && Date.now() - _rolesCache.time < ROLES_TTL) {
    return Promise.resolve(_rolesCache.data);
  }
  if (!_rolesPromise) {
    _rolesPromise = withRetry(() => base44.entities.EmployeeRole.list("name", 500))
      .then(list => {
        const roles = list.map(mergeDbRole);
        _rolesCache = { data: roles, time: Date.now() };
        return roles;
      })
      .catch(() => (_rolesCache?.data || []))
      .finally(() => { _rolesPromise = null; });
  }
  return _rolesPromise;
}

/** Force a fresh fetch (e.g. after creating/editing a role). */
export function invalidateRolesCache() {
  _rolesCache = null;
  _rolesPromise = null;
}

// Reading roles must never create or restore records.
export function useRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Bypass cache on explicit reload, use cache on realtime refresh
      if (silent) invalidateRolesCache();
      const list = await _fetchRoles();
      setRoles(list);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Realtime subscription: any create/update/delete on EmployeeRole
    // silently refreshes the list so all dropdowns stay in sync with
    // the Roles & Permissions settings page.
    const unsubscribe = base44.entities.EmployeeRole.subscribe(() => load(true));
    return unsubscribe;
  }, [load]);

  return { roles, loading, reload: load };
}