/**
 * Computes the effective task status based on its current status and
 * whether a planning date + time slot are set.
 *
 * - Queued + (date + time) → Scheduled
 * - Scheduled + (no date or time) → Queued
 * - Not Completed / Active / Completed are never auto-changed
 *
 * Completion status is set explicitly (by the employee or from the webpage)
 * and is NOT derived from subtask check state.
 *
 * This is the SINGLE source of truth for task status — used by the table
 * badge, tab counts, filter logic, and auto-correct on load.
 */
export function getEffectiveStatus(task, reports = [], subtasks = []) {
  const status = task.status || "Queued";
  if (status === "Draft") return "Queued";
  if (status === "Template" || status === "Archived") return status;

  if (status === "Not Completed" || status === "Active" || status === "Completed") return status;
  const hasDate = !!task.planning_date;
  if (status === "Queued" && hasDate) return "Scheduled";
  if (status === "Scheduled" && !hasDate) return "Queued";
  return status;
}