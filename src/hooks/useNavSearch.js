import { useEffect, useState } from "react";
import { searchNavRecords } from "@/lib/navSearch";

export default function useNavSearch(query, enabled) {
  const [groups, setGroups] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let current = true;
    setGroups([]);
    if (!enabled || query.replace(/\s+/g, "").length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchNavRecords(query, () => current);
      if (current) {
        setGroups(results);
        setSearching(false);
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return { groups, searching };
}