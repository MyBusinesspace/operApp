/**
 * Date-only helpers — the single way calendar dates are read and written.
 *
 * Fields such as issue_date, due_date, expiry_date, delivery_date, a payment
 * date or AccountingSettings.lock_date are stored as plain "YYYY-MM-DD"
 * strings: a calendar day with no time and no timezone. `new Date("2026-09-14")`
 * parses such a value as UTC midnight, so any local rendering
 * (toLocaleDateString, getDate) shows the PREVIOUS day in every timezone behind
 * UTC — that is why INV-7138 printed 13 Sept 2026 for issue_date 2026-09-14.
 *
 * Rules: read and write a date-only value through its LOCAL calendar parts and
 * never through toISOString(). Real timestamps (created_date, clock-in/out
 * instants, updated_date) are instants, not calendar days — leave those alone.
 *
 * parseDateOnly anchors at local noon, so a date-only value can never drift
 * across a day boundary in any timezone or DST switch.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

const pad = (n) => String(n).padStart(2, "0");

function localISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Normalise any date-only value to its "YYYY-MM-DD" key.
 * Accepts "YYYY-MM-DD", an ISO datetime (its date part is taken exactly as
 * stored, with no conversion) or a Date (local calendar parts).
 * Returns "" for an empty or unrecognisable value.
 */
export function dateOnlyKey(value) {
  if (!value) return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : localISO(value);
  const s = String(value).trim();
  const m = s.match(ISO_DATE_RE);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : localISO(d);
}

/** Local Date at noon for a date-only value, or null when there is no date. */
export function parseDateOnly(value) {
  const key = dateOnlyKey(value);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const STYLES = {
  short: { day: "2-digit", month: "short", year: "numeric" }, // 14 Sep 2026
  day: { day: "numeric", month: "short", year: "numeric" },   // 4 Sep 2026
  monthYear: { month: "long", year: "numeric" },               // September 2026
};

/**
 * Format a date-only value for display — the day never shifts, whatever the
 * viewer's timezone is.
 * style: "short" (default, 14 Sep 2026) | "day" (4 Sep 2026) |
 *        "monthYear" (September 2026) | "iso" (2026-09-14).
 * Returns "" for an empty/unparseable value; callers keep their own fallback.
 */
export function formatDateOnly(value, style = "short") {
  const key = dateOnlyKey(value);
  if (!key) return "";
  if (style === "iso") return key;
  return parseDateOnly(key).toLocaleDateString("en-GB", STYLES[style] || STYLES.short);
}

/** Today's calendar day in the viewer's own timezone (never toISOString). */
export function todayLocalISO() {
  return localISO(new Date());
}

/** Add (or subtract) whole days to a date-only value. */
export function addDaysISO(value, days = 0) {
  const base = parseDateOnly(value || todayLocalISO());
  if (!base) return "";
  base.setDate(base.getDate() + (Number(days) || 0));
  return localISO(base);
}

/**
 * Compare two date-only values by their calendar day: -1 | 0 | 1.
 * A missing value sorts before a present one.
 */
export function compareDateOnly(a, b) {
  const ka = dateOnlyKey(a);
  const kb = dateOnlyKey(b);
  if (!ka && !kb) return 0;
  if (!ka) return -1;
  if (!kb) return 1;
  if (ka === kb) return 0;
  return ka < kb ? -1 : 1;
}

/** True for a bare calendar day ("YYYY-MM-DD") — never true for a real timestamp. */
export function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(value.trim());
}

/**
 * Display a stored value in a shared helper that may receive either kind of field:
 * a bare calendar date renders from its stored day (never shifted by timezone),
 * while a real timestamp keeps the previous locale rendering, so those stay as they were.
 */
export function formatDateValue(value, style = "short", fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (isDateOnly(value)) return formatDateOnly(value, style);
  const d = new Date(value);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-GB", STYLES[style] || STYLES.short);
}