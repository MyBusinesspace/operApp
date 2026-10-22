// syncEmployeeLeaveStatus — entity automation target.
// Fires on every LeaveRequest create/update/delete (web app or mobile API).
// Recomputes the affected employee's On Leave / Active status so every leave
// entry is reflected on the worker automatically, regardless of input source.
//
// Payload from the platform: { event, data, old_data, changed_fields, payload_too_large }

// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recomputeEmployeeLeaveStatus } from "../../shared/leaveSync.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: true, skipped: true, reason: "no body" });
    }

    const employeeId =
      body?.data?.employee_id ||
      body?.old_data?.employee_id ||
      body?.event?.entity_id ||
      null;

    if (!employeeId) {
      return Response.json({ ok: true, skipped: true, reason: "no employee_id" });
    }

    const result = await recomputeEmployeeLeaveStatus(base44, employeeId);
    return Response.json({ ok: true, employeeId, result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}