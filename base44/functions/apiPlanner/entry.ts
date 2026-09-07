import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { checkEmployeePermission } from "../../shared/permissions.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, employee-id, x-app-version',
};

async function checkAppVersion(base44, req) {
  const clientVersion = req.headers.get('x-app-version') || null;
  try {
    const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
    if (!apps || apps.length === 0) return null;
    const app = apps[0];
    if (clientVersion && clientVersion === app.app_version) return null;
    return { update_required: true, latest_version: app.app_version, version_description: app.version_description || '' };
  } catch { return null; }
}

function withVersion(data, va) {
  return va ? { ...data, ...va } : data;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const base44 = createClientFromRequest(req);

    // ── Auth: employee-id header ──────────────────────────────────────────────
    const employeeId = req.headers.get('employee-id');
    if (!employeeId) {
      return Response.json({ error: 'Missing employee-id header' }, { status: 401, headers: CORS_HEADERS });
    }

    // Verify the employee exists
    const employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    if (!employees || employees.length === 0) {
      return Response.json({ error: 'Employee not found' }, { status: 403, headers: CORS_HEADERS });
    }
    const employee = employees[0];
    const va = await checkAppVersion(base44, req);
    if (va) return Response.json(va, { status: 426, headers: CORS_HEADERS });

    // ── Body / params ─────────────────────────────────────────────────────────
    const url = new URL(req.url);
    const body = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : Object.fromEntries(url.searchParams.entries());

    const action = body.action;

    if (!action) {
      return Response.json({
        error: 'Missing action',
        available_actions: [
          'list_tasks', 'get_task', 'create_task', 'update_task', 'delete_task',
          'list_subtasks', 'create_subtask', 'update_subtask', 'delete_subtask'
        ]
      }, { status: 400, headers: CORS_HEADERS });
    }

    // ── TASKS ─────────────────────────────────────────────────────────────────

    if (action === 'list_tasks') {
      if (body.assigned_only === true || body.assigned_only === 'true') {
        let tasks = await base44.asServiceRole.entities.Task.list('-planning_date', 200);
        tasks = tasks.filter(t =>
          t.assigned_employees?.includes(employeeId) ||
          t.assigned_team_ids?.some(teamId => employee.team_id === teamId)
        );
        if (body.status) tasks = tasks.filter(t => t.status === body.status);
        if (body.planning_date) tasks = tasks.filter(t => t.planning_date === body.planning_date);
        return Response.json(withVersion({ tasks, employee_id: employeeId, total: tasks.length }, va), { headers: CORS_HEADERS });
      }

      const filter = {};
      if (body.status) filter.status = body.status;
      if (body.planning_date) filter.planning_date = body.planning_date;

      const tasks = Object.keys(filter).length > 0
        ? await base44.asServiceRole.entities.Task.filter(filter, '-planning_date', 200)
        : await base44.asServiceRole.entities.Task.list('-planning_date', 200);

      return Response.json(withVersion({ tasks, total: tasks.length }, va), { headers: CORS_HEADERS });
    }

    if (action === 'get_task') {
      const { task_id } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400, headers: CORS_HEADERS });

      const tasks = await base44.asServiceRole.entities.Task.filter({ id: task_id });
      if (!tasks || tasks.length === 0) return Response.json({ error: 'Task not found' }, { status: 404, headers: CORS_HEADERS });

      const task = tasks[0];
      const subtasks = await base44.asServiceRole.entities.TaskSubtask.filter({ task_id });
      return Response.json(withVersion({ task, subtasks }, va), { headers: CORS_HEADERS });
    }

    if (action === 'create_task') {
      if (!(await checkEmployeePermission(base44, employee, 'tasks', 'can_create'))) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS_HEADERS });
      }
      const { title, description, status, category, priority, planning_date, planning_time_in,
              planning_time_out, notes, work_order_id, work_order_name, project_id, project_name,
              contact_id, contact_name, asset_id, asset_name, assigned_employees, assigned_employee_names,
              assigned_team_ids, assigned_team_names, location_lat, location_lng, location_address,
              allowed_radius_m } = body;

      if (!title) return Response.json({ error: 'title is required' }, { status: 400, headers: CORS_HEADERS });

      // ── Normalize status to a valid enum value ──────────────────────────────
      // Valid: Draft, Template, Queued, Scheduled, Not Completed, Completed
      // Mobile apps may send "Active" or "Pending" — map to "Queued" (default for new tasks)
      const VALID_STATUSES = ['Draft', 'Template', 'Queued', 'Scheduled', 'Not Completed', 'Completed'];
      const normalizedStatus = VALID_STATUSES.includes(status) ? status : 'Queued';

      // ── Generate reference (respects DocumentTemplate __task_numbering__ settings) ──
      const [settingsList, allTasks] = await Promise.all([
        base44.asServiceRole.entities.DocumentTemplate.list(),
        base44.asServiceRole.entities.Task.list(),
      ]);
      const s = settingsList.find(t => t.name === '__task_numbering__');
      const settings = s ? JSON.parse(s.footer_notes || '{}') : {};
      const prefix = settings.task_prefix || 'TSK';
      const padding = settings.number_padding || 4;
      const includeYear = settings.include_year !== false;
      const year = new Date().getFullYear();
      const storedNext = settings.next_number || 1;
      const pattern = includeYear
        ? new RegExp(`^${prefix}-${year}-(\\d+)$`)
        : new RegExp(`^${prefix}-(\\d+)$`);
      let maxFound = 0;
      for (const t of allTasks) {
        if (!t.reference) continue;
        const m = t.reference.match(pattern);
        if (m) { const n = parseInt(m[1], 10); if (n > maxFound) maxFound = n; }
      }
      const nextNum = Math.max(storedNext, maxFound + 1);
      if (s) {
        const newSettings = { ...settings, next_number: nextNum + 1 };
        await base44.asServiceRole.entities.DocumentTemplate.update(s.id, { footer_notes: JSON.stringify(newSettings) });
      }
      const padded = String(nextNum).padStart(padding, '0');
      const reference = includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;

      const task = await base44.asServiceRole.entities.Task.create({
        reference, title, description, status: normalizedStatus,
        category, priority: priority || 'Medium', planning_date, planning_time_in, planning_time_out,
        notes, work_order_id, work_order_name, project_id, project_name,
        contact_id, contact_name, asset_id, asset_name,
        assigned_employees: assigned_employees || [],
        assigned_employee_names: assigned_employee_names || [],
        assigned_team_ids: assigned_team_ids || [],
        assigned_team_names: assigned_team_names || [],
        location_lat, location_lng, location_address,
        allowed_radius_m: allowed_radius_m || 200,
      });

      return Response.json(withVersion({ task }, va), { status: 201, headers: CORS_HEADERS });
    }

    if (action === 'update_task') {
      if (!(await checkEmployeePermission(base44, employee, 'tasks', 'can_edit'))) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS_HEADERS });
      }
      const { task_id, action: _a, ...fields } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400, headers: CORS_HEADERS });

      // Normalize status if present — reject invalid enum values from mobile
      const VALID_STATUSES = ['Draft', 'Template', 'Queued', 'Scheduled', 'Not Completed', 'Completed'];
      if (fields.status && !VALID_STATUSES.includes(fields.status)) {
        delete fields.status;
      }

      const task = await base44.asServiceRole.entities.Task.update(task_id, fields);
      return Response.json(withVersion({ task }, va), { headers: CORS_HEADERS });
    }

    if (action === 'delete_task') {
      if (!(await checkEmployeePermission(base44, employee, 'tasks', 'can_delete'))) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS_HEADERS });
      }
      const { task_id } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400, headers: CORS_HEADERS });

      await base44.asServiceRole.entities.Task.delete(task_id);
      const subtasks = await base44.asServiceRole.entities.TaskSubtask.filter({ task_id });
      for (const s of subtasks) {
        await base44.asServiceRole.entities.TaskSubtask.delete(s.id);
      }
      return Response.json(withVersion({ success: true, deleted_task_id: task_id, deleted_subtasks: subtasks.length }, va), { headers: CORS_HEADERS });
    }

    // ── SUBTASKS ──────────────────────────────────────────────────────────────

    if (action === 'list_subtasks') {
      const { task_id } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400, headers: CORS_HEADERS });

      const subtasks = await base44.asServiceRole.entities.TaskSubtask.filter({ task_id });
      return Response.json(withVersion({ subtasks, total: subtasks.length }, va), { headers: CORS_HEADERS });
    }

    if (action === 'create_subtask') {
      const { task_id, title, done } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400, headers: CORS_HEADERS });
      if (!title) return Response.json({ error: 'title is required' }, { status: 400, headers: CORS_HEADERS });

      const subtask = await base44.asServiceRole.entities.TaskSubtask.create({ task_id, title, done: done || false });
      return Response.json(withVersion({ subtask }, va), { status: 201, headers: CORS_HEADERS });
    }

    if (action === 'update_subtask') {
      const { subtask_id, action: _a, ...fields } = body;
      if (!subtask_id) return Response.json({ error: 'subtask_id is required' }, { status: 400, headers: CORS_HEADERS });

      const subtask = await base44.asServiceRole.entities.TaskSubtask.update(subtask_id, fields);
      return Response.json(withVersion({ subtask }, va), { headers: CORS_HEADERS });
    }

    if (action === 'delete_subtask') {
      const { subtask_id } = body;
      if (!subtask_id) return Response.json({ error: 'subtask_id is required' }, { status: 400, headers: CORS_HEADERS });

      await base44.asServiceRole.entities.TaskSubtask.delete(subtask_id);
      return Response.json(withVersion({ success: true, deleted_subtask_id: subtask_id }, va), { headers: CORS_HEADERS });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: CORS_HEADERS });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
});