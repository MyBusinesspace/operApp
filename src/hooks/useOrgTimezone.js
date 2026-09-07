import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";

/**
 * Loads the organization's operational timezone.
 * Returns the IANA timezone string (defaults to Asia/Dubai).
 */
export function useOrgTimezone() {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  useEffect(() => {
    let cancelled = false;
    base44.entities.Organization.list("-created_date", 1)
      .then((list) => {
        if (!cancelled && list?.[0]?.timezone) setTimezone(list[0].timezone);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return timezone;
}