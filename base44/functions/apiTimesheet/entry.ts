/**
 * apiTimesheet — Unified Timesheet API
 *
 * Authentication: Pass employee ID in the request header: X-Employee-ID: <employee_id>
 * The employee record is looked up and validated on every request.
 *
 * All requests are POST with a JSON body containing an "action" field.
 *
 * Actions:
 *   clock_in         – Start a new time entry for a task
 *   clock_out        – Complete an active time entry
 *   switch_task      – Close current entry and open a new one
 *   get_active       – Get the current active entry for the employee
 *   get_entries      – List time entries (own by default; scope=all with timesheets view)
 *   get_entry        – Get a single time entry by ID (others allowed with timesheets view)
 *   update_entry     – Update notes/fields on a completed entry
 *   delete_entry     – Delete a time entry
 *   get_tasks        – List tasks (assigned by default; scope=clock_in for full catalog)
 *   get_task         – Get a single task by ID
 *   get_task         – Get a single task by ID
 *   record_location  – Record the worker's GPS location during an active shift
 *   upload_photo     – Upload a photo (base64) for timesheet / mobile camera capture
 *   get_working_reports        – List working reports (by time_entry_id and/or task_id)
 *   get_working_report_templates – List working report templates
 *   create_working_report      – Create a working report after clock-out
 *   update_working_report      – Update an existing working report
 *   get_clock_out_context      – Subtasks, templates, report count, entry report (one call)
 *   finalize_session           – Clock-out / report / subtasks / task status in one call
 *   generate_working_report_pdf – Build Service & Maintenance Report PDF (jsPDF); returns base64
 */

// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { arrayBufferToBase64, buildWorkingReportPdf } from "../../shared/workingReportPdf.ts";

// ─── Upload helper ───────────────────────────────────────────────────────────

function base64ToFile(imageBase64, fileName, mimeType) {
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName || 'photo.jpg', { type: mimeType || 'image/jpeg' });
}

async function uploadBase64Image(base44, { image_base64, file_name, mime_type }) {
  if (!image_base64) throw new Error('image_base64 is required');
  const file = base64ToFile(image_base64, file_name, mime_type);
  const result = await base44.integrations.Core.UploadFile({ file });
  return result.file_url;
}

// ─── Geo helpers ────────────────────────────────────────────────────────────

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': 'OPERAPP360/1.0' }
    });
    const data = await res.json();
    return data.display_name || `${lat}, ${lng}`;
  } catch {
    return `${lat}, ${lng}`;
  }
}

// ─── Aggregation helper ──────────────────────────────────────────────────────

function getPeriodKey(period, date) {
  const d = new Date(date);
  if (period === 'daily') return d.toISOString().slice(0, 10);
  if (period === 'monthly') return d.toISOString().slice(0, 7);
  if (period === 'weekly') {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return 'all';
}

async function updateAggregation(base44, entityType, entityId, entityName, durationMinutes, clockInTime) {
  for (const period of ['daily', 'weekly', 'monthly', 'alltime']) {
    const period_key = getPeriodKey(period, clockInTime);
    const existing = await base44.asServiceRole.entities.TimeAggregation.filter({
      entity_type: entityType, entity_id: entityId, period, period_key
    });
    if (existing.length > 0) {
      await base44.asServiceRole.entities.TimeAggregation.update(existing[0].id, {
        total_minutes: (existing[0].total_minutes || 0) + durationMinutes,
        entry_count: (existing[0].entry_count || 0) + 1,
      });
    } else {
      await base44.asServiceRole.entities.TimeAggregation.create({
        entity_type: entityType, entity_id: entityId, entity_name: entityName,
        period, period_key, total_minutes: durationMinutes, entry_count: 1,
      });
    }
  }
}

async function runAggregations(base44, entry, durationMinutes) {
  const aggs = [
    { type: 'employee', id: entry.employee_id, name: entry.employee_name },
    { type: 'task', id: entry.task_id, name: entry.task_title },
  ];
  if (entry.work_order_id) aggs.push({ type: 'work_order', id: entry.work_order_id, name: entry.work_order_name });
  if (entry.project_id) aggs.push({ type: 'project', id: entry.project_id, name: entry.project_name });
  if (entry.contact_id) aggs.push({ type: 'contact', id: entry.contact_id, name: entry.contact_name });
  if (entry.asset_id) aggs.push({ type: 'asset', id: entry.asset_id, name: entry.asset_name });
  for (const agg of aggs) {
    await updateAggregation(base44, agg.type, agg.id, agg.name, durationMinutes, entry.clock_in_time);
  }
}

// ─── Version check helper ────────────────────────────────────────────────────

async function checkAppVersion(base44, req) {
  const clientVersion = req.headers.get('x-app-version') || null;
  // Web / server-to-server calls omit the header — do not force an update gate.
  if (!clientVersion) return null;
  try {
    const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
    if (!apps || apps.length === 0) return null;
    const app = apps[0];
    if (clientVersion === app.app_version) return null;
    return {
      update_required: true,
      latest_version: app.app_version,
      version_description: app.version_description || '',
    };
  } catch { return null; }
}

function withVersion(data, va) {
  return va ? { ...data, ...va } : data;
}

async function isPlatformAdmin(base44, employee) {
  // Resolve by role KEY (locked to "admin") so detection survives renaming the
  // Admin role's display name. employee.role stores the role name.
  return (await resolveRoleKey(base44, employee?.role)) === 'admin';
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

async function getRolePermission(base44, roleKey, module, employeeRoleName) {
  if (!roleKey && !employeeRoleName?.trim()) return null;
  try {
    if (roleKey) {
      const byKey = await base44.asServiceRole.entities.RolePermission.filter({
        role: roleKey,
        module,
      });
      if (byKey[0]) return byKey[0];
    }
    // Legacy rows may store role display name instead of key.
    const name = employeeRoleName?.trim();
    if (name && name !== roleKey) {
      const byName = await base44.asServiceRole.entities.RolePermission.filter({
        role: name,
        module,
      });
      if (byName[0]) return byName[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function canViewAllTasks(base44, employee) {
  if (await isPlatformAdmin(base44, employee)) return true;
  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, 'tasks', employee.role);
  if (!perm) return false;
  if (perm.can_view === false) return false;
  return perm.can_create_on_behalf === true;
}

/** Timesheets view → list everyone's time entries (matches web Timesheets page). */
async function canViewAllTimeEntries(base44, employee) {
  if (await isPlatformAdmin(base44, employee)) return true;
  const roleKey = await resolveRoleKey(base44, employee.role);
  const perm = await getRolePermission(base44, roleKey, 'timesheets', employee.role);
  // No explicit row → default allow (same as mobile timesheets ModuleAccess).
  if (!perm) return true;
  if (perm.can_view === false) return false;
  return true;
}

function isTaskAssignedToEmployee(task, employee) {
  const employeeId = employee?.id;
  if (!employeeId) return false;
  if ((task.assigned_employees || []).includes(employeeId)) return true;
  if ((task.assigned_users || []).includes(employeeId)) return true;

  const hasNamedAssignees =
    (task.assigned_employees || []).length > 0 ||
    (task.assigned_users || []).length > 0;
  if (hasNamedAssignees) return false;

  const teamId = employee?.team_id;
  if (teamId && (task.assigned_team_ids || []).includes(teamId)) return true;
  return false;
}

/** Business calendar day (UAE). Avoids UTC midnight cutting overnight / early shifts. */
const BUSINESS_TZ = 'Asia/Dubai';

function dateKey(value, timeZone = BUSINESS_TZ) {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function todayKey(timeZone = BUSINESS_TZ) {
  return dateKey(new Date(), timeZone);
}

async function resolveLeaderStatus(base44, { taskId, employeeId, employeeName, entryId, reports = [] }) {
  const fallback = {
    is_leader: false,
    is_acting: false,
    can_make_report: false,
    leader_name: employeeName || '',
  };
  if (!taskId || !employeeId) return fallback;

  try {
    const tasks = await base44.asServiceRole.entities.Task.filter({ id: taskId });
    const task = tasks[0];
    if (!task) return fallback;

    const assignedEmpIds = task.assigned_employees || [];
    const assignedEmpNames = task.assigned_employee_names || [];
    const today = todayKey();

    const resolveLeaderName = (id) => {
      if (!id) return 'the team leader';
      if (id === task.team_leader_id && task.team_leader_name) {
        return task.team_leader_name;
      }
      const idx = assignedEmpIds.indexOf(id);
      if (idx >= 0 && assignedEmpNames[idx]) return assignedEmpNames[idx];
      return 'the team leader';
    };

    const blockReport = (leaderName, extra = {}) => ({
      is_leader: false,
      is_acting: false,
      can_make_report: false,
      leader_name: leaderName,
      report_already_exists: false,
      ...extra,
    });

    const allowReport = (extra = {}) => ({
      is_leader: extra.is_leader === true,
      is_acting: extra.is_acting === true,
      can_make_report: true,
      leader_name: employeeName || resolveLeaderName(employeeId),
      report_already_exists: false,
      ...extra,
    });

    const sameId = (a, b) => String(a || '') === String(b || '');
    const isOpenSession = (e) => {
      if (!e) return false;
      if (e.status === 'Active') return true;
      return !!(e.clock_in_time && !e.clock_out_time);
    };

    // All recent entries on this task + explicit Active sessions.
    // Active query is the source of truth for "someone else is still clocked in".
    let taskEntries = [];
    let activeEntries = [];
    let entriesLoadFailed = false;
    try {
      taskEntries = await base44.asServiceRole.entities.TimeEntry.filter(
        { task_id: taskId },
        '-clock_in_time',
        300,
      );
    } catch {
      taskEntries = [];
      entriesLoadFailed = true;
    }
    try {
      activeEntries = await base44.asServiceRole.entities.TimeEntry.filter(
        { task_id: taskId, status: 'Active' },
        '-clock_in_time',
        100,
      );
    } catch {
      activeEntries = [];
      if (entriesLoadFailed) {
        // Cannot verify who is still on the task — do not allow a report.
        return blockReport('the last worker to clock out', {
          reason: 'entries_unavailable',
        });
      }
    }

    const todayEntries = (taskEntries || []).filter(
      (e) => e?.clock_in_time && dateKey(e.clock_in_time) === today,
    );

    const employeeIdsClockedIn = [
      ...new Set(
        todayEntries
          .map((e) => e.employee_id)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    const othersStillActive = new Set();
    for (const e of [...(activeEntries || []), ...todayEntries]) {
      if (!e?.employee_id) continue;
      if (sameId(e.employee_id, employeeId)) continue;
      // Entry being closed right now is no longer "still in".
      if (entryId && sameId(e.id, entryId)) continue;
      if (isOpenSession(e)) othersStillActive.add(String(e.employee_id));
    }

    const reportExistsForEntry = entryId
      ? (reports || []).some((r) => sameId(r.time_entry_id, entryId))
      : false;

    // Task-level leader; fall back to the assigned team's leader when the task
    // itself doesn't carry one. The team leader is only treated as THIS task's
    // leader when they actually clocked in today (leaderClockedInToday below),
    // so a team leader working on another task never blocks this one.
    let taskLeaderId = task.team_leader_id || null;
    if (!taskLeaderId && Array.isArray(task.assigned_team_ids) && task.assigned_team_ids.length > 0) {
      try {
        const teamRows = await base44.asServiceRole.entities.Team.filter(
          { id: task.assigned_team_ids[0] },
          null,
          1,
        );
        const team = teamRows[0];
        if (team?.leader_id) taskLeaderId = team.leader_id;
      } catch { /* ignore — fall through to acting-leader logic */ }
    }
    const leaderClockedInToday = !!(
      taskLeaderId && employeeIdsClockedIn.includes(String(taskLeaderId))
    );

    // ── 1) Designated task leader who clocked in today → only they report ──
    if (taskLeaderId && leaderClockedInToday) {
      if (sameId(employeeId, taskLeaderId)) {
        // Same time entry already has a report → allow (finalize updates that row).
        // A new clock-out session gets a new entry id → new report is created.
        return allowReport({
          is_leader: true,
          is_acting: false,
          reason: 'task_leader',
          report_already_exists: reportExistsForEntry,
        });
      }
      return blockReport(resolveLeaderName(taskLeaderId), {
        reason: 'waiting_for_task_leader',
      });
    }

    // ── 2) No task leader, OR leader never clocked in → last person to clock out ──
    if (othersStillActive.size > 0) {
      return blockReport('the last worker to clock out', {
        reason: 'waiting_for_others_to_clock_out',
        waiting_employee_ids: [...othersStillActive],
      });
    }

    // Could not load today's roster and nobody Active — fail closed (avoid false "acting").
    if (entriesLoadFailed && employeeIdsClockedIn.length === 0) {
      return blockReport('the last worker to clock out', {
        reason: 'entries_unavailable',
      });
    }

    // Always allow a new report on this clock-out (even if older task reports exist).
    // Same time_entry_id is updated in createReport; a new session creates a new row.
    return allowReport({
      is_leader: false,
      is_acting: true,
      reason: taskLeaderId && !leaderClockedInToday
        ? 'leader_absent_last_out'
        : 'last_out',
      report_already_exists: reportExistsForEntry,
    });
  } catch {
    return fallback;
  }
}

/**
 * Resolves the designated team leader for a task — the leader of the first
 * assigned team that has a leader. This is the accountable "Team Leader" shown
 * on the report, independent of who authored (filled) it. Returns '' when the
 * task has no team or none of its teams have a leader.
 */
async function resolveDesignatedLeaderName(base44, task) {
  if (!task) return '';
  const teamIds = (task.assigned_team_ids || []).filter(Boolean);
  if (teamIds.length === 0) return '';
  try {
    const teams = await base44.asServiceRole.entities.Team.list('name', 200);
    for (const tid of teamIds) {
      const team = (teams || []).find((tm) => tm.id === tid);
      if (!team) continue;
      if (team.leader_name) return team.leader_name;
      if (team.leader_id) {
        const emps = await base44.asServiceRole.entities.Employee.filter({ id: team.leader_id });
        if (emps?.[0]?.full_name) return emps[0].full_name;
      }
    }
  } catch {
    /* non-critical — leave empty */
  }
  return '';
}

/** Same reference rules as web ClockOutReportModal.jsx */
function buildWorkingReportReference(template, task, existingReports = [], maxFallbackNumber = 0) {
  const prefix = template?.ref_prefix || 'WR';
  const includeYear = template?.ref_include_year !== false;
  const year = new Date().getFullYear();
  const padding = template?.ref_number_padding ?? 4;
  const taskRef = task?.reference || '';
  const taskNumMatch = String(taskRef).match(/(\d+)$/);
  const taskNum = taskNumMatch ? taskNumMatch[1] : '';

  if (taskNum) {
    const refBase = includeYear ? `${prefix}-${year}-${taskNum}` : `${prefix}-${taskNum}`;
    const escaped = refBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const seqPattern = new RegExp(`^${escaped}\\.(\\d+)$`);
    let seq = (existingReports || []).length + 1;
    for (const r of existingReports || []) {
      if (!r?.reference) continue;
      const m = String(r.reference).match(seqPattern);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= seq) seq = n + 1;
      }
    }
    return `${refBase}.${seq}`;
  }

  // Derive the fallback sequence from the highest existing fallback number in
  // the database (passed in) rather than the shared template counter, which
  // races under concurrent clock-outs and produces duplicate references.
  const maxBased = (maxFallbackNumber || 0) + 1;
  const nextNum = Math.max(template?.ref_next_number ?? 1, maxBased);
  const padded = String(nextNum).padStart(padding, '0');
  return includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}

/** Build a WorkingReport payload from a completed TimeEntry (mobile skip_report fallback). */
function buildReportPayloadFromEntry(entry, employeeId, employeeName, overlay = {}) {
  const e = entry || {};
  const o = overlay && typeof overlay === 'object' && !Array.isArray(overlay) ? overlay : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(o, key);

  const payload = {
    task_id: e.task_id,
    time_entry_id: e.id,
    task_reference: o.task_reference || e.task_reference || '',
    task_title: o.task_title || e.task_title || '',
    employee_id: employeeId,
    employee_name: o.employee_name || employeeName || e.employee_name || '',
    contact_id: o.contact_id ?? e.contact_id ?? null,
    contact_name: o.contact_name ?? e.contact_name ?? null,
    work_order_id: o.work_order_id ?? e.work_order_id ?? null,
    work_order_name: o.work_order_name ?? e.work_order_name ?? null,
    project_id: o.project_id ?? e.project_id ?? null,
    project_name: o.project_name ?? e.project_name ?? null,
    clock_in_time: o.clock_in_time || e.clock_in_time || null,
    clock_out_time: o.clock_out_time || e.clock_out_time || null,
    duration_minutes: o.duration_minutes ?? e.duration_minutes ?? null,
    clock_in_address: o.clock_in_address ?? e.clock_in_address ?? null,
    clock_out_address: o.clock_out_address ?? e.clock_out_address ?? null,
    on_site: o.on_site ?? e.on_site ?? null,
    report_site_items: has('report_site_items') ? (o.report_site_items || []) : [],
    report_work_description:
      has('report_work_description')
        ? o.report_work_description
        : (o.report_work_description || e.notes || ''),
    report_balance_work: has('report_balance_work') ? (o.report_balance_work || '') : '',
    report_client_comments: has('report_client_comments') ? (o.report_client_comments || '') : '',
    is_acting_leader: o.is_acting_leader ?? false,
    report_leader_name: o.report_leader_name || employeeName || e.employee_name || '',
    reference: o.reference || null,
  };

  // Only send signature when the client explicitly includes it — avoids wiping
  // an existing signature on partial updates.
  if (has('report_client_signature')) {
    payload.report_client_signature = o.report_client_signature ?? null;
  }

  return payload;
}

/** Preserve DB-only fields when the incoming patch omits them. */
function mergeWorkingReportPatch(existing, incoming) {
  const merged = { ...incoming };
  if (existing) {
    if (!Object.prototype.hasOwnProperty.call(incoming, 'report_client_signature')) {
      merged.report_client_signature = existing.report_client_signature ?? null;
    }
  }
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged;
}

/**
 * Persist working report from finalize_session — always ties to time_entry_id so
 * mobile clock-out reports appear on web like web-created reports.
 */
async function persistWorkingReportFromFinalize(base44, {
  templateId,
  employeeId,
  employeeName,
  entryId,
  effectiveTaskId,
  entry,
  report,
  reportId,
}) {
  const taskRows = await base44.asServiceRole.entities.Task.filter({ id: effectiveTaskId });
  const task = taskRows[0] ?? null;

  const enrichedReport = {
    ...report,
    task_id: effectiveTaskId,
    time_entry_id: entryId,
    task_reference: report.task_reference || task?.reference || entry?.task_reference || '',
    task_title: report.task_title || task?.title || entry?.task_title || '',
    employee_id: employeeId,
    employee_name: report.employee_name || employeeName || entry?.employee_name || '',
    clock_in_time: report.clock_in_time || entry?.clock_in_time || null,
    clock_out_time: report.clock_out_time || entry?.clock_out_time || null,
    duration_minutes: report.duration_minutes ?? entry?.duration_minutes ?? null,
    clock_in_address: report.clock_in_address || entry?.clock_in_address || null,
    clock_out_address: report.clock_out_address || entry?.clock_out_address || null,
    on_site: report.on_site ?? entry?.on_site ?? null,
  };

  if (reportId) {
    const rows = await base44.asServiceRole.entities.WorkingReport.filter({ id: reportId });
    const existing = rows[0];
    if (!existing) return { error: 'Working report not found', status: 404 };
    if (existing.employee_id !== employeeId) {
      return { error: 'Only the report author can edit this working report', status: 403 };
    }
    // Preserve the existing reference on updates — never let a client payload overwrite it.
    const updatePatch = { ...enrichedReport };
    delete updatePatch.reference;
    const saved = await base44.asServiceRole.entities.WorkingReport.update(
      reportId,
      mergeWorkingReportPatch(existing, updatePatch),
    );
    return { report: saved };
  }

  let template = null;
  if (templateId) {
    const tmplRows = await base44.asServiceRole.entities.WorkingReportTemplate.filter({
      id: templateId,
    });
    template = tmplRows[0] ?? null;
  } else {
    const templates = await base44.asServiceRole.entities.WorkingReportTemplate.list('name', 20);
    template = templates.find((t) => t.is_default) || templates[0] || null;
  }

  const max = template?.max_reports_per_task ?? 99;
  if (max === 0) {
    return { report: null, skipped: true, reason: 'reports_disabled' };
  }

  const taskReports = await base44.asServiceRole.entities.WorkingReport.filter({
    task_id: effectiveTaskId,
  });

  const existingForEntry = (taskReports || []).find(
    (r) => r.time_entry_id === entryId && r.employee_id === employeeId,
  );
  if (existingForEntry) {
    const updatePatch = { ...enrichedReport };
    delete updatePatch.reference;
    const saved = await base44.asServiceRole.entities.WorkingReport.update(
      existingForEntry.id,
      mergeWorkingReportPatch(existingForEntry, updatePatch),
    );
    return { report: saved };
  }

  // Each time entry gets its own report row (mobile clock-out must appear on web).
  // Allow a new report for this time_entry even when the per-task cap is reached,
  // as long as this entry does not already have one.
  const canCreate =
    max >= 99 || (taskReports || []).length < max;
  if (!canCreate) {
    return {
      report: null,
      skipped: true,
      reason: 'report_limit_reached',
    };
  }

  const leaderStatus = await resolveLeaderStatus(base44, {
    taskId: effectiveTaskId,
    employeeId,
    employeeName: employeeName || entry?.employee_name || '',
    entryId,
    reports: taskReports,
  });

  if (!leaderStatus.can_make_report) {
    return {
      report: null,
      skipped: true,
      reason: leaderStatus.report_already_exists
        ? 'report_already_exists'
        : 'not_report_leader',
      leader_status: leaderStatus,
    };
  }

  // ALWAYS compute the reference server-side. A client (mobile/web) may
  // pre-compute a fallback number from the shared template counter, which
  // races under concurrent clock-outs and produces duplicate references
  // (e.g. several workers all getting WR-2026-0269). Deriving it here from the
  // task reference + existing reports is race-free for task-based refs, and
  // from the max DB fallback number for the rare no-task-reference case.
  const refPrefix = template?.ref_prefix || 'WR';
  const refIncludeYear = template?.ref_include_year !== false;
  const refYear = new Date().getFullYear();
  const escPrefix = refPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fbRe = refIncludeYear
    ? new RegExp(`^${escPrefix}-${refYear}-(\\d+)$`)
    : new RegExp(`^${escPrefix}-(\\d+)$`);
  let maxFallback = 0;
  const allReportsForMax =
    await base44.asServiceRole.entities.WorkingReport.list('-created_date', 5000);
  for (const r of allReportsForMax || []) {
    const m = String(r?.reference || '').match(fbRe);
    if (m) maxFallback = Math.max(maxFallback, parseInt(m[1], 10));
  }
  enrichedReport.reference = buildWorkingReportReference(template, task, taskReports, maxFallback);
  enrichedReport.is_acting_leader = !!(leaderStatus.is_acting && !leaderStatus.is_leader);
  enrichedReport.report_leader_name =
    leaderStatus.leader_name || enrichedReport.employee_name;
  enrichedReport.designated_leader_name = await resolveDesignatedLeaderName(base44, task);

  try {
    const saved = await base44.asServiceRole.entities.WorkingReport.create(enrichedReport);

    const taskNumMatch = String(task?.reference || '').match(/(\d+)$/);
    if (!taskNumMatch && template?.id) {
      const usedMatch = String(enrichedReport.reference || '').match(/(\d+)$/);
      const usedNum = usedMatch ? parseInt(usedMatch[1], 10) : maxFallback + 1;
      await base44.asServiceRole.entities.WorkingReportTemplate.update(template.id, {
        ref_next_number: usedNum + 1,
      });
    }

    return { report: saved };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `WorkingReport.create failed: ${message}`, status: 500 };
  }
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

  const fieldMap = { create: 'can_create', edit: 'can_edit', delete: 'can_delete' };
  if (!perm[fieldMap[action]]) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    // ── Parse body first (web may pass employee_id in body) ───────────────────
    let body = {};
    if (req.method !== 'GET') {
      try { body = await req.json(); } catch { body = {}; }
    }

    // ── Auth via header (mobile) or body.employee_id (web invoke) ─────────────
    const employeeId =
      req.headers.get('X-Employee-ID') ||
      (typeof body.employee_id === 'string' ? body.employee_id : null);
    if (!employeeId) {
      return Response.json(
        { error: 'Missing X-Employee-ID header or employee_id in body' },
        { status: 401 },
      );
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

    const { action } = body;
    if (!action) {
      return Response.json({ error: 'Missing "action" field in request body' }, { status: 400 });
    }

    // ── Route actions ────────────────────────────────────────────────────────

    // ── clock_in ─────────────────────────────────────────────────────────────
    if (action === 'clock_in') {
      const { task_id, lat, lng } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

      const activeEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: employeeId, status: 'Active' });
      if (activeEntries.length > 0) {
        return Response.json({ error: 'Employee already has an active clock-in. Clock out first.' }, { status: 409 });
      }

      const tasks = await base44.asServiceRole.entities.Task.filter({ id: task_id });
      const task = tasks[0];
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

      // Match web clockIn: allow clock-in to any task (assigned or other/unassigned).
      // Auto-fill planning_date so the task appears in Planner.
      if (!task.planning_date) {
        const today = new Date().toISOString().slice(0, 10);
        await base44.asServiceRole.entities.Task.update(task_id, { planning_date: today });
        task.planning_date = today;
      }

      let distance_from_task_m = null;
      let on_site = null;
      let clock_in_address = null;

      if (lat != null && lng != null) {
        clock_in_address = await reverseGeocode(lat, lng);
        if (task.location_lat != null && task.location_lng != null) {
          distance_from_task_m = Math.round(haversineDistance(lat, lng, task.location_lat, task.location_lng));
          on_site = distance_from_task_m <= (task.allowed_radius_m || 200);
        }
      }

      const entry = await base44.asServiceRole.entities.TimeEntry.create({
        employee_id: employeeId,
        employee_name: employee.full_name,
        task_id,
        task_title: task.title,
        work_order_id: task.work_order_id || '',
        work_order_name: task.work_order_name || '',
        project_id: task.project_id || '',
        project_name: task.project_name || '',
        contact_id: task.contact_id || '',
        contact_name: task.contact_name || '',
        asset_id: task.asset_id || '',
        asset_name: task.asset_name || '',
        clock_in_time: new Date().toISOString(),
        status: 'Active',
        clock_in_lat: lat ?? null,
        clock_in_lng: lng ?? null,
        clock_in_address,
        distance_from_task_m,
        on_site,
      });

      return Response.json(withVersion({ success: true, entry }, va));
    }

    // ── clock_out ─────────────────────────────────────────────────────────────
    if (action === 'clock_out') {
      const { entry_id, lat, lng, notes } = body;
      if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });

      const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
      const entry = entries[0];
      if (!entry) return Response.json({ error: 'Time entry not found' }, { status: 404 });
      if (entry.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (entry.status !== 'Active') return Response.json({ error: 'Entry is not active' }, { status: 400 });

      const clockOutTime = new Date();
      const durationMinutes = Math.round((clockOutTime - new Date(entry.clock_in_time)) / 60000);

      let clock_out_address = null;
      if (lat != null && lng != null) clock_out_address = await reverseGeocode(lat, lng);

      const updated = await base44.asServiceRole.entities.TimeEntry.update(entry_id, {
        clock_out_time: clockOutTime.toISOString(),
        duration_minutes: durationMinutes,
        status: 'Completed',
        clock_out_lat: lat ?? null,
        clock_out_lng: lng ?? null,
        clock_out_address,
        notes: notes || entry.notes,
      });

      await runAggregations(base44, entry, durationMinutes);

      return Response.json(withVersion({ success: true, entry: updated, duration_minutes: durationMinutes }, va));
    }

    // ── switch_task ──────────────────────────────────────────────────────────
    if (action === 'switch_task') {
      const { current_entry_id, new_task_id, lat, lng } = body;
      if (!current_entry_id || !new_task_id) {
        return Response.json({ error: 'current_entry_id and new_task_id are required' }, { status: 400 });
      }

      const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: current_entry_id });
      const currentEntry = entries[0];
      if (!currentEntry) return Response.json({ error: 'Current entry not found' }, { status: 404 });
      if (currentEntry.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const newEntryClockIn = new Date();
      let closeAddress = null;
      if (lat != null && lng != null) closeAddress = await reverseGeocode(lat, lng);

      // Retry guard: another active entry (not the one we're switching from).
      const otherActive = (await base44.asServiceRole.entities.TimeEntry.filter({
        employee_id: employeeId,
        status: 'Active',
      })).filter((e) => e.id !== current_entry_id);
      if (otherActive.length > 0) {
        const active = otherActive[0];
        if (active.task_id === new_task_id) {
          return Response.json(
            withVersion(
              {
                success: true,
                closed_entry_id: current_entry_id,
                new_entry: active,
                already_active: true,
              },
              va,
            ),
          );
        }
        return Response.json(
          { error: 'Employee already has an active clock-in. Clock out first.' },
          { status: 409 },
        );
      }

      // If the entry is still Active, close it as Switched.
      // If already Switched/Completed (retry after report step), skip closing.
      if (currentEntry.status === 'Active') {
        const durationMinutes = Math.round(
          (newEntryClockIn - new Date(currentEntry.clock_in_time)) / 60000,
        );

        await base44.asServiceRole.entities.TimeEntry.update(current_entry_id, {
          clock_out_time: newEntryClockIn.toISOString(),
          duration_minutes: durationMinutes,
          status: 'Switched',
          clock_out_lat: lat ?? null,
          clock_out_lng: lng ?? null,
          clock_out_address: closeAddress,
        });

        await runAggregations(base44, currentEntry, durationMinutes);

        // A switch is an instant clock-out + clock-in. Treat the closed session
        // as a clock-out for working-report purposes so the leader who was on the
        // task (or the last-out worker) becomes the reporter — not whoever clocks
        // out later. Idempotent: if a report already exists for this entry (web or
        // mobile filled it before switching), it is just updated with the real
        // switch-out time; nothing is duplicated.
        try {
          await persistWorkingReportFromFinalize(base44, {
            templateId: null,
            employeeId,
            employeeName: employee.full_name || currentEntry.employee_name || '',
            entryId: current_entry_id,
            effectiveTaskId: currentEntry.task_id,
            entry: {
              ...currentEntry,
              clock_out_time: newEntryClockIn.toISOString(),
              duration_minutes: durationMinutes,
              status: 'Switched',
              clock_out_address: closeAddress,
            },
            report: {},
            reportId: null,
          });
        } catch { /* non-critical — switch still succeeds */ }
      } else if (currentEntry.status !== 'Switched' && currentEntry.status !== 'Completed') {
        return Response.json(
          { error: `Cannot switch from entry with status: ${currentEntry.status}` },
          { status: 400 },
        );
      }

      const tasks = await base44.asServiceRole.entities.Task.filter({ id: new_task_id });
      const newTask = tasks[0];
      if (!newTask) return Response.json({ error: 'New task not found' }, { status: 404 });

      let distance_from_task_m = null;
      let on_site = null;
      if (lat != null && lng != null && newTask.location_lat != null && newTask.location_lng != null) {
        distance_from_task_m = Math.round(haversineDistance(lat, lng, newTask.location_lat, newTask.location_lng));
        on_site = distance_from_task_m <= (newTask.allowed_radius_m || 200);
      }

      const newEntry = await base44.asServiceRole.entities.TimeEntry.create({
        employee_id: employeeId,
        employee_name: employee.full_name,
        task_id: new_task_id,
        task_title: newTask.title,
        work_order_id: newTask.work_order_id || '',
        work_order_name: newTask.work_order_name || '',
        project_id: newTask.project_id || '',
        project_name: newTask.project_name || '',
        contact_id: newTask.contact_id || '',
        contact_name: newTask.contact_name || '',
        asset_id: newTask.asset_id || '',
        asset_name: newTask.asset_name || '',
        clock_in_time: newEntryClockIn.toISOString(),
        status: 'Active',
        clock_in_lat: lat ?? null,
        clock_in_lng: lng ?? null,
        clock_in_address: closeAddress,
        distance_from_task_m,
        on_site,
        switched_from_entry_id: current_entry_id,
      });

      return Response.json(withVersion({ success: true, closed_entry_id: current_entry_id, new_entry: newEntry }, va));
    }

    // ── get_active ────────────────────────────────────────────────────────────
    if (action === 'get_active') {
      const active = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id: employeeId, status: 'Active' });
      return Response.json(withVersion({ success: true, entry: active[0] || null }, va));
    }

    // ── get_entries ───────────────────────────────────────────────────────────
    if (action === 'get_entries') {
      const { date_from, date_to, limit = 100, scope } = body;
      const viewAll =
        (scope === 'all' || scope === 'team') &&
        (await canViewAllTimeEntries(base44, employee));
      const fetchLimit = viewAll ? Math.max(Number(limit) || 100, 300) : (limit || 100);
      let all = viewAll
        ? await base44.asServiceRole.entities.TimeEntry.list('-clock_in_time', fetchLimit)
        : await base44.asServiceRole.entities.TimeEntry.filter(
            { employee_id: employeeId },
            '-clock_in_time',
            fetchLimit,
          );
      if (date_from) all = all.filter(e => e.clock_in_time >= date_from);
      if (date_to) all = all.filter(e => e.clock_in_time <= date_to + 'T23:59:59Z');
      return Response.json(withVersion({
        success: true,
        entries: all,
        view_all: viewAll,
      }, va));
    }

    // ── get_entry ─────────────────────────────────────────────────────────────
    if (action === 'get_entry') {
      const { entry_id } = body;
      if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });
      const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
      const entry = entries[0];
      if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });
      if (entry.employee_id !== employeeId) {
        const allowed = await canViewAllTimeEntries(base44, employee);
        if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      return Response.json(withVersion({ success: true, entry }, va));
    }

    // ── update_entry ──────────────────────────────────────────────────────────
    if (action === 'update_entry') {
      const {
        entry_id,
        notes,
        clock_in_time,
        clock_out_time,
        clock_in_photo_url,
        clock_out_photo_url,
      } = body;
      if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });
      const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
      const entry = entries[0];
      if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });
      if (entry.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const editsTimes = clock_in_time !== undefined || clock_out_time !== undefined;
      if (editsTimes) {
        const denied = await denyUnlessModuleAccess(base44, employee, 'reports', 'edit');
        if (denied) return denied;
      }

      const patch = {};
      if (notes !== undefined) patch.notes = notes;
      if (clock_in_photo_url !== undefined) patch.clock_in_photo_url = clock_in_photo_url;
      if (clock_out_photo_url !== undefined) patch.clock_out_photo_url = clock_out_photo_url;
      if (clock_in_time !== undefined) patch.clock_in_time = clock_in_time;
      if (clock_out_time !== undefined) {
        patch.clock_out_time = clock_out_time;
        const cin = new Date(clock_in_time || entry.clock_in_time);
        const cout = new Date(clock_out_time);
        patch.duration_minutes = Math.round((cout - cin) / 60000);
      }

      const updated = await base44.asServiceRole.entities.TimeEntry.update(entry_id, patch);
      return Response.json(withVersion({ success: true, entry: updated }, va));
    }

    // ── delete_entry ──────────────────────────────────────────────────────────
    if (action === 'delete_entry') {
      const { entry_id } = body;
      if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });
      const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
      const entry = entries[0];
      if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });
      if (entry.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      await base44.asServiceRole.entities.TimeEntry.delete(entry_id);
      return Response.json(withVersion({ success: true }, va));
    }

    // ── get_tasks ─────────────────────────────────────────────────────────────
    if (action === 'get_tasks') {
      const { status, date, scope } = body;
      const filter = {};
      if (status) filter.status = status;
      const limit = scope === 'clock_in' ? 500 : 200;
      let tasks = await base44.asServiceRole.entities.Task.filter(filter, '-planning_date', limit);

      // clock_in scope matches web ClockInModal: all non-completed tasks for filters.
      const viewAll = scope === 'clock_in' ? true : await canViewAllTasks(base44, employee);
      if (!viewAll) {
        tasks = tasks.filter((t) => isTaskAssignedToEmployee(t, employee));
      }

      if (date) tasks = tasks.filter(t => t.planning_date === date);
      return Response.json(withVersion({
        success: true,
        tasks,
        view_all: viewAll,
      }, va));
    }

    // ── get_task ──────────────────────────────────────────────────────────────
    if (action === 'get_task') {
      const { task_id } = body;
      if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });
      const tasks = await base44.asServiceRole.entities.Task.filter({ id: task_id });
      const task = tasks[0];
      if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
      return Response.json(withVersion({ success: true, task }, va));
    }

    // ── record_location ───────────────────────────────────────────────────────
    if (action === 'record_location') {
      const { entry_id, lat, lng } = body;
      if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });
      if (lat == null || lng == null) return Response.json({ error: 'lat and lng are required' }, { status: 400 });

      const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
      const entry = entries[0];
      if (!entry) return Response.json({ error: 'Time entry not found' }, { status: 404 });
      if (entry.employee_id !== employeeId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (entry.status !== 'Active') return Response.json({ error: 'Entry is not active' }, { status: 400 });

      // Respect tracking interval from settings
      const settingsList = await base44.asServiceRole.entities.OperationsSettings.list();
      const settings = (settingsList || []).reduce((latest, s) => {
        if (!latest) return s;
        const a = new Date(latest.updated_date || latest.created_date || 0).getTime();
        const b = new Date(s.updated_date || s.created_date || 0).getTime();
        return b >= a ? s : latest;
      }, null) || {};
      const intervalMin = settings.tracking_interval_min || 0;

      // Only enforce minimum interval if configured (0 = disabled, but we still record)
      if (intervalMin > 0) {
        const recent = await base44.asServiceRole.entities.WorkerLocation.filter(
          { time_entry_id: entry_id },
          '-recorded_at',
          1
        );
        if (recent.length > 0) {
          const lastTime = new Date(recent[0].recorded_at).getTime();
          const secondsSince = (Date.now() - lastTime) / 1000;
          if (secondsSince < intervalMin * 60) {
            return Response.json({
              success: true,
              skipped: true,
              next_allowed_in_seconds: Math.round(intervalMin * 60 - secondsSince),
              interval_min: intervalMin,
              seconds_since_last: Math.round(secondsSince),
            });
          }
        }
      }

      const address = await reverseGeocode(lat, lng);

      const location = await base44.asServiceRole.entities.WorkerLocation.create({
        time_entry_id: entry_id,
        employee_id: employeeId,
        employee_name: employee.full_name,
        task_id: entry.task_id,
        task_title: entry.task_title,
        lat,
        lng,
        address,
        recorded_at: new Date().toISOString(),
      });

      return Response.json(withVersion({ success: true, location, interval_min: intervalMin }, va));
    }

    // ── upload_photo ──────────────────────────────────────────────────────────
    if (action === 'upload_photo') {
      const { image_base64, file_name, mime_type } = body;
      const file_url = await uploadBase64Image(base44, { image_base64, file_name, mime_type });
      return Response.json(withVersion({ success: true, file_url, url: file_url }, va));
    }

    // ── get_working_reports ───────────────────────────────────────────────────
    // Anyone authenticated may VIEW reports. Edit remains author-only elsewhere.
    if (action === 'get_working_reports') {
      const { time_entry_id, task_id, limit = 50 } = body;
      if (!time_entry_id && !task_id) {
        return Response.json({ error: 'time_entry_id or task_id is required' }, { status: 400 });
      }

      const filter = {};
      if (time_entry_id) filter.time_entry_id = time_entry_id;
      if (task_id) filter.task_id = task_id;

      const reports = await base44.asServiceRole.entities.WorkingReport.filter(
        filter,
        '-created_date',
        limit,
      );

      return Response.json(withVersion({ success: true, reports: reports || [] }, va));
    }

    // ── get_working_report_templates ──────────────────────────────────────────
    if (action === 'get_working_report_templates') {
      const { limit = 20 } = body;
      // Same sort as web Settings / TaskWorkingReports
      const templates = await base44.asServiceRole.entities.WorkingReportTemplate.list('name', limit);
      return Response.json(withVersion({ success: true, templates: templates || [] }, va));
    }

    // ── create_working_report ─────────────────────────────────────────────────
    // Clock-out working reports are part of the timesheets flow (web uses entity create
    // without Reports module RBAC). Own-report employee_id check is enforced below.
    if (action === 'create_working_report') {
      const { report, template_id } = body;
      if (!report || typeof report !== 'object' || Array.isArray(report)) {
        return Response.json({ error: 'report object is required' }, { status: 400 });
      }
      if (report.employee_id && report.employee_id !== employeeId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const taskId = report.task_id || null;
      let taskReports = [];
      let task = null;
      if (taskId) {
        taskReports = await base44.asServiceRole.entities.WorkingReport.filter({
          task_id: taskId,
        });
        const taskRows = await base44.asServiceRole.entities.Task.filter({ id: taskId });
        task = taskRows[0] ?? null;
        const leaderStatus = await resolveLeaderStatus(base44, {
          taskId,
          employeeId,
          employeeName: report.employee_name || employee.full_name || '',
          entryId: report.time_entry_id || null,
          reports: taskReports,
        });
        if (!leaderStatus.can_make_report) {
          return Response.json(
            {
              error: leaderStatus.report_already_exists
                ? 'A working report already exists for this task today'
                : `Only ${leaderStatus.leader_name || 'the team leader'} can create the working report`,
              leader_status: leaderStatus,
            },
            { status: 403 },
          );
        }
      }

      // Resolve template (explicit id, else the current default)
      let template = null;
      if (template_id) {
        const tmplRows = await base44.asServiceRole.entities.WorkingReportTemplate.filter({ id: template_id });
        template = tmplRows[0] ?? null;
      } else {
        const templates = await base44.asServiceRole.entities.WorkingReportTemplate.list('name', 50);
        template = (templates || []).find(t => t.is_default) || (templates || [])[0] || null;
      }

      // ALWAYS compute the reference server-side (race-free): task-based when the
      // task has a reference, else max-DB fallback. Never trust a client-supplied
      // reference — concurrent clock-outs sharing the template counter produced
      // duplicates (e.g. several workers all getting WR-2026-0269).
      const refPrefix = template?.ref_prefix || 'WR';
      const refIncludeYear = template?.ref_include_year !== false;
      const refYear = new Date().getFullYear();
      const escPrefix = refPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fbRe = refIncludeYear
        ? new RegExp(`^${escPrefix}-${refYear}-(\\d+)$`)
        : new RegExp(`^${escPrefix}-(\\d+)$`);
      let maxFallback = 0;
      const allReportsForMax =
        await base44.asServiceRole.entities.WorkingReport.list('-created_date', 5000);
      for (const r of allReportsForMax || []) {
        const m = String(r?.reference || '').match(fbRe);
        if (m) maxFallback = Math.max(maxFallback, parseInt(m[1], 10));
      }
      const reference = buildWorkingReportReference(template, task, taskReports, maxFallback);

      const payload = {
        ...report,
        employee_id: employeeId,
        employee_name: report.employee_name || employee.full_name || '',
        reference,
        designated_leader_name: await resolveDesignatedLeaderName(base44, task),
      };

      const created = await base44.asServiceRole.entities.WorkingReport.create(payload);

      const taskNumMatch = String(task?.reference || '').match(/(\d+)$/);
      if (!taskNumMatch && template?.id) {
        const usedMatch = String(reference || '').match(/(\d+)$/);
        const usedNum = usedMatch ? parseInt(usedMatch[1], 10) : maxFallback + 1;
        await base44.asServiceRole.entities.WorkingReportTemplate.update(template.id, {
          ref_next_number: usedNum + 1,
        });
      }

      return Response.json(withVersion({ success: true, report: created }, va));
    }

    // ── update_working_report ─────────────────────────────────────────────────
    if (action === 'update_working_report') {
      const { report_id, report: patch } = body;
      if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return Response.json({ error: 'report patch object is required' }, { status: 400 });
      }

      const rows = await base44.asServiceRole.entities.WorkingReport.filter({ id: report_id });
      const existing = rows[0];
      if (!existing) return Response.json({ error: 'Working report not found' }, { status: 404 });
      if (existing.employee_id !== employeeId) {
        return Response.json(
          { error: 'Only the report author can edit this working report' },
          { status: 403 },
        );
      }

      const updated = await base44.asServiceRole.entities.WorkingReport.update(report_id, patch);
      return Response.json(withVersion({ success: true, report: updated }, va));
    }

    // ── get_clock_out_context ─────────────────────────────────────────────────
    if (action === 'get_clock_out_context') {
      const { entry_id, task_id } = body;

      const subtasks = task_id
        ? await base44.asServiceRole.entities.TaskSubtask.filter({ task_id }, 'sort_order', 200)
        : [];

      const templates =
        await base44.asServiceRole.entities.WorkingReportTemplate.list('name', 20);

      let reports_count = 0;
      let entry_report = null;
      let task_report = null;
      let taskReports = [];
      if (task_id) {
        taskReports = await base44.asServiceRole.entities.WorkingReport.filter(
          { task_id },
          '-created_date',
          200,
        );
        reports_count = taskReports.length;
        // Latest report on the task — any teammate may VIEW it.
        task_report = taskReports[0] ?? null;
      }
      if (entry_id) {
        const entryReports = await base44.asServiceRole.entities.WorkingReport.filter(
          { time_entry_id: entry_id },
          '-created_date',
          5,
        );
        // Prefer caller's own report for edit; otherwise any report on this entry.
        entry_report =
          entryReports.find((r) => r.employee_id === employeeId) ??
          entryReports[0] ??
          null;
      }

      let task = null;
      let leader_status = null;
      if (task_id) {
        const taskRows = await base44.asServiceRole.entities.Task.filter({ id: task_id });
        task = taskRows[0] ?? null;
        leader_status = await resolveLeaderStatus(base44, {
          taskId: task_id,
          employeeId,
          employeeName: employee.full_name || '',
          entryId: entry_id || null,
          reports: taskReports,
        });
      }

      return Response.json(
        withVersion(
          {
            success: true,
            subtasks,
            templates,
            reports_count,
            entry_report,
            task_report,
            task,
            leader_status,
          },
          va,
        ),
      );
    }

    // ── finalize_session ──────────────────────────────────────────────────────
    if (action === 'finalize_session') {
      const {
        mode = 'clock_out',
        entry_id,
        lat,
        lng,
        notes,
        clock_in_time,
        clock_out_time,
        clock_in_photo_url,
        clock_out_photo_url,
        subtask_updates = [],
        task_id,
        task_status,
        template_id,
        report_id,
        report,
        skip_report = false,
        amendment,
      } = body;

      if (!entry_id) {
        return Response.json({ error: 'entry_id is required' }, { status: 400 });
      }

      const entryRows = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
      let entry = entryRows[0];
      if (!entry) return Response.json({ error: 'Time entry not found' }, { status: 404 });
      if (entry.employee_id !== employeeId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (mode === 'clock_out' && entry.status === 'Active') {
        const effectiveClockOutIso =
          clock_out_time ||
          (amendment && typeof amendment === 'object' ? amendment.amended_clock_out : null);
        const effectiveClockInIso =
          clock_in_time ||
          (amendment && typeof amendment === 'object' ? amendment.amended_clock_in : null);
        const clockOutTime = effectiveClockOutIso ? new Date(effectiveClockOutIso) : new Date();
        const clockInSource = effectiveClockInIso || entry.clock_in_time;
        const durationMinutes = Math.round(
          (clockOutTime - new Date(clockInSource)) / 60000,
        );

        let clock_out_address = null;
        if (lat != null && lng != null) {
          clock_out_address = await reverseGeocode(lat, lng);
        }

        entry = await base44.asServiceRole.entities.TimeEntry.update(entry_id, {
          clock_out_time: clockOutTime.toISOString(),
          duration_minutes: durationMinutes,
          status: 'Completed',
          clock_out_lat: lat ?? null,
          clock_out_lng: lng ?? null,
          clock_out_address,
          notes: notes || entry.notes,
          ...(effectiveClockInIso ? { clock_in_time: effectiveClockInIso } : {}),
        });

        await runAggregations(base44, entryRows[0], durationMinutes);
      } else if (mode === 'switch_report') {
        // Save report/subtasks for task switch — keep the entry Active until switch_task runs.
        if (entry.status !== 'Active') {
          return Response.json(
            { error: `Cannot save switch report (status: ${entry.status})` },
            { status: 400 },
          );
        }
      } else if (mode === 'clock_out' && entry.status !== 'Completed' && entry.status !== 'Switched') {
        return Response.json(
          { error: `This shift cannot be closed (status: ${entry.status})` },
          { status: 400 },
        );
      }

      const entryPatch = {};
      if (notes !== undefined && mode !== 'clock_out') entryPatch.notes = notes;
      if (clock_in_photo_url !== undefined) entryPatch.clock_in_photo_url = clock_in_photo_url;
      if (clock_out_photo_url !== undefined) entryPatch.clock_out_photo_url = clock_out_photo_url;

      const editsTimes = clock_in_time !== undefined || clock_out_time !== undefined;
      if (editsTimes && mode === 'edit_entry') {
        const denied = await denyUnlessModuleAccess(base44, employee, 'reports', 'edit');
        if (denied) return denied;
      }
      // Apply amended times on clock_out too (mobile sends them in report payload;
      // also honour explicit clock_in/out when provided after the initial close).
      if (mode === 'clock_out' && editsTimes) {
        if (clock_in_time !== undefined) entryPatch.clock_in_time = clock_in_time;
        if (clock_out_time !== undefined) {
          entryPatch.clock_out_time = clock_out_time;
          const cin = new Date(clock_in_time || entry.clock_in_time);
          const cout = new Date(clock_out_time);
          entryPatch.duration_minutes = Math.round((cout - cin) / 60000);
        }
      } else {
        if (clock_in_time !== undefined) entryPatch.clock_in_time = clock_in_time;
        if (clock_out_time !== undefined) {
          entryPatch.clock_out_time = clock_out_time;
          const cin = new Date(clock_in_time || entry.clock_in_time);
          const cout = new Date(clock_out_time);
          entryPatch.duration_minutes = Math.round((cout - cin) / 60000);
        }
      }

      if (Object.keys(entryPatch).length > 0) {
        entry = await base44.asServiceRole.entities.TimeEntry.update(entry_id, entryPatch);
      }

      if (Array.isArray(subtask_updates)) {
        for (const su of subtask_updates) {
          if (!su?.id) continue;
          await base44.asServiceRole.entities.TaskSubtask.update(su.id, { done: !!su.done });
        }
      }

      const effectiveTaskId = task_id || entry.task_id;
      if (effectiveTaskId && task_status) {
        await base44.asServiceRole.entities.Task.update(effectiveTaskId, { status: task_status });
      }

      if (amendment && typeof amendment === 'object' && !Array.isArray(amendment)) {
        await base44.asServiceRole.entities.TimeEntryAmendment.create({
          time_entry_id: entry_id,
          employee_id: employeeId,
          employee_name: employee.full_name || entry.employee_name || '',
          task_id: entry.task_id,
          task_title: entry.task_title,
          original_clock_in: amendment.original_clock_in,
          original_clock_out: amendment.original_clock_out,
          amended_clock_in: amendment.amended_clock_in,
          amended_clock_out: amendment.amended_clock_out,
          reason: amendment.reason ?? null,
          status: 'Pending',
        });
      }

      let savedReport = null;
      let reportSaved = false;
      let reportSkipReason = null;

      const shouldPersistReport =
        effectiveTaskId &&
        (mode === 'clock_out' || mode === 'switch_report' || mode === 'edit_entry');

      // Mobile often sends skip_report=true (leader/limit checks) but still fills
      // the wizard — the server always persists so web sees the same report.
      if (shouldPersistReport) {
        const clientReport =
          report && typeof report === 'object' && !Array.isArray(report) ? report : null;
        const reportPayload = buildReportPayloadFromEntry(
          entry,
          employeeId,
          employee.full_name || '',
          clientReport || {},
        );

        const persistResult = await persistWorkingReportFromFinalize(base44, {
          templateId: template_id,
          employeeId,
          employeeName: employee.full_name || entry.employee_name || '',
          entryId: entry_id,
          effectiveTaskId,
          entry,
          report: reportPayload,
          reportId: report_id,
        });

        if (persistResult.error) {
          reportSkipReason = persistResult.error;
        } else {
          savedReport = persistResult.report ?? null;
          reportSaved = !!savedReport;
          if (!reportSaved && persistResult.skipped) {
            reportSkipReason = persistResult.reason || 'unknown';
          }
        }
      }

      return Response.json(
        withVersion({
          success: true,
          entry,
          report: savedReport,
          report_saved: reportSaved,
          report_skip_reason: reportSkipReason,
        }, va),
      );
    }

    // ── generate_working_report_pdf ───────────────────────────────────────────
    // Body: report_id OR report object; optional task_id, for_client_fill, subtasks
    if (action === 'generate_working_report_pdf') {
      const {
        report_id,
        report: reportBody,
        task_id: taskIdOverride,
        for_client_fill = false,
        subtasks: subtasksBody,
      } = body;

      if (!report_id && (!reportBody || typeof reportBody !== 'object' || Array.isArray(reportBody))) {
        return Response.json(
          { error: 'report_id or report object is required' },
          { status: 400 },
        );
      }

      let report = null;
      if (report_id) {
        const rows = await base44.asServiceRole.entities.WorkingReport.filter({ id: report_id });
        report = rows[0] ?? null;
        if (!report) return Response.json({ error: 'Working report not found' }, { status: 404 });
        // Only overlay non-null fields so mobile/web payloads cannot wipe DB values.
        if (reportBody && typeof reportBody === 'object' && !Array.isArray(reportBody)) {
          const patch = {};
          for (const [k, v] of Object.entries(reportBody)) {
            if (v !== null && v !== undefined && k !== 'id') patch[k] = v;
          }
          report = { ...report, ...patch, id: report.id };
        }
      } else {
        report = reportBody;
      }

      // PDF generation is VIEW-only — any authenticated worker may open a report.
      // Creating/updating reports stays author / leader gated elsewhere.
      if (!report.employee_id) {
        report = { ...report, employee_id: employeeId };
      }

      // Prefer explicit template_id, else current default (same pick as web UI).
      let template = null;
      const requestedTemplateId =
        (typeof body.template_id === 'string' && body.template_id) ||
        (typeof reportBody?.template_id === 'string' && reportBody.template_id) ||
        null;
      if (requestedTemplateId) {
        const tmplRows = await base44.asServiceRole.entities.WorkingReportTemplate.filter({
          id: requestedTemplateId,
        });
        template = tmplRows[0] ?? null;
      }
      if (!template) {
        const templates = await base44.asServiceRole.entities.WorkingReportTemplate.list(
          'name',
          50,
        );
        template =
          (templates || []).find((t) => t.is_default) || (templates || [])[0] || null;
      }

      const resolvedTaskId = taskIdOverride || report.task_id || null;
      let task = null;
      if (resolvedTaskId) {
        const taskRows = await base44.asServiceRole.entities.Task.filter({ id: resolvedTaskId });
        task = taskRows[0] ?? null;
      }

      let subtasks = Array.isArray(subtasksBody) ? subtasksBody : null;
      if (!subtasks && resolvedTaskId) {
        subtasks = await base44.asServiceRole.entities.TaskSubtask.filter(
          { task_id: resolvedTaskId },
          'sort_order',
          200,
        );
      }
      subtasks = subtasks || [];

      let asset = null;
      const assetId = task?.asset_id || report.asset_id;
      if (assetId) {
        try {
          const assetRows = await base44.asServiceRole.entities.Asset.filter({ id: assetId });
          asset = assetRows[0] ?? null;
        } catch { /* skip */ }
      }

      let woContactLabel = '';
      const woId = report.work_order_id || task?.work_order_id;
      if (woId) {
        try {
          const cps = await base44.asServiceRole.entities.ContactPerson.filter(
            { work_order_id: woId },
            'full_name',
            50,
          );
          woContactLabel = (cps || [])
            .map((cp) => (cp.phone ? `${cp.full_name} (${cp.phone})` : cp.full_name))
            .filter(Boolean)
            .join(' · ');
        } catch { /* skip */ }
      }

      const entryForPdf = {
        ...report,
        report_reference: report.report_reference || report.reference,
        report_client_comments: for_client_fill ? '' : (report.report_client_comments || ''),
        report_client_signature: for_client_fill ? null : (report.report_client_signature || null),
      };

      const taskForPdf = {
        ...(task || {}),
        subtasks,
      };

      const pdf = await buildWorkingReportPdf({
        template,
        entry: entryForPdf,
        task: taskForPdf,
        asset,
        woContactLabel,
      });

      const pdfBytes = pdf.output('arraybuffer');
      const pdf_base64 = arrayBufferToBase64(pdfBytes);

      const ref = String(report.reference || report.report_reference || 'working')
        .replace(/[^\w\-]+/g, '_');
      const file_name = `Report_${ref}.pdf`;

      return Response.json(
        withVersion({
          success: true,
          file_name,
          pdf_base64,
          mime_type: 'application/pdf',
          template_id: template?.id || null,
          template_name: template?.name || null,
        }, va),
      );
    }

    return Response.json({ error: `Unknown action: "${action}"` }, { status: 400 });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});