// attendanceSweep — long-session safeguard for office attendance and field clock-ins.
//
// (a) Alerts: every Open AttendanceDay / Active TimeEntry whose alert mark has passed
//     and has not been alerted yet is marked and its owner is emailed.
// (b) Auto-close: sessions not confirmed within 30 minutes of that alert are closed
//     AT THE ALERT MARK (clock_out_time = next_alert_at), never at the sweep time.
// (c) Rows with an empty next_alert_at are ignored, so older rows are never touched.
// Idempotent: a second run changes nothing more.
//
// Invoked by the "Attendance Sweep" workflow every 15 minutes.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { t, getAppLanguage, stillWorkingEmailVars } from "../../shared/attendance.ts";

const CONFIRM_WINDOW_MINUTES = 30;
const BATCH_SIZE = 6;

function minutesBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 60000));
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.allSettled(items.slice(i, i + size).map(fn));
  }
}

function firstNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

/** Clock-out time for the closed-session message, in the company timezone. */
function formatLocal(whenIso) {
  const d = new Date(whenIso);
  if (!Number.isFinite(d.getTime())) return String(whenIso || '');
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

// At most one notification per row and event: skip any (source_type, source_id, type) that already exists.
async function createNotifications(db, rows) {
  const candidates = rows.filter((r) => r.user_id);
  if (!candidates.length) return 0;
  const sourceIds = [...new Set(candidates.map((c) => c.source_id))];
  const existing = await db.Notification.filter({ source_id: { $in: sourceIds } }, '-created_date', 1000);
  const seen = new Set((existing || []).map((n) => `${n.source_type}|${n.source_id}|${n.type}`));
  const missing = candidates.filter((c) => !seen.has(`${c.source_type}|${c.source_id}|${c.type}`));
  if (missing.length) await db.Notification.bulkCreate(missing);
  return missing.length;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // Called by the scheduled workflow (no user session). Idempotent and rule-based, like the other scheduled functions.

    // Test hooks (optional JSON body): test_user_id scopes the whole sweep to one
    // user's rows so a ZZ test employee can be exercised without touching real
    // staff; test_email_to sends one sample alert email to that address.
    let reqBody = {};
    try { reqBody = await req.json(); } catch { /* workflow calls carry no JSON body */ }
    const testUserId = typeof reqBody?.test_user_id === 'string' ? reqBody.test_user_id : null;
    const testEmailTo = typeof reqBody?.test_email_to === 'string' ? reqBody.test_email_to : null;

    const db = base44.asServiceRole.entities;
    const lang = await getAppLanguage(db);
    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    const [openDaysRaw, activeEntriesRaw] = await Promise.all([
      db.AttendanceDay.filter({ status: 'Open' }, '-created_date', 500),
      db.TimeEntry.filter({ status: 'Active' }, '-created_date', 500),
    ]);
    const days = (openDaysRaw || []).filter((r) => !testUserId || r.user_id === testUserId);
    const entries = (activeEntriesRaw || []).filter((r) => !testUserId || r.user_id === testUserId);

    // ── (a) Alerts: alert mark passed, nothing sent yet ───────────────────────
    const isDue = (r) => !!r.next_alert_at && !r.alert_sent_at && new Date(r.next_alert_at).getTime() <= nowMs;
    const dueDays = days.filter(isDue);
    const dueEntries = entries.filter(isDue);

    if (dueDays.length) {
      await db.AttendanceDay.bulkUpdate(dueDays.map((d) => ({ id: d.id, alert_sent_at: nowIso })));
    }
    if (dueEntries.length) {
      await db.TimeEntry.bulkUpdate(dueEntries.map((e) => ({ id: e.id, alert_sent_at: nowIso })));
    }

    // Notify the owners (best-effort: a failed send must not stop the sweep).
    const due = [...dueDays, ...dueEntries];
    const ownerIds = [...new Set(due.map((r) => r.user_id).filter(Boolean))];
    const owners = ownerIds.length ? await db.User.filter({ id: { $in: ownerIds } }) : [];
    const ownerById = new Map((owners || []).map((u) => [u.id, u]));

    await inBatches(due, BATCH_SIZE, async (row) => {
      const owner = row.user_id ? ownerById.get(row.user_id) : null;
      if (!owner?.email) return;
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: owner.email,
        template_name: 'AttendanceStillWorking',
        variables: stillWorkingEmailVars(lang, firstNameOf(owner.full_name || row.employee_name)),
      });
    });

    // Optional test email (see test hooks above).
    if (testEmailTo) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: testEmailTo,
        template_name: 'AttendanceStillWorking',
        variables: stillWorkingEmailVars(lang, 'Test'),
      }).catch(() => {});
    }

    // In-app bell notification for each alerted session.
    const ALERT_TITLE = t('alert_title', lang);
    const ALERT_MESSAGE = t('alert_message', lang);
    await createNotifications(db, [
      ...dueDays.map((d) => ({
        user_id: d.user_id, title: ALERT_TITLE, message: ALERT_MESSAGE,
        type: 'attendance_alert', link: '/attendance', source_type: 'AttendanceDay', source_id: `${d.id}|${d.next_alert_at}`,
      })),
      ...dueEntries.map((e) => ({
        user_id: e.user_id, title: ALERT_TITLE, message: ALERT_MESSAGE,
        type: 'attendance_alert', link: '/attendance', source_type: 'TimeEntry', source_id: `${e.id}|${e.next_alert_at}`,
      })),
    ]);

    // ── (b) Auto-close: alerted, 30 minutes passed, not confirmed after the alert ──
    const isAutoCloseable = (r) => {
      if (!r.next_alert_at || !r.alert_sent_at) return false;
      const alertedAt = new Date(r.alert_sent_at).getTime();
      if (!Number.isFinite(alertedAt)) return false;
      if (nowMs - alertedAt < CONFIRM_WINDOW_MINUTES * 60000) return false;
      const confirmedAt = r.confirmed_at ? new Date(r.confirmed_at).getTime() : null;
      return !(confirmedAt && Number.isFinite(confirmedAt) && confirmedAt >= alertedAt);
    };

    const closeDays = days.filter(isAutoCloseable);
    const closeEntries = entries.filter(isAutoCloseable);

    if (closeDays.length) {
      await db.AttendanceDay.bulkUpdate(closeDays.map((d) => ({
        id: d.id,
        clock_out_time: d.next_alert_at,
        duration_minutes: minutesBetween(d.clock_in_time, d.next_alert_at),
        status: 'AutoClosed',
        closed_by: 'auto',
      })));
    }

    if (closeEntries.length) {
      await db.TimeEntry.bulkUpdate(closeEntries.map((e) => ({
        id: e.id,
        clock_out_time: e.next_alert_at,
        duration_minutes: minutesBetween(e.clock_in_time, e.next_alert_at),
        status: 'Completed',
        auto_closed: true,
      })));

      // Mirror onto any linked working report, as a normal clock-out does.
      const entryIds = closeEntries.map((e) => e.id);
      const byEntry = new Map(closeEntries.map((e) => [e.id, e]));
      const reports = await db.WorkingReport.filter({ time_entry_id: { $in: entryIds } }, '-created_date', 1000);
      const reportPatches = (reports || [])
        .filter((r) => byEntry.has(r.time_entry_id))
        .map((r) => {
          const e = byEntry.get(r.time_entry_id);
          return {
            id: r.id,
            clock_out_time: e.next_alert_at,
            duration_minutes: minutesBetween(e.clock_in_time, e.next_alert_at),
          };
        });
      if (reportPatches.length) {
        await db.WorkingReport.bulkUpdate(reportPatches);
      }
    }

    // In-app bell notification for each session the sweep closed.
    await createNotifications(db, [
      ...closeDays.map((d) => ({
        user_id: d.user_id, title: t('closed_title', lang),
        message: t('closed_message', lang, { time: formatLocal(d.next_alert_at) }),
        type: 'attendance_closed', link: '/attendance', source_type: 'AttendanceDay', source_id: d.id,
      })),
      ...closeEntries.map((e) => ({
        user_id: e.user_id, title: t('closed_title', lang),
        message: t('closed_message', lang, { time: formatLocal(e.next_alert_at) }),
        type: 'attendance_closed', link: '/attendance', source_type: 'TimeEntry', source_id: e.id,
      })),
    ]);

    return Response.json({
      success: true,
      alerted: due.length,
      auto_closed: closeDays.length + closeEntries.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
