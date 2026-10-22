import { base44 } from "@/api/base44Client";

/**
 * Sync data-scope flags (can_view_all_employees, can_view_all_leave, can_view_all_payroll, can_view_all_petty_cash)
 * from an EmployeeRole to all Users linked to Employees with that role.
 *
 * Called when a role's scope flags are saved in RolePermissionsSection, so that
 * RLS rules on LeaveRequest / PayrollEntry / EmployeeDocument pick up the change
 * for every user who holds that role.
 *
 * @param {string} roleKey - The EmployeeRole key (e.g. "payroll_admin")
 * @param {object} scopeFlags - { can_view_all_employees, can_view_all_leave, can_view_all_payroll, can_view_all_petty_cash }
 * @returns {Promise<{updated: number, failed: number, total: number}>}
 */
export async function syncRoleScopeToUsers(roleKey, scopeFlags) {
  const employees = await base44.entities.Employee.filter({ role: roleKey }, "full_name", 500);
  const userIds = employees.filter(e => e.user_id).map(e => e.user_id);
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return { updated: 0, failed: 0, total: 0 };

  // Prefer a single bulk update — one API call avoids the per-user rate-limit
  // failures that sequential User.update loops hit.
  try {
    await base44.entities.User.bulkUpdate(
      uniqueUserIds.map(id => ({ id, ...scopeFlags }))
    );
    return { updated: uniqueUserIds.length, failed: 0, total: uniqueUserIds.length };
  } catch (e) {
    // Fallback: sequential updates with a short delay between each.
    let updated = 0;
    let failed = 0;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (const userId of uniqueUserIds) {
      try {
        await base44.entities.User.update(userId, scopeFlags);
        updated++;
      } catch (err) {
        failed++;
      }
      await sleep(250);
    }
    return { updated, failed, total: uniqueUserIds.length };
  }
}

/**
 * Get the scope flags that should be applied to a user based on their role.
 * Administrator role always gets all flags set to true.
 *
 * @param {object} role - The EmployeeRole record (with can_view_all_* fields)
 * @returns {{can_view_all_employees: boolean, can_view_all_leave: boolean, can_view_all_payroll: boolean, can_view_all_petty_cash: boolean}}
 */
/**
 * Map an EmployeeRole key to the platform User.role value.
 * The Base44 platform checks `role === "admin"` for platform-admin features
 * (managing users, bypassing RLS), so only the administrator role maps to "admin";
 * every other role maps to "regular platform user". App-level permissions are
 * still controlled by the RolePermission matrix.
 */
export function getPlatformRoleForKey(roleKey) {
  return roleKey === "administrator" ? "admin" : "user";
}

/**
 * Sync a single linked app User from an EmployeeRole: sets the platform User.role
 * (admin/user) AND the data-scope flags (can_view_all_*) in one update.
 *
 * @param {string} userId - The linked User id (Employee.user_id)
 * @param {object} role - The EmployeeRole record
 * @returns {Promise<boolean>} true if updated, false if skipped/failed
 */
export async function syncUserFromRole(userId, role) {
  if (!userId) return false;
  const platformRole = getPlatformRoleForKey(role?.key);
  const scopeFlags = getScopeFlagsForRole(role);
  const financeFlags = await getFinanceFlagsForRole(role?.key);
  const timeFlags = await getTimeFlagsForRole(role?.key);
  try {
    await base44.entities.User.update(userId, { role: platformRole, ...scopeFlags, ...financeFlags, ...timeFlags });
    return true;
  } catch (e) {
    console.warn("Could not sync user from role:", e.message);
    return false;
  }
}

export function getScopeFlagsForRole(role) {
  if (role?.key === "administrator") {
    return {
      can_view_all_employees: true,
      can_view_all_leave: true,
      can_view_all_payroll: true,
      can_view_all_petty_cash: true,
      can_edit_all_employees: true,
      can_edit_all_leave: true,
      can_edit_all_payroll: true,
      can_edit_all_petty_cash: true,
    };
  }
  return {
    can_view_all_employees: !!role?.can_view_all_employees,
    can_view_all_leave: !!role?.can_view_all_leave,
    can_view_all_payroll: !!role?.can_view_all_payroll,
    can_view_all_petty_cash: !!role?.can_view_all_petty_cash,
    can_edit_all_employees: role?.can_edit_all_employees,
    can_edit_all_leave: role?.can_edit_all_leave,
    can_edit_all_payroll: role?.can_edit_all_payroll,
    can_edit_all_petty_cash: role?.can_edit_all_petty_cash,
  };
}

/**
 * Returns true if excluding the given employee would leave zero administrators.
 * Used to prevent removing or demoting the last administrator, so the system
 * always has at least one user who can make changes.
 *
 * @param {string} excludeEmployeeId - Employee ID to exclude from the count
 * @returns {Promise<boolean>}
 */
export async function isLastAdministrator(excludeEmployeeId) {
  const employees = await base44.entities.Employee.list("full_name", 500);
  const admins = employees.filter(e => e.role === "administrator" && e.id !== excludeEmployeeId);
  return admins.length === 0;
}

// ---------------------------------------------------------------------------
// Finance data-scope flags (row-level security on Invoice, Bill, JournalEntry,
// BankTransaction, Contact write, etc. reads User.can_read_finance / can_write_finance).
// Derived from the RolePermission matrix so "one role per position" keeps working
// for non-admin app users. PORTING NOTE (Vercel): replace by a server-side check of
// the same matrix; the module lists below are the single source of the rule.
// ---------------------------------------------------------------------------
export const FINANCE_READ_MODULES = ["invoices", "bills", "accounting", "bank_accounts", "chart_of_accounts", "manual_journals", "quotes", "purchase_orders", "purchases"];
export const FINANCE_WRITE_MODULES = ["invoices", "bills", "accounting", "bank_accounts", "chart_of_accounts", "manual_journals", "quotes", "purchase_orders"];

export function computeFinanceFlags(roleKey, rows) {
  if (roleKey === "administrator") return { can_read_finance: true, can_write_finance: true };
  const mine = (rows || []).filter(r => r.role === roleKey);
  const read = mine.some(r => FINANCE_READ_MODULES.includes(r.module) && r.can_view);
  const write = mine.some(r => FINANCE_WRITE_MODULES.includes(r.module) && r.can_view && (r.can_create || r.can_edit));
  return { can_read_finance: read || write, can_write_finance: write };
}

export async function getFinanceFlagsForRole(roleKey) {
  try {
    const rows = await base44.entities.RolePermission.filter({ role: roleKey }, "module", 500);
    return computeFinanceFlags(roleKey, rows);
  } catch (e) {
    return { can_read_finance: false, can_write_finance: false };
  }
}

// ---------------------------------------------------------------------------
// Time-management flag (row-level security on TimeEntry update/delete reads
// User.can_manage_time; owners can always edit their own entries via TimeEntry.user_id).
// True for administrators and for non-employee roles that can approve timesheets
// (managers). The base "employee" role never gets it, whatever its matrix says.
// PORTING NOTE (Vercel): replace by a server-side check of the same matrix.
// ---------------------------------------------------------------------------
export function computeTimeFlags(roleKey, rows) {
  if (roleKey === "administrator") return { can_manage_time: true };
  if (!roleKey || roleKey === "employee") return { can_manage_time: false };
  const ts = (rows || []).find(r => r.role === roleKey && r.module === "timesheets");
  return { can_manage_time: !!(ts && ts.can_view && ts.can_approve) };
}

export async function getTimeFlagsForRole(roleKey) {
  try {
    const rows = await base44.entities.RolePermission.filter({ role: roleKey, module: "timesheets" }, "module", 20);
    return computeTimeFlags(roleKey, rows);
  } catch (e) {
    return { can_manage_time: false };
  }
}

/** Recompute finance flags for every user linked to an employee, for all roles. */
export async function syncFinanceFlagsAllRoles() {
  const [employees, rows] = await Promise.all([
    base44.entities.Employee.list("full_name", 1000),
    base44.entities.RolePermission.list("module", 2000),
  ]);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let updated = 0, failed = 0;
  for (const e of employees) {
    if (!e.user_id) continue;
    try {
      await base44.entities.User.update(e.user_id, { ...computeFinanceFlags(e.role, rows), ...computeTimeFlags(e.role, rows) });
      updated++;
    } catch (err) { failed++; }
    await sleep(350);
  }
  return { updated, failed };
}

