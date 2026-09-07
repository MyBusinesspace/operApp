import React from "react";
import { Check } from "lucide-react";

export default function TaskSubtasksCell({ subtasks = [] }) {
  if (subtasks.length === 0) return <span className="text-xs text-muted-foreground/40 italic">No subtasks</span>;
  return (
    <div className="space-y-0.5 min-w-[180px] max-w-[260px] py-0.5">
      {subtasks.slice(0, 3).map(s => (
        <div key={s.id} className="flex items-center gap-1.5 text-xs">
          <span className={`flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0 ${s.done ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-500"}`}>
            {s.done ? <Check className="w-2.5 h-2.5" /> : <span className="w-1 h-1 rounded-full bg-current" />}
          </span>
          <span className={`truncate ${s.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {s.title || s.name || "—"}
          </span>
        </div>
      ))}
      {subtasks.length > 3 && (
        <span className="text-xs text-muted-foreground/60 pl-5">+{subtasks.length - 3} more</span>
      )}
    </div>
  );
}