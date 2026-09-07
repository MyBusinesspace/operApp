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
                  A worker is automatically designated as the <strong>Acting Leader</strong> when they are the <strong>only person who actually clocked in</strong> on that task today, or when no team leader is among those who clocked in today. This is based on <strong>real clock-in data</strong>, not just the list of assigned employees — so if a team leader was assigned but didn't show up, the worker who did clock in becomes acting leader and can create the report. See the per-day limit rule below.
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
                  When no team leader is assigned, the first worker is auto-designated as <strong>Acting Leader</strong>. Acting leaders can create <strong>one report per task per day</strong>. If a report already exists for that task today, the acting leader will see <strong>"Report already exists"</strong> and no duplicate is generated. The next day, a new report can be created again.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <FileText className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-semibold">Non-Leader Workers</p>
                <p className="text-blue-700 dark:text-blue-300 text-xs leading-relaxed">
                  A worker <strong>cannot create reports</strong> only if a team leader <strong>also clocked in today</strong> on the same task. Being assigned but absent does not block other workers — the system checks <strong>who actually clocked in</strong>, not who is on the assignment list. When blocked, the worker sees a notice naming the team leader responsible for the report. Their time is still recorded normally — only the PDF report is blocked.
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
            <strong>Summary:</strong> The system evaluates who <strong>actually clocked in today</strong> on the task — not just who is assigned. Team leaders who clocked in can create unlimited reports. If you're the only one who clocked in, or no leader clocked in, you become Acting Leader (1 report per task per day). You're only blocked if a team leader <strong>also clocked in today</strong> on the same task. Each task is independent — switching between tasks allows separate reports.
          </div>
        </div>
      )}
    </div>
  );
}