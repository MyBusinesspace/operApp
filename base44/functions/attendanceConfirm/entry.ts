// attendanceConfirm — the owner confirms they are still on shift.
// Only the owner, and only while the day is Open.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const attendanceId = typeof body?.attendance_id === 'string' ? body.attendance_id : '';
    if (!attendanceId) return Response.json({ error: 'attendance_id is required' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const rows = await db.AttendanceDay.filter({ id: attendanceId });
    const day = rows?.[0] || null;
    if (!day) return Response.json({ error: 'Attendance day not found' }, { status: 404 });

    if (!user.id || day.user_id !== user.id) {
      return Response.json({ error: 'Forbidden: only the owner can confirm this attendance day.' }, { status: 403 });
    }
    if (day.status !== 'Open') {
      return Response.json({ error: 'Only an open attendance day can be confirmed.' }, { status: 400 });
    }

    const now = new Date();
    const updated = await db.AttendanceDay.update(day.id, {
      confirmed_at: now.toISOString(),
      alert_sent_at: null,
      next_alert_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    });

    return Response.json({ success: true, attendance: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}