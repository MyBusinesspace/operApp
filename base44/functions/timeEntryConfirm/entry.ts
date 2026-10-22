// timeEntryConfirm — the owner confirms they are still working on an active session.
// Resets the long-session reminder (next one due in 3 hours).
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCallerEmployee } from "../../shared/permissions.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const timeEntryId = typeof body?.time_entry_id === 'string' ? body.time_entry_id : '';
    if (!timeEntryId) return Response.json({ error: 'time_entry_id is required' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const rows = await db.TimeEntry.filter({ id: timeEntryId });
    const entry = rows?.[0] || null;
    if (!entry) return Response.json({ error: 'Time entry not found' }, { status: 404 });

    // Owner by user_id, or by the linked employee (same ownership idea used elsewhere).
    const callerEmp = await getCallerEmployee(base44, user);
    const isOwner =
      (!!entry.user_id && entry.user_id === user.id) ||
      (!!callerEmp && entry.employee_id === callerEmp.id);
    if (!isOwner) {
      return Response.json({ error: 'Forbidden: only the owner can confirm this session.' }, { status: 403 });
    }
    if (entry.status !== 'Active') {
      return Response.json({ error: 'Only an active session can be confirmed.' }, { status: 400 });
    }

    const now = new Date();
    const updated = await db.TimeEntry.update(entry.id, {
      confirmed_at: now.toISOString(),
      alert_sent_at: null,
      next_alert_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    });

    return Response.json({ success: true, entry: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}