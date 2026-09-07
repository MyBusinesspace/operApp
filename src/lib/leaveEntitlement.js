// Accrued annual leave entitlement.
// 2.5 natural days per completed month (i.e. annual_leave_days / 12),
// counted up to today:
//   - Current-year hires: from the hire date.
//   - Prior-year hires: from Jan 1 of the current year.
//   - No hire date: from Jan 1 of the current year.
// Entitlement is floored; remaining is ceiled (matches the existing convention).

export function computeAccruedEntitlement({ hireDate, annualLeaveDays = 30, today, currentYear } = {}) {
  const now = today || new Date();
  const year = currentYear || now.getFullYear();
  const monthlyRate = (annualLeaveDays || 30) / 12;

  let periodStart;
  if (hireDate) {
    const hire = new Date(hireDate);
    periodStart = hire.getFullYear() >= year ? hire : new Date(year, 0, 1);
  } else {
    periodStart = new Date(year, 0, 1);
  }

  // Completed calendar months from periodStart to today
  let months = (now.getFullYear() - periodStart.getFullYear()) * 12 + (now.getMonth() - periodStart.getMonth());
  // If we haven't reached the start day-of-month yet, the current month isn't complete
  if (now.getDate() < periodStart.getDate()) months -= 1;
  if (months < 0) months = 0;

  const isProrated = months < 12;
  const rawEntitlement = months * monthlyRate;

  return { rawEntitlement, isProrated, months };
}