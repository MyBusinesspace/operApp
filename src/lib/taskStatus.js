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
export function getEffectiveStatus(task) {
  const status = task.status || "Queued";
  if (status === "Draft") return "Queued";
  if (status === "Template" || status === "Not Completed" || status === "Active" || status === "Completed" || status === "Archived") return status;
  const hasDate = !!task.planning_date;
  if (status === "Queued" && hasDate) return "Scheduled";
  if (status === "Scheduled" && !hasDate) return "Queued";
  return status;
}