// Shared leave-status sync logic.
// Recomputes an Employee's On Leave / Active status from their approved
// LeaveRequest records. Used by the syncEmployeeLeaveStatus entity automation
// (fires on every leave create/update/delete) and the clearStaleLeaveFlags
// scheduled cleanup, so web and mobile inputs stay consistent.

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Recompute and persist the leave-derived status for a single employee.
 * Only toggles between "Active" and "On Leave" — never overrides
 * "Inactive" / "Terminated" employees.
 */
export async function recomputeEmployeeLeaveStatus(base44, employeeId: string) {
  if (!employeeId) return { skipped: true, reason: "no employee_id" };

  let employees: any[] = [];
  try {
    employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
  } catch {
    return { skipped: true, reason: "employee lookup failed" };
  }
  const emp = employees?.[0];
  if (!emp) return { skipped: true, reason: "employee not found" };

  // Don't touch non-active employment states
  if (emp.status === "Inactive" || emp.status === "Terminated") {
    return { skipped: true, reason: `employee is ${emp.status}` };
  }

  const today = todayStr();
  let leaves: any[] = [];
  try {
    leaves = await base44.asServiceRole.entities.LeaveRequest.filter(
      { employee_id: employeeId, status: "approved" },
      "-start_date",
      200,
    );
  } catch {
    leaves = [];
  }

  const current = (leaves || []).find(
    (l) => l.start_date && l.end_date && l.start_date <= today && l.end_date >= today,
  );

  const desired = current
    ? { status: "On Leave", absence_status: current.leave_type || null }
    : { status: "Active", absence_status: null };

  const needsUpdate =
    emp.status !== desired.status || emp.absence_status !== desired.absence_status;

  if (needsUpdate) {
    await base44.asServiceRole.entities.Employee.update(employeeId, desired);
    return { updated: true, ...desired };
  }
  return { updated: false, ...desired };
}