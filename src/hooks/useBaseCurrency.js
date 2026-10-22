import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { DEFAULT_BASE_CURRENCY } from "@/lib/currency";

/**
 * Returns the organization's base currency code (Organization.currency),
 * falling back to DEFAULT_BASE_CURRENCY while loading or if unset.
 *
 * This is the single source of truth for the app's base currency; all
 * cost/summary displays that are not document-specific should use this.
 */
export function useBaseCurrency() {
  const [currency, setCurrency] = useState(DEFAULT_BASE_CURRENCY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    base44.entities.Organization.list("-created_date", 1)
      .then(list => {
        if (cancelled) return;
        const org = list && list[0];
        if (org && org.currency) setCurrency(org.currency);
      })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { currency, loading };
}

export default useBaseCurrency;