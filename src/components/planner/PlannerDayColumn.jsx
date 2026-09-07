import React, { useState } from "react";
import { isToday, format } from "date-fns";
import { Plus, Check, ChevronDown, ChevronRight } from "lucide-react";
import TaskCard from "./TaskCard";

export default function PlannerDayColumn({ date, tasks, employees = [], timeEntries = [], subtasksMap = {}, onTaskClick, onTaskDragStart, onTaskDrop, onAddTask, onTaskDelete, onUpdateWorkers, collapseCompleted = false }) {
  const isCurrentDay = isToday(date);
  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedCompleted, setExpandedCompleted] = useState(false);

  const sortedTasks = [...tasks].sort((a, b) => {
    if (!a.planning_time_in) return 1;
    if (!b.planning_time_in) return -1;
    return a.planning_time_in.localeCompare(b.planning_time_in);
  });

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    onTaskDrop && onTaskDrop(format(date, "yyyy-MM-dd"));
  };

  return (
    <div
      className={`flex-1 min-w-[140px] border-r border-border last:border-r-0 flex flex-col transition-colors ${isCurrentDay ? "bg-primary/5" : ""} ${isDragOver ? "bg-primary/10 ring-2 ring-inset ring-primary/30" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex-1 p-1 space-y-0.5 min-h-[80px] relative group">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddTask && onAddTask(format(date, "yyyy-MM-dd")); }}
          className="absolute top-0.5 right-0.5 z-10 w-5 h-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all opacity-0 group-hover:opacity-100"
          title="Add task"
        >
          <Plus className="w-3 h-3" />
        </button>
        {sortedTasks.map((task, idx) => {
          if (task.status === "Completed" && collapseCompleted && !expandedCompleted) return null;
          return (
            <TaskCard
              key={task.id}
              task={task}
              employees={employees}
              timeEntries={timeEntries.filter(te => te.task_id === task.id)}
              onClick={() => onTaskClick && onTaskClick(task)}
              onDelete={onTaskDelete}
              onUpdateWorkers={onUpdateWorkers}
              subtasks={subtasksMap[task.id] || []}
              onDragStart={onTaskDragStart}
              taskIndex={idx + 1}
              taskTotal={sortedTasks.length}
            />
          );
        })}
        {collapseCompleted && sortedTasks.some(t => t.status === "Completed") && (
          <button
            type="button"
            onClick={() => setExpandedCompleted(v => !v)}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium hover:bg-emerald-100 transition-colors w-full"
          >
            <Check className="w-2.5 h-2.5 shrink-0" />
            <span>{sortedTasks.filter(t => t.status === "Completed").length} completed</span>
            {expandedCompleted
              ? <ChevronDown className="w-2.5 h-2.5 ml-auto" />
              : <ChevronRight className="w-2.5 h-2.5 ml-auto" />}
          </button>
        )}
      </div>
    </div>
  );
}