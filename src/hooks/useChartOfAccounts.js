import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

let _cache = null;

export function useChartOfAccounts() {
  const [accounts, setAccounts] = useState(_cache || []);

  useEffect(() => {
    if (_cache) return;
    base44.entities.ChartOfAccount.filter({ status: "Active" }, "code", 200)
      .then(list => {
        _cache = list;
        setAccounts(list);
      })
      .catch(() => {});
  }, []);

  return accounts;
}