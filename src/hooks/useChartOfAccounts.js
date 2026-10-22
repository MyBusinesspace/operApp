import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

let _cache = null;

export function useChartOfAccounts() {
  const [accounts, setAccounts] = useState(_cache || []);

  useEffect(() => {
    // Only skip the fetch when we already have a populated cache.
    // An empty array ([]) is truthy but means the prior load came back
    // empty (e.g. before accounts were imported) — refetch in that case
    // so the dropdown recovers once accounts actually exist.
    if (_cache && _cache.length > 0) return;
    let cancelled = false;
    base44.entities.ChartOfAccount.filter({ status: "Active" }, "code", 5000)
      .then(list => {
        if (cancelled) return;
        _cache = list;
        setAccounts(list);
      })
      .catch(err => console.error(err));
    return () => { cancelled = true; };
  }, []);

  return accounts;
}