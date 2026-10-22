// Shared leave validation: working days (same rule as payroll), overlaps, vacation balance cap.
// @ts-nocheck

export function workingDays(startStr: string, endStr: string, perWeek = 5) {
  const maxDow = perWeek >= 6 ? 6 : 5;
  const cur = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  let n = 0;
  while (cur <= end) {
    const d = cur.getDay();
    if (d >= 1 && d <= maxDow) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

// Same accrual as the Leave page: annual_leave_days / 12 per completed month.
export function accruedEntitlement(hireDate: string | null, annualDays: number, asOf: Date) {
  const year = asOf.getFullYear();
  const rate = (annualDays || 30) / 12;
  let start = new Date(year, 0, 1);
  if (hireDate) {
    const h = new Date(hireDate);
    if (h.getFullYear() >= year) start = h;
  }
  let months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  if (asOf.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  return Math.floor(months * rate);
}

// Returns { error } or { total_days }.
export async function validateLeave(base44, p: { employee: any; leave_type: string; start_date: string; end_date: string; excludeId?: string }) {
  const { employee, leave_type, start_date, end_date, excludeId } = p;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end_date || '')) {
    return { error: 'Invalid dates' };
  }
  if (start_date > end_date) return { error: 'The start date must be on or before the end date' };
  const sRows = await base44.asServiceRole.entities.PayrollSettings.list('-created_date', 1);
  const perWeek = sRows?.[0]?.working_days_per_week || 5;
  const total_days = workingDays(start_date, end_date, perWeek);
  if (total_days < 1) return { error: 'The selected dates contain no working days' };

  const existing = await base44.asServiceRole.entities.LeaveRequest.filter(
    { employee_id: employee.id, status: { $in: ['pending', 'approved'] } }, '-created_date', 5000);
  const clash = (existing || []).find((r) => r.id !== excludeId && r.start_date <= end_date && r.end_date >= start_date);
  if (clash) {
    return { error: `Overlaps an existing ${clash.status} request (${clash.start_date} to ${clash.end_date})` };
  }

  if (leave_type === 'vacation') {
    const profs = await base44.asServiceRole.entities.EmployeePayrollProfile.filter({ employee_id: employee.id });
    const prof = profs?.[0];
    const year = parseInt(start_date.slice(0, 4), 10);
    const entitlement = accruedEntitlement(employee.hire_date || null, prof?.annual_leave_days ?? 30, new Date(start_date + 'T12:00:00'));
    const used = (prof?.leave_used_override != null && year === new Date().getFullYear())
      ? prof.leave_used_override
      : (existing || []).filter((r) => r.id !== excludeId && r.leave_type === 'vacation' && r.status === 'approved' && String(r.start_date).startsWith(String(year)))
          .reduce((s, r) => s + (r.total_days || 0), 0);
    const pending = (existing || []).filter((r) => r.id !== excludeId && r.leave_type === 'vacation' && r.status === 'pending' && String(r.start_date).startsWith(String(year)))
      .reduce((s, r) => s + (r.total_days || 0), 0);
    const remaining = entitlement - used - pending;
    if (total_days > remaining) {
      return { error: `Not enough vacation balance: ${total_days} working day(s) requested, ${Math.max(0, remaining)} available (including pending requests)` };
    }
  }
  return { total_days };
}