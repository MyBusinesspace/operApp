/**
 * Shared helpers for Working Report validation and leader resolution.
 * Used by apiTimesheet and validateWorkingReports.
 */

export const BUSINESS_TZ = 'Asia/Dubai';
export const MIN_REPORT_DURATION_MINUTES = 2;

/** Format a date/timestamp as a YYYY-MM-DD business-day key in the given timezone. */
export function dayKey(value, timeZone = BUSINESS_TZ) {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Convert an ISO timestamp to epoch milliseconds, or null. */
export function toMs(v) {
  return v ? new Date(v).getTime() : null;
}

/**
 * Resolve the designated team leader for a task — the leader of the first
 * assigned team that has a leader. Returns '' when the task has no team or
 * none of its teams have a leader.
 */
export async function resolveDesignatedLeaderName(base44, task) {
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