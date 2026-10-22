import {
  format, startOfMonth, endOfMonth, subMonths,
  startOfQuarter, endOfQuarter, subQuarters,
  startOfYear, endOfYear, subYears,
  startOfWeek, endOfWeek, subWeeks,
} from "date-fns";

/**
 * Build an array of comparison periods from a main date range and a comparison config.
 * Returns [{ from, to, label }, ...] — first entry is the main period.
 */
import { parseDateOnly } from "@/lib/dateOnly";

export function buildComparisonPeriods(fromStr, toStr, comparison) {
  const cols = [];
  const mainFrom = parseDateOnly(fromStr);
  const mainTo = parseDateOnly(toStr);
  mainTo.setHours(23, 59, 59);
  cols.push({ from: mainFrom, to: mainTo, label: format(mainTo, "d MMM yyyy") });

  const n = comparison.value || 0;

  if (comparison.type === "weeks") {
    for (let i = 1; i <= n; i++) {
      const f = startOfWeek(subWeeks(mainFrom, i), { weekStartsOn: 1 });
      const t = endOfWeek(subWeeks(mainFrom, i), { weekStartsOn: 1 });
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label: `${format(f, "d MMM")} - ${format(t, "d MMM yyyy")}` });
    }
  } else if (comparison.type === "months") {
    for (let i = 1; i <= n; i++) {
      const f = startOfMonth(subMonths(mainFrom, i));
      const t = endOfMonth(subMonths(mainFrom, i));
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label: format(t, "MMM yyyy") });
    }
  } else if (comparison.type === "quarters") {
    for (let i = 1; i <= n; i++) {
      const f = startOfQuarter(subQuarters(mainFrom, i));
      const t = endOfQuarter(subQuarters(mainFrom, i));
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label: `${format(f, "d MMM")} - ${format(t, "d MMM yyyy")}` });
    }
  } else if (comparison.type === "years") {
    for (let i = 1; i <= n; i++) {
      const f = startOfYear(subYears(mainFrom, i));
      const t = endOfYear(subYears(mainFrom, i));
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label: format(t, "yyyy") });
    }
  } else if (comparison.type === "shift") {
    // Same period shifted back (e.g. month-to-date vs same days last month, YTD vs last year YTD)
    for (let i = 1; i <= n; i++) {
      const f = comparison.unit === "year" ? subYears(mainFrom, i) : subMonths(mainFrom, i);
      const t = comparison.unit === "year" ? subYears(mainTo, i) : subMonths(mainTo, i);
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label: `${format(f, "d MMM")} - ${format(t, "d MMM yyyy")}` });
    }
  } else if (comparison.type === "previous") {
    let f, t, label;
    if (comparison.value === "month") {
      f = startOfMonth(subMonths(mainFrom, 1));
      t = endOfMonth(subMonths(mainFrom, 1));
      label = format(t, "MMM yyyy");
    } else if (comparison.value === "quarter") {
      f = startOfQuarter(subQuarters(mainFrom, 1));
      t = endOfQuarter(subQuarters(mainFrom, 1));
      label = `${format(f, "d MMM")} - ${format(t, "d MMM yyyy")}`;
    } else if (comparison.value === "year") {
      f = startOfYear(subYears(mainFrom, 1));
      t = endOfYear(subYears(mainFrom, 1));
      label = format(t, "yyyy");
    }
    if (f && t) {
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label });
    }
  }
  return cols;
}

/** Convert a period object { from, to } to the yyyy-MM-dd strings the backend expects. */
export function periodToArgs(p) {
  return {
    from_date: format(p.from, "yyyy-MM-dd"),
    to_date: format(p.to, "yyyy-MM-dd"),
  };
}