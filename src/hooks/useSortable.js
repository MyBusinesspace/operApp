import { useState, useCallback } from "react";

/**
 * useSortable - shared hook for column sorting in tables
 * Returns: { sortKey, sortDir, handleSort, applySorting, SortIcon }
 */
export function useSortable(defaultKey = null, defaultDir = "asc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return key; }
      setSortDir("asc"); return key;
    });
  }, []);

  const applySorting = useCallback((items) => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      const av = (a[sortKey] ?? "").toString().toLowerCase();
      const bv = (b[sortKey] ?? "").toString().toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [sortKey, sortDir]);

  return { sortKey, sortDir, handleSort, applySorting };
}