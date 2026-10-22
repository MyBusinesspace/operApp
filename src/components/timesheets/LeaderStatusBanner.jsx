import React from "react";
import { ShieldCheck, ShieldAlert, UserCog, Clock, FileText } from "lucide-react";

/**
 * Shows who signs the Working Report for the current clock-out session.
 * The status is resolved server-side by apiTimesheet.resolveLeaderStatus:
 *   - task_leader: the team leader always signs.
 *   - waiting_for_task_leader: a leader session overlaps this one → only the leader signs.
 *   - waiting_for_others_to_clock_out: someone in the overlap group is still clocked in.
 *   - not_last_out: someone else clocked out later → they sign.
 *   - report_already_exists: this overlap group already has a signed report.
 *   - leader_absent_last_out / last_out: no leader in the group → last out signs.
 *   - entries_unavailable: couldn't verify — fail closed.
 */
export default function LeaderStatusBanner({ leaderStatus, entry }) {
  if (!leaderStatus) return null;
  const reason = leaderStatus.reason;
  const name = leaderStatus.leaderName || entry?.employee_name || "the team leader";

  let icon, classes, text;
  if (reason === "task_leader") {
    icon = <ShieldCheck className="w-4 h-4 shrink-0" />;
    classes = "bg-primary/10 border-primary/30 text-primary";
    text = <span><strong>Team Leader</strong> — You sign this report.</span>;
  } else if (reason === "waiting_for_task_leader") {
    icon = <ShieldAlert className="w-4 h-4 shrink-0" />;
    classes = "bg-red-50 border-red-200 text-red-700";
    text = <span><strong>Waiting for {name}</strong> — only the team leader can sign this report.</span>;
  } else if (reason === "waiting_for_others_to_clock_out") {
    const n = leaderStatus.waitingEmployeeIds?.length || 1;
    icon = <Clock className="w-4 h-4 shrink-0" />;
    classes = "bg-amber-50 border-amber-200 text-amber-800";
    text = <span><strong>Waiting for {n} other worker{n !== 1 ? "s" : ""} to clock out</strong> — the last one out signs.</span>;
  } else if (reason === "not_last_out") {
    icon = <Clock className="w-4 h-4 shrink-0" />;
    classes = "bg-amber-50 border-amber-200 text-amber-800";
    text = <span><strong>{name} clocked out after you</strong> — they will sign the report.</span>;
  } else if (reason === "report_already_exists" || leaderStatus.reportAlreadyExists) {
    icon = <FileText className="w-4 h-4 shrink-0" />;
    classes = "bg-red-50 border-red-200 text-red-700";
    text = <span><strong>Report already exists</strong> — a report has already been signed for this shift.</span>;
  } else if (reason === "leader_absent_last_out") {
    icon = <UserCog className="w-4 h-4 shrink-0" />;
    classes = "bg-amber-50 border-amber-200 text-amber-800";
    text = <span><strong>Acting Leader</strong> — no team leader worked this shift, and you're the last to clock out, so you sign.</span>;
  } else if (reason === "last_out") {
    icon = <UserCog className="w-4 h-4 shrink-0" />;
    classes = "bg-amber-50 border-amber-200 text-amber-800";
    text = <span><strong>Acting Leader</strong> — you're the last to clock out of this shift, so you sign.</span>;
  } else if (reason === "entries_unavailable") {
    icon = <ShieldAlert className="w-4 h-4 shrink-0" />;
    classes = "bg-red-50 border-red-200 text-red-700";
    text = <span><strong>Couldn't verify who signs</strong> — try again in a moment.</span>;
  } else if (leaderStatus.isLeader) {
    icon = <ShieldCheck className="w-4 h-4 shrink-0" />;
    classes = "bg-primary/10 border-primary/30 text-primary";
    text = <span><strong>Team Leader</strong> — You sign this report.</span>;
  } else if (leaderStatus.isActing) {
    icon = <UserCog className="w-4 h-4 shrink-0" />;
    classes = "bg-amber-50 border-amber-200 text-amber-800";
    text = <span><strong>Acting Leader</strong> — you sign this report.</span>;
  } else {
    icon = <ShieldAlert className="w-4 h-4 shrink-0" />;
    classes = "bg-red-50 border-red-200 text-red-700";
    text = <span><strong>Leader required</strong> — only {name} can sign this report.</span>;
  }

  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${classes}`}>
      {icon}
      <span>{text}</span>
    </div>
  );
}