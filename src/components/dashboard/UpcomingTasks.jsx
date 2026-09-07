import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow, addDays } from "date-fns";

const priorityStyles = {
  High: "bg-destructive/10 text-destructive border-destructive/20",
  Medium: "bg-warning/10 text-amber-700 border-warning/20",
  Low: "bg-muted text-muted-foreground border-border",
  Urgent: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-emerald-100/50 text-emerald-700 border-emerald-200",
};

export default function UpcomingTasks({ tasks }) {
  const upcoming = useMemo(() => {
    return tasks
      .filter(t => t.status !== "Completed" && t.planning_date)
      .sort((a, b) => new Date(a.planning_date) - new Date(b.planning_date))
      .slice(0, 6);

  }, [tasks]);

  const completedToday = useMemo(() => {
    return tasks.filter(t => t.status === "Completed").slice(0, 2);
  }, [tasks]);

  const getDueLabel = (dateStr) => {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "MMM d");
  };

  const getDueColor = (dateStr) => {
    const d = new Date(dateStr);
    if (isToday(d) || d < new Date()) return "text-destructive";
    if (isTomorrow(d)) return "text-warning";
    return "text-muted-foreground";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="bg-card rounded-2xl border border-border card-hover"
    >
      <div className="flex items-center justify-between p-6 pb-4">
        <div>
          <h3 className="font-semibold text-foreground">Upcoming Tasks</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Scheduled & pending</p>
        </div>
        <Link to="/tasks" className="text-xs text-primary font-semibold hover:text-primary/80 flex items-center gap-1 transition-colors">
          All Tasks <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="px-3 pb-3">
        {upcoming.length === 0 && completedToday.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No upcoming tasks.</p>
        ) : (
          <>
            {/* Pending tasks */}
            {upcoming.map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/60 transition-colors group"
              >
                <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.project_name || task.work_order_name || "No project"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityStyles[task.priority] || priorityStyles.Medium}`}>
                    {task.priority || "Medium"}
                  </Badge>
                  <span className={`text-xs font-medium ${getDueColor(task.planning_date)}`}>
                    {getDueLabel(task.planning_date)}
                  </span>
                </div>
              </motion.div>
            ))}

            {/* Recently completed */}
            {completedToday.map((task, i) => (
              <motion.div
                key={`done-${task.id}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.6 + i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/60 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate line-through text-muted-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.project_name || ""}</p>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-100/50 text-emerald-700 border-emerald-200">
                  Done
                </Badge>
              </motion.div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}