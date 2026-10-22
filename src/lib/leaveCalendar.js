// Date-aware leave checks backed by approved LeaveRequest records.
// Used by the planner so that "Update workers" only strips an employee
// from a task when they are actually on leave on THAT task's date — not
// just because they are on leave today.

export function isOnLeaveOnDate(empId, dateStr, approvedLeaves) {
  if (!empId || !dateStr) return false;
  return (approvedLeaves || []).some(
    (lr) =>
      lr.employee_id === empId &&
      lr.status === "approved" &&
      lr.start_date &&
      lr.end_date &&
      lr.start_date <= dateStr &&
      lr.end_date >= dateStr
  );
}