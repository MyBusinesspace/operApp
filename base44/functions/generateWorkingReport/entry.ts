import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { buildWorkingReportPdf, dayKey, fmtDate, loadActiveAssetFields } from "../../shared/workingReportPdf.ts";

/**
 * generateWorkingReport
 *
 * Renders a Service & Maintenance Report PDF using the SAME renderer as the
 * mobile API (base44/shared/workingReportPdf.ts), uploads it, and returns a
 * hosted PDF URL that can be opened from the web or mobile.
 *
 * Auth: a Base44 user token (web) OR an X-Employee-ID header (mobile).
 *
 * Payload: { report_id: string, for_client_fill?: boolean, task_id?: string }
 * Returns: { url, file_name }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Accept either web (user token) or mobile (X-Employee-ID) auth
    let webUser = null;
    try { webUser = await base44.auth.me(); } catch { webUser = null; }
    const employeeId = req.headers.get("X-Employee-ID");
    if (!webUser && !employeeId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload = {};
    try { payload = await req.json(); } catch { /* empty body */ }
    const reportId = payload.report_id;
    const forClientFill = !!payload.for_client_fill;
    const taskIdOverride = payload.task_id || null;
    if (!reportId) {
      return Response.json({ error: "report_id is required" }, { status: 400 });
    }

    // ── Load the WorkingReport ──────────────────────────────────────────────
    const reportRows = await base44.asServiceRole.entities.WorkingReport.filter({ id: reportId });
    const report = reportRows[0];
    if (!report) return Response.json({ error: "Working report not found" }, { status: 404 });

    // ── Default Working Report template ──────────────────────────────────────
    const templates = await base44.asServiceRole.entities.WorkingReportTemplate.list("name", 50);
    const template = (templates || []).find((t) => t.is_default) || (templates || [])[0] || null;

    // ── Task + subtasks ──────────────────────────────────────────────────────
    const resolvedTaskId = taskIdOverride || report.task_id || null;
    let task = null;
    if (resolvedTaskId) {
      const taskRows = await base44.asServiceRole.entities.Task.filter({ id: resolvedTaskId });
      task = taskRows[0] || null;
    }
    let subtasks = [];
    if (resolvedTaskId) {
      try {
        subtasks = await base44.asServiceRole.entities.TaskSubtask.filter(
          { task_id: resolvedTaskId }, "sort_order", 200,
        );
      } catch { subtasks = []; }
    }
    const taskForPdf = { ...(task || {}), subtasks };

    // ── Asset ────────────────────────────────────────────────────────────────
    let asset = null;
    const assetId = task?.asset_id || report.asset_id;
    if (assetId) {
      try {
        const a = await base44.asServiceRole.entities.Asset.filter({ id: assetId });
        asset = a[0] || null;
      } catch { asset = null; }
    }

    // ── Work order contact persons ───────────────────────────────────────────
    let woContactLabel = "";
    const woId = report.work_order_id || task?.work_order_id;
    if (woId) {
      try {
        const cps = await base44.asServiceRole.entities.ContactPerson.filter(
          { work_order_id: woId }, "full_name", 50,
        );
        woContactLabel = (cps || [])
          .map((cp) => (cp.phone ? `${cp.full_name} (${cp.phone})` : cp.full_name))
          .filter(Boolean)
          .join(" · ");
      } catch { woContactLabel = ""; }
    }

    // ── Workers participation: all time entries for this task on the report day ──
    let participants = [];
    if (report.task_id) {
      try {
        const reportDay = dayKey(report.clock_in_time);
        const taskEntries = await base44.asServiceRole.entities.TimeEntry.filter(
          { task_id: report.task_id }, "clock_in_time", 200,
        );
        participants = (taskEntries || [])
          .filter((te) => !reportDay || dayKey(te.clock_in_time) === reportDay)
          .map((te) => ({
            employee_id: te.employee_id,
            employee_name: te.employee_name,
            clock_in_time: te.clock_in_time,
            clock_out_time: te.clock_out_time,
          }));
      } catch { participants = []; }
    }

    const entryForPdf = {
      ...report,
      participants,
      report_reference: report.report_reference || report.reference,
      report_client_comments: forClientFill ? "" : (report.report_client_comments || ""),
      report_client_signature: forClientFill ? null : (report.report_client_signature || null),
    };

    // ── Render PDF (shared renderer = identical to mobile) ───────────────────
    const assetFields = await loadActiveAssetFields(base44);
    const pdf = await buildWorkingReportPdf({
      template,
      entry: entryForPdf,
      task: taskForPdf,
      asset,
      woContactLabel,
      assetFields,
    });

    // ── Filename ─────────────────────────────────────────────────────────────
    const dateStr = (entryForPdf.clock_in_time
      ? fmtDate(entryForPdf.clock_in_time)
      : fmtDate(taskForPdf.planning_date)).replace(/\//g, "-");
    const parts = [
      "Report",
      dateStr,
      entryForPdf.task_title || taskForPdf.title,
      entryForPdf.project_name || taskForPdf.project_name,
      entryForPdf.contact_name || taskForPdf.contact_name,
    ].filter(Boolean).map((p) => String(p).replace(/\s+/g, "-"));
    const fileName = `${parts.join("_")}.pdf`;

    // ── Upload and return a hosted URL ────────────────────────────────────────
    const pdfBytes = pdf.output("arraybuffer");
    const file = new File([pdfBytes], fileName, { type: "application/pdf" });
    const up = webUser
      ? await base44.integrations.Core.UploadFile({ file })
      : await base44.asServiceRole.integrations.Core.UploadFile({ file });
    const url = up?.file_url || up?.url;

    return Response.json({ url, file_name: fileName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});