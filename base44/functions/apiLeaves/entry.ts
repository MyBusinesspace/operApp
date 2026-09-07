/**
 * apiLeaves — Employee Leave Request API
 *
 * Authentication: Pass employee ID in the request header: X-Employee-ID: <employee_id>
 * The employee record is looked up and validated on every request.
 *
 * All requests are POST with a JSON body containing an "action" field.
 *
 * Actions:
 *   create_request   – Submit a new leave request
 *   get_requests     – List leave requests for the authenticated employee (optional filters)
 *   get_request      – Get a single leave request by ID
 *   update_request   – Update a pending leave request (only employee's own, only if pending)
 *   cancel_request   – Cancel a pending leave request
 *   delete_request   – Delete a leave request (only if pending/cancelled)
 *
 * Team / approval actions (RolePermission-based):
 *   get_all_requests – List all employees' leave requests (requires team view)
 *   approve_request  – Approve a pending leave request (requires can_approve)
 *   reject_request   – Reject a pending leave request (requires can_approve)
 *   upload_document  – Upload a supporting document (returns file_url)
 */

// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function base64ToFile(fileBase64, fileName, mimeType) {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName || 'document', { type: mimeType || 'application/octet-stream' });
}

async function uploadBase64File(base44, { file_base64, file_name, mime_type }) {
  if (!file_base64) throw new Error('file_base64 is required');
  const file = base64ToFile(file_base64, file_name, mime_type);
  const result = await base44.integrations.Core.UploadFile({ file });
  return result.file_url;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return Math.round((e - s) / 86400000) + 1;
}

async function isPlatformAdmin(base44, employee) {
  // Resolve by role KEY (locked to "admin") so detection survives renaming the
  // Admin role's display name. employee.role stores the role name.
  return (await resolveRoleKey(base44, employee?.role)) === 'admin';
}

async function findEmployeeById(base44, employeeId) {
  try {
    const employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    return employees[0] ?? null;
  } catch (err) {
    const message = String(err?.message || err);
    if (/not found|invalid id/i.test(message)) return null;
    throw err;
  }
}

async function resolveRoleKey(base44, employeeRoleName) {
  if (!employeeRoleName?.trim()) return null;
  const trimmed = employeeRoleName.trim();
  let roles = [];
  try {
    roles = await base44.asServiceRole.entities.EmployeeRole.filter({}, null, 200);
  } catch {
    return null;
  }
  const match = roles.find((r) => r.name === trimmed || r.key === trimmed);
  return match?.key ?? null;
}

async function getRolePermission(base44, roleKey, module) {
  if (!roleKey) return null;
  try {
    const perms = await base44.asServiceRole.entities.RolePermission.filter({ role: roleKey, module });
    return perms[0] ?? null;
  } catch {
    return null;
  }
}

async function denyUnlessOnBehalf(base44, employee, module) {
  if (await isPlatformAdmin(base44, employee)) return null;
  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, module);
  if (!perm?.can_create_on_behalf) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/** Returns a Response to send, or null if access is allowed. */
async function denyUnlessModuleAccess(base44, employee, module, action) {
  if (await isPlatformAdmin(base44, employee)) return null;

  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, module);

  if (!perm) {
    if (action === 'view') return null;
    if ((module === 'leave' || module === 'timesheets') && action === 'create') return null;
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (action === 'view') {
    if (perm.can_view === false) return Response.json({ error: 'Forbidden' }, { status: 403 });
    return null;
  }

  if (action === 'approve') {
    if (!perm.can_approve) return Response.json({ error: 'Forbidden' }, { status: 403 });
    return null;
  }

  const fieldMap = { create: 'can_create', edit: 'can_edit', delete: 'can_delete' };
  if (!perm[fieldMap[action]]) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

async function denyUnlessApprove(base44, employee, module) {
  return denyUnlessModuleAccess(base44, employee, module, 'approve');
}

async function canViewTeamRecords(base44, employee, module) {
  if (await isPlatformAdmin(base44, employee)) return true;
  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, module);
  if (!perm) return true;
  return perm.can_view !== false || perm.can_approve === true;
}

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

async function readJsonBody(req) {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    // ── Auth via header ──────────────────────────────────────────────────────
    const employeeId = req.headers.get('X-Employee-ID');
    if (!employeeId) {
      return Response.json({ error: 'Missing X-Employee-ID header' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    const employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    const employee = employees[0];
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 401 });
    }
    if (employee.status === 'Terminated' || employee.status === 'Inactive') {
      return Response.json({ error: 'Employee account is inactive' }, { status: 403 });
    }

    const va = await checkAppVersion(base44, req);
    if (va) return Response.json(va, { status: 426 });

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await readJsonBody(req);

    const action = body.action;
    if (!action) {
      return Response.json({ error: 'Missing "action" field in request body' }, { status: 400 });
    }

    // ── upload_document ──────────────────────────────────────────────────────
    if (action === 'upload_document') {
      const deniedCreate = await denyUnlessModuleAccess(base44, employee, 'leave', 'create');
      if (deniedCreate) return deniedCreate;

      const file_base64 = body.file_base64;
      const file_name = body.file_name;
      const mime_type = body.mime_type;
      if (!file_base64) {
        return Response.json({ error: 'file_base64 is required' }, { status: 400 });
      }

      const file_url = await uploadBase64File(base44, {
        file_base64,
        file_name,
        mime_type,
      });

      return Response.json(withVersion({
        success: true,
        file_url,
        file_name: file_name || 'document',
        file_type: mime_type || '',
      }, va));
    }

    // ── create_request ───────────────────────────────────────────────────────
    if (action === 'create_request') {
      const deniedCreate = await denyUnlessModuleAccess(base44, employee, 'leave', 'create');
      if (deniedCreate) return deniedCreate;

      const leave_type = body.leave_type;
      const start_date = body.start_date;
      const end_date = body.end_date;
      const reason = body.reason;
      const on_behalf_employee_id = body.on_behalf_employee_id;
      const documents = body.documents;

      if (!leave_type) return Response.json({ error: 'leave_type is required' }, { status: 400 });
      if (!start_date) return Response.json({ error: 'start_date is required' }, { status: 400 });
      if (!end_date) return Response.json({ error: 'end_date is required' }, { status: 400 });

      const validTypes = ['vacation', 'sick', 'other'];
      if (!validTypes.includes(leave_type)) {
        return Response.json({ error: `leave_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
      }

      if (new Date(start_date) > new Date(end_date)) {
        return Response.json({ error: 'start_date must be before or equal to end_date' }, { status: 400 });
      }

      let targetEmployee = employee;
      if (on_behalf_employee_id && on_behalf_employee_id !== employeeId) {
        const deniedOnBehalf = await denyUnlessOnBehalf(base44, employee, 'leave');
        if (deniedOnBehalf) return deniedOnBehalf;
        const found = await findEmployeeById(base44, on_behalf_employee_id);
        if (!found) {
          return Response.json({ error: 'Target employee not found' }, { status: 404 });
        }
        targetEmployee = found;
      }

      const total_days = daysBetween(start_date, end_date);

      const request = await base44.asServiceRole.entities.LeaveRequest.create({
        employee_id: targetEmployee.id,
        employee_name: targetEmployee.full_name,
        submitted_by_name: employee.full_name,
        leave_type,
        start_date,
        end_date,
        total_days,
        reason: reason || '',
        status: 'pending',
        documents: Array.isArray(documents) ? documents : [],
      });

      return Response.json(withVersion({ success: true, request }, va));
    }

    // ── get_requests ─────────────────────────────────────────────────────────
    if (action === 'get_requests') {
      const deniedView = await denyUnlessModuleAccess(base44, employee, 'leave', 'view');
      if (deniedView) return deniedView;

      const status = body.status;
      const year = body.year;
      const limit = body.limit ?? 100;

      let requests = await base44.asServiceRole.entities.LeaveRequest.filter(
        { employee_id: employeeId },
        '-created_date',
        limit
      );

      if (status) requests = requests.filter(r => r.status === status);
      if (year) requests = requests.filter(r => r.start_date && r.start_date.startsWith(String(year)));

      return Response.json(withVersion({ success: true, requests }, va));
    }

    // ── get_request ──────────────────────────────────────────────────────────
    if (action === 'get_request') {
      const request_id = body.request_id;
      if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

      const results = await base44.asServiceRole.entities.LeaveRequest.filter({ id: request_id });
      const request = results[0];
      if (!request) return Response.json({ error: 'Leave request not found' }, { status: 404 });

      // Employees can only see their own requests unless they have team view access
      if (request.employee_id !== employeeId) {
        const teamView = await canViewTeamRecords(base44, employee, 'leave');
        if (!teamView) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      return Response.json(withVersion({ success: true, request }, va));
    }

    // ── update_request ───────────────────────────────────────────────────────
    if (action === 'update_request') {
      const deniedEdit = await denyUnlessModuleAccess(base44, employee, 'leave', 'edit');
      if (deniedEdit) return deniedEdit;

      const request_id = body.request_id;
      const leave_type = body.leave_type;
      const start_date = body.start_date;
      const end_date = body.end_date;
      const reason = body.reason;
      if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

      const results = await base44.asServiceRole.entities.LeaveRequest.filter({ id: request_id });
      const request = results[0];
      if (!request) return Response.json({ error: 'Leave request not found' }, { status: 404 });
      if (request.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (request.status !== 'pending') {
        return Response.json({ error: 'Only pending requests can be updated' }, { status: 400 });
      }

      const patch = {};
      if (leave_type !== undefined) {
        const validTypes = ['vacation', 'sick', 'other'];
        if (!validTypes.includes(leave_type)) {
          return Response.json({ error: `leave_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
        }
        patch.leave_type = leave_type;
      }
      if (reason !== undefined) patch.reason = reason;

      const newStart = start_date || request.start_date;
      const newEnd = end_date || request.end_date;
      if (new Date(newStart) > new Date(newEnd)) {
        return Response.json({ error: 'start_date must be before or equal to end_date' }, { status: 400 });
      }
      if (start_date !== undefined) patch.start_date = start_date;
      if (end_date !== undefined) patch.end_date = end_date;
      if (start_date !== undefined || end_date !== undefined) {
        patch.total_days = daysBetween(newStart, newEnd);
      }

      const updated = await base44.asServiceRole.entities.LeaveRequest.update(request_id, patch);
      return Response.json(withVersion({ success: true, request: updated }, va));
    }

    // ── cancel_request ───────────────────────────────────────────────────────
    if (action === 'cancel_request') {
      const deniedDelete = await denyUnlessModuleAccess(base44, employee, 'leave', 'delete');
      if (deniedDelete) return deniedDelete;

      const request_id = body.request_id;
      if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

      const results = await base44.asServiceRole.entities.LeaveRequest.filter({ id: request_id });
      const request = results[0];
      if (!request) return Response.json({ error: 'Leave request not found' }, { status: 404 });
      if (request.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!['pending', 'approved'].includes(request.status)) {
        return Response.json({ error: 'Only pending or approved requests can be cancelled' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.LeaveRequest.update(request_id, { status: 'cancelled' });
      return Response.json(withVersion({ success: true, request: updated }, va));
    }

    // ── delete_request ───────────────────────────────────────────────────────
    if (action === 'delete_request') {
      const request_id = body.request_id;
      if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

      const results = await base44.asServiceRole.entities.LeaveRequest.filter({ id: request_id });
      const request = results[0];
      if (!request) return Response.json({ error: 'Leave request not found' }, { status: 404 });
      if (request.employee_id !== employeeId) {
        const teamView = await canViewTeamRecords(base44, employee, 'leave');
        if (!teamView) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
      if (!['pending', 'cancelled'].includes(request.status)) {
        return Response.json({ error: 'Only pending or cancelled requests can be deleted' }, { status: 400 });
      }

      await base44.asServiceRole.entities.LeaveRequest.delete(request_id);
      return Response.json(withVersion({ success: true }, va));
    }

    // ── get_all_requests (team view / approvers) ─────────────────────────────
    if (action === 'get_all_requests') {
      const deniedView = await denyUnlessModuleAccess(base44, employee, 'leave', 'view');
      if (deniedView) return deniedView;

      const teamView = await canViewTeamRecords(base44, employee, 'leave');
      if (!teamView) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const status = body.status;
      const filterEmployeeId = body.employee_id;
      const year = body.year;
      const limit = body.limit ?? 200;

      const filter = {};
      if (filterEmployeeId) filter.employee_id = filterEmployeeId;
      if (status) filter.status = status;

      let requests = await base44.asServiceRole.entities.LeaveRequest.filter(filter, '-created_date', limit);
      if (year) requests = requests.filter(r => r.start_date && r.start_date.startsWith(String(year)));

      return Response.json(withVersion({ success: true, requests }, va));
    }

    // ── approve_request ──────────────────────────────────────────────────────
    if (action === 'approve_request') {
      const deniedApprove = await denyUnlessApprove(base44, employee, 'leave');
      if (deniedApprove) return deniedApprove;

      const request_id = body.request_id;
      const admin_notes = body.admin_notes;
      if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

      const results = await base44.asServiceRole.entities.LeaveRequest.filter({ id: request_id });
      const request = results[0];
      if (!request) return Response.json({ error: 'Leave request not found' }, { status: 404 });
      if (request.status !== 'pending') {
        return Response.json({ error: 'Only pending requests can be approved' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.LeaveRequest.update(request_id, {
        status: 'approved',
        approved_by: employeeId,
        approved_by_name: employee.full_name,
        approved_at: new Date().toISOString(),
        admin_notes: admin_notes || '',
      });

      return Response.json(withVersion({ success: true, request: updated }, va));
    }

    // ── reject_request ───────────────────────────────────────────────────────
    if (action === 'reject_request') {
      const deniedApprove = await denyUnlessApprove(base44, employee, 'leave');
      if (deniedApprove) return deniedApprove;

      const request_id = body.request_id;
      const admin_notes = body.admin_notes;
      if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

      const results = await base44.asServiceRole.entities.LeaveRequest.filter({ id: request_id });
      const request = results[0];
      if (!request) return Response.json({ error: 'Leave request not found' }, { status: 404 });
      if (request.status !== 'pending') {
        return Response.json({ error: 'Only pending requests can be rejected' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.LeaveRequest.update(request_id, {
        status: 'rejected',
        approved_by: employeeId,
        approved_by_name: employee.full_name,
        approved_at: new Date().toISOString(),
        admin_notes: admin_notes || '',
      });

      return Response.json(withVersion({ success: true, request: updated }, va));
    }

    return Response.json({ error: `Unknown action: "${action}"` }, { status: 400 });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});