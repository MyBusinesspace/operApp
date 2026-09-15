/**
 * Paginated apiTimesheet actions for Vercel — without editing base44/functions/**.
 *
 * Activates only when the client sends `skip` (or `page`). Otherwise the
 * original Base44 handler runs unchanged (Base44 mobile builds never send skip).
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
  const rows = await base44.asServiceRole.entities.Employee.filter(
    { id: employeeId },
    undefined,
    1,
    0
  );
  const employee = rows[0];
  if (!employee) return { error: json({ error: "Employee not found" }, 401) };
  if (employee.status === "Terminated" || employee.status === "Inactive") {
    return { error: json({ error: "Employee account is inactive" }, 403) };
  }
  return { employee, employeeId, base44 };
}

async function resolveRoleKey(base44, roleVal) {
  const val = String(roleVal || "").trim();
  if (!val) return null;
  const roles = await base44.asServiceRole.entities.EmployeeRole.list("name", 200);
  return (roles.find((r) => r.key === val) || roles.find((r) => r.name === val))?.key ?? null;
}

async function isPlatformAdmin(base44, employee) {
  return (await resolveRoleKey(base44, employee.role)) === "admin";
}

async function getRolePermission(base44, roleKey, module) {
  if (!roleKey) return null;
  const perms = await base44.asServiceRole.entities.RolePermission.filter({
    role: roleKey,
    module,
  });
  return perms?.[0] ?? null;
}

async function canViewAllTasks(base44, employee) {
  if (await isPlatformAdmin(base44, employee)) return true;
  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, "tasks");
  if (!perm) return false;
  if (perm.can_view === false) return false;
  return perm.can_create_on_behalf === true;
}

async function canViewAllTimeEntries(base44, employee) {
  if (await isPlatformAdmin(base44, employee)) return true;
  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, "timesheets");
  if (!perm) return true;
  if (perm.can_view === false) return false;
  return true;
}

function isTaskAssignedToEmployee(task, employee) {
  const employeeId = employee?.id;
  if (!employeeId) return false;
  if ((task.assigned_employees || []).includes(employeeId)) return true;
  if ((task.assigned_users || []).includes(employeeId)) return true;

  const hasNamedAssignees =
    (task.assigned_employees || []).length > 0 || (task.assigned_users || []).length > 0;
  if (hasNamedAssignees) return false;

  const teamId = employee?.team_id;
  if (teamId && (task.assigned_team_ids || []).includes(teamId)) return true;
  return false;
}

function pageArgs(body, defaultLimit) {
  const limit = Math.min(Math.max(1, Number(body.limit) || defaultLimit), 500);
  const skip = Math.max(0, Number(body.skip) || Number(body.page) * limit || 0);
  return { limit, skip };
}

/** Same searchable fields as mobile `taskSearchableText`. */
function taskSearchHaystack(task) {
  const parts = [
    task.id,
    task.reference,
    task.title,
    task.description,
    task.status,
    task.category,
    task.work_order_id,
    task.work_order_name,
    task.project_id,
    task.project_name,
    task.contact_id,
    task.contact_name,
    task.asset_id,
    task.asset_name,
    task.planning_date,
    task.planning_time_in,
    task.planning_time_out,
    task.priority,
    task.notes,
    task.location_address,
    task.location_lat != null ? String(task.location_lat) : null,
    task.location_lng != null ? String(task.location_lng) : null,
    task.created_date,
    task.updated_date,
    task.created_by_id,
    task.created_by,
    task.recurrence_frequency,
    task.recurrence_end_date,
    task.last_generated_date,
    task.recurrence_template_id,
    ...(task.assigned_users || []),
    ...(task.assigned_user_names || []),
    ...(task.assigned_employees || []),
    ...(task.assigned_employee_names || []),
    ...(task.assigned_team_ids || []),
    ...(task.assigned_team_names || []),
    ...((task.photos || []).map((p) => p?.caption).filter(Boolean)),
  ];
  return parts
    .filter((p) => p != null && String(p).trim() !== "")
    .join(" ")
    .toLowerCase();
}

function taskMatchesSearch(task, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;
  return taskSearchHaystack(task).includes(q);
}

function readSearchQuery(body) {
  const raw = body?.search ?? body?.q ?? body?.query ?? "";
  return String(raw).trim();
}

/**
 * @returns {Promise<Response|null>}
 */
export async function tryHandleTimesheetGetEntries(request, body) {
  if (body?.action !== "get_entries") return null;
  if (body.skip == null && body.page == null) return null;

  const auth = await loadEmployee(request, body);
  if (auth.error) return auth.error;

  const { date_from, date_to, scope } = body;
  const { limit, skip } = pageArgs(body, 100);
  const viewAll =
    (scope === "all" || scope === "team") &&
    (await canViewAllTimeEntries(auth.base44, auth.employee));

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

/**
 * Paginated get_tasks. Walks the Task table when results must be filtered to
 * the caller's assignments / search so each page has up to `limit` visible rows.
 * @returns {Promise<Response|null>}
 */
export async function tryHandleTimesheetGetTasks(request, body) {
  if (body?.action !== "get_tasks") return null;
  if (body.skip == null && body.page == null) return null;

  const auth = await loadEmployee(request, body);
  if (auth.error) return auth.error;

  const { status, date, scope } = body;
  const search = readSearchQuery(body);
  const { limit, skip } = pageArgs(body, scope === "clock_in" ? 50 : 50);
  const viewAll =
    scope === "clock_in" ? true : await canViewAllTasks(auth.base44, auth.employee);

  const filter = {};
  if (status) filter.status = status;

  let pageTasks;
  let hasMore;

  // Fast path: no assignment / date / text post-filter.
  if (viewAll && !date && !search) {
    const raw = await auth.base44.asServiceRole.entities.Task.filter(
      filter,
      "-created_date",
      limit + 1,
      skip
    );
    hasMore = raw.length > limit;
    pageTasks = hasMore ? raw.slice(0, limit) : raw;
  } else {
    // Scan forward until we can slice [skip, skip+limit) of matching rows.
    const matched = [];
    let dbSkip = 0;
    const batchSize = 100;
    const need = skip + limit + 1;
    // Bound worst-case scans when searching a rare term.
    const maxScan = search ? 5000 : 20000;

    while (matched.length < need && dbSkip < maxScan) {
      const batch = await auth.base44.asServiceRole.entities.Task.filter(
        filter,
        "-created_date",
        batchSize,
        dbSkip
      );
      if (!batch.length) break;

      for (const task of batch) {
        if (!viewAll && !isTaskAssignedToEmployee(task, auth.employee)) continue;
        if (date && task.planning_date !== date) continue;
        if (search && !taskMatchesSearch(task, search)) continue;
        matched.push(task);
        if (matched.length >= need) break;
      }

      dbSkip += batch.length;
      if (batch.length < batchSize) break;
    }

    pageTasks = matched.slice(skip, skip + limit);
    hasMore = matched.length > skip + limit;
  }

  return json({
    success: true,
    tasks: pageTasks,
    view_all: viewAll,
    search: search || null,
    skip,
    limit,
    has_more: hasMore,
    next_skip: hasMore ? skip + pageTasks.length : null,
  });
}
