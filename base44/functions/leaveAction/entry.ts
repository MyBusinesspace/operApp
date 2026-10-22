// v2 edit scope
// leaveAction - the only write path for LeaveRequest from the web app.
// Entity writes are admin-only; this function checks the permission matrix and the business rules.
// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { checkPermission, checkOnBehalf } from '../../shared/permissions.ts';
import { validateLeave } from '../../shared/leaveRules.ts';

const json = (o, status = 200) => Response.json(o, { status });

async function hasScope(base44, user, field) {
  if (user.role === 'admin') return true;
  try {
    const emps = await base44.asServiceRole.entities.Employee.filter({ user_id: user.id });
    const key = emps?.[0]?.role;
    if (!key) return false;
    const roles = await base44.asServiceRole.entities.EmployeeRole.list('name', 200);
    const role = roles.find((x) => x.key === key) || roles.find((x) => x.name === key);
    return !!role?.[field];
  } catch { return false; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const db = base44.asServiceRole.entities;
    const isAdmin = user.role === 'admin';
    const myEmps = await db.Employee.filter({ user_id: user.id });
    const me = myEmps?.[0] || null;
    const isOwner = (r) => !!r && ((r.user_id && r.user_id === user.id) || (me && r.employee_id === me.id));
    const canApprove = isAdmin || await checkPermission(base44, user, 'leave', 'can_approve');

    if (action === 'create') {
      if (!isAdmin && !(await checkPermission(base44, user, 'leave', 'can_create'))) return json({ error: 'Forbidden: you cannot create leave requests' }, 403);
      if (!me) return json({ error: 'Your account is not linked to an employee profile.' }, 400);
      const types = canApprove ? ['vacation', 'sick', 'other', 'unjustified'] : ['vacation', 'sick', 'other'];
      if (!types.includes(body.leave_type)) return json({ error: 'Leave type not allowed' }, 400);
      let target = me;
      if (body.on_behalf_employee_id && body.on_behalf_employee_id !== me.id) {
        if (!(await checkOnBehalf(base44, user, 'leave', 'can_edit_all_leave'))) return json({ error: 'Forbidden: you cannot create requests for other employees' }, 403);
        const f = await db.Employee.filter({ id: body.on_behalf_employee_id });
        if (!f?.[0]) return json({ error: 'Employee not found' }, 404);
        target = f[0];
      }
      const v = await validateLeave(base44, { employee: target, leave_type: body.leave_type, start_date: body.start_date, end_date: body.end_date });
      if (v.error) return json({ error: v.error }, 400);
      const request = await db.LeaveRequest.create({
        employee_id: target.id, employee_name: target.full_name, user_id: target.user_id || '',
        submitted_by_name: user.full_name || '', leave_type: body.leave_type,
        start_date: body.start_date, end_date: body.end_date, total_days: v.total_days,
        reason: body.reason || '', documents: Array.isArray(body.documents) ? body.documents : [], status: 'pending',
      });
      return json({ success: true, request });
    }

    const rows = body.request_id ? await db.LeaveRequest.filter({ id: body.request_id }) : [];
    const r = rows?.[0];
    if (!r) return json({ error: 'Leave request not found' }, 404);

    if (action === 'decide') {
      if (!canApprove) return json({ error: 'Forbidden: you cannot approve or reject leave' }, 403);
      if (isOwner(r) && !isAdmin) return json({ error: 'You cannot approve or reject your own leave request' }, 403);
      if (!['approved', 'rejected', 'pending'].includes(body.status)) return json({ error: 'Invalid status' }, 400);
      if (r.status === 'cancelled') return json({ error: 'A cancelled request cannot be decided' }, 400);
      if (body.status === 'approved') {
        const emp = (await db.Employee.filter({ id: r.employee_id }))?.[0];
        if (emp) {
          const v = await validateLeave(base44, { employee: emp, leave_type: r.leave_type, start_date: r.start_date, end_date: r.end_date, excludeId: r.id });
          if (v.error) return json({ error: v.error }, 400);
        }
      }
      const updated = await db.LeaveRequest.update(r.id, {
        status: body.status, approved_by: user.id, approved_by_name: user.full_name, approved_at: new Date().toISOString(), admin_notes: body.admin_notes || '',
      });
      return json({ success: true, request: updated });
    }

    if (action === 'cancel') {
      const today = new Date().toISOString().slice(0, 10);
      const ownOk = isOwner(r) && (r.status === 'pending' || (r.status === 'approved' && r.start_date > today));
      if (!ownOk && !canApprove) return json({ error: 'Forbidden: you cannot cancel this request' }, 403);
      if (!['pending', 'approved'].includes(r.status)) return json({ error: 'Only pending or approved requests can be cancelled' }, 400);
      const updated = await db.LeaveRequest.update(r.id, { status: 'cancelled' });
      return json({ success: true, request: updated });
    }

    if (action === 'delete') {
      if (!isAdmin && !(await checkPermission(base44, user, 'leave', 'can_delete'))) return json({ error: 'Forbidden: you cannot delete leave requests' }, 403);
      if (r.status !== 'cancelled') return json({ error: 'Only cancelled requests can be deleted' }, 400);
      await db.LeaveRequest.delete(r.id);
      return json({ success: true });
    }

    if (action === 'edit') {
      if (!isAdmin) {
        const canEditPerm = await checkPermission(base44, user, 'leave', 'can_edit');
        const scope = await hasScope(base44, user, 'can_edit_all_leave');
        if (!canEditPerm || !scope) return json({ error: 'Forbidden: editing leave requires the Edit permission and the All employees leave scope' }, 403);
      }
      const emp = (await db.Employee.filter({ id: r.employee_id }))?.[0];
      const patch = { reason: body.reason ?? r.reason, admin_notes: body.admin_notes ?? r.admin_notes };
      const lt = body.leave_type || r.leave_type, sd = body.start_date || r.start_date, ed = body.end_date || r.end_date;
      const st = body.status || r.status;
      if (['pending', 'approved'].includes(st) && emp) {
        const v = await validateLeave(base44, { employee: emp, leave_type: lt, start_date: sd, end_date: ed, excludeId: r.id });
        if (v.error) return json({ error: v.error }, 400);
        patch.total_days = v.total_days;
      } else {
        const v = await validateLeave(base44, { employee: { id: '__none__' }, leave_type: 'other', start_date: sd, end_date: ed });
        if (!v.error) patch.total_days = v.total_days;
      }
      Object.assign(patch, { leave_type: lt, start_date: sd, end_date: ed, status: st });
      if (st !== r.status) Object.assign(patch, { approved_by: user.id, approved_by_name: user.full_name, approved_at: new Date().toISOString() });
      const updated = await db.LeaveRequest.update(r.id, patch);
      return json({ success: true, request: updated });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});