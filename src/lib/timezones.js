/**
 * Operational timezone list for the Organization profile.
 * The selected timezone is the zone in which the organization's work
 * is performed — used for the live clock, date displays and report dates.
 */

export const TIMEZONES = [
  { id: "Asia/Dubai", label: "Gulf Standard Time — Dubai (UTC+4)" },
  { id: "Asia/Riyadh", label: "Arabia Standard Time — Riyadh (UTC+3)" },
  { id: "Asia/Qatar", label: "Arabia Standard Time — Doha (UTC+3)" },
  { id: "Asia/Kuwait", label: "Arabia Standard Time — Kuwait (UTC+3)" },
  { id: "Asia/Bahrain", label: "Arabia Standard Time — Bahrain (UTC+3)" },
  { id: "Asia/Muscat", label: "Gulf Standard Time — Muscat (UTC+4)" },
  { id: "Asia/Karachi", label: "Pakistan Standard Time — Karachi (UTC+5)" },
  { id: "Asia/Kolkata", label: "India Standard Time — New Delhi (UTC+5:30)" },
  { id: "Asia/Dhaka", label: "Bangladesh Standard Time — Dhaka (UTC+6)" },
  { id: "Asia/Jakarta", label: "Western Indonesia Time — Jakarta (UTC+7)" },
  { id: "Asia/Singapore", label: "Singapore Standard Time — Singapore (UTC+8)" },
  { id: "Asia/Hong_Kong", label: "Hong Kong Time — Hong Kong (UTC+8)" },
  { id: "Asia/Manila", label: "Philippine Time — Manila (UTC+8)" },
  { id: "Asia/Tokyo", label: "Japan Standard Time — Tokyo (UTC+9)" },
  { id: "Africa/Cairo", label: "Eastern European Time — Cairo (UTC+2)" },
  { id: "Africa/Johannesburg", label: "South African Standard Time — Johannesburg (UTC+2)" },
  { id: "Africa/Lagos", label: "West Africa Time — Lagos (UTC+1)" },
  { id: "Europe/London", label: "Greenwich Mean Time — London (UTC+0)" },
  { id: "Europe/Madrid", label: "Central European Time — Madrid (UTC+1)" },
  { id: "Europe/Paris", label: "Central European Time — Paris (UTC+1)" },
  { id: "Europe/Berlin", label: "Central European Time — Berlin (UTC+1)" },
  { id: "Europe/Istanbul", label: "Turkey Time — Istanbul (UTC+3)" },
  { id: "America/New_York", label: "Eastern Time — New York (UTC-5)" },
  { id: "America/Chicago", label: "Central Time — Chicago (UTC-6)" },
  { id: "America/Denver", label: "Mountain Time — Denver (UTC-7)" },
  { id: "America/Los_Angeles", label: "Pacific Time — Los Angeles (UTC-8)" },
  { id: "America/Sao_Paulo", label: "Brasilia Time — São Paulo (UTC-3)" },
  { id: "Australia/Sydney", label: "Australian Eastern Time — Sydney (UTC+10)" },
];

export const DEFAULT_TIMEZONE = "Asia/Dubai";

/**
 * Returns a short display label for a timezone, e.g. "GST · UTC+4".
 */
export function getTimezoneShortLabel(tz) {
  const zone = tz || DEFAULT_TIMEZONE;
  try {
    // Get short timezone name (e.g. "GST")
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "short",
    });
    const parts = dtf.formatToParts(new Date());
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const offset = getUtcOffset(zone);
    const offsetStr = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
    return tzName ? `${tzName} · ${offsetStr}` : offsetStr;
  } catch {
    return zone;
  }
}

/**
 * Format a time value as "HH:mm" in the given timezone.
 */
export function tzTime(date, tz) {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || DEFAULT_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/**
 * Format a date value as "yyyy-MM-dd" in the given timezone (for grouping keys).
 */
export function tzDateKey(date, tz) {
  if (!date) return "";
  try {
    const d = new Date(date);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${day}`;
  } catch {
    return String(date).slice(0, 10);
  }
}

/**
 * Convert an ISO string to a datetime-local input value ("yyyy-MM-ddTHH:mm")
 * representing the time in the given timezone.
 */
export function isoToTzDatetimeLocal(iso, tz) {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || DEFAULT_TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

/**
 * Convert a datetime-local input value ("yyyy-MM-ddTHH:mm") interpreted as the
 * given timezone into a UTC ISO string.
 */
export function tzDatetimeLocalToISO(value, tz) {
  if (!value) return null;
  try {
    const [datePart, timePart] = value.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const [h, mi] = timePart.split(":").map(Number);
    const offsetMinutes = Math.round(getUtcOffset(tz) * 60);
    const utcMs = Date.UTC(y, m - 1, d, h, mi) - offsetMinutes * 60000;
    return new Date(utcMs).toISOString();
  } catch {
    return null;
  }
}

/**
 * Format a date value as "Tuesday, August 4, 2026" in the given timezone.
 */
export function tzDayLabel(date, tz) {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || DEFAULT_TIMEZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/**
 * Returns the UTC offset in hours for the given IANA timezone (e.g. 4 for Asia/Dubai).
 */
export function getUtcOffset(tz) {
  const zone = tz || DEFAULT_TIMEZONE;
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const local = new Date(now.toLocaleString("en-US", { timeZone: zone }));
    const diffMs = local - utc;
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.round(diffHours * 10) / 10;
  } catch {
    return 4;
  }
}