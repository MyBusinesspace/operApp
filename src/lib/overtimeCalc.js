import { format, isSunday } from "date-fns";

/**
 * Compute overtime for a single TimeEntry given payroll settings + profile.
 * Mirrors the logic used by the Overtime Report so values stay consistent.
 */
export function computeOvertime(entry, settings, profile) {
  if (!entry || !entry.clock_out_time || !entry.clock_in_time) return null;
  const clockIn = new Date(entry.clock_in_time);
  const clockOut = new Date(entry.clock_out_time);
  const totalMins = entry.duration_minutes || Math.round((clockOut - clockIn) / 60000);

  // Always threshold-based (total hours per day). Clock-out-time method removed.
  const thresholdMins = (settings?.overtime_threshold_daily_h || 8) * 60;
  let regularMins = Math.min(totalMins, thresholdMins);
  let overtimeMins = Math.max(0, totalMins - thresholdMins);

  // Manager override — changes OT only; REG stays capped at the threshold
  if (entry.overtime_override_minutes != null) {
    overtimeMins = entry.overtime_override_minutes;
  }

  if (overtimeMins <= 0 && entry.overtime_override_minutes == null) return null;

  const dateStr = format(clockIn, "yyyy-MM-dd");
  const holidays = settings?.public_holidays || [];
  const isHoliday = holidays.includes(dateStr);
  const isSun = isSunday(clockIn);
  const dayType = isHoliday ? "holiday" : isSun ? "sunday" : "regular";

  const basicSalary = profile?.basic_salary || 0;
  const workDays = settings?.working_days_per_month || 22;
  const workHours = settings?.working_hours_per_day || 8;
  const baseHourly = profile?.pay_type === "hourly"
    ? (profile.hourly_rate || 0)
    : (basicSalary > 0 ? basicSalary / workDays / workHours : 0);

  let otRate = 0;
  if (dayType === "holiday") {
    const fixed = parseFloat(settings?.overtime_fixed_rate_holiday);
    otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings?.overtime_multiplier_holiday || 2.0);
  } else if (dayType === "sunday") {
    const fixed = parseFloat(settings?.overtime_fixed_rate_sunday);
    otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings?.overtime_multiplier_sunday || 2.0);
  } else {
    const fixed = parseFloat(settings?.overtime_fixed_rate);
    otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings?.overtime_multiplier || 1.5);
  }

  return {
    overtimeMins,
    regularMins,
    totalMins,
    dayType,
    otRate,
    overtimeCost: otRate * (overtimeMins / 60),
  };
}

/**
 * Compute overtime per DAY for a set of entries (one employee).
 * Groups all entries by calendar day, sums total hours, and applies the
 * daily threshold. Returns an array of day objects (only days with OT).
 */
export function computeOvertimeForEntries(entries, settings, profile) {
  if (!settings || !entries || entries.length === 0) return [];
  const thresholdMins = (settings.overtime_threshold_daily_h || 8) * 60;
  const holidays = settings.public_holidays || [];
  const map = {};

  entries.forEach(entry => {
    if (!entry.clock_out_time || !entry.clock_in_time) return;
    const d = new Date(entry.clock_in_time);
    const dayKey = format(d, "yyyy-MM-dd");
    if (!map[dayKey]) map[dayKey] = { dayKey, totalMins: 0, entries: [], overrideMins: 0, hasOverride: false };
    const dur = entry.duration_minutes || Math.round((new Date(entry.clock_out_time) - d) / 60000);
    map[dayKey].totalMins += dur;
    map[dayKey].entries.push(entry);
    if (entry.overtime_override_minutes != null) {
      map[dayKey].hasOverride = true;
      map[dayKey].overrideMins += entry.overtime_override_minutes;
    }
  });

  const basicSalary = profile?.basic_salary || 0;
  const workDays = settings.working_days_per_month || 22;
  const workHours = settings.working_hours_per_day || 8;
  const baseHourly = profile?.pay_type === "hourly"
    ? (profile.hourly_rate || 0)
    : (basicSalary > 0 ? basicSalary / workDays / workHours : 0);

  return Object.keys(map).sort().map(dayKey => {
    const day = map[dayKey];
    let otMins;
    if (day.hasOverride) {
      otMins = Math.max(0, day.overrideMins);
    } else {
      otMins = Math.max(0, day.totalMins - thresholdMins);
    }
    const isHoliday = holidays.includes(dayKey);
    const isSun = isSunday(new Date(dayKey + "T12:00:00"));
    const dayType = isHoliday ? "holiday" : isSun ? "sunday" : "regular";
    let otRate = 0;
    if (dayType === "holiday") {
      const fixed = parseFloat(settings.overtime_fixed_rate_holiday);
      otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings.overtime_multiplier_holiday || 2.0);
    } else if (dayType === "sunday") {
      const fixed = parseFloat(settings.overtime_fixed_rate_sunday);
      otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings.overtime_multiplier_sunday || 2.0);
    } else {
      const fixed = parseFloat(settings.overtime_fixed_rate);
      otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings.overtime_multiplier || 1.5);
    }
    return {
      dayKey,
      totalMins: day.totalMins,
      regularMins: Math.min(day.totalMins, thresholdMins),
      overtimeMins: otMins,
      dayType,
      otRate,
      overtimeCost: otRate * (otMins / 60),
      entries: day.entries,
      hasOverride: day.hasOverride,
    };
  }).filter(d => d.overtimeMins > 0 || d.hasOverride);
}

export function fmtMins(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

export function fmtAED(val) {
  if (val == null || isNaN(val)) return "—";
  return `${val.toFixed(val % 1 === 0 ? 0 : 1)} AED`;
}