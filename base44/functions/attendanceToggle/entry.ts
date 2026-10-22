// attendanceToggle — clock the caller (or, on behalf, another employee) in or out of the office.
// Opens a new AttendanceDay when none is open, otherwise closes the open one.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCallerEmployee, requireOnBehalf } from "../../shared/permissions.ts";
import { ATTENDANCE_TZ, localDateKey, elapsedMinutes } from "../../shared/attendance.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedEmployeeId = typeof body?.employee_id === 'string' && body.employee_id ? body.employee_id : null;

    const db = base44.asServiceRole.entities;
    const callerEmp = await getCallerEmployee(base44, user);

    // Act on someone else only with the same check clockIn uses.
    let employee = callerEmp;
    if (requestedEmployeeId && (!callerEmp || callerEmp.id !== requestedEmployeeId)) {
      const denied = await requireOnBehalf(base44, user, 'timesheets', 'can_edit_all_employees');
      if (denied) return denied;
      const rows = await db.Employee.filter({ id: requestedEmployeeId });
      employee = rows?.[0] || null;
    }
    if (!employee) return Response.json({ error: 'No employee profile is linked to this account.' }, { status: 400 });

    const openRows = await db.AttendanceDay.filter({ employee_id: employee.id, status: 'Open' }, '-clock_in_time', 1);
    const open = openRows?.[0] || null;
    const now = new Date();

    // Close the open session.
    if (open) {
      const duration = elapsedMinutes(open.clock_in_time, now);
      const updated = await db.AttendanceDay.update(open.id, {
        clock_out_time: now.toISOString(),
        duration_minutes: duration,
        status: 'Closed',
        closed_by: 'self',
      });
      return Response.json({ success: true, action: 'closed', attendance: updated });
    }

    // Open a new session.
    const settingsList = await db.PayrollSettings.list();
    const currency = (Array.isArray(settingsList) && settingsList[0]?.currency) || 'AED';

    const created = await db.AttendanceDay.create({
      employee_id: employee.id,
      employee_name: employee.full_name || '',
      user_id: employee.user_id || '',
      work_date: localDateKey(now, ATTENDANCE_TZ),
      clock_in_time: now.toISOString(),
      status: 'Open',
      currency,
      next_alert_at: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
    });

    return Response.json({ success: true, action: 'opened', attendance: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}