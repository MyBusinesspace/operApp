import React, { useState } from "react";
import { Info, ChevronDown, ChevronUp, ShieldCheck, UserCog, FileText, Lock, Users } from "lucide-react";

/**
 * Explains the Working Report generation logic for end-users / sales demos.
 * Renders a collapsible panel — closed by default to save space.
 */
export default function WorkingReportLogicInfo({ compact = false }) {
  const [open, setOpen] = useState(false);

  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        How does the report logic work?
      </button>
    );
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
          <Info className="w-4 h-4 shrink-0" />
          How Working Report Generation Works
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 text-sm text-blue-800 dark:text-blue-200">
          <p className="text-blue-700 dark:text-blue-300 leading-relaxed">
            Working Reports are professional PDF documents generated automatically during the clock-out process. The system intelligently determines who can create a report based on team leadership and task assignments.
          </p>

          <div className="space-y-2.5">
            <div className="flex gap-2.5">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-semibold">Team Leaders</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  If a task has an assigned team leader, only that leader can generate the Working Report. Other workers on the same task will see a notice that the leader is responsible for the report.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <UserCog className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Acting Leader (auto-assigned)</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  When no team leader worked during a shift, the <strong>last worker to clock out</strong> of that shift is the Acting Leader and signs the report. A <strong>shift</strong> is everyone whose sessions overlap in time (directly or through a chain of overlaps) on the same task and day.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <Users className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-semibold">Team Leaders — Unlimited Reports</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  Official team leaders can create <strong>unlimited reports</strong> for their tasks. If a leader clocks in and out multiple times on the same task in one day (e.g. morning and afternoon sessions), each clock-out generates its own report. There is no per-day limit for leaders.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold">Acting Leaders — One Report Per Task Per Day</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  One report is generated per <strong>shift (overlap group)</strong>. Once a report exists for that group, other workers in the same group see <strong>"Report already exists"</strong> and no duplicate is created. A separate, non-overlapping shift on the same task gets its own report.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <FileText className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-semibold">Non-Leader Workers</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  If a team leader worked <strong>during your shift</strong> (your sessions overlap), only the leader signs — you'll see a notice naming them. If the leader worked a <strong>different, non-overlapping shift</strong>, they sign their own shift and you sign yours. Your time is always recorded — only the PDF is gated.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-semibold">Different Tasks = Independent Reports</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  Each task is evaluated independently. If a worker clocks out of Task A and then clocks out of Task B, each task gets its own report. The per-day limit applies <strong>per task</strong>, not per employee.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <FileText className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-semibold">Configurable Limit</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  Administrators can configure the maximum number of reports allowed per task in the Working Report Template settings (default: unlimited). Set to 0 to disable reports, or 1 for a single report per task.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-100 dark:bg-blue-900/40 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <strong>Summary:</strong> The system groups overlapping sessions on the same task into a shift. The team leader signs when they worked that shift; otherwise the last worker to clock out signs. One report per shift. Each task is independent.
          </div>
        </div>
      )}
    </div>
  );
}