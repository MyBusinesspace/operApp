/**
 * Computes the effective task status based on its current status and
 * whether a planning date + time slot are set.
 *
 * - Queued + (date + time) → Scheduled
 * - Scheduled + (no date or time) → Queued
 * - Not Completed / Active / Completed are never auto-changed
 *
 * This is the SINGLE source of truth for task status — used by the table
 * badge, tab counts, filter logic, and auto-correct on load.
 */
export function getEffectiveStatus(task, reports = [], subtasks = []) {
  const status = task.status || "Queued";
  if (status === "Draft") return "Queued";
  if (status === "Template" || status === "Archived") return status;

  // If working reports exist, the task has been performed — show a completion-based
  // status instead of the planning-based "Scheduled"/"Queued".
  const hasReports = reports && reports.length > 0;
  if (hasReports && (status === "Scheduled" || status === "Queued")) {
    const hasSubtasks = subtasks && subtasks.length > 0;
    const allDone = !hasSubtasks || subtasks.every(s => s.done);
    return allDone ? "Completed" : "Not Completed";
  }

  if (status === "Not Completed" || status === "Active" || status === "Completed") return status;
  const hasDate = !!task.planning_date;
  if (status === "Queued" && hasDate) return "Scheduled";
  if (status === "Scheduled" && !hasDate) return "Queued";
  return status;
}