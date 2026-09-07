// Shared permission helper for backend functions.
// Resolves the caller's employee role and checks the RolePermission matrix.
// Platform admins (user.role === "admin") always pass.
//
// Usage in a function:
//   const user = await base44.auth.me();
//   if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
//   const denied = await requirePermission(base44, user, "timesheets", "can_edit");
//   if (denied) return denied;
//
// employee.role may store the role KEY (new records) or the role NAME (legacy),
// so we resolve against both to stay robust during the name->key migration.

export async function checkPermission(base44, user, module, flag) {
  if (!user) return false;
  // Platform admin bypasses the matrix
  if (user.role === "admin") return true;
  try {
    const employees = await base44.asServiceRole.entities.Employee.filter({ user_id: user.id });
    const employee = employees?.[0];
    if (!employee?.role) return false;

    const roles = await base44.asServiceRole.entities.EmployeeRole.list("name", 200);
    const role = roles.find((r) => r.key === employee.role) || roles.find((r) => r.name === employee.role);
    if (!role?.key) return false;

    const perms = await base44.asServiceRole.entities.RolePermission.filter({ role: role.key, module });
    return !!perms?.[0]?.[flag];
  } catch {
    return false;
  }
}

// Returns a 403 Response when denied, or null when allowed — so a function can
// early-return on denial:
//   const denied = await requirePermission(...); if (denied) return denied;
export async function requirePermission(base44, user, module, flag) {
  const ok = await checkPermission(base44, user, module, flag);
  if (!ok) {
    return Response.json(
      { error: `Forbidden: missing permission '${flag}' on '${module}'` },
      { status: 403 }
    );
  }
  return null;
}

// Resolves the caller's employee record (or null). Useful for "on behalf" checks.
export async function getCallerEmployee(base44, user) {
  if (!user) return null;
  try {
    const employees = await base44.asServiceRole.entities.Employee.filter({ user_id: user.id });
    return employees?.[0] || null;
  } catch {
    return null;
  }
}

// ─── Employee-based variants (for mobile APIs that auth via X-Employee-ID) ───
// employee.role may store the role KEY (post-migration) or NAME (legacy), so we
// resolve against both. The Admin role key is locked to "admin" — matching by
// key keeps detection correct even if the Admin role is renamed.

export async function resolveEmployeeRoleKey(base44, employee) {
  const val = (employee?.role || "").trim();
  if (!val) return null;
  let roles = [];
  try {
    roles = await base44.asServiceRole.entities.EmployeeRole.list("name", 200);
  } catch {
    return null;
  }
  return (roles.find((r) => r.key === val) || roles.find((r) => r.name === val))?.key ?? null;
}

export async function isPlatformAdminEmployee(base44, employee) {
  return (await resolveEmployeeRoleKey(base44, employee)) === "admin";
}

export async function checkEmployeePermission(base44, employee, module, flag) {
  if (!employee) return false;
  if (await isPlatformAdminEmployee(base44, employee)) return true;
  const key = await resolveEmployeeRoleKey(base44, employee);
  if (!key) return false;
  try {
    const perms = await base44.asServiceRole.entities.RolePermission.filter({ role: key, module });
    return !!perms?.[0]?.[flag];
  } catch {
    return false;
  }
}