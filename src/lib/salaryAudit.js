import { base44 } from "@/api/base44Client";

/**
 * Log a salary change to SalaryAuditLog.
 * @param {object} params
 * @param {string} params.employeeId
 * @param {string} params.employeeName
 * @param {string} params.profileId
 * @param {string} params.field - e.g. "basic_salary" | "hourly_rate"
 * @param {number} params.oldValue
 * @param {number} params.newValue
 * @param {object} params.user - { id, full_name }
 * @param {"individual_edit"|"bulk_edit"} params.source
 */
export async function logSalaryChange({ employeeId, employeeName, profileId, field, oldValue, newValue, user, source = "individual_edit" }) {
  const action = field === "basic_salary" ? "salary_updated" : "hourly_rate_updated";
  await base44.entities.SalaryAuditLog.create({
    employee_id: employeeId,
    employee_name: employeeName,
    profile_id: profileId,
    action,
    source,
    field_changed: field,
    old_value: oldValue,
    new_value: newValue,
    change_amount: newValue - oldValue,
    performed_by_id: user?.id || "",
    performed_by_name: user?.full_name || "Unknown",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a profile creation.
 */
export async function logProfileCreated({ employeeId, employeeName, profileId, user }) {
  await base44.entities.SalaryAuditLog.create({
    employee_id: employeeId,
    employee_name: employeeName,
    profile_id: profileId,
    action: "profile_created",
    source: "individual_edit",
    performed_by_id: user?.id || "",
    performed_by_name: user?.full_name || "Unknown",
    timestamp: new Date().toISOString(),
  });
}