import React from "react";
import { format, addDays, isSameDay } from "date-fns";
import { GripVertical, Crown, ChevronUp, ChevronDown } from "lucide-react";
import PlannerDayColumn from "./PlannerDayColumn";

export default function PlannerRow({
  entity, tasks, weekStart, viewBy,
  employees = [], timeEntries = [],
  onTaskClick, onTaskDragStart, onTaskDrop, onAddTask, onTaskDelete, onUpdateWorkers, subtasksMap = {},
  // Row reordering
  isRowDragging, isRowDragOver, onRowDragStart, onRowDragEnd, onRowDragOver, onRowDrop,
  // Avatar drag-to-reassign
  draggingEmployeeId, onAvatarDragStart, onAvatarDropOnTeam,
  // Row reordering buttons
  canMoveUp, canMoveDown, onMoveUp, onMoveDown,
  // On-leave employees for the viewed day
  onLeaveIds,
  // Collapse completed tasks into compact bar
  collapseCompleted = false,
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getTasksForDay = (day) =>
    tasks.filter((t) => t.planning_date && isSameDay(new Date(t.planning_date), day));

  const avatarUrl = entity.avatar_url;
  const color = entity.color;

  const teamMembers = viewBy === "team"
    ? employees.filter(e => {
        const teamEmpIds = entity.employee_ids || [];
        return e.team_id === entity.id || teamEmpIds.includes(e.id);
      })
    : [];
  const isDropTarget = viewBy === "team" && draggingEmployeeId;

  return (
    <div
      className={`flex border-b border-border transition-all ${isRowDragOver ? "ring-2 ring-inset ring-primary/40 bg-primary/5" : ""} ${isRowDragging ? "opacity-40" : ""} ${isDropTarget ? "ring-2 ring-inset ring-amber-400/40" : ""}`}
      onDragOver={(e) => {
        onRowDragOver && onRowDragOver(e);
        // Allow avatar drop on team row
        if (draggingEmployeeId) e.preventDefault();
      }}
      onDrop={() => {
        if (draggingEmployeeId) {
          onAvatarDropOnTeam && onAvatarDropOnTeam();
        } else {
          onRowDrop && onRowDrop();
        }
      }}
      onDragLeave={() => {}}
    >
      {/* Left label column */}
      <div className="w-40 shrink-0 border-r border-border p-3 flex items-start gap-1.5 bg-card sticky left-0 z-10">
        {/* Row reorder controls */}
        <div className="flex flex-col items-center shrink-0 -ml-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp && onMoveUp(); }}
            disabled={!canMoveUp}
            className="p-0.5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-20 disabled:pointer-events-none"
            title="Move up"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <div
            draggable
            onDragStart={(e) => { e.stopPropagation(); onRowDragStart && onRowDragStart(); }}
            onDragEnd={onRowDragEnd}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
            title="Drag to reorder row"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown && onMoveDown(); }}
            disabled={!canMoveDown}
            className="p-0.5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-20 disabled:pointer-events-none"
            title="Move down"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Avatar */}
        {avatarUrl ? (
          <img src={avatarUrl} alt={entity.full_name || entity.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: color || "#6366f1" }}
          >
            {(entity.full_name || entity.name || "?")[0].toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground truncate">{entity.full_name || entity.name}</p>
          {entity.role && <p className="text-[10px] text-muted-foreground truncate">{entity.role}</p>}
          {entity.team_name && viewBy === "employee" && (
            <p className="text-[10px] text-muted-foreground truncate">{entity.team_name}</p>
          )}

          {/* Team view: draggable employee chips (avatar + name) */}
          {viewBy === "team" && teamMembers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {teamMembers.slice(0, 8).map(emp => {
                const isLeader = entity.leader_id === emp.id;
                const onLeave = onLeaveIds?.has(emp.id);
                const firstName = (emp.full_name || "?").split(" ")[0];
                return (
                  <div
                    key={emp.id}
                    title={emp.full_name + (isLeader ? " (Team Leader)" : "") + (onLeave ? " (On leave this day)" : "")}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); onAvatarDragStart && onAvatarDragStart(emp.id); }}
                    className={`relative flex items-center gap-1 rounded-full pl-0.5 pr-1.5 py-0.5 cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-primary/50 transition-all ${onLeave ? "bg-amber-50 ring-1 ring-amber-200 opacity-60" : "bg-muted/60"}`}
                  >
                    {isLeader && (
                      <Crown className="w-2.5 h-2.5 text-amber-400 absolute -top-1.5 left-1/2 -translate-x-1/2 drop-shadow-sm" fill="currentColor" />
                    )}
                    {emp.avatar_url ? (
                      <img src={emp.avatar_url} className="w-4 h-4 rounded-full object-cover shrink-0" alt="" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-[8px] font-bold text-primary shrink-0">
                        {firstName[0]}
                      </div>
                    )}
                    <span className={`text-[9px] font-medium truncate max-w-[60px] ${onLeave ? "text-amber-700 line-through" : "text-foreground"}`}>{firstName}</span>
                    {onLeave && <span className="text-[7px] font-semibold px-0.5 rounded bg-amber-200 text-amber-800" title="On leave this day">off</span>}
                  </div>
                );
              })}
              {teamMembers.length > 8 && <span className="text-[9px] text-muted-foreground self-center px-1">+{teamMembers.length - 8}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Day columns */}
      <div className="flex flex-1 min-w-0">
        {days.map((day) => (
          <PlannerDayColumn
            key={format(day, "yyyy-MM-dd")}
            date={day}
            tasks={getTasksForDay(day)}
            employees={employees}
            timeEntries={timeEntries}
            onTaskClick={onTaskClick}
            onTaskDelete={onTaskDelete}
            onUpdateWorkers={onUpdateWorkers}
            subtasksMap={subtasksMap}
            onTaskDragStart={onTaskDragStart}
            onTaskDrop={(newDate) => onTaskDrop && onTaskDrop(newDate, entity)}
            onAddTask={(dateStr) => onAddTask && onAddTask(entity, dateStr)}
            collapseCompleted={collapseCompleted}
          />
        ))}
      </div>
    </div>
  );
}