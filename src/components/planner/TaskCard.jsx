import React, { useState } from "react";
import { Timer, Pencil, Trash2, RefreshCw, Check } from "lucide-react";

const CARD_BG = {
  "Queued":        "bg-amber-50 border-amber-200",
  "Scheduled":     "bg-violet-50 border-violet-200",
  "Active":        "bg-orange-50 border-orange-300",
  "Not Completed": "bg-orange-50 border-orange-300",
  "Completed":     "bg-emerald-50 border-emerald-200"
};

const STATUS_BADGE = {
  "Queued":        "bg-amber-100 text-amber-600",
  "Scheduled":     "bg-violet-100 text-violet-600",
  "Active":        "bg-orange-100 text-orange-700",
  "Not Completed": "bg-orange-100 text-orange-700",
  "Completed":     "bg-emerald-100 text-emerald-600"
};

function planDuration(timeIn, timeOut) {
  if (!timeIn || !timeOut) return null;
  try {
    const [ih, im] = timeIn.split(":").map(Number);
    const [oh, om] = timeOut.split(":").map(Number);
    const mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? m + "m" : ""}` : `${m}m`;
  } catch { return null; }
}

export default function TaskCard({ task, employees = [], timeEntries = [], subtasks = [], onClick, onDragStart, onDelete, onUpdateWorkers, taskIndex, taskTotal }) {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const cardBg = CARD_BG[task.status] || CARD_BG["Queued"];
  const isDraggable = task.status === "Queued" || task.status === "Scheduled" || task.status === "Not Completed" || task.status === "Active";
  const dur = planDuration(task.planning_time_in, task.planning_time_out);

  // Check if any employee is actively clocked in on this task
  const activeEntries = timeEntries.filter(te => te.task_id === task.id && te.status === "Active");
  const isClockedIn = activeEntries.length > 0;

  // Resolve avatars
  let assignedEmps = (task.assigned_employees || []).map(id => employees.find(e => e.id === id)).filter(Boolean);
  if (assignedEmps.length === 0 && (task.assigned_employee_names || []).length > 0) {
    assignedEmps = (task.assigned_employee_names || []).map(name => employees.find(e => e.full_name === name)).filter(Boolean);
  }
  const namesFallback = task.assigned_employee_names || [];
  const displayEmps = assignedEmps.length > 0 ? assignedEmps : namesFallback.slice(0, 5).map((n, i) => ({ _fb: true, id: `fb${i}`, full_name: n }));

  return (
    <div
      onClick={onClick}
      draggable={isDraggable}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onDragStart={isDraggable ? (e) => { setShowTooltip(false); e.stopPropagation(); onDragStart && onDragStart(task, e); } : undefined}
      className={`group relative rounded-md border px-1 py-0.5 hover:shadow-md transition-shadow text-[8.5px] leading-[1.1] font-light ${cardBg} ${isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      {/* Row 1: index + avatars + status badge */}
      <div className="flex items-center gap-1 mb-0">
        {taskTotal > 0 && (
          <span className="text-[9px] font-bold text-muted-foreground shrink-0">{taskIndex}/{taskTotal}</span>
        )}
        <div className="flex -space-x-1 min-w-0">
          {displayEmps.slice(0, 3).map(emp =>
            emp.avatar_url
              ? <img key={emp.id} src={emp.avatar_url} title={emp.full_name} className="w-3 h-3 rounded-full object-cover border border-white shadow-sm shrink-0" alt={emp.full_name} />
              : <div key={emp.id} title={emp.full_name} className="w-3 h-3 rounded-full bg-primary/20 flex items-center justify-center text-[5px] font-bold text-primary border border-white shadow-sm shrink-0">{(emp.full_name || "?")[0]}</div>
          )}
        </div>
        {isClockedIn && (
          <span title={`${activeEntries.length} employee${activeEntries.length > 1 ? "s" : ""} clocked in`}
            className="shrink-0 flex items-center gap-0.5 bg-green-100 text-green-600 px-1 py-0.5 rounded-full animate-pulse">
            <Timer className="w-2.5 h-2.5" />
            {activeEntries.length > 1 && <span className="text-[7px] font-bold">{activeEntries.length}</span>}
          </span>
        )}
        <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ml-auto ${STATUS_BADGE[task.status] || STATUS_BADGE["Queued"]}`}>
          {task.status || "Queued"}
        </span>
      </div>

      {/* Row 2: Task title (main info, truncated) */}
      <p className="font-semibold text-foreground truncate" title={task.title}>{task.title}</p>

      {/* Row 3: Client → Project (truncated, single line) */}
      {(task.contact_name || task.project_name) && (
        <p className="text-muted-foreground truncate" title={[task.contact_name, task.project_name].filter(Boolean).join(" → ")}>
          {[task.contact_name, task.project_name].filter(Boolean).join(" → ")}
        </p>
      )}

      {/* Row 4: Planned time */}
      {(task.planning_time_in || task.planning_time_out) && (
        <p className="mt-0">
          <span className="font-medium">⏱</span> {task.planning_time_in || "—"} → {task.planning_time_out || "—"}
          {dur && <span className="ml-1 font-semibold text-primary">({dur})</span>}
        </p>
      )}

      {/* Hover tooltip — expanded task details */}
      {showTooltip && (
      <div className="absolute z-50 left-0 top-full mt-1 w-72 p-3 rounded-lg bg-popover border border-border shadow-xl text-xs text-popover-foreground">
        {task.reference && (
          <p className="font-mono text-[10px] text-muted-foreground mb-1">{task.reference}</p>
        )}
        <p className="font-bold text-sm mb-1">{task.title}</p>
        {subtasks.length > 0 ? (
          <div className="mb-2 pt-2 border-t border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Subtasks</p>
            <ul className="space-y-0.5">
              {subtasks.map(s => (
                <li key={s.id} className="flex items-start gap-1.5 text-xs leading-snug">
                  <span className={`flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 ${s.done ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-500"}`}>
                    {s.done ? <Check className="w-2.5 h-2.5" /> : <span className="w-1 h-1 rounded-full bg-current" />}
                  </span>
                  <span className={`whitespace-pre-wrap ${s.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{s.title || s.name || "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : task.description ? (
          <p className="text-muted-foreground whitespace-pre-wrap mb-2 leading-relaxed">{task.description}</p>
        ) : null}
        {(task.contact_name || task.project_name || task.work_order_name || task.asset_name) && (
          <div className="flex flex-col gap-0.5 mb-2">
            {task.contact_name && <p className="text-emerald-600">🏢 {task.contact_name}</p>}
            {task.project_name && <p className="text-violet-600">📁 {task.project_name}</p>}
            {task.work_order_name && <p className="text-blue-600">📋 {task.work_order_name}</p>}
            {task.asset_name && <p className="text-amber-600">📦 {task.asset_name}</p>}
          </div>
        )}
        {displayEmps.length > 0 && (
          <p className="mb-1">
            <span className="font-semibold">Assigned:</span> {displayEmps.map(e => e.full_name).join(", ")}
          </p>
        )}
        {(task.planning_time_in || task.planning_time_out) && (
          <p>
            <span className="font-semibold">⏱</span> {task.planning_time_in || "—"} → {task.planning_time_out || "—"}
            {dur && <span className="ml-1 font-semibold text-primary">({dur})</span>}
          </p>
        )}
        {task.notes && (
          <p className="mt-2 pt-2 border-t border-border text-muted-foreground whitespace-pre-wrap">{task.notes}</p>
        )}
        {/* Action buttons */}
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowTooltip(false); onClick && onClick(task); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          {onUpdateWorkers && (
            <button
              type="button"
              title="Refresh assigned workers to match their current team/group"
              onClick={(e) => { e.stopPropagation(); setShowTooltip(false); onUpdateWorkers(task); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Update workers
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowTooltip(false); onDelete && onDelete(task); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors ml-auto"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
      )}
    </div>
  );
}