import { useState, useEffect } from "react";

/**
 * Like useState, but persists the value to sessionStorage so the search
 * survives navigation (back button) and page re-mounts.
 * @param {string} key - unique key per page (e.g. "tasks", "contacts")
 * @param {string} initial - initial value (default "")
 */
export function usePersistedSearch(key, initial = "") {
  const [value, setValue] = useState(() => {
    try {
      return sessionStorage.getItem(`search_${key}`) || initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      if (value) {
        sessionStorage.setItem(`search_${key}`, value);
      } else {
        sessionStorage.removeItem(`search_${key}`);
      }
    } catch { /* ignore */ }
  }, [key, value]);

  return [value, setValue];
}