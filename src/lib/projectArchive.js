import { base44 } from "@/api/base44Client";

// Archive all Work Orders and Tasks linked to a project.
// Called when a project transitions to "Completed" so its children
// are removed from the active operation cycle (mirrors the WorkOrder
// "Archived" terminal status). Idempotent — already-archived records
// are simply re-set to "Archived".
export async function archiveProjectChildren(projectId) {
  if (!projectId) return { wos: 0, tasks: 0 };
  const [wos, tasks] = await Promise.all([
    base44.entities.WorkOrder.filter({ project_id: projectId }).catch(() => []),
    base44.entities.Task.filter({ project_id: projectId }).catch(() => []),
  ]);
  const woCount = (wos || []).length;
  const taskCount = (tasks || []).length;
  if (woCount > 0) {
    await base44.entities.WorkOrder.updateMany(
      { project_id: projectId },
      { $set: { status: "Archived" } }
    ).catch(() => {});
  }
  if (taskCount > 0) {
    await base44.entities.Task.updateMany(
      { project_id: projectId },
      { $set: { status: "Archived" } }
    ).catch(() => {});
  }
  return { wos: woCount, tasks: taskCount };
}