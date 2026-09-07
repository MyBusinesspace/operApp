import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

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
    (async () => {
      try {
        const me = await base44.auth.me();
        if (cancelled) return;
        setUser(me);
        if (me?.id) {
          const results = await base44.entities.Employee.filter({ user_id: me.id });
          if (!cancelled) setEmployee(results?.[0] || null);
        }
      } catch {
        // not authenticated or no employee linked
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { employee, user, loading };
}