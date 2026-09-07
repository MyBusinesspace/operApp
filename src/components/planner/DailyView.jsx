import React, { useRef, useState, useCallback, useEffect } from "react";
import { format, isSameDay } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Users, User, FolderKanban, Timer } from "lucide-react";

const SIDEBAR_W = 176; // px — matches w-44
const DAY_START = 0;
const DAY_END = 24;
const TOTAL_HOURS = DAY_END - DAY_START;
const LANE_HEIGHT = 88;
const LANE_PADDING = 4;
const SNAP_MIN = 15;

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min) {
  const clamped = Math.max(0, Math.min(min, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snap(min) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function planDuration(startMin, endMin) {
  const mins = endMin - startMin;
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? m + "m" : ""}` : `${m}m`;
}

const STATUS_BG = {
  "Queued":        "bg-amber-50 border-amber-200",
  "Scheduled":     "bg-violet-50 border-violet-200",
  "Active":        "bg-orange-50 border-orange-300",
  "Not Completed": "bg-orange-50 border-orange-300",
  "Completed":     "bg-emerald-50 border-emerald-200",
};

const STATUS_BADGE = {
  "Queued":        "bg-amber-100 text-amber-600",
  "Scheduled":     "bg-violet-100 text-violet-600",
  "Active":        "bg-orange-100 text-orange-700",
  "Not Completed": "bg-orange-100 text-orange-700",
  "Completed":     "bg-emerald-100 text-emerald-600"
};

const VIEW_ICONS = {
  employee: User,
  team: Users,
  project: FolderKanban,
};

// ─── TaskBlock ────────────────────────────────────────────────────────────────
function TaskBlock({ task, employees, timeEntries, startMin, endMin, top, blockHeight, pixelsPerHour, onMoveStart, onResizeStart, isDragging, onLeaveIds }) {
  // Employees on leave for the current day are auto-excluded from the task block,
  // but remain visible in their team's sidebar column so they can be scheduled on other days.
  const assignedEmps = (task.assigned_employees || [])
    .map(id => employees.find(e => e.id === id))
    .filter(e => e && !(onLeaveIds?.has(e.id)));

  const activeEntries = timeEntries.filter(te => te.task_id === task.id && te.status === "Active");
  const isClockedIn = activeEntries.length > 0;

  const taskEntries = timeEntries.filter(te => te.task_id === task.id);
  const clockIn = taskEntries.map(te => te.clock_in_time).filter(Boolean)
    .reduce((a, b) => (a && a < b ? a : b), null);
  const clockOut = taskEntries.map(te => te.clock_out_time).filter(Boolean)
    .reduce((a, b) => (a && a > b ? a : b), null);
  const fmtT = (iso) => { try { return format(new Date(iso), "HH:mm"); } catch { return ""; } };

  const left = (startMin / 60) * pixelsPerHour;
  const width = Math.max(((endMin - startMin) / 60) * pixelsPerHour - 4, 32);
  const height = blockHeight || (LANE_HEIGHT - 8);
  const bg = STATUS_BG[task.status] || STATUS_BG["Queued"];
  const dur = planDuration(startMin, endMin);

  return (
    <div
      className={`absolute border rounded-lg overflow-hidden text-[10px] shadow-sm select-none transition-opacity ${bg} ${isDragging ? "opacity-30 pointer-events-none" : "opacity-100"}`}
      style={{ left, width, top, height }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize z-10 hover:bg-black/10 rounded-l-lg"
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, task, startMin, endMin, "left"); }}
      />
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-e-resize z-10 hover:bg-black/10 rounded-r-lg"
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, task, startMin, endMin, "right"); }}
      />

      {/* Drag body */}
      <div
        className="absolute inset-0 px-2 py-1.5 cursor-grab active:cursor-grabbing flex flex-col overflow-hidden"
        onMouseDown={(e) => {
          const grabOffsetPx = e.clientX - e.currentTarget.parentElement.getBoundingClientRect().left;
          const grabOffsetMin = Math.round((grabOffsetPx / pixelsPerHour) * 60);
          onMoveStart(e, task, startMin, endMin, grabOffsetMin);
        }}
      >
        {/* Row 1: avatars + clocked-in badge + status badge */}
        <div className="flex items-center gap-1 mb-1">
          <div className="flex -space-x-1 min-w-0">
            {assignedEmps.slice(0, 3).map(emp =>
              emp.avatar_url
                ? <img key={emp.id} src={emp.avatar_url} title={emp.full_name} className="w-4 h-4 rounded-full object-cover border border-white shadow-sm shrink-0" alt={emp.full_name} />
                : <div key={emp.id} title={emp.full_name} className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[7px] font-bold text-primary border border-white shadow-sm shrink-0">{emp.full_name?.[0] || "?"}</div>
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

        {/* Row 2: Task title */}
        <p className="text-[10px] leading-tight font-semibold text-foreground truncate" title={task.title}>{task.title}</p>

        {/* Row 3: Client → Project */}
        {(task.contact_name || task.project_name) && (
          <p className="text-[9px] leading-tight truncate text-muted-foreground mt-0.5" title={[task.contact_name, task.project_name].filter(Boolean).join(" → ")}>
            {[task.contact_name, task.project_name].filter(Boolean).join(" → ")}
          </p>
        )}

        {/* Row 4: Time + duration (matching week view) */}
        <p className="text-[10px] font-bold text-foreground leading-none mt-auto">
          ⏱ {minutesToTime(startMin)} → {minutesToTime(endMin)}
          {dur && <span className="ml-1 font-semibold text-primary">({dur})</span>}
        </p>
      </div>
    </div>
  );
}

// ─── ScheduleRow ─────────────────────────────────────────────────────────────
function ScheduleRow({ entity, viewBy, localTasks, employees, teams, projects, timeEntries, currentDay, pixelsPerHour, interaction, onMoveStart, onResizeStart, onLeaveIds }) {

  // Filter tasks for this entity
  const dayTasks = localTasks.filter(task => {
    if (!task.planning_date) return false;
    if (!isSameDay(new Date(task.planning_date), currentDay)) return false;
    if (viewBy === "employee") {
      return task.assigned_employees?.includes(entity.id) ||
        task.assigned_employee_names?.includes(entity.full_name);
    }
    if (viewBy === "team") {
      if (task.assigned_team_ids?.includes(entity.id)) return true;
      const teamEmpIds = employees.filter(e => e.team_id === entity.id).map(e => e.id);
      return teamEmpIds.length > 0 && task.assigned_employees?.some(eid => teamEmpIds.includes(eid));
    }
    if (viewBy === "project") {
      if (task.project_id === entity.id) return true;
      if (!task.project_id && task.project_name && task.project_name === entity.name) return true;
      return false;
    }
    return false;
  });

  // Build lanes
  const placed = dayTasks.map(task => {
    const startMin = timeToMinutes(task.planning_time_in) ?? 420;
    const endMin = timeToMinutes(task.planning_time_out) ?? startMin + 60;
    return { task, startMin, endMin };
  }).sort((a, b) => a.startMin - b.startMin);

  const lanes = [];
  placed.forEach(item => {
    let lane = lanes.find(l => l[l.length - 1].endMin <= item.startMin);
    if (!lane) { lane = []; lanes.push(lane); }
    lane.push(item);
  });

  const laneCount = Math.max(lanes.length, 1);
  const rowHeight = Math.max(laneCount * LANE_HEIGHT + LANE_PADDING * 2, 80);
  const totalWidth = TOTAL_HOURS * pixelsPerHour;

  // Sub-entities for the sidebar
  let subItems = [];
  if (viewBy === "team") {
    const teamEmpIds = entity.employee_ids || [];
    subItems = employees.filter(e => e.team_id === entity.id || teamEmpIds.includes(e.id));
  } else if (viewBy === "project") {
    subItems = employees.filter(e => e.id && false); // projects don't have members
  }

  const Icon = VIEW_ICONS[viewBy];

  const isDropTarget = interaction?.type === "move" && interaction?.targetEntityId === entity.id && interaction?.sourceEntityId !== entity.id;

  return (
    <div
      data-entity-id={entity.id}
      className={`border-b border-border flex transition-colors ${isDropTarget ? "bg-primary/5" : ""}`}
      style={{ minHeight: rowHeight }}
    >
      {/* Label */}
      <div className="w-44 shrink-0 border-r border-border bg-card sticky left-0 z-10 p-2 flex flex-col justify-start gap-1">
        <div className="flex items-center gap-1.5">
          {viewBy === "team" ? (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: entity.color || "#6366f1" }}>
              {entity.name?.[0] || "?"}
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-3 h-3 text-primary" />
            </div>
          )}
          <span className="text-xs font-bold text-foreground truncate">{entity.name || entity.full_name}</span>
          {viewBy === "employee" && onLeaveIds?.has(entity.id) && (
            <span className="ml-1 shrink-0 inline-flex items-center px-1 py-0.5 rounded-full text-[8px] font-semibold bg-amber-100 text-amber-700 border border-amber-200" title="On leave on this day">On Leave</span>
          )}
        </div>
        {subItems.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            {subItems.map(emp => (
              <div key={emp.id} className="flex items-center gap-1">
                {emp.avatar_url
                  ? <img src={emp.avatar_url} className="w-4 h-4 rounded-full object-cover shrink-0" alt="" />
                  : <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary shrink-0">{emp.full_name?.[0] || "?"}</div>
                }
                <span className={`text-[10px] truncate ${onLeaveIds?.has(emp.id) ? "text-amber-600 line-through" : "text-muted-foreground"}`}>{emp.full_name}</span>
                {onLeaveIds?.has(emp.id) && (
                  <span className="ml-auto shrink-0 text-[7px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700" title="On leave on this day">off</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="relative overflow-hidden" style={{ width: totalWidth, minWidth: totalWidth, height: rowHeight }}>
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
          <div key={i} className="absolute top-0 bottom-0 border-l border-border" style={{ left: i * pixelsPerHour }} />
        ))}
        {Array.from({ length: TOTAL_HOURS }, (_, i) => (
          <div key={`half-${i}`} className="absolute top-0 bottom-0 border-l border-slate-300/70" style={{ left: i * pixelsPerHour + pixelsPerHour / 2 }} />
        ))}
        {Array.from({ length: TOTAL_HOURS * 4 }, (_, i) => {
          const offsetInHour = (i % 4) * (pixelsPerHour / 4);
          if (offsetInHour === 0 || offsetInHour === pixelsPerHour / 2) return null;
          return (
            <div key={`q-${i}`} className="absolute top-0 bottom-0 border-l border-slate-200/60" style={{ left: Math.floor(i / 4) * pixelsPerHour + offsetInHour }} />
          );
        })}

        {/* Task blocks */}
        {lanes.map((lane, laneIdx) =>
          lane.map(({ task, startMin, endMin }) => {
            const isInteracting = interaction?.task?.id === task.id;
            const displayStart = isInteracting ? interaction.previewStart : startMin;
            const displayEnd = isInteracting ? interaction.previewEnd : endMin;
            const top = LANE_PADDING + laneIdx * LANE_HEIGHT;
            const blockHeight = LANE_HEIGHT - LANE_PADDING * 2;

            return (
              <TaskBlock
                key={task.id}
                task={task}
                employees={employees}
                timeEntries={timeEntries}
                startMin={displayStart}
                endMin={displayEnd}
                top={top}
                blockHeight={blockHeight}
                pixelsPerHour={pixelsPerHour}
                isDragging={isInteracting && interaction?.sourceEntityId !== entity.id}
                onMoveStart={onMoveStart}
                onResizeStart={onResizeStart}
                onLeaveIds={onLeaveIds}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── DailyView ────────────────────────────────────────────────────────────────
export default function DailyView({ currentDay, teams, projects, employees, tasks: propTasks, timeEntries, onTasksRefresh, onTaskUpdate, viewBy, setViewBy, sortedRows, onLeaveIds }) {
  const wrapperRef = useRef(null);
  const [pixelsPerHour, setPixelsPerHour] = useState(80);

  // Fit all 24 hours into the available width on mount/resize
  useEffect(() => {
    const recalc = () => {
      if (!wrapperRef.current) return;
      const available = wrapperRef.current.clientWidth - SIDEBAR_W;
      setPixelsPerHour(Math.max(30, available / TOTAL_HOURS));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  const totalWidth = TOTAL_HOURS * pixelsPerHour;
  const [dayStartHour, setDayStartHour] = useState(7);
  const [dayEndHour, setDayEndHour] = useState(17);

  const [localTasks, setLocalTasks] = useState(propTasks);
  useEffect(() => { setLocalTasks(propTasks); }, [propTasks]);

  const [interaction, setInteraction] = useState(null);
  const interactionRef = useRef(null);
  const containerRef = useRef(null);

  // Keep ref in sync — used by mouse handlers to avoid stale closures
  const syncInteraction = useCallback((value) => {
    interactionRef.current = value;
    setInteraction(value);
  }, []);

  const saveTask = useCallback(async (taskId, updateData) => {
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updateData } : t));
    if (onTaskUpdate) onTaskUpdate(taskId, updateData);
    await base44.entities.Task.update(taskId, updateData);
  }, [onTaskUpdate]);

  const getEntityIdForTask = useCallback((task) => {
    if (viewBy === "team") {
      if (task.assigned_team_ids?.length) return task.assigned_team_ids[0];
      const emp = employees.find(e => task.assigned_employees?.includes(e.id));
      return emp?.team_id || null;
    }
    if (viewBy === "employee") {
      return task.assigned_employees?.[0] || null;
    }
    if (viewBy === "project") {
      return task.project_id || null;
    }
    return null;
  }, [viewBy, employees]);

  const handleMoveStart = useCallback((e, task, startMin, endMin, grabOffsetMin) => {
    e.preventDefault();
    const newInteraction = {
      type: "move",
      task,
      sourceEntityId: getEntityIdForTask(task),
      targetEntityId: getEntityIdForTask(task),
      startX: e.clientX,
      grabOffsetMin,
      originalStart: startMin,
      originalEnd: endMin,
      previewStart: startMin,
      previewEnd: endMin,
    };
    syncInteraction(newInteraction);
  }, [getEntityIdForTask, syncInteraction]);

  const handleResizeStart = useCallback((e, task, startMin, endMin, side) => {
    e.preventDefault();
    const newInteraction = {
      type: "resize",
      task,
      sourceEntityId: getEntityIdForTask(task),
      targetEntityId: getEntityIdForTask(task),
      startX: e.clientX,
      side,
      originalStart: startMin,
      originalEnd: endMin,
      previewStart: startMin,
      previewEnd: endMin,
    };
    syncInteraction(newInteraction);
  }, [getEntityIdForTask, syncInteraction]);



  // Global mouse move & up — reads from interactionRef to avoid stale closures
  useEffect(() => {
    if (!interaction) return;

    const onMouseMove = (e) => {
      const inter = interactionRef.current;
      if (!inter) return;

      // Detect which row the mouse is over for cross-row assignment
      if (inter.type === "move") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const row = el?.closest("[data-entity-id]");
        const hoveredEntityId = row?.dataset?.entityId;
        if (hoveredEntityId && hoveredEntityId !== inter.targetEntityId) {
          interactionRef.current = { ...interactionRef.current, targetEntityId: hoveredEntityId };
          setInteraction(prev => prev ? { ...prev, targetEntityId: hoveredEntityId } : prev);
        }
      }

      const dx = e.clientX - inter.startX;
      const deltaMin = snap(dx / pixelsPerHour * 60);

      let updated;
      if (inter.type === "move") {
        const newStart = Math.max(0, snap(inter.originalStart + deltaMin));
        const duration = inter.originalEnd - inter.originalStart;
        updated = { ...inter, previewStart: newStart, previewEnd: newStart + duration };
      } else {
        if (inter.side === "right") {
          const newEnd = Math.max(inter.originalStart + SNAP_MIN, snap(inter.originalEnd + deltaMin));
          updated = { ...inter, previewEnd: newEnd };
        } else {
          const newStart = Math.min(inter.originalEnd - SNAP_MIN, snap(inter.originalStart + deltaMin));
          updated = { ...inter, previewStart: newStart };
        }
      }
      interactionRef.current = updated;
      setInteraction(updated);
    };

    const onMouseUp = async (e) => {
      const inter = interactionRef.current;
      if (!inter) return;
      interactionRef.current = null;
      setInteraction(null);

      const { task, previewStart, previewEnd, targetEntityId } = inter;

      const updateData = {
        planning_time_in: minutesToTime(previewStart),
        planning_time_out: minutesToTime(previewEnd),
      };

      const currentEntityId = getEntityIdForTask(task);
      if (targetEntityId && targetEntityId !== currentEntityId) {
        if (viewBy === "team") {
          const newTeam = teams.find(t => t.id === targetEntityId);
          updateData.assigned_team_ids = [targetEntityId];
          updateData.assigned_team_names = newTeam ? [newTeam.name] : [];
          updateData.assigned_employees = [];
          updateData.assigned_employee_names = [];
        } else if (viewBy === "employee") {
          const emp = employees.find(e => e.id === targetEntityId);
          updateData.assigned_employees = [targetEntityId];
          updateData.assigned_employee_names = emp ? [emp.full_name] : [];
          updateData.assigned_team_ids = [];
          updateData.assigned_team_names = [];
        } else if (viewBy === "project") {
          const proj = projects.find(p => p.id === targetEntityId);
          updateData.project_id = targetEntityId;
          updateData.project_name = proj ? proj.name : "";
        }
      }

      await saveTask(task.id, updateData);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [interaction, pixelsPerHour, saveTask, getEntityIdForTask, viewBy, teams, employees, projects]);

  const rows = sortedRows || (viewBy === "employee" ? employees : viewBy === "team" ? teams : projects);
  const labelIcon = VIEW_ICONS[viewBy];

  return (
    <div
      ref={(el) => { containerRef.current = el; wrapperRef.current = el; }}
      className="flex-1 overflow-auto"
      style={{ userSelect: interaction ? "none" : "auto", cursor: interaction?.type === "move" ? "grabbing" : interaction?.type === "resize" ? "ew-resize" : "default" }}
    >
      {/* Header */}
      <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">{format(currentDay, "EEEE, MMMM d, yyyy")}</span>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {/* View mode switcher */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {["employee", "team", "project"].map(v => {
              const Icon = VIEW_ICONS[v];
              return (
                <button
                  key={v}
                  onClick={() => setViewBy(v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold capitalize transition-colors ${viewBy === v ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="w-3 h-3" />
                  {v}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Start:
            <input
              type="number" min={0} max={23} value={dayStartHour}
              onChange={e => setDayStartHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
              className="ml-1 w-10 text-center font-bold text-foreground bg-muted border border-border rounded px-1 py-0.5 text-xs"
            />
            <span>h</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            End:
            <input
              type="number" min={0} max={24} value={dayEndHour}
              onChange={e => setDayEndHour(Math.max(0, Math.min(24, parseInt(e.target.value) || 0)))}
              className="ml-1 w-10 text-center font-bold text-foreground bg-muted border border-border rounded px-1 py-0.5 text-xs"
            />
            <span>h</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col">
        {/* Sticky hour header */}
        <div className="flex sticky top-0 z-20 bg-card border-b border-border shadow-sm">
          <div className="w-44 shrink-0 border-r border-border px-2 py-1.5 flex items-center gap-1">
            {React.createElement(labelIcon, { className: "w-3 h-3 text-muted-foreground" })}
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">{viewBy}</p>
          </div>
          <div className="relative overflow-hidden" style={{ width: totalWidth, minWidth: totalWidth, height: 28 }}>
            {Array.from({ length: TOTAL_HOURS }, (_, i) => {
              const hour = DAY_START + i;
              return (
                <div key={hour} className="absolute top-0 bottom-0 flex flex-col" style={{ left: i * pixelsPerHour, width: pixelsPerHour }}>
                  <span className={`text-[10px] font-bold px-0.5 ${hour === dayStartHour || hour === dayEndHour ? "text-red-500" : "text-muted-foreground"}`}>
                    {String(hour).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 px-0.5" style={{ marginLeft: pixelsPerHour / 2 - 4 }}>:30</span>
                </div>
              );
            })}
            <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-10" style={{ left: dayStartHour * pixelsPerHour }} />
            <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-10" style={{ left: dayEndHour * pixelsPerHour }} />
          </div>
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No {viewBy}s found.
          </div>
        ) : (
          rows.map(entity => (
            <div key={entity.id} className="relative">
              <div className="absolute top-0 bottom-0 border-l-2 border-red-400/60 z-10 pointer-events-none" style={{ left: 176 + dayStartHour * pixelsPerHour }} />
              <div className="absolute top-0 bottom-0 border-l-2 border-red-400/60 z-10 pointer-events-none" style={{ left: 176 + dayEndHour * pixelsPerHour }} />
              <ScheduleRow
                entity={entity}
                viewBy={viewBy}
                localTasks={localTasks}
                employees={employees}
                teams={teams}
                projects={projects}
                timeEntries={timeEntries}
                currentDay={currentDay}
                pixelsPerHour={pixelsPerHour}
                interaction={interaction}
                onMoveStart={handleMoveStart}
                onResizeStart={handleResizeStart}
                onLeaveIds={onLeaveIds}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}