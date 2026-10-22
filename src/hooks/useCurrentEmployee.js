import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { withRetry } from "@/lib/apiHelpers";

/**
 * Module-level cache for the current user + employee so multiple
 * components (TopNavBar, pages, etc.) share a single fetch.
 */
let _userCache = null;       // { data: { user, employee }, time }
let _userPromise = null;
const USER_TTL = 60_000;

async function _fetchUserAndEmployee() {
  const me = await withRetry(() => base44.auth.me());
  let employee = null;
  if (me?.id) {
    const results = await withRetry(() => base44.entities.Employee.filter({ user_id: me.id }));
    employee = results?.[0] || null;
  }
  return { user: me, employee };
}

function _getUserEmployee() {
  if (_userCache && Date.now() - _userCache.time < USER_TTL) {
    return Promise.resolve(_userCache.data);
  }
  if (!_userPromise) {
    _userPromise = _fetchUserAndEmployee()
      .catch(() => ({ user: null, employee: null }))
      .finally(() => { _userPromise = null; })
      .then(data => { _userCache = { data, time: Date.now() }; return data; });
  }
  return _userPromise;
}

/** Exposed for refresh after profile edits */
export function invalidateCurrentUserCache() {
  _userCache = null;
  _userPromise = null;
}

/**
 * Returns the Employee record linked to the currently logged-in user.
 * Uses employee.user_id === currentUser.id to find the match.
 *
 * Returns: { employee, user, loading }
 */
export function useCurrentEmployee() {
  const [employee, setEmployee] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    _getUserEmployee().then(({ user: u, employee: e }) => {
      if (cancelled) return;
      setUser(u);
      setEmployee(e);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { employee, user, loading };
}