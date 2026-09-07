import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Clock, Inbox } from "lucide-react";

export default function CellTaskPickerModal({ open, onClose, entity, viewBy, dateStr, queuedTasks, onAssignTask, onCreateNew }) {
  const [search, setSearch] = useState("");

  if (!entity || !dateStr) return null;

  const entityName = entity.full_name || entity.name || "—";
  const viewLabel = viewBy === "employee" ? "Employee" : viewBy === "team" ? "Team" : "Project";

  const filtered = queuedTasks.filter(t => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      t.title?.toLowerCase().includes(q) ||
      t.reference?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.work_order_name?.toLowerCase().includes(q) ||
      t.project_name?.toLowerCase().includes(q) ||
      t.contact_name?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="px-6 pt-6 pb-3 space-y-1">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Add Task
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {viewLabel}: <span className="font-medium text-foreground">{entityName}</span> · Date: <span className="font-medium text-foreground">{dateStr}</span>
          </p>
        </DialogHeader>

        <div className="px-6 pb-3">
          <Button
            type="button"
            onClick={() => { onCreateNew(); onClose(); }}
            className="w-full"
          >
            <Plus className="w-4 h-4" />
            Create New Task
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col border-t border-border px-6 pt-3 pb-6">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Inbox className="w-3.5 h-3.5" />
            Or pick from queue ({queuedTasks.length})
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search queued tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No queued tasks available.
              </p>
            ) : (
              filtered.map(task => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => { onAssignTask(task); onClose(); }}
                  className="w-full text-left p-2 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.reference && <span className="text-[10px] text-muted-foreground">{task.reference}</span>}
                        {task.category && <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{task.category}</span>}
                      </div>
                      {(task.project_name || task.work_order_name || task.contact_name) && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {[task.project_name, task.work_order_name, task.contact_name].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <Clock className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}