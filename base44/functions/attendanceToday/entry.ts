// attendanceToday — the caller's open attendance day (if any) and today's allocations,
// so the UI can render its state in one call.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCallerEmployee } from "../../shared/permissions.ts";
import { ATTENDANCE_TZ, localDateKey } from "../../shared/attendance.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole.entities;
    const today = localDateKey(new Date(), ATTENDANCE_TZ);
    const employee = await getCallerEmployee(base44, user);

    if (!employee) {
      return Response.json({ success: true, work_date: today, attendance: null, allocations: [] });
    }

    const openRows = await db.AttendanceDay.filter({ employee_id: employee.id, status: 'Open' }, '-clock_in_time', 1);
    const attendance = openRows?.[0] || null;
    const allocations = await db.AttendanceAllocation.filter(
      { employee_id: employee.id, work_date: today },
      '-created_date',
      200,
    );

    return Response.json({
      success: true,
      work_date: today,
      attendance,
      allocations: allocations || [],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}