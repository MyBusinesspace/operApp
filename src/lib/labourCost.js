import { base44 } from "@/api/base44Client";
import { format, isSunday } from "date-fns";
import { withRetry } from "@/lib/sdkRetry";

// Overtime threshold: hours per day beyond which OT rate kicks in
export const OT_THRESHOLD_HOURS = 8;
// Default overtime multiplier if no specific rate configured
export const DEFAULT_OT_MULTIPLIER = 1.5;

/**
 * Derive an employee's hourly rate from their payroll profile and the saved Payroll settings.
 * - pay_type "hourly" -> hourly_rate
 * - otherwise -> basic_salary / working_days_per_month / working_hours_per_day (defaults 22 / 8)
 * Returns null when no rate can be derived.
 */
export function getHourlyRate(profile, settings) {
  if (!profile) return null;
  if (profile.pay_type === "hourly") return profile.hourly_rate || 0;
  if (profile.basic_salary) {
    const days = Number(settings?.working_days_per_month) || 22;
    const hours = Number(settings?.working_hours_per_day) || 8;
    return profile.basic_salary / days / hours;
  }
  return null;
}

/** Overtime rate for a given day type, from the saved Payroll settings (same rules as overtimeCalc.js). */
export function overtimeRateFor(dayKey, baseHourly, settings) {
  const s = settings || {};
  const holidays = s.public_holidays || [];
  const num = v => { const n = parseFloat(v); return !isNaN(n) && n > 0 ? n : null; };
  if (holidays.includes(dayKey)) return num(s.overtime_fixed_rate_holiday) ?? baseHourly * (Number(s.overtime_multiplier_holiday) || 2.0);
  if (isSunday(new Date(dayKey + "T12:00:00"))) return num(s.overtime_fixed_rate_sunday) ?? baseHourly * (Number(s.overtime_multiplier_sunday) || 2.0);
  return num(s.overtime_fixed_rate) ?? baseHourly * (s.overtime_multiplier != null && s.overtime_multiplier !== "" ? Number(s.overtime_multiplier) : 1.5);
}

export function entryDayKey(e) {
  if (!e.clock_in_time) return "unknown";
  const d = new Date(e.clock_in_time);
  return isNaN(d) ? "unknown" : format(d, "yyyy-MM-dd");
}

export async function fetchPayrollSettings() {
  // null only means "the read succeeded and there is no settings record".
  // A failed read is logged and still yields null so callers keep their
  // existing default-parameter behaviour.
  try {
    const l = await withRetry(() => base44.entities.PayrollSettings.list(), { tries: 4, label: "labourCost.PayrollSettings" });
    return (Array.isArray(l) && l[0]) || null;
  } catch (e) {
    console.error("Could not load payroll settings:", e);
    return null;
  }
}

/**
 * Load what the day-aware calculation needs for a set of scoped entries:
 * the saved Payroll settings and ALL time entries of the same employees on the same days
 * (so the daily overtime threshold applies to the whole day, not to one task).
 */
export async function loadLabourContext(scopeEntries) {
  const settings = await fetchPayrollSettings();
  const entries = (scopeEntries || []).filter(e => e.employee_id && e.clock_in_time);
  const byEmp = {};
  entries.forEach(e => {
    const t = new Date(e.clock_in_time).getTime();
    const r = byEmp[e.employee_id] || (byEmp[e.employee_id] = { min: t, max: t });
    r.min = Math.min(r.min, t); r.max = Math.max(r.max, t);
  });
  const DAY = 86400000;
  const lists = await Promise.all(Object.entries(byEmp).map(([eid, r]) =>
    base44.entities.TimeEntry.filter({
      employee_id: eid,
      clock_in_time: { $gte: new Date(r.min - DAY).toISOString(), $lte: new Date(r.max + DAY).toISOString() },
    }, "clock_in_time", 5000).catch(() => [])
  ));
  // Office attendance of the same employees in the same period (counts toward the day total)
  const attLists = await Promise.all(Object.entries(byEmp).map(async ([eid, r]) => {
    try {
      const range = { $gte: new Date(r.min - DAY).toISOString(), $lte: new Date(r.max + DAY).toISOString() };
      const days = await base44.entities.AttendanceDay.filter({ employee_id: eid, clock_in_time: range }, "clock_in_time", 2000);
      if (!days?.length) return [];
      const ids = days.map(d => d.id);
      const al = await base44.entities.AttendanceAllocation.filter({ attendance_id: { $in: ids } }, "-created_date", 5000);
      return attendanceToEntries(days, al);
    } catch { return []; }
  }));
  const seen = new Set();
  const dayEntries = [];
  [...lists.flat(), ...attLists.flat(), ...(scopeEntries || [])].forEach(e => { if (e && !seen.has(e.id)) { seen.add(e.id); dayEntries.push(e); } });
  return { settings, dayEntries };
}


/**
 * Office attendance as cost entries. A closed AttendanceDay becomes one entry per allocation (task / project)
 * plus one "overhead" entry for the time not pointed anywhere, so overtime uses the whole day.
 */
export function attendanceToEntries(days, allocs, { includeOverhead = true } = {}) {
  const byDay = {};
  (allocs || []).forEach(a => { (byDay[a.attendance_id] = byDay[a.attendance_id] || []).push(a); });
  const out = [];
  (days || []).forEach(d => {
    if (!d || d.status === "Open" || !d.duration_minutes) return;
    const list = byDay[d.id] || [];
    let used = 0;
    list.forEach(a => {
      const mins = Math.min(a.minutes || 0, Math.max(0, d.duration_minutes - used));
      used += mins;
      if (mins <= 0) return;
      out.push({
        id: `att:${a.id}`, _attendance: true, employee_id: d.employee_id, employee_name: d.employee_name, user_id: d.user_id,
        task_id: a.task_id || "", task_title: a.task_title || "", project_id: a.project_id || "", project_name: a.project_name || "",
        contact_id: a.contact_id || "", contact_name: a.contact_name || "", clock_in_time: d.clock_in_time, duration_minutes: mins,
        currency: d.currency || "AED", status: "Completed",
      });
    });
    const rest = d.duration_minutes - used;
    if (includeOverhead && rest > 0) {
      out.push({
        id: `att-oh:${d.id}`, _attendance: true, _overhead: true, employee_id: d.employee_id, employee_name: d.employee_name, user_id: d.user_id,
        task_id: "", task_title: "Office overhead", project_id: "__overhead__", project_name: "Overhead (not pointed)",
        contact_id: "__overhead__", contact_name: "Overhead (not pointed)", clock_in_time: d.clock_in_time, duration_minutes: rest,
        currency: d.currency || "AED", status: "Completed",
      });
    }
  });
  return out;
}

/** Attendance entries pointed to one task or project (for the task / project labour panels). */
export async function loadAttendanceScope(filterKey, filterId) {
  if (filterKey !== "task_id" && filterKey !== "project_id") return [];
  try {
    const allocs = await base44.entities.AttendanceAllocation.filter({ [filterKey]: filterId }, "-created_date", 5000);
    if (!allocs?.length) return [];
    const ids = [...new Set(allocs.map(a => a.attendance_id))];
    const days = await base44.entities.AttendanceDay.filter({ id: { $in: ids } }, "-clock_in_time", 5000);
    const all = await base44.entities.AttendanceAllocation.filter({ attendance_id: { $in: ids } }, "-created_date", 5000);
    return attendanceToEntries(days, all, { includeOverhead: false }).filter(e => e[filterKey] === filterId);
  } catch { return []; }
}

/**
 * Cost of every entry in `scopeEntries`, day-aware.
 * For each employee and day: total hours of the day (all tasks/projects) decide the overtime
 * (above overtime_threshold_daily_h, or overtime_override_minutes when set). Regular hours cost the
 * base rate, overtime hours the overtime rate for that day type. An entry carries its share of the day.
 * Returns { [entryId]: { hours, regularHours, overtimeHours, cost, regularCost, overtimeCost, rate, otRate, dayKey, currency } | null (no rate) }.
 */
export function entryCosts(scopeEntries, profileMap, ctx = {}) {
  const settings = ctx.settings || null;
  const dayEntries = ctx.dayEntries || scopeEntries || [];
  const threshold = Number(settings?.overtime_threshold_daily_h) || OT_THRESHOLD_HOURS;
  const days = {};
  dayEntries.forEach(e => {
    if (!e.employee_id || !e.duration_minutes) return;
    const k = e.employee_id + "|" + entryDayKey(e);
    const d = days[k] || (days[k] = { mins: 0, override: 0, hasOverride: false });
    d.mins += e.duration_minutes || 0;
    if (e.overtime_override_minutes != null) { d.hasOverride = true; d.override += e.overtime_override_minutes; }
  });
  const out = {};
  (scopeEntries || []).forEach(e => {
    const profile = profileMap?.[e.employee_id];
    const rate = getHourlyRate(profile, settings);
    if (rate == null) { out[e.id] = null; return; }
    const hours = (e.duration_minutes || 0) / 60;
    const dayKey = entryDayKey(e);
    const d = days[e.employee_id + "|" + dayKey] || { mins: e.duration_minutes || 0, override: 0, hasOverride: false };
    const dayHours = d.mins / 60 || hours || 1;
    const otDay = d.hasOverride ? Math.max(0, d.override) / 60 : Math.max(0, dayHours - threshold);
    const share = dayHours > 0 ? hours / dayHours : 0;
    const overtimeHours = Math.min(hours, otDay * share);
    const regularHours = hours - overtimeHours;
    const otRate = overtimeRateFor(dayKey, rate, settings);
    const regularCost = regularHours * rate;
    const overtimeCost = overtimeHours * otRate;
    out[e.id] = { hours, regularHours, overtimeHours, regularCost, overtimeCost, cost: regularCost + overtimeCost, rate, otRate, dayKey, currency: e.currency || settings?.currency || "AED" };
  });
  return out;
}

/**
 * Fetch payroll profiles for a set of employee IDs.
 * Returns a map: { employee_id → profile | null }
 */
export async function fetchProfiles(employeeIds) {
  const profiles = await Promise.all(
    employeeIds.map(eid =>
      base44.entities.EmployeePayrollProfile.filter({ employee_id: eid })
        .then(res => (res && res.length > 0 ? res[0] : null))
        .catch(() => null)
    )
  );
  const map = {};
  employeeIds.forEach((eid, i) => { map[eid] = profiles[i]; });
  return map;
}

/**
 * Compute labour cost from time entries + a profile map.
 * ctx = { settings, dayEntries } from loadLabourContext() so overtime uses the whole day and the
 * saved Payroll settings. Without ctx it falls back to the given entries and default settings.
 * Costs are grouped by the currency stamped on each entry and never summed across currencies.
 */
export function computeLabourCost(timeEntries, profileMap, ctx = {}) {
  const costs = entryCosts(timeEntries, profileMap, ctx);
  const byEmployee = {};
  (timeEntries || []).forEach(entry => {
    const eid = entry.employee_id;
    if (!eid) return;
    if (!byEmployee[eid]) byEmployee[eid] = { name: entry.employee_name || eid, entries: [] };
    byEmployee[eid].entries.push(entry);
  });
  const missing = [];
  const byDay = {};
  const byCurrency = {};
  const cur = code => byCurrency[code] || (byCurrency[code] = { hours: 0, regularCost: 0, otCost: 0, total: 0 });
  let totalHours = 0, totalRegularCost = 0, totalOtCost = 0;

  const rows = Object.entries(byEmployee).map(([eid, { name, entries }]) => {
    const totalMins = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const rowCurrency = entries[entries.length - 1]?.currency || ctx.settings?.currency || "AED";
    let regularHours = 0, overtimeHours = 0, regularCost = 0, overtimeCost = 0, hasRate = false, rate = null, otRate = null;
    entries.forEach(e => {
      const c = costs[e.id];
      const hrs = (e.duration_minutes || 0) / 60;
      if (!c) { regularHours += hrs; return; }
      hasRate = true; rate = c.rate; otRate = c.otRate;
      regularHours += c.regularHours; overtimeHours += c.overtimeHours;
      regularCost += c.regularCost; overtimeCost += c.overtimeCost;
      const cc = cur(c.currency);
      cc.hours += c.hours; cc.regularCost += c.regularCost; cc.otCost += c.overtimeCost; cc.total += c.cost;
      const bd = byDay[c.dayKey] || (byDay[c.dayKey] = { labourCost: 0, minutes: 0, currency: c.currency });
      bd.labourCost += c.cost; bd.minutes += e.duration_minutes || 0;
    });
    if (!hasRate) {
      missing.push(name);
      return { employeeId: eid, name, totalMins, regularHours, overtimeHours, hourlyRate: null, overtimeRate: null, regularCost: null, overtimeCost: null, totalCost: null, currency: rowCurrency };
    }
    totalHours += totalMins / 60; totalRegularCost += regularCost; totalOtCost += overtimeCost;
    return { employeeId: eid, name, totalMins, regularHours, overtimeHours, hourlyRate: rate, overtimeRate: otRate, regularCost, overtimeCost, totalCost: regularCost + overtimeCost, currency: rowCurrency };
  });

  return {
    rows,
    missingProfiles: missing,
    totals: { hours: totalHours, regularCost: totalRegularCost, otCost: totalOtCost, total: totalRegularCost + totalOtCost },
    byCurrency,
    byDay,
  };
}