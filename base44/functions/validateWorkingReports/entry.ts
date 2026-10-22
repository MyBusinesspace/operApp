/**
 * validateWorkingReports — Daily validation of Working Reports against rules.
 *
 * Checks every report in a date range and flags violations of:
 *   1. Session duration < 2 minutes (junk / accidental clock-in-out)
 *   2. Overlap group has a leader present → only the leader may sign;
 *      reports from non-leaders are violations (Rule 2).
 *   3. Overlap group has no leader → only the last person to clock out may sign;
 *      reports from non-last-out workers are violations (Rule 3).
 *
 * Input (POST JSON):
 *   date_from       ISO date string (inclusive). Default: yesterday (Asia/Dubai).
 *   date_to         ISO date string (inclusive). Default: same as date_from.
 *   auto_quarantine boolean. If true, deletes violating reports. Default: false.
 *
 * When called without explicit dates (workflow call), the function checks the
 * current hour (Dubai time) against OperationsSettings.working_report_validation_hour.
 * If they don't match, it skips and returns { skipped: true }.
 *
 * Each actual validation run is logged to WorkingReportValidationRun.
 *
 * Returns:
 *   { checked, violations_found, quarantined, violations: [...] }
 *   or { skipped: true, reason: 'not_scheduled_hour', ... }
 */

// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { BUSINESS_TZ, MIN_REPORT_DURATION_MINUTES, dayKey, toMs, resolveDesignatedLeaderName } from "../../shared/workingReportRules.ts";

Deno.serve(async (req) => {
  try {
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const base44 = createClientFromRequest(req);

    // ── Determine if this is a workflow call (no explicit dates) ──
    const hasExplicitDates = !!(body.date_from || body.date_to);

    // ── Get configured validation hour from OperationsSettings ──
    let configuredHour = 20;
    let configuredTz = BUSINESS_TZ;
    try {
      const settings = await base44.asServiceRole.entities.OperationsSettings.list('-created_date', 1);
      if (settings[0]?.working_report_validation_hour != null) {
        configuredHour = settings[0].working_report_validation_hour;
      }
      if (settings[0]?.working_report_validation_timezone) {
        configuredTz = settings[0].working_report_validation_timezone;
      }
    } catch { /* defaults */ }

    // ── If workflow call, only run at the configured hour ──
    if (!hasExplicitDates) {
      const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: configuredTz }));
      const currentHour = nowInTz.getHours();
      if (currentHour !== configuredHour) {
        return Response.json({
          skipped: true,
          reason: 'not_scheduled_hour',
          configured_hour: configuredHour,
          current_hour: currentHour,
        });
      }
    }

    // ── Determine date range (default: yesterday, Asia/Dubai) ──
    const now = new Date();
    const yesterdayDubai = new Date(now.toLocaleString('en-US', { timeZone: BUSINESS_TZ }));
    yesterdayDubai.setDate(yesterdayDubai.getDate() - 1);
    const defaultDate = yesterdayDubai.toISOString().slice(0, 10);

    const dateFrom = body.date_from || defaultDate;
    const dateTo = body.date_to || dateFrom;
    const autoQuarantine = body.auto_quarantine === true;

    // ── Helper to log the validation run ──
    const logRun = async (result) => {
      try {
        await base44.asServiceRole.entities.WorkingReportValidationRun.create({
          run_at: new Date().toISOString(),
          date_from: dateFrom,
          date_to: dateTo,
          checked: result.checked,
          violations_found: result.violations_found,
          quarantined: result.quarantined,
          auto_quarantine: autoQuarantine,
          triggered_by: hasExplicitDates ? 'manual' : 'workflow',
          violations_summary: (result.violations || []).map((v) => ({
            reference: v.reference,
            task_reference: v.task_reference,
            employee_name: v.employee_name,
            reason: v.reason,
            duration_minutes: v.duration_minutes,
          })),
        });
      } catch { /* non-critical */ }
    };

    // ── Load all reports (filter by created_date date range) ──
    const allReports = await base44.asServiceRole.entities.WorkingReport.list('-created_date', 5000);
    const reports = allReports.filter((r) => {
      const created = (r.created_date || '').slice(0, 10);
      return created >= dateFrom && created <= dateTo;
    });

    if (reports.length === 0) {
      const result = {
        date_from: dateFrom, date_to: dateTo,
        checked: 0, violations_found: 0, quarantined: 0, violations: [],
      };
      await logRun(result);
      return Response.json(result);
    }

    // ── Cache tasks + designated leaders ──
    const taskIds = [...new Set(reports.map((r) => r.task_id).filter(Boolean))];
    const taskLeaderCache = new Map();
    if (taskIds.length > 0) {
      const tasks = await base44.asServiceRole.entities.Task.list('-created_date', 500);
      for (const t of tasks) {
        if (taskIds.includes(t.id)) {
          taskLeaderCache.set(t.id, (t.team_leader_name || '').trim() || await resolveDesignatedLeaderName(base44, t));
        }
      }
    }

    // ── Group by task + business day ──
    const groups = {};
    for (const r of reports) {
      const key = `${r.task_id || 'none'}__${dayKey(r.clock_in_time || r.created_date)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    const violations = [];

    for (const [groupKey, groupReports] of Object.entries(groups)) {
      if (groupReports.length <= 1) {
        for (const r of groupReports) {
          const dur = r.duration_minutes;
          if (dur != null && dur < MIN_REPORT_DURATION_MINUTES) {
            violations.push({
              id: r.id, reference: r.reference, task_reference: r.task_reference,
              employee_name: r.employee_name, duration_minutes: dur,
              clock_in_time: r.clock_in_time, clock_out_time: r.clock_out_time,
              reason: 'session_too_short',
            });
          }
        }
        continue;
      }

      // ── Build overlap spans ──
      const spans = groupReports.map((r) => ({
        r,
        s: toMs(r.clock_in_time),
        e: toMs(r.clock_out_time) || Date.now(),
        dur: r.duration_minutes,
      })).filter((sp) => sp.s != null);

      // ── Find overlap groups (transitive closure) ──
      const visited = new Set();
      for (const sp of spans) {
        if (visited.has(sp.r.id)) continue;
        const overlapGroup = [sp];
        visited.add(sp.r.id);
        const queue = [sp];
        while (queue.length > 0) {
          const cur = queue.shift();
          for (const other of spans) {
            if (!visited.has(other.r.id) && cur.s < other.e && other.s < cur.e) {
              visited.add(other.r.id);
              overlapGroup.push(other);
              queue.push(other);
            }
          }
        }

        if (overlapGroup.length <= 1) {
          const r = overlapGroup[0].r;
          const dur = r.duration_minutes;
          if (dur != null && dur < MIN_REPORT_DURATION_MINUTES) {
            violations.push({
              id: r.id, reference: r.reference, task_reference: r.task_reference,
              employee_name: r.employee_name, duration_minutes: dur,
              clock_in_time: r.clock_in_time, clock_out_time: r.clock_out_time,
              reason: 'session_too_short',
            });
          }
          continue;
        }

        // ── Determine leader presence ──
        const taskId = overlapGroup[0].r.task_id;
        const designatedLeader = (taskLeaderCache.get(taskId) || '').trim();
        const leaderPresent = designatedLeader && overlapGroup.some(
          (g) => (g.r.employee_name || '').trim() === designatedLeader && !g.r.is_acting_leader,
        );

        // ── Find the last-out session ──
        const sorted = [...overlapGroup].sort((a, b) => (b.e || 0) - (a.e || 0));
        const lastOut = sorted[0];

        // ── Flag violations ──
        for (const g of overlapGroup) {
          const r = g.r;
          const dur = r.duration_minutes;

          if (dur != null && dur < MIN_REPORT_DURATION_MINUTES) {
            violations.push({
              id: r.id, reference: r.reference, task_reference: r.task_reference,
              employee_name: r.employee_name, duration_minutes: dur,
              clock_in_time: r.clock_in_time, clock_out_time: r.clock_out_time,
              reason: 'session_too_short',
              group_size: overlapGroup.length,
            });
            continue;
          }

          const isLeader = leaderPresent && (r.employee_name || '').trim() === designatedLeader && !r.is_acting_leader;
          const isLastOut = !leaderPresent && r.id === lastOut.r.id;

          if (!isLeader && !isLastOut) {
            violations.push({
              id: r.id, reference: r.reference, task_reference: r.task_reference,
              employee_name: r.employee_name, duration_minutes: dur,
              clock_in_time: r.clock_in_time, clock_out_time: r.clock_out_time,
              reason: leaderPresent ? 'leader_present_non_leader_signed' : 'not_last_out',
              designated_leader: designatedLeader,
              leader_present: leaderPresent,
              last_out_employee: leaderPresent ? null : lastOut.r.employee_name,
              group_size: overlapGroup.length,
            });
          }
        }
      }
    }

    // ── Quarantine (delete) violations if requested ──
    let quarantined = 0;
    if (autoQuarantine && violations.length > 0) {
      for (const v of violations) {
        try {
          await base44.asServiceRole.entities.WorkingReport.delete(v.id);
          quarantined++;
        } catch { /* already deleted or not found */ }
      }
    }

    const result = {
      date_from: dateFrom,
      date_to: dateTo,
      checked: reports.length,
      violations_found: violations.length,
      quarantined,
      auto_quarantine: autoQuarantine,
      violations,
    };
    await logRun(result);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});