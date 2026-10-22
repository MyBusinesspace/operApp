import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { withRetry } from "@/lib/apiHelpers";
import { getDefaultPerms, ALL_MODULE_KEYS } from "@/lib/rolePermissionsConfig";

/**
 * Module-level cache + in-flight promise so the permission matrix is
 * fetched exactly ONCE per page load, no matter how many components
 * call the hook (AppLayout, TopNavBar, etc. all share the same data).
 */
let _permCache = null;       // { data, time }
let _permPromise = null;     // shared in-flight promise
const PERM_TTL = 60_000;     // 60s — permissions rarely change mid-session

async function _fetchPermissions() {
  const me = await withRetry(() => base44.auth.me());
  if (!me) return {};
  if (me.role === "admin") return { __admin: true };

  const employees = await withRetry(() => base44.entities.Employee.filter({ user_id: me.id }));
  const employee = employees?.[0];
  if (!employee?.role) return {};

  const roles = await withRetry(() => base44.entities.EmployeeRole.list("name", 100));
  const role = roles.find(r => r.name === employee.role) || roles.find(r => r.key === employee.role);
  if (!role?.key) return {};

  const perms = await withRetry(() => base44.entities.RolePermission.filter({ role: role.key }));
  const map = {};
  (perms || []).forEach(p => { map[p.module] = p; });

  for (const mk of ALL_MODULE_KEYS) {
    if (!map[mk]) {
      const dp = getDefaultPerms(role.key, mk);
      if (dp && dp.can_view) map[mk] = dp;
    }
  }
  return map;
}

function _getPermissions() {
  // Return cached if fresh
  if (_permCache && Date.now() - _permCache.time < PERM_TTL) {
    return Promise.resolve(_permCache.data);
  }
  // Dedupe concurrent callers — share a single in-flight promise
  if (!_permPromise) {
    _permPromise = _fetchPermissions()
      .catch(() => ({}))
      .finally(() => { _permPromise = null; })
      .then(data => { _permCache = { data, time: Date.now() }; return data; });
  }
  return _permPromise;
}

/** Exposed for testing / role-change refresh */
export function invalidatePermissionsCache() {
  _permCache = null;
  _permPromise = null;
}

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
    _getPermissions().then(data => {
      if (!cancelled) { setPermMap(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const can = (module, action = "can_view") => {
    if (!permMap) return false;
    if (permMap.__admin) return true;
    return !!permMap[module]?.[action];
  };

  return { can, loading, isAdmin: !!permMap?.__admin };
}