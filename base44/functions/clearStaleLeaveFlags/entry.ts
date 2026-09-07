import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recomputeEmployeeLeaveStatus } from "../../shared/leaveSync.ts";

// Scheduled daily cleanup: for every employee currently flagged as On Leave,
// recompute their status from approved leave requests so stale flags clear
// when an approved leave has ended. Runs via the "Clear Stale Leave Flags"
// scheduled automation. Reuses the same logic as the per-leave sync automation.

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const employees = await base44.asServiceRole.entities.Employee.list("full_name", 1000);

    const flagged = employees.filter(
      (e) => e.absence_status || e.status === "On Leave",
    );

    const cleared: any[] = [];
    for (const emp of flagged) {
      const result = await recomputeEmployeeLeaveStatus(base44, emp.id);
      if (result.updated && result.status === "Active") {
        cleared.push({ id: emp.id, name: emp.full_name });
      }
    }

    return Response.json({
      ok: true,
      checked: flagged.length,
      cleared: cleared.length,
      cleared_employees: cleared,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}