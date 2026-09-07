import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, X, FolderKanban, ClipboardList, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Reusable section for linking a Quote or Invoice to Project, Work Order, and Tasks.
 * Props:
 *   form: { project_id, project_name, work_order_id, work_order_name, task_ids, task_names }
 *   onChange(updates): called with partial form updates
 *   contactId: filter records to those linked to this contact
 */
export default function LinkedRecordsSection({ form, onChange, contactId }) {
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectList, setShowProjectList] = useState(false);
  const [woSearch, setWoSearch] = useState("");
  const [showWoList, setShowWoList] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [showTaskList, setShowTaskList] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Project.list("name", 200),
      base44.entities.WorkOrder.list("title", 200),
      base44.entities.Task.list("title", 200),
    ]).then(([p, w, t]) => {
      setProjects(p);
      setWorkOrders(w);
      setTasks(t);
    });
  }, []);

  // ── Cascading filters based on contact, project, work order ──────
  // Projects: filter by contact if selected
  const availableProjects = contactId
    ? projects.filter(p => p.contact_id === contactId)
    : projects;

  // Work orders: filter by contact AND by project if selected
  const availableWO = workOrders.filter(w => {
    if (contactId && w.contact_id !== contactId) return false;
    if (form.project_id && w.project_id !== form.project_id) return false;
    return true;
  });

  // Tasks: filter by contact AND by project AND by work order if selected
  const availableTasks = tasks.filter(t => {
    if (contactId && t.contact_id !== contactId) return false;
    if (form.project_id && t.project_id !== form.project_id) return false;
    if (form.work_order_id && t.work_order_id !== form.work_order_id) return false;
    return true;
  });

  // ── Project ──────────────────────────────────────────────────────
  const filteredProjects = availableProjects.filter(p => {
    const q = projectSearch.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q);
  });

  const selectProject = (p) => {
    // Clear work order and tasks when project changes (they need to be re-filtered)
    onChange({ project_id: p.id, project_name: p.name, work_order_id: "", work_order_name: "", task_ids: [], task_names: [], task_references: [] });
    setProjectSearch("");
    setShowProjectList(false);
  };

  const clearProject = () => {
    onChange({ project_id: "", project_name: "", work_order_id: "", work_order_name: "", task_ids: [], task_names: [], task_references: [] });
    setProjectSearch("");
  };

  // ── Work Order ────────────────────────────────────────────────────
  const filteredWO = availableWO.filter(w => {
    const q = woSearch.toLowerCase();
    return !q || w.title?.toLowerCase().includes(q) || w.reference?.toLowerCase().includes(q);
  });

  const selectWO = (w) => {
    // Clear tasks when work order changes
    onChange({ work_order_id: w.id, work_order_name: w.title, task_ids: [], task_names: [], task_references: [] });
    setWoSearch("");
    setShowWoList(false);
  };

  const clearWO = () => {
    onChange({ work_order_id: "", work_order_name: "", task_ids: [], task_names: [], task_references: [] });
    setWoSearch("");
  };

  // ── Tasks (multi) ─────────────────────────────────────────────────
  const selectedTaskIds = form.task_ids || [];

  const filteredTasks = availableTasks.filter(t => {
    if (selectedTaskIds.includes(t.id)) return false;
    const q = taskSearch.toLowerCase();
    return !q || t.title?.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q);
  });

  const addTask = (t) => {
    const ids = [...selectedTaskIds, t.id];
    const names = [...(form.task_names || []), t.title];
    const refs = [...(form.task_references || []), t.reference || ""];
    onChange({ task_ids: ids, task_names: names, task_references: refs });
    setTaskSearch("");
    setShowTaskList(false);
  };

  const removeTask = (id) => {
    const idx = selectedTaskIds.indexOf(id);
    const ids = selectedTaskIds.filter(x => x !== id);
    const names = (form.task_names || []).filter((_, i) => i !== idx);
    const refs = (form.task_references || []).filter((_, i) => i !== idx);
    onChange({ task_ids: ids, task_names: names, task_references: refs });
  };

  return (
    <div className="space-y-3 pt-1">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
        Link to Operations
      </label>

      <div className="grid grid-cols-2 gap-3">
        {/* Project */}
        <div className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
            <FolderKanban className="w-3 h-3" /> Project
          </label>
          {form.project_id ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30 text-sm">
              <span className="font-medium truncate">{form.project_name}</span>
              <button type="button" onClick={clearProject} className="ml-2 text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search project..."
                value={projectSearch}
                onChange={e => { setProjectSearch(e.target.value); setShowProjectList(true); }}
                onFocus={() => setShowProjectList(true)}
                onBlur={() => setTimeout(() => setShowProjectList(false), 150)}
                autoComplete="off"
              />
            </div>
          )}
          {showProjectList && !form.project_id && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredProjects.length === 0
                ? <p className="px-3 py-2 text-xs text-muted-foreground">No projects found</p>
                : filteredProjects.map(p => (
                  <button key={p.id} type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onMouseDown={() => selectProject(p)}>
                    <span className="font-medium">{p.name}</span>
                    {p.reference && <span className="text-xs text-muted-foreground ml-1.5 font-mono">{p.reference}</span>}
                  </button>
                ))
              }
            </div>
          )}
        </div>

        {/* Work Order */}
        <div className="relative">
          <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
            <ClipboardList className="w-3 h-3" /> Work Order
          </label>
          {form.work_order_id ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30 text-sm">
              <span className="font-medium truncate">{form.work_order_name}</span>
              <button type="button" onClick={clearWO} className="ml-2 text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search work order..."
                value={woSearch}
                onChange={e => { setWoSearch(e.target.value); setShowWoList(true); }}
                onFocus={() => setShowWoList(true)}
                onBlur={() => setTimeout(() => setShowWoList(false), 150)}
                autoComplete="off"
              />
            </div>
          )}
          {showWoList && !form.work_order_id && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredWO.length === 0
                ? <p className="px-3 py-2 text-xs text-muted-foreground">No work orders found</p>
                : filteredWO.map(w => (
                  <button key={w.id} type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onMouseDown={() => selectWO(w)}>
                    <span className="font-medium">{w.title}</span>
                    {w.reference && <span className="text-xs text-muted-foreground ml-1.5 font-mono">{w.reference}</span>}
                  </button>
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Tasks (multi-select) */}
      <div className="relative">
        <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
          <CheckSquare className="w-3 h-3" /> Tasks
          <span className="font-normal text-muted-foreground/60">(multiple)</span>
        </label>

        {/* Selected task chips */}
        {selectedTaskIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedTaskIds.map((id, idx) => (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <span className="font-mono">{(form.task_references || [])[idx] || (form.task_names || [])[idx] || id}</span>
                <button type="button" onClick={() => removeTask(id)} className="hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Search and add tasks..."
            value={taskSearch}
            onChange={e => { setTaskSearch(e.target.value); setShowTaskList(true); }}
            onFocus={() => setShowTaskList(true)}
            onBlur={() => setTimeout(() => setShowTaskList(false), 150)}
            autoComplete="off"
          />
        </div>

        {showTaskList && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filteredTasks.length === 0
              ? <p className="px-3 py-2 text-xs text-muted-foreground">No tasks found</p>
              : filteredTasks.map(t => (
                <button key={t.id} type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  onMouseDown={() => addTask(t)}>
                  <span className="font-medium">{t.title}</span>
                  {t.reference && <span className="text-xs text-muted-foreground ml-1.5 font-mono">{t.reference}</span>}
                  {t.status && <span className="text-xs text-muted-foreground ml-1.5">· {t.status}</span>}
                </button>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}