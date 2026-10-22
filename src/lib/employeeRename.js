/**
 * Propagates an employee name change to all entities that cache `employee_name`.
 *
 * When an employee is renamed (e.g. "Muhammad Amer" → "Amer"), the old name
 * stays cached in TimeEntry, PayrollEntry, WorkingReport, etc.  This makes it
 * look like a different person — old records show the old name, new records
 * show the new name, even though the `employee_id` is the same.
 *
 * Call this after updating an Employee record whenever the name changes.
 *
 * @param {import("@/api/base44Client").base44} base44
 * @param {string} employeeId
 * @param {string} oldName
 * @param {string} newName
 */
export async function propagateEmployeeRename(base44, employeeId, oldName, newName) {
  if (!employeeId || !newName || oldName === newName) return;

  // Entities that cache employee_name and should be updated in bulk.
  const entities = [
    "TimeEntry",
    "PayrollEntry",
    "WorkingReport",
    "EmployeePayrollProfile",
    "LeaveRequest",
    "EmployeeDocument",
    "HistoricalPayment",
    "WorkerLocation",
  ];

  await Promise.all(
    entities.map(async (entityName) => {
      try {
        await base44.entities[entityName].updateMany(
          { employee_id: employeeId },
          { $set: { employee_name: newName } }
        );
      } catch {
        // Entity may not exist or may have RLS restrictions — skip silently.
      }
    })
  );
}