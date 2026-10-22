// attendanceAllocate — replace the allocations of an attendance day.
// Allowed for the owner, or admin / can_manage_time users.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { canManageTime, elapsedMinutes } from "../../shared/attendance.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const attendanceId = typeof body?.attendance_id === 'string' ? body.attendance_id : '';
    if (!attendanceId) return Response.json({ error: 'attendance_id is required' }, { status: 400 });
    if (!Array.isArray(body?.allocations)) return Response.json({ error: 'allocations must be an array' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const dayRows = await db.AttendanceDay.filter({ id: attendanceId });
    const day = dayRows?.[0] || null;
    if (!day) return Response.json({ error: 'Attendance day not found' }, { status: 404 });

    const isOwner = !!user.id && day.user_id === user.id;
    if (!isOwner && !(await canManageTime(base44, user))) {
      return Response.json({ error: 'Forbidden: you cannot allocate this attendance day.' }, { status: 403 });
    }

    // Validate and normalise the requested allocations.
    const items = [];
    for (const raw of body.allocations) {
      const minutes = Math.round(Number(raw?.minutes));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return Response.json({ error: 'Each allocation needs a positive number of minutes.' }, { status: 400 });
      }
      items.push({
        task_id: typeof raw?.task_id === 'string' ? raw.task_id : '',
        project_id: typeof raw?.project_id === 'string' ? raw.project_id : '',
        minutes,
        notes: typeof raw?.notes === 'string' ? raw.notes : '',
      });
    }

    // The day cannot be over-allocated. An open day uses the time elapsed so far.
    const dayDuration = day.status === 'Open'
      ? elapsedMinutes(day.clock_in_time)
      : (day.duration_minutes || 0);
    const totalMinutes = items.reduce((sum, it) => sum + it.minutes, 0);
    if (totalMinutes > dayDuration) {
      return Response.json({
        error: `Allocated minutes (${totalMinutes}) exceed the day duration (${dayDuration}).`,
      }, { status: 400 });
    }

    // Resolve task / project labels so names stay consistent with the rest of the app.
    const taskIds = [...new Set(items.map((it) => it.task_id).filter(Boolean))];
    const tasks = taskIds.length ? await db.Task.filter({ id: { $in: taskIds } }) : [];
    const taskMap = new Map((tasks || []).map((t) => [t.id, t]));

    const projectIdSet = new Set(items.map((it) => it.project_id).filter(Boolean));
    for (const t of tasks || []) if (t.project_id) projectIdSet.add(t.project_id);
    const projectIds = [...projectIdSet];
    const projects = projectIds.length ? await db.Project.filter({ id: { $in: projectIds } }) : [];
    const projectMap = new Map((projects || []).map((p) => [p.id, p]));

    const rows = items.map((it) => {
      const task = it.task_id ? taskMap.get(it.task_id) || null : null;
      const projectId = it.project_id || task?.project_id || '';
      const project = projectId ? projectMap.get(projectId) || null : null;
      return {
        attendance_id: day.id,
        employee_id: day.employee_id || '',
        user_id: day.user_id || '',
        work_date: day.work_date || '',
        task_id: task?.id || it.task_id || '',
        task_title: task?.title || '',
        project_id: projectId,
        project_name: project?.name || task?.project_name || '',
        contact_id: project?.contact_id || task?.contact_id || '',
        contact_name: project?.contact_name || task?.contact_name || '',
        minutes: it.minutes,
        notes: it.notes,
      };
    });

    // Replace all existing allocations of this attendance day.
    await db.AttendanceAllocation.deleteMany({ attendance_id: day.id });
    const created = rows.length ? await db.AttendanceAllocation.bulkCreate(rows) : [];

    return Response.json({
      success: true,
      allocations: created,
      allocated_minutes: totalMinutes,
      day_duration_minutes: dayDuration,
      unassigned_minutes: Math.max(0, dayDuration - totalMinutes),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}