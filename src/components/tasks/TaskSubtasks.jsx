import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, CheckCircle2, Circle, GripVertical, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export default function TaskSubtasks({ taskId, subtasks, onSubtasksChange }) {
  const [local, setLocal] = useState(subtasks);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  const startEdit = (sub) => {
    setEditingId(sub.id);
    setEditTitle(sub.title);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };
  const saveEdit = async (sub) => {
    const title = editTitle.trim();
    if (!title) { cancelEdit(); return; }
    const next = local.map(s => s.id === sub.id ? { ...s, title } : s);
    sync(next);
    setEditingId(null);
    setEditTitle("");
    try {
      await base44.entities.TaskSubtask.update(sub.id, { title });
    } catch {
      sync(local);
    }
  };

  // Sync from parent prop when the parent's data changes (e.g. full reload)
  useEffect(() => {
    setLocal(subtasks);
  }, [subtasks]);

  const sync = (next) => {
    setLocal(next);
    onSubtasksChange?.(next);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await base44.entities.TaskSubtask.create({
        task_id: taskId,
        title: newTitle.trim(),
        done: false,
        sort_order: local.length,
      });
      sync([...local, created]);
      setNewTitle("");
      setAdding(false);
    } catch {
      // keep local as-is on error
    }
    setSaving(false);
  };

  const toggleDone = async (sub) => {
    const next = local.map(s => s.id === sub.id ? { ...s, done: !s.done } : s);
    sync(next);
    try {
      await base44.entities.TaskSubtask.update(sub.id, { done: !sub.done });
    } catch {
      sync(local);
    }
  };

  const handleDelete = async (id) => {
    const prev = local;
    const next = local.filter(s => s.id !== id);
    sync(next);
    try {
      await base44.entities.TaskSubtask.delete(id);
      // Re-seal sort_order gaps so order stays tight
      await persistOrder(next);
    } catch {
      sync(prev);
    }
  };

  // Persist the current array order as sort_order values (0..n-1)
  const persistOrder = async (ordered) => {
    const updates = ordered.map((s, i) => ({ id: s.id, sort_order: i }));
    if (updates.length === 0) return;
    try {
      await base44.entities.TaskSubtask.bulkUpdate(updates);
    } catch {
      // non-fatal: UI still reflects the chosen order for this session
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...local];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    sync(next);
    persistOrder(next);
  };

  const done = local.filter(s => s.done).length;
  const total = local.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full inline-block" />
          Instructions / Subtasks
          {total > 0 && (
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {done}/{total}
            </span>
          )}
        </h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary"
          onClick={() => setAdding(a => !a)}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1.5 w-full bg-muted rounded-full mb-3 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-3">
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="New instruction..." autoFocus className="flex-1" />
          <Button type="submit" size="sm" disabled={saving || !newTitle.trim()}>Add</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(false); setNewTitle(""); }}>Cancel</Button>
        </form>
      )}

      {local.length === 0 && !adding ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No instructions yet. Add the first one.</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId={`subtasks-${taskId || "new"}`}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                {local.map((sub, index) => (
                  <Draggable key={sub.id} draggableId={sub.id} index={index}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all group
                          ${sub.done ? "bg-emerald-50 border-emerald-100" : "bg-card border-border hover:bg-muted/30"}
                          ${snapshot.isDragging ? "shadow-md ring-1 ring-primary/30 border-primary/40" : ""}`}
                      >
                        <button
                          {...dragProvided.dragHandleProps}
                          className="p-0.5 rounded text-muted-foreground/40 hover:text-primary cursor-grab active:cursor-grabbing touch-none"
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleDone(sub)}
                          className="shrink-0"
                          title={sub.done ? "Mark as not done" : "Mark as done"}
                        >
                          {sub.done
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            : <Circle className="w-5 h-5 text-muted-foreground/40 hover:text-primary transition-colors" />}
                        </button>
                        {editingId === sub.id ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <Input
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); saveEdit(sub); }
                                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                              }}
                              autoFocus
                              className="h-7 text-sm"
                            />
                            <button
                              onClick={() => saveEdit(sub)}
                              className="p-1 rounded hover:bg-emerald-100 text-emerald-600"
                              title="Save"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 rounded hover:bg-muted text-muted-foreground"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span
                              onClick={() => toggleDone(sub)}
                              className={`flex-1 text-sm cursor-pointer ${sub.done ? "line-through text-muted-foreground" : "text-foreground"}`}
                            >
                              {sub.title}
                            </span>
                            <button
                              onClick={() => startEdit(sub)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(sub.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}