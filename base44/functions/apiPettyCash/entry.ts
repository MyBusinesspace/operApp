/**
 * apiPettyCash — Employee Petty Cash API
 *
 * Auth: X-Employee-ID / x-employee-id header.
 *
 * GET  /apiPettyCash           – List entries (own, or all when scope=team + Data Scope)
 * GET  /apiPettyCash/:id       – Get one entry
 * POST /apiPettyCash           – Create entry | upload_receipt | extract_receipt |
 *                                approve_entry | reject_entry
 * PUT  /apiPettyCash           – Update pending entry (own or Data Scope)
 * DELETE /apiPettyCash         – Delete non-approved entry (own or Data Scope)
 */

// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function base64ToFile(imageBase64, fileName, mimeType) {
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName || 'receipt.jpg', { type: mimeType || 'image/jpeg' });
}

async function uploadBase64Image(base44, { image_base64, file_name, mime_type }) {
  if (!image_base64) throw new Error('image_base64 is required');
  const file = base64ToFile(image_base64, file_name, mime_type);
  const result = await base44.integrations.Core.UploadFile({ file });
  return result.file_url;
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

function withMeta(data, va, permissionsRevision) {
  const out = withVersion(data, va);
  if (permissionsRevision) out.permissions_revision = permissionsRevision;
  return out;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function findEmployeeRoleRow(employeeRoles, employee) {
  const label = String(employee?.role || '').trim();
  if (!label) return null;
  const needle = label.toLowerCase();
  return (employeeRoles || []).find((r) =>
    r.name === label
    || r.key === label
    || String(r.name || '').toLowerCase() === needle
    || String(r.key || '').toLowerCase() === needle
  ) || null;
}

async function buildPermissionsRevisionHash(employee, roleRow, perms, allPerms, allRoles) {
  const permStamp = (perms || [])
    .map((p) => [
      p.module,
      p.updated_date,
      p.can_view,
      p.can_create,
      p.can_edit,
      p.can_delete,
      p.can_approve,
      p.can_create_on_behalf,
    ].join(':'))
    .sort()
    .join('|');

  const maxDate = (rows) => (rows || [])
    .map((r) => String(r?.updated_date || ''))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';

  const catalogStamp = [
    String((allPerms || []).length),
    maxDate(allPerms),
    String((allRoles || []).length),
    maxDate(allRoles),
  ].join('|');

  const raw = [
    String(employee?.id || ''),
    String(employee?.role || ''),
    String(employee?.updated_date || ''),
    String(roleRow?.key || ''),
    String(roleRow?.name || ''),
    String(roleRow?.updated_date || ''),
    roleRow?.can_view_all_leave === true ? '1' : '0',
    roleRow?.can_view_all_payroll === true ? '1' : '0',
    roleRow?.can_view_all_petty_cash === true ? '1' : '0',
    String((perms || []).length),
    permStamp,
    catalogStamp,
  ].join('#');

  return sha256Hex(raw);
}

function filterPermsForRole(rolePermissions, roleRow, employee) {
  const keys = new Set();
  if (roleRow?.key) keys.add(String(roleRow.key).trim());
  if (roleRow?.name) keys.add(String(roleRow.name).trim());
  if (employee?.role) keys.add(String(employee.role).trim());
  const lower = new Set([...keys].map((k) => k.toLowerCase()));
  return (rolePermissions || []).filter((p) => {
    const role = String(p.role || '').trim();
    return keys.has(role) || lower.has(role.toLowerCase());
  });
}

async function computePermissionsRevision(base44, employee) {
  let roles = [];
  let permsAll = [];
  try {
    [roles, permsAll] = await Promise.all([
      base44.asServiceRole.entities.EmployeeRole.filter({}, null, 500).catch(() => []),
      base44.asServiceRole.entities.RolePermission.filter({}, null, 500).catch(() => []),
    ]);
  } catch {
    roles = [];
    permsAll = [];
  }
  const roleRow = findEmployeeRoleRow(roles, employee);
  const perms = filterPermsForRole(permsAll, roleRow, employee);
  return buildPermissionsRevisionHash(employee, roleRow, perms, permsAll, roles);
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
  const needle = trimmed.toLowerCase();
  let roles = [];
  try {
    roles = await base44.asServiceRole.entities.EmployeeRole.filter({}, null, 200);
  } catch {
    return null;
  }
  const match = roles.find(
    (r) =>
      r.name === trimmed ||
      r.key === trimmed ||
      String(r.name || '').toLowerCase() === needle ||
      String(r.key || '').toLowerCase() === needle,
  );
  return match?.key ?? (needle === 'admin' || needle === 'administrator' ? needle : null);
}

async function isPlatformAdmin(base44, employee) {
  const key = await resolveRoleKey(base44, employee?.role);
  return key === 'administrator' || key === 'admin';
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
  if (!perm?.can_create) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  // On-behalf (write for others) requires the matching data-scope EDIT flag
  const scopeByModule = { leave: 'can_edit_all_leave', petty_cash: 'can_edit_all_petty_cash' };
  const scopeField = scopeByModule[module];
  if (scopeField) {
    const roles = await base44.asServiceRole.entities.EmployeeRole.filter({ key: roleKey }, null, 1);
    if (!roles[0]?.[scopeField]) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  return null;
}

async function denyUnlessModuleAccess(base44, employee, module, action) {
  if (await isPlatformAdmin(base44, employee)) return null;

  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, module);

  if (!perm) {
    if (action === 'view') return null;
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

  // Web "Edit" composite = create + edit + delete as one modify capability.
  if (action === 'modify') {
    if (perm.can_create || perm.can_edit || perm.can_delete) return null;
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fieldMap = { create: 'can_create', edit: 'can_edit', delete: 'can_delete' };
  if (!perm[fieldMap[action]]) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/** Team catalog: platform admin OR EmployeeRole.can_view_all_petty_cash only. */
async function canViewTeamRecords(base44, employee) {
  if (await isPlatformAdmin(base44, employee)) return true;
  const roleKey = await resolveRoleKey(base44, employee.role);
  if (!roleKey) return false;
  if (roleKey === 'administrator' || roleKey === 'admin') return true;

  const roles = await base44.asServiceRole.entities.EmployeeRole.filter({ key: roleKey }, null, 1);
  return !!roles[0]?.can_view_all_petty_cash;
}

async function fetchPettyCashEntries(base44, {
  teamView,
  employeeId,
  filterEmployeeId,
  status,
  type,
  projectId,
  workOrderId,
  fromDate,
  toDate,
}) {
  const filter = {
    ...(teamView
      ? (filterEmployeeId ? { employee_id: filterEmployeeId } : {})
      : { employee_id: employeeId }),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(projectId ? { project_id: projectId } : {}),
    ...(workOrderId ? { work_order_id: workOrderId } : {}),
  };

  let entries = [];
  try {
    const limit = teamView ? 500 : 100;
    if (Object.keys(filter).length === 0) {
      entries = await base44.asServiceRole.entities.PettyCashEntry.list('-date', limit);
    } else {
      entries = await base44.asServiceRole.entities.PettyCashEntry.filter(filter, '-date', limit);
    }
  } catch (err) {
    const message = String(err?.message || err);
    if (!/not found|invalid id/i.test(message)) throw err;
  }

  if (fromDate) entries = entries.filter((e) => e.date >= fromDate);
  if (toDate) entries = entries.filter((e) => e.date <= toDate);
  return entries;
}

function entryIdFromPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  const fnIndex = pathParts.indexOf('apiPettyCash');
  if (fnIndex < 0 || pathParts.length <= fnIndex + 1) return null;
  return pathParts[fnIndex + 1];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const employeeId =
      req.headers.get('x-employee-id') || req.headers.get('X-Employee-ID');
    if (!employeeId) {
      return Response.json({ error: 'Missing x-employee-id header' }, { status: 401 });
    }

    const employee = await findEmployeeById(base44, employeeId);
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 403 });
    }
    const va = await checkAppVersion(base44, req);
    if (va) return Response.json(va, { status: 426 });

    const permissionsRevision = await computePermissionsRevision(base44, employee).catch(() => null);

    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const entryId = entryIdFromPath(url.pathname);

    // ─── LIST ────────────────────────────────────────────────────────────────
    if (method === 'GET' && !entryId) {
      const deniedView = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'view');
      if (deniedView) return deniedView;

      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const fromDate = url.searchParams.get('from');
      const toDate = url.searchParams.get('to');
      const projectId = url.searchParams.get('project_id');
      const workOrderId = url.searchParams.get('work_order_id');
      const scope = url.searchParams.get('scope');
      const filterEmployeeId = url.searchParams.get('employee_id');

      const teamView = scope === 'team' ? await canViewTeamRecords(base44, employee) : false;
      if (scope === 'team' && !teamView) {
        return Response.json(
          withMeta({ error: 'Forbidden' }, null, permissionsRevision),
          { status: 403 },
        );
      }

      const entries = await fetchPettyCashEntries(base44, {
        teamView,
        employeeId,
        filterEmployeeId,
        status,
        type,
        projectId,
        workOrderId,
        fromDate,
        toDate,
      });

      return Response.json(withMeta({ success: true, entries, count: entries.length }, va, permissionsRevision));
    }

    // ─── GET BY ID ───────────────────────────────────────────────────────────
    if (method === 'GET' && entryId) {
      const deniedView = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'view');
      if (deniedView) return deniedView;

      const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id: entryId });
      const entry = results[0];
      if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

      if (entry.employee_id !== employeeId) {
        const teamView = await canViewTeamRecords(base44, employee);
        if (!teamView) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      return Response.json(withMeta({ success: true, entry }, va, permissionsRevision));
    }

    // ─── POST ────────────────────────────────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json();

      // Mirror apiLeaves get_all_requests — explicit team catalog action.
      if (body.action === 'get_all_entries') {
        const deniedView = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'view');
        if (deniedView) return deniedView;

        const teamView = await canViewTeamRecords(base44, employee);
        if (!teamView) {
          return Response.json(
            withMeta({ error: 'Forbidden' }, null, permissionsRevision),
            { status: 403 },
          );
        }

        const entries = await fetchPettyCashEntries(base44, {
          teamView: true,
          employeeId,
          filterEmployeeId: body.employee_id || null,
          status: body.status || null,
          type: body.type || null,
          projectId: body.project_id || null,
          workOrderId: body.work_order_id || null,
          fromDate: body.from || null,
          toDate: body.to || null,
        });

        return Response.json(withMeta({ success: true, entries, count: entries.length }, va, permissionsRevision));
      }

      if (body.action === 'upload_receipt') {
        const deniedCreate = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'create');
        if (deniedCreate) return deniedCreate;
        const { image_base64, file_name, mime_type } = body;
        const file_url = await uploadBase64Image(base44, { image_base64, file_name, mime_type });
        return Response.json(withMeta({ success: true, file_url, url: file_url }, null, permissionsRevision));
      }

      if (body.action === 'extract_receipt') {
        const deniedCreate = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'create');
        if (deniedCreate) return deniedCreate;
        const { receipt_url } = body;
        if (!receipt_url) {
          return Response.json({ error: 'receipt_url is required' }, { status: 400 });
        }

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are an expense receipt parser. Analyze this receipt image and extract the following information. Be precise with numbers.

Return a JSON object with these fields:
- provider: string (store/vendor name, or null)
- note_number: string (receipt/invoice number, or null)
- date: string in YYYY-MM-DD format (or null if not found)
- amount: number (total amount paid, numbers only)
- currency: string (3-letter code, default AED if not clear)
- note: string (brief description of what was purchased, max 100 chars)
- category: one of ["Fuel", "Food & Drinks", "Materials", "Transport", "Office Supplies", "Maintenance", "Utilities", "Entertainment", "Other"]

Return ONLY the JSON, no other text.`,
          file_urls: [receipt_url],
          response_json_schema: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              note_number: { type: 'string' },
              date: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              note: { type: 'string' },
              category: { type: 'string' },
            },
          },
        });

        return Response.json(withMeta({ success: true, extracted: result }, null, permissionsRevision));
      }

      if (body.action === 'approve_entry' || body.action === 'reject_entry') {
        const deniedApprove = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'approve');
        if (deniedApprove) return deniedApprove;

        const id = body.id || body.entry_id;
        if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

        const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id });
        const existing = results[0];
        if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });
        if (existing.status !== 'pending') {
          return Response.json({ error: `Cannot review an entry with status "${existing.status}"` }, { status: 409 });
        }

        const nextStatus = body.action === 'approve_entry' ? 'approved' : 'rejected';
        const patch = {
          status: nextStatus,
        };
        if (body.admin_notes != null) patch.admin_notes = body.admin_notes;

        const updated = await base44.asServiceRole.entities.PettyCashEntry.update(id, patch);
        return Response.json(withMeta({ success: true, entry: updated }, va, permissionsRevision));
      }

      // Create entry
      const deniedCreate = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'create');
      if (deniedCreate) return deniedCreate;

      const {
        date, amount, type, provider, note_number, note, currency, category,
        project_id, project_name, work_order_id, work_order_name, receipt_url, ai_extracted,
        target_employee_id, on_behalf_employee_id,
      } = body;

      if (!date || amount === undefined || !type) {
        return Response.json({ error: 'date, amount and type are required' }, { status: 400 });
      }
      if (!['expense', 'income'].includes(type)) {
        return Response.json({ error: 'type must be "expense" or "income"' }, { status: 400 });
      }

      let targetEmployee = employee;
      const behalfId = target_employee_id || on_behalf_employee_id;
      if (behalfId && behalfId !== employeeId) {
        const deniedOnBehalf = await denyUnlessOnBehalf(base44, employee, 'petty_cash');
        if (deniedOnBehalf) return deniedOnBehalf;
        const found = await findEmployeeById(base44, behalfId);
        if (!found) {
          return Response.json({ error: 'Target employee not found' }, { status: 404 });
        }
        targetEmployee = found;
      }

      const entry = await base44.asServiceRole.entities.PettyCashEntry.create({
        employee_id: targetEmployee.id,
        employee_name: targetEmployee.full_name || '',
        user_id: targetEmployee.user_id || '',
        date,
        amount: Number(amount),
        type,
        provider: provider || '',
        note_number: note_number || '',
        note: note || '',
        currency: currency || 'AED',
        category: category || '',
        project_id: project_id || '',
        project_name: project_name || '',
        work_order_id: work_order_id || '',
        work_order_name: work_order_name || '',
        receipt_url: receipt_url || '',
        ai_extracted: ai_extracted || false,
        status: 'pending',
      });

      return Response.json(withMeta({ success: true, entry }, va, permissionsRevision), { status: 201 });
    }

    // ─── UPDATE ──────────────────────────────────────────────────────────────
    if (method === 'PUT') {
      const body = await req.json();
      const { id, ...rest } = body;
      if (!id) return Response.json({ error: 'id is required in request body' }, { status: 400 });

      const fields = { ...rest };

      const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id });
      const existing = results[0];
      if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

      const isOwn = existing.employee_id === employeeId;
      if (!isOwn) {
        const teamView = await canViewTeamRecords(base44, employee);
        if (!teamView) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      const deniedEdit = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'modify');
      if (deniedEdit) return deniedEdit;

      if (existing.status !== 'pending') {
        return Response.json({ error: `Cannot edit an entry with status "${existing.status}"` }, { status: 409 });
      }

      delete fields.employee_id;
      delete fields.employee_name;
      delete fields.user_id;
      delete fields.status;
      delete fields.action;
      delete fields.target_employee_id;
      delete fields.target_employee_name;
      delete fields.on_behalf_employee_id;

      if (fields.amount !== undefined) fields.amount = Number(fields.amount);
      if (fields.type && !['expense', 'income'].includes(fields.type)) {
        return Response.json({ error: 'type must be "expense" or "income"' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.PettyCashEntry.update(id, fields);
      return Response.json(withMeta({ success: true, entry: updated }, va, permissionsRevision));
    }

    // ─── DELETE ──────────────────────────────────────────────────────────────
    if (method === 'DELETE') {
      const body = await req.json();
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required in request body' }, { status: 400 });

      const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id });
      const existing = results[0];
      if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

      const isOwn = existing.employee_id === employeeId;
      if (!isOwn) {
        const teamView = await canViewTeamRecords(base44, employee);
        if (!teamView) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      const deniedDelete = await denyUnlessModuleAccess(base44, employee, 'petty_cash', 'modify');
      if (deniedDelete) return deniedDelete;

      if (existing.status === 'approved') {
        return Response.json({ error: 'Cannot delete an approved entry' }, { status: 409 });
      }

      await base44.asServiceRole.entities.PettyCashEntry.delete(id);
      return Response.json(withMeta({ success: true, deleted_id: id }, va, permissionsRevision));
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});