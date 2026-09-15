/**
 * Paginated get_entries for apiTimesheet — Vercel only.
 * Base44's handler accepts `limit` but not `skip`. When the mobile client sends
 * skip (BACKEND=vercel), we answer here without touching base44/functions/**.
 */
import { createClient } from "./sdk.js";

function json(data, status = 200) {
  return Response.json(data, { status });
}

async function loadEmployee(request, body) {
  const employeeId =
    request.headers.get("X-Employee-ID") ||
    request.headers.get("x-employee-id") ||
    (typeof body.employee_id === "string" ? body.employee_id : null);
  if (!employeeId) {
    return { error: json({ error: "Missing X-Employee-ID header or employee_id in body" }, 401) };
  }
  const base44 = createClient({ accessToken: null });
  const rows = await base44.asServiceRole.entities.Employee.filter({ id: employeeId }, undefined, 1, 0);
  const employee = rows[0];
  if (!employee) return { error: json({ error: "Employee not found" }, 401) };
  if (employee.status === "Terminated" || employee.status === "Inactive") {
    return { error: json({ error: "Employee account is inactive" }, 403) };
  }
  return { employee, employeeId, base44 };
}

async function canViewAll(base44, employee) {
  try {
    const roles = await base44.asServiceRole.entities.EmployeeRole.list("name", 200);
    const key =
      roles.find((r) => r.key === employee.role)?.key ||
      roles.find((r) => r.name === employee.role)?.key;
    if (key === "admin") return true;
    const perms = await base44.asServiceRole.entities.RolePermission.filter({
      role: key,
      module: "timesheets",
    });
    return !!perms?.[0]?.can_view;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<Response|null>}
 */
export async function tryHandleTimesheetGetEntries(request, body) {
  if (body?.action !== "get_entries") return null;
  // Only take over when the client asks for paging (Base44 path has no skip).
  if (body.skip == null && body.page == null) return null;

  const auth = await loadEmployee(request, body);
  if (auth.error) return auth.error;

  const { date_from, date_to, scope } = body;
  const limit = Math.min(Math.max(1, Number(body.limit) || 100), 500);
  const skip = Math.max(0, Number(body.skip) || Number(body.page) * limit || 0);
  const viewAll =
    (scope === "all" || scope === "team") && (await canViewAll(auth.base44, auth.employee));

  const filter = {};
  if (!viewAll) filter.employee_id = auth.employeeId;
  if (date_from) filter.clock_in_time = { ...(filter.clock_in_time || {}), $gte: date_from };
  if (date_to) {
    filter.clock_in_time = {
      ...(filter.clock_in_time || {}),
      $lte: `${date_to}T23:59:59.999Z`,
    };
  }

  let page;
  if (Object.keys(filter).length) {
    page = await auth.base44.asServiceRole.entities.TimeEntry.filter(
      filter,
      "-clock_in_time",
      limit + 1,
      skip
    );
  } else {
    page = await auth.base44.asServiceRole.entities.TimeEntry.list(
      "-clock_in_time",
      limit + 1,
      skip
    );
  }

  const hasMore = page.length > limit;
  const entries = hasMore ? page.slice(0, limit) : page;

  return json({
    success: true,
    entries,
    view_all: viewAll,
    skip,
    limit,
    has_more: hasMore,
    next_skip: hasMore ? skip + entries.length : null,
  });
}
