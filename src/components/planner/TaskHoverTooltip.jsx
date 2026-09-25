import React from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, RefreshCw, CheckCircle2, Check, Clock } from "lucide-react";

/**
 * Shared hover tooltip for planner task cards/blocks.
 * Renders via portal with fixed positioning so it escapes overflow-hidden containers.
 */
export default function TaskHoverTooltip({
  task,
  displayEmps = [],
  subtasks = [],
  dur,
  position,
  onClick,
  onUpdateWorkers,
  onComplete,
  onDelete,
  onClose,
  cancelClose,
}) {
  if (!position) return null;

  // Edge-aware positioning
  const TOOLTIP_W = 288; // w-72
  const TOOLTIP_H_EST = 320;
  let { top, left } = position;
  if (left + TOOLTIP_W > window.innerWidth - 8) {
    left = window.innerWidth - TOOLTIP_W - 8;
  }
  if (top + TOOLTIP_H_EST > window.innerHeight - 8) {
    top = Math.max(8, position.top - TOOLTIP_H_EST - 8);
  }

  const content = (
    <div
      className="fixed z-[100] w-72 p-3 rounded-lg bg-popover border border-border shadow-xl text-xs text-popover-foreground"
      style={{ top, left }}
      onMouseEnter={(e) => { e.stopPropagation(); cancelClose && cancelClose(); }}
      onMouseLeave={onClose}
    >
      {task.reference && (
        <p className="font-mono text-[10px] text-muted-foreground mb-1">{task.reference}</p>
      )}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusBadgeClass(task.status)}`}>
          {task.status || "Queued"}
        </span>
      </div>
      <p className="font-bold text-sm mb-1.5 leading-snug">{task.title}</p>

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
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className="font-semibold">Assigned:</span>
          <div className="flex -space-x-1">
            {displayEmps.slice(0, 6).map(emp =>
              emp.avatar_url
                ? <img key={emp.id} src={emp.avatar_url} title={emp.full_name} className="w-5 h-5 rounded-full object-cover border border-white shadow-sm" alt={emp.full_name} />
                : <div key={emp.id} title={emp.full_name} className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary border border-white shadow-sm">{emp.full_name?.[0] || "?"}</div>
            )}
          </div>
          <span className="text-muted-foreground">{displayEmps.map(e => e.full_name).join(", ")}</span>
        </div>
      )}

      {(task.planning_time_in || task.planning_time_out) && (
        <p className="flex items-center gap-1 mb-1">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="font-semibold">{task.planning_time_in || "—"} → {task.planning_time_out || "—"}</span>
          {dur && <span className="ml-1 font-semibold text-primary">({dur})</span>}
        </p>
      )}

      {task.notes && (
        <p className="mt-2 pt-2 border-t border-border text-muted-foreground whitespace-pre-wrap">{task.notes}</p>
      )}

      {(onClick || onUpdateWorkers || onComplete || onDelete) && (
        <div className="flex items-stretch gap-1.5 mt-2 pt-2 border-t border-border">
          {onClick && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onClose && onClose(); onClick(task); }}
              className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Pencil className="w-3 h-3 shrink-0" /> Edit
            </button>
          )}
          {onUpdateWorkers && (
            <button type="button" title="Refresh assigned workers" onClick={(e) => { e.stopPropagation(); onClose && onClose(); onUpdateWorkers(task); }}
              className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <RefreshCw className="w-3 h-3 shrink-0" /> Workers
            </button>
          )}
          {onComplete && task.status !== "Completed" && (
            <button type="button" title="Mark completed" onClick={(e) => { e.stopPropagation(); onClose && onClose(); onComplete(task); }}
              className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[11px] font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> Done
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onClose && onClose(); onDelete(task); }}
              className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[11px] font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
              <Trash2 className="w-3 h-3 shrink-0" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

function statusBadgeClass(status) {
  const map = {
    "Queued":        "bg-amber-100 text-amber-600",
    "Scheduled":     "bg-violet-100 text-violet-600",
    "Active":        "bg-orange-100 text-orange-700",
    "Not Completed": "bg-orange-100 text-orange-700",
    "Completed":     "bg-emerald-100 text-emerald-600",
  };
  return map[status] || map["Queued"];
}