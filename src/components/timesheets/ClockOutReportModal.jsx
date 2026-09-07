import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Printer, Loader2, ClipboardCheck, Plus, Trash2, PenLine, RotateCcw, CheckCircle2, Circle, CheckCheck, Clock, ListChecks, ShieldCheck, UserCog, ShieldAlert, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { printWorkingReport, generateReportBlob } from "./WorkingReportPrint";
import ClockOutTimeReview from "./ClockOutTimeReview";
import TimesheetPhotoCapture from "./TimesheetPhotoCapture";
import WorkingReportLogicInfo from "./WorkingReportLogicInfo";
import { logTaskHistory } from "@/components/tasks/TaskHistoryPanel.jsx";

// navigator.share crashes inside the Base44 native iOS app (WKWebView) with a zero
// sharePositionOrigin ("PlatformException ... {{0,0},{0,0}} must be non-zero").
// iOS in-app webviews have no "Safari" token in the user agent — detect that and
// fall back to a plain download so the share sheet is never invoked there.
function canUseWebShare() {
  if (!navigator.share || !navigator.canShare) return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIOS && !isSafari) return false;
  return true;
}

function SignaturePad({ onSignatureChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e, canvasRef.current);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e1e1e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
    onSignatureChange(canvas.toDataURL());
  };

  const stopDraw = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <PenLine className="w-3 h-3" /> Client Signature
        </Label>
        <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
          <RotateCcw className="w-3 h-3" /> Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full border border-border rounded-lg bg-white cursor-crosshair touch-none"
        style={{ height: 120 }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <p className="text-xs text-muted-foreground text-center">Sign above</p>
    </div>
  );
}

export default function ClockOutReportModal({ open, onClose, entry }) {
  const [step, setStep] = useState("review"); // "review" | "report"
  const [confirmedEntry, setConfirmedEntry] = useState(null);
  const [siteItems, setSiteItems] = useState([{ description: "", done: false }]);
  const [workDescription, setWorkDescription] = useState("");
  const [balanceWork, setBalanceWork] = useState("");
  const [clientComments, setClientComments] = useState("");
  const [clientSignature, setClientSignature] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [taskStatus, setTaskStatus] = useState("Not Completed");
  const [originalTaskStatus, setOriginalTaskStatus] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [reportsCount, setReportsCount] = useState(0);
  const [maxReports, setMaxReports] = useState(99);
  const [template, setTemplate] = useState(null);
  const [clockOutPhotoUrl, setClockOutPhotoUrl] = useState(null);
  const [requireClockOutPhoto, setRequireClockOutPhoto] = useState(false);
  const [leaderStatus, setLeaderStatus] = useState(null); // { isLeader, isActing, canMakeReport, leaderName }
  const [taskData, setTaskData] = useState(null);

  // Determine leader status: only team leaders (or auto-designated acting leaders) can create reports
  useEffect(() => {
    if (!open || !entry?.task_id || !entry?.employee_id) return;
    (async () => {
      try {
        const [taskRes, teams] = await batchedAll([
          () => withRetry(() => base44.entities.Task.filter({ id: entry.task_id })).catch(() => []),
          () => withRetry(() => base44.entities.Team.list("name", 200)).catch(() => []),
        ], 2);
        const task = taskRes[0];
        if (!task) { setLeaderStatus({ isLeader: false, isActing: true, canMakeReport: true }); return; }
        setTaskData(task);

        const assignedEmpIds = task.assigned_employees || [];
        const assignedTeamIds = task.assigned_team_ids || [];

        // Find teams assigned to this task
        const taskTeams = teams.filter(t => assignedTeamIds.includes(t.id));

        // Also find teams where any assigned employee is a member (via employee_ids)
        const employeeTeams = teams.filter(t =>
          (t.employee_ids || []).some(id => assignedEmpIds.includes(id))
        );

        // Combine: all relevant teams (assigned to task OR containing assigned employees)
        const allRelevantTeamIds = new Set([
          ...taskTeams.map(t => t.id),
          ...employeeTeams.map(t => t.id)
        ]);
        const allRelevantTeams = teams.filter(t => allRelevantTeamIds.has(t.id));

        // Collect leader IDs from all relevant teams
        const leaderIds = new Set(allRelevantTeams.map(t => t.leader_id).filter(Boolean));

        // Is the current employee a team leader of any relevant team?
        const currentIsLeader = leaderIds.has(entry.employee_id);

        // Is any OTHER assigned employee a team leader?
        const otherLeaderOnTask = assignedEmpIds.some(id => leaderIds.has(id) && id !== entry.employee_id);

        // Only 1 person (or fewer) assigned to this task?
        const isOnlyPerson = assignedEmpIds.length <= 1;

        // Check if a report already exists for this task TODAY (acting leader = 1 report per task per day)
        const existingReports = await withRetry(() => base44.entities.WorkingReport.filter({ task_id: entry.task_id })).catch(() => []);
        const reportAlreadyExists = (existingReports || []).some(r => r.time_entry_id === entry.id);

        if (currentIsLeader) {
          setLeaderStatus({ isLeader: true, isActing: false, canMakeReport: true, leaderName: entry.employee_name });
        } else if (isOnlyPerson || !otherLeaderOnTask) {
          // Auto-designate as acting leader — but only if no report exists yet
          setLeaderStatus({
            isLeader: false,
            isActing: true,
            canMakeReport: !reportAlreadyExists,
            leaderName: entry.employee_name,
            reportAlreadyExists,
          });
        } else {
          // Another leader is on the task — they should make the report
          const otherLeaderId = [...leaderIds].find(id => assignedEmpIds.includes(id));
          const leaderTeam = allRelevantTeams.find(t => t.leader_id === otherLeaderId);
          setLeaderStatus({ isLeader: false, isActing: false, canMakeReport: false, leaderName: leaderTeam?.leader_name || "the team leader" });
        }
      } catch {
        // On error, allow report creation (fail open)
        setLeaderStatus({ isLeader: false, isActing: true, canMakeReport: true, leaderName: entry.employee_name });
      }
    })();
  }, [open, entry?.task_id, entry?.employee_id]);

  // Preserve the task's current status (workers may have already set Completed/Not Completed)
  useEffect(() => {
    if (taskData?.status) {
      setTaskStatus(taskData.status);
      setOriginalTaskStatus(taskData.status);
    }
  }, [taskData?.id]);

  // Reset state and load subtasks when a new entry opens
  useEffect(() => {
    if (open) {
      setStep("review");
      setConfirmedEntry(null);
      setSiteItems([{ description: "", done: false }]);
      setWorkDescription("");
      setBalanceWork("");
      setClientComments("");
      setClientSignature(null);
      setTaskStatus("Not Completed");
      setOriginalTaskStatus(null);
      setLeaderStatus(null);
      setTaskData(null);

      if (entry?.task_id) {
        batchedAll([
          () => withRetry(() => base44.entities.TaskSubtask.filter({ task_id: entry.task_id }, "sort_order")).catch(() => []),
          () => withRetry(() => base44.entities.WorkingReport.filter({ task_id: entry.task_id })).catch(() => []),
          () => withRetry(() => base44.entities.WorkingReportTemplate.list("name", 50)).catch(() => []),
          () => withRetry(() => base44.entities.OperationsSettings.list("-created_date", 10)).catch(() => []),
        ], 2).then(([subs, reports, templates, ops]) => {
          setSubtasks((subs || []).map(s => ({ ...s })));
          setReportsCount((reports || []).length);
          const tmpl = (templates || []).find(t => t.is_default) || templates?.[0] || null;
          setTemplate(tmpl);
          setMaxReports(tmpl?.max_reports_per_task ?? 99);
          setRequireClockOutPhoto(ops?.[0]?.require_photo_clock_out || false);
        });
      } else {
        setSubtasks([]);
        setReportsCount(0);
        base44.entities.OperationsSettings.list("-created_date", 10).catch(() => []).then(ops => {
          setRequireClockOutPhoto(ops[0]?.require_photo_clock_out || false);
        });
      }
    }
  }, [open, entry?.id]);

  const addRow = () => setSiteItems(prev => [...prev, { description: "", done: false }]);
  const removeRow = (i) => setSiteItems(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i, field, value) =>
    setSiteItems(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  const toggleDone = (i) =>
    setSiteItems(prev => prev.map((r, idx) => idx === i ? { ...r, done: !r.done } : r));

  const toggleSubtask = (id) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s));
  };

  const handleTimeReviewConfirm = (amendedClockIn, amendedClockOut) => {
    // Save clock-out photo to the TimeEntry
    if (clockOutPhotoUrl && entry?.id) {
      base44.entities.TimeEntry.update(entry.id, { clock_out_photo_url: clockOutPhotoUrl }).catch(() => {});
    }
    // Use the (possibly amended) times for the report entry display
    setConfirmedEntry({ ...entry, clock_in_time: amendedClockIn, clock_out_time: amendedClockOut, clock_out_photo_url: clockOutPhotoUrl });
    setStep("report");
  };

  const reportsDisabled = maxReports === 0;
  const reportLimitReached = maxReports > 0 && reportsCount >= maxReports;
  const activeEntry = confirmedEntry || entry;

  const handleSaveAndClose = async (mode = "close") => {
    setPrinting(true);

    // Save subtask statuses — bulk update to avoid many parallel calls
    const changedSubs = subtasks.filter(s => s.id);
    if (changedSubs.length > 0) {
      await base44.entities.TaskSubtask.bulkUpdate(
        changedSubs.map(s => ({ id: s.id, done: s.done }))
      ).catch(() => {});
    }

    // Update task status only if the user actually changed it (preserve worker-set value)
    if (activeEntry?.task_id && originalTaskStatus !== null && taskStatus !== originalTaskStatus) {
      await base44.entities.Task.update(activeEntry.task_id, { status: taskStatus }).catch(() => {});
      // Record who changed the status during clock-out so it shows in History & Notes
      await logTaskHistory({
        taskId: activeEntry.task_id,
        taskReference: taskData?.reference || activeEntry?.task_reference || "",
        action: "Status Changed",
        detail: `Status changed from ${originalTaskStatus || "Queued"} to ${taskStatus} (clock-out)`,
        userName: activeEntry?.employee_name || "Unknown",
      }).catch(() => {});
    }

    // Save WorkingReport record (only if leader/acting-leader, reports enabled, and limit not reached)
    // Acting leaders get blocked if a report was already created for this task TODAY (race-condition guard)
    let canCreateReport = leaderStatus?.canMakeReport !== false;
    if (canCreateReport && leaderStatus?.isActing && activeEntry?.id) {
      const freshReports = await withRetry(() => base44.entities.WorkingReport.filter({ time_entry_id: activeEntry.id })).catch(() => []);
      if ((freshReports || []).length > 0) canCreateReport = false;
    }
    let reportReference = "";
    let savedReport = null;
    if (activeEntry?.task_id && !reportsDisabled && !reportLimitReached && canCreateReport) {
      const taskObj = taskData || null;

      // Build the report payload. The reference is assigned SERVER-SIDE to
      // guarantee uniqueness — task-based numbering when the task has a
      // reference, and a sequential fallback derived from existing reports so
      // concurrent clock-outs no longer share the same number.
      const reportPayload = {
        task_id: activeEntry.task_id,
        task_reference: taskObj?.reference || activeEntry?.task_reference || "",
        task_title: taskObj?.title || activeEntry.task_title || "",
        time_entry_id: activeEntry.id,
        employee_id: activeEntry.employee_id,
        employee_name: activeEntry.employee_name,
        contact_id: activeEntry.contact_id,
        contact_name: activeEntry.contact_name,
        work_order_id: activeEntry.work_order_id,
        work_order_name: activeEntry.work_order_name,
        project_id: activeEntry.project_id,
        project_name: activeEntry.project_name,
        clock_in_time: activeEntry.clock_in_time,
        clock_out_time: activeEntry.clock_out_time,
        duration_minutes: activeEntry.duration_minutes,
        on_site: activeEntry.on_site,
        clock_in_address: activeEntry.clock_in_address,
        clock_out_address: activeEntry.clock_out_address,
        report_site_items: siteItems.filter(r => r.description.trim()),
        report_work_description: workDescription,
        report_balance_work: balanceWork,
        report_client_comments: clientComments,
        report_client_signature: clientSignature,
        is_acting_leader: leaderStatus?.isActing || false,
        report_leader_name: leaderStatus?.leaderName || activeEntry.employee_name,
      };

      const res = await withRetry(() =>
        base44.functions.invoke("apiTimesheet", {
          action: "create_working_report",
          employee_id: activeEntry.employee_id,
          template_id: template?.id,
          skip_leader_check: true, // web already enforced leader status above
          report: reportPayload,
        })
      ).catch((err) => { console.error("create_working_report failed", err); return null; });

      savedReport = res?.report || null;
      reportReference = savedReport?.reference || "";
    }

    const enrichedEntry = {
      ...activeEntry,
      report_reference: reportReference,
      report_site_items: siteItems.filter(r => r.description.trim()),
      report_work_description: workDescription,
      report_balance_work: balanceWork,
      report_client_comments: clientComments,
      report_client_signature: clientSignature,
      report_leader_name: leaderStatus?.leaderName || activeEntry.employee_name,
      is_acting_leader: leaderStatus?.isActing || false,
    };

    if (mode === "print" && !reportsDisabled && canCreateReport) {
      await printWorkingReport({ template, entry: enrichedEntry, task: { ...(taskData || {}), subtasks } });
    } else if (mode === "whatsapp" && !reportsDisabled && canCreateReport) {
      // Generate PDF with blank signature/comments so the client can fill them in
      const blob = await generateReportBlob({
        template,
        entry: enrichedEntry,
        task: { ...(taskData || {}), subtasks },
        forClientFill: true,
      });
      const fileName = `Report_${reportReference || "working"}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (canUseWebShare() && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Working Report — ${activeEntry?.task_title || ""}`,
            text: `Please review, sign and return this working report for ${activeEntry?.task_title || "the task"}.`,
          });
        } catch { /* user cancelled share */ }
      } else {
        // Fallback: download the PDF for manual sharing
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    }

    setPrinting(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <ClipboardCheck className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle>
              {step === "review" ? `Clock Out — ${entry?.employee_name}` : `Working Report — ${entry?.employee_name}`}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-1">

          {/* Step 1: Time Review */}
          {step === "review" && (
            <div className="space-y-5">
              <ClockOutTimeReview
                entry={entry}
                onConfirm={handleTimeReviewConfirm}
                clockOutPhotoUrl={clockOutPhotoUrl}
                requireClockOutPhoto={requireClockOutPhoto}
              />
              {/* Clock-out photo capture (shown inline before confirm) */}
              <TimesheetPhotoCapture
                label="Clock-Out Photo"
                required={requireClockOutPhoto}
                onPhoto={setClockOutPhotoUrl}
              />
            </div>
          )}

          {/* Step 2: Working Report */}
          {step === "report" && <>
          <p className="text-sm text-muted-foreground">
            Fill in the site report for <strong>{activeEntry?.task_title}</strong> before generating the PDF.
          </p>

          {/* Leader status badge */}
          {leaderStatus && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${
              leaderStatus.isLeader
                ? "bg-primary/10 border-primary/30 text-primary"
                : leaderStatus.isActing
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-red-50 border-red-200 text-red-700"
            }`}>
              {leaderStatus.isLeader && <ShieldCheck className="w-4 h-4 shrink-0" />}
              {leaderStatus.isActing && <UserCog className="w-4 h-4 shrink-0" />}
              {!leaderStatus.isLeader && !leaderStatus.isActing && <ShieldAlert className="w-4 h-4 shrink-0" />}
              {leaderStatus.isLeader && <span><strong>Team Leader</strong> — You are the designated team leader for this task.</span>}
              {leaderStatus.isActing && leaderStatus.canMakeReport && <span><strong>Acting Leader (auto)</strong> — No team leader is assigned to this task. You have been auto-designated as acting leader to create this report.</span>}
              {leaderStatus.isActing && !leaderStatus.canMakeReport && <span><strong>Report already exists</strong> — A working report has already been created for this session.</span>}
              {!leaderStatus.isLeader && !leaderStatus.isActing && <span><strong>Leader required</strong> — {leaderStatus.leaderName} is the team leader on this task. Only leaders can create the PDF report. Please ask them to clock out and generate it.</span>}
            </div>
          )}

          {/* Report logic explanation (collapsible) */}
          <WorkingReportLogicInfo compact />

          {/* Report limit warning */}
          {reportsDisabled && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2.5">
              Reports are disabled for this task (max 0 configured in settings).
            </div>
          )}
          {!reportsDisabled && reportLimitReached && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2.5">
              This task already has {reportsCount} report{reportsCount !== 1 ? "s" : ""} (max {maxReports}). No new report will be saved.
            </div>
          )}

          {/* Task Status */}
          {entry?.task_id && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Task Status after this session</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTaskStatus("Not Completed")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    taskStatus === "Not Completed"
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-border text-muted-foreground hover:border-amber-300"
                  }`}
                >
                  <Clock className="w-4 h-4" /> Not Completed
                </button>
                <button
                  onClick={() => setTaskStatus("Completed")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    taskStatus === "Completed"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-border text-muted-foreground hover:border-emerald-300"
                  }`}
                >
                  <CheckCheck className="w-4 h-4" /> Completed
                </button>
              </div>
            </div>
          )}

          {/* Subtasks checklist */}
          {subtasks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-primary" /> Subtasks / Instructions
              </Label>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                {subtasks.map((sub) => (
                  <button
                    type="button"
                    key={sub.id}
                    onClick={() => toggleSubtask(sub.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 border-b border-border last:border-0 hover:bg-muted/20 active:bg-muted/40 transition-colors text-left cursor-pointer"
                  >
                    <span className={`shrink-0 transition-colors ${sub.done ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {sub.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </span>
                    <span className={`text-sm flex-1 ${sub.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {sub.title}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{subtasks.filter(s => s.done).length}/{subtasks.length} completed</p>
            </div>
          )}

          {/* Work Description (employee) */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Describe Your Work</Label>
            <Textarea
              value={workDescription}
              onChange={e => setWorkDescription(e.target.value)}
              placeholder="Describe the work performed by the team..."
              rows={3}
            />
          </div>

          {/* Balance Work */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Balance Work</Label>
            <Textarea
              value={balanceWork}
              onChange={e => setBalanceWork(e.target.value)}
              placeholder="Describe remaining work or pending items..."
              rows={3}
            />
          </div>

          {/* Client Comments */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Client Comments</Label>
            <Textarea
              value={clientComments}
              onChange={e => setClientComments(e.target.value)}
              placeholder="Any comments or feedback from the client..."
              rows={2}
            />
          </div>

          {/* Client Signature */}
          <SignaturePad onSignatureChange={setClientSignature} />

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => handleSaveAndClose("close")} disabled={printing} className="text-muted-foreground gap-2">
              {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save & Close
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleSaveAndClose("whatsapp")}
                disabled={printing || reportsDisabled || (leaderStatus && !leaderStatus.canMakeReport)}
                className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Send via WhatsApp
              </Button>
              <Button
                onClick={() => handleSaveAndClose("print")}
                disabled={printing || reportsDisabled || (leaderStatus && !leaderStatus.canMakeReport)}
                className="gap-2"
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Save & Print
              </Button>
            </div>
          </div>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}