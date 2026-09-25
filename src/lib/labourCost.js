import { base44 } from "@/api/base44Client";

// Overtime threshold: hours per day beyond which OT rate kicks in
export const OT_THRESHOLD_HOURS = 8;
// Default overtime multiplier if no specific rate configured
export const DEFAULT_OT_MULTIPLIER = 1.5;

/**
 * Derive an employee's hourly rate from their payroll profile.
 * - pay_type "hourly" → hourly_rate
 * - otherwise → basic_salary ÷ 22 working days ÷ 8 hours
 * Returns null when no rate can be derived.
 */
export function getHourlyRate(profile) {
  if (!profile) return null;
  if (profile.pay_type === "hourly") return profile.hourly_rate || 0;
  if (profile.basic_salary) return profile.basic_salary / 22 / 8;
  return null;
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
 *
 * Returns:
 *   rows:           per-employee breakdown (same shape as WorkhandCostPanel)
 *   totals:         { hours, regularCost, otCost, total }
 *   missingProfiles: employee names without a usable payroll profile
 *   byDay:          { 'YYYY-MM-DD': { labourCost, minutes } } for charting
 */
export function computeLabourCost(timeEntries, profileMap) {
  const byEmployee = {};
  (timeEntries || []).forEach(entry => {
    const eid = entry.employee_id;
    if (!eid) return;
    if (!byEmployee[eid]) byEmployee[eid] = { name: entry.employee_name || eid, entries: [] };
    byEmployee[eid].entries.push(entry);
  });

  const missing = [];
  let totalHours = 0, totalRegularCost = 0, totalOtCost = 0;
  const byDay = {};

  const rows = Object.entries(byEmployee).map(([eid, { name, entries }]) => {
    const profile = profileMap[eid];
    const totalMins = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const totalHoursEmp = totalMins / 60;

    // Group by calendar date to compute OT per day
    const byDate = {};
    entries.forEach(e => {
      const dateKey = (e.clock_in_time || "").slice(0, 10) || "unknown";
      if (!byDate[dateKey]) byDate[dateKey] = 0;
      byDate[dateKey] += (e.duration_minutes || 0) / 60;
    });

    let regularHours = 0;
    let overtimeHours = 0;
    const perDay = {};
    Object.entries(byDate).forEach(([dateKey, dayHours]) => {
      let reg, ot;
      if (dayHours <= OT_THRESHOLD_HOURS) {
        reg = dayHours;
        ot = 0;
      } else {
        reg = OT_THRESHOLD_HOURS;
        ot = dayHours - OT_THRESHOLD_HOURS;
      }
      regularHours += reg;
      overtimeHours += ot;
      perDay[dateKey] = { regularHours: reg, overtimeHours: ot, minutes: dayHours * 60 };
    });

    if (!profile || !profile.basic_salary) {
      missing.push(name);
      return {
        employeeId: eid,
        name,
        totalMins,
        regularHours,
        overtimeHours,
        hourlyRate: null,
        overtimeRate: null,
        regularCost: null,
        overtimeCost: null,
        totalCost: null,
      };
    }

    const hourlyRate = getHourlyRate(profile);
    const overtimeRate = hourlyRate * DEFAULT_OT_MULTIPLIER;
    const regularCost = regularHours * hourlyRate;
    const overtimeCost = overtimeHours * overtimeRate;
    const totalCost = regularCost + overtimeCost;

    // Per-day labour cost for charting
    Object.entries(perDay).forEach(([dateKey, { regularHours: rh, overtimeHours: oh }]) => {
      if (!byDay[dateKey]) byDay[dateKey] = { labourCost: 0, minutes: 0 };
      byDay[dateKey].labourCost += rh * hourlyRate + oh * overtimeRate;
      byDay[dateKey].minutes += perDay[dateKey].minutes;
    });

    totalHours += totalHoursEmp;
    totalRegularCost += regularCost;
    totalOtCost += overtimeCost;

    return {
      employeeId: eid,
      name,
      totalMins,
      regularHours,
      overtimeHours,
      hourlyRate,
      overtimeRate,
      regularCost,
      overtimeCost,
      totalCost,
    };
  });

  return {
    rows,
    missingProfiles: missing,
    totals: {
      hours: totalHours,
      regularCost: totalRegularCost,
      otCost: totalOtCost,
      total: totalRegularCost + totalOtCost,
    },
    byDay,
  };
}