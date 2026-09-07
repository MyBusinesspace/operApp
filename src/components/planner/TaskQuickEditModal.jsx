import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, Trash2, Plus, X, ChevronDown, ChevronUp, Crown, FolderKanban, ClipboardList, Box, Building2, Hash, Search, Sparkles, Loader2 } from "lucide-react";
import { format, addDays } from "date-fns";
import TaskHistoryPanel from "@/components/tasks/TaskHistoryPanel";

const TODAY = format(new Date(), "yyyy-MM-dd");
const TOMORROW = format(addDays(new Date(), 1), "yyyy-MM-dd");
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];

export default function TaskQuickEditModal({ open, onClose, task, onSaved, onDelete }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [shifts, setShifts] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [expandedTeams, setExpandedTeams] = useState({});
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjects, setShowProjects] = useState(false);
  const [woSearch, setWoSearch] = useState("");
  const [showWO, setShowWO] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  const generateDescription = async () => {
    if (!form.title) return;
    setGeneratingDesc(true);
    try {
      const project = projects.find(p => p.id === form.project_id);
      const workOrder = workOrders.find(w => w.id === form.work_order_id);

      const contextParts = [];
      if (form.title) contextParts.push(`Task title: ${form.title}`);
      if (project?.name) contextParts.push(`Project: ${project.name}`);
      if (project?.type) contextParts.push(`Project type: ${project.type}`);
      if (project?.location) contextParts.push(`Project location: ${project.location}`);
      if (workOrder?.title) contextParts.push(`Work order: ${workOrder.title}`);
      if (workOrder?.type) contextParts.push(`Work order type: ${workOrder.type}`);
      if (form.asset_name) contextParts.push(`Asset: ${form.asset_name}`);
      if (form.contact_name) contextParts.push(`Client: ${form.contact_name}`);
      if (form.priority) contextParts.push(`Priority: ${form.priority}`);

      const prompt = `You are a field operations assistant for a maintenance/service company. Based on the following task context, write a clear, professional task description (2-3 sentences) explaining what needs to be done. Keep it concise and actionable, in English. Do not add bullet points or headings — just plain text.

Context:
${contextParts.join("\n")}

Write the description:`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      const text = typeof result === "string" ? result : result?.text || result?.response || "";
      if (text) set("description", text);
    } catch {
      // silently fail
    }
    setGeneratingDesc(false);
  };

  useEffect(() => {
    if (open) {
      Promise.all([
        base44.entities.TaskShift.list("name", 100).catch(() => []),
        base44.entities.Team.list("sort_order", 200).catch(() => []),
        base44.entities.Employee.list("full_name", 500).catch(() => []),
        base44.entities.Contact.list("full_name", 200).catch(() => []),
        base44.entities.Project.list("name", 200).catch(() => []),
        base44.entities.WorkOrder.list("title", 200).catch(() => []),
      ]).then(([sh, tm, emp, ct, pr, wo]) => {
        setShifts(sh); setTeams([...tm].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))); setEmployees(emp);
        setContacts(ct); setProjects(pr); setWorkOrders(wo);
      });
    }
  }, [open]);

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || "",
        priority: task.priority || "Medium",
        planning_date: task.planning_date || "",
        planning_time_in: task.planning_time_in || "",
        planning_time_out: task.planning_time_out || "",
        assigned_employees: task.assigned_employees || [],
        assigned_employee_names: task.assigned_employee_names || [],
        assigned_team_ids: task.assigned_team_ids || [],
        assigned_team_names: task.assigned_team_names || [],
        description: task.description || "",
        notes: task.notes || "",
        contact_id: task.contact_id || "",
        contact_name: task.contact_name || "",
        project_id: task.project_id || "",
        project_name: task.project_name || "",
        work_order_id: task.work_order_id || "",
        work_order_name: task.work_order_name || "",
        asset_id: task.asset_id || "",
        asset_name: task.asset_name || "",
      });
      setNewSubtask("");
      setExpandedTeams({});
      setContactSearch(""); setProjectSearch(""); setWoSearch("");
      if (task.id) {
        base44.entities.TaskSubtask.filter({ task_id: task.id }).catch(() => []).then(setSubtasks);
      } else {
        setSubtasks([]);
      }
    }
  }, [task]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleWOSelect = (wo) => {
    setForm(f => ({
      ...f,
      work_order_id: wo.id, work_order_name: wo.title,
      project_id: wo.project_id || f.project_id,
      project_name: wo.project_name || f.project_name,
      contact_id: wo.contact_id || f.contact_id || "",
      contact_name: wo.contact_name || f.contact_name || "",
      asset_id: f.asset_id || wo.asset_id || "",
      asset_name: f.asset_name || wo.asset_name || "",
    }));
    setShowWO(false); setWoSearch("");
  };

  const handleProjectSelect = (p) => {
    setForm(f => ({
      ...f,
      project_id: p.id, project_name: p.name,
      contact_id: p.contact_id || f.contact_id || "",
      contact_name: p.contact_name || f.contact_name || "",
    }));
    setShowProjects(false); setProjectSearch("");
  };

  const handleContactSelect = (c) => {
    setForm(f => ({ ...f, contact_id: c.id, contact_name: c.company || c.full_name }));
    setShowContacts(false); setContactSearch("");
  };

  // Filtered Work Orders: scoped by project → contact, then search
  const filteredWO = workOrders.filter(w => {
    if (form.project_id && w.project_id !== form.project_id) return false;
    if (form.contact_id && w.contact_id !== form.contact_id) return false;
    const q = woSearch.toLowerCase();
    return !q || w.title?.toLowerCase().includes(q) || w.reference?.toLowerCase().includes(q);
  });

  // Filtered Projects: only active status, scoped by contact, then search
  const filteredProjects = projects.filter(p => {
    if (p.status && p.status !== "Active") return false;
    if (form.contact_id) {
      if (p.contact_id && p.contact_id !== form.contact_id) return false;
    }
    const q = projectSearch.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q);
  });

  // Filtered Contacts: then search
  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    return !q || c.full_name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q);
  });

  const toggleEmployee = (emp) => {
    setForm(f => {
      const ids = f.assigned_employees || [];
      const names = f.assigned_employee_names || [];
      if (ids.includes(emp.id)) {
        return { ...f, assigned_employees: ids.filter(x => x !== emp.id), assigned_employee_names: names.filter(x => x !== emp.full_name) };
      }
      return { ...f, assigned_employees: [...ids, emp.id], assigned_employee_names: [...names, emp.full_name] };
    });
  };

  const toggleAllInTeam = (team) => {
    const teamEmps = employees.filter(e => e.team_id === team.id);
    const allSelected = teamEmps.every(e => (form.assigned_employees || []).includes(e.id));
    if (allSelected) {
      teamEmps.forEach(e => {
        if ((form.assigned_employees || []).includes(e.id)) toggleEmployee(e);
      });
    } else {
      teamEmps.forEach(e => {
        if (!(form.assigned_employees || []).includes(e.id)) toggleEmployee(e);
      });
    }
  };

  const toggleSubtask = async (sub) => {
    if (sub._temp) {
      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, done: !s.done } : s));
    } else {
      await base44.entities.TaskSubtask.update(sub.id, { done: !sub.done });
      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, done: !s.done } : s));
    }
  };

  const deleteSubtask = async (sub) => {
    if (!sub._temp) {
      try { await base44.entities.TaskSubtask.delete(sub.id); } catch {}
    }
    setSubtasks(prev => prev.filter(s => s.id !== sub.id));
  };

  const editSubtaskTitle = async (sub, newTitle) => {
    const title = newTitle.trim();
    if (!title) return;
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, title } : s));
    if (!sub._temp) {
      try { await base44.entities.TaskSubtask.update(sub.id, { title }); } catch {}
    }
  };

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks(prev => [...prev, { _temp: true, id: `tmp_${Date.now()}`, title, done: false }]);
    setNewSubtask("");
  };

  const handleSave = () => {
    // Sync assigned_team_ids/names from the teams of currently selected employees
    const selectedEmps = (form.assigned_employees || [])
      .map(id => employees.find(e => e.id === id))
      .filter(Boolean);
    const syncedTeamIds = [...new Set(selectedEmps.map(e => e.team_id).filter(Boolean))];
    const syncedTeamNames = syncedTeamIds
      .map(tid => teams.find(t => t.id === tid)?.name)
      .filter(Boolean);
    const formToSave = {
      ...form,
      assigned_team_ids: syncedTeamIds,
      assigned_team_names: syncedTeamNames,
    };
    // Optimistic: close immediately + update parent state without full reload
    onSaved({ ...task, ...formToSave });
    onClose();
    // Fire save in background — realtime subscription will confirm the update
    (async () => {
      try {
        const tempSubs = subtasks.filter(s => s._temp);
        await Promise.all([
          base44.entities.Task.update(task.id, formToSave),
          tempSubs.length > 0
            ? base44.entities.TaskSubtask.bulkCreate(tempSubs.map(s => ({ task_id: task.id, title: s.title, done: s.done })))
            : Promise.resolve(),
        ]);
      } catch (e) {
        console.error("Quick edit save error:", e);
      }
    })();
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Edit Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Reference + Asset (read-only) */}
          {(task.reference || form.asset_name) && (
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-muted/40 border border-border">
              {task.reference && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                  <Hash className="w-3 h-3" />
                  {task.reference}
                </span>
              )}
              {form.asset_name && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Box className="w-3 h-3" />
                  {form.asset_name}
                </span>
              )}
            </div>
          )}

          {/* Customer */}
          <div className="space-y-1">
            <Label>Customer</Label>
            {form.contact_id ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30">
                <span className="text-sm font-medium text-foreground">{form.contact_name}</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, contact_id: "", contact_name: "" }))}
                  className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Search customer..." value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); setShowContacts(true); }}
                  onFocus={() => setShowContacts(true)} onBlur={() => setTimeout(() => setShowContacts(false), 150)} />
                {showContacts && filteredContacts.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.slice(0, 10).map(c => (
                      <button key={c.id} type="button" onMouseDown={() => handleContactSelect(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors">
                        <p className="text-sm font-medium text-foreground">{c.company || c.full_name}</p>
                        {c.company && c.full_name && <p className="text-xs text-muted-foreground">{c.full_name}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project */}
          <div className="space-y-1">
            <Label>Project</Label>
            {form.project_id ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30">
                <span className="text-sm font-medium text-foreground">{form.project_name}</span>
                {!form.work_order_id && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, project_id: "", project_name: "" }))}
                    className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Search project..." value={projectSearch}
                  onChange={e => { setProjectSearch(e.target.value); setShowProjects(true); }}
                  onFocus={() => setShowProjects(true)} onBlur={() => setTimeout(() => setShowProjects(false), 150)} />
                {showProjects && filteredProjects.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredProjects.slice(0, 10).map(p => (
                      <button key={p.id} type="button" onMouseDown={() => handleProjectSelect(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors">
                        <p className="text-sm font-medium text-foreground">{p.name}</p>
                        {p.reference && <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Work Order */}
          <div className="space-y-1">
            <Label>Work Order</Label>
            {form.work_order_id ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30">
                <span className="text-sm font-medium text-foreground">{form.work_order_name}</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, work_order_id: "", work_order_name: "" }))}
                  className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Search work order..." value={woSearch}
                  onChange={e => { setWoSearch(e.target.value); setShowWO(true); }}
                  onFocus={() => setShowWO(true)} onBlur={() => setTimeout(() => setShowWO(false), 150)} />
                {showWO && filteredWO.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredWO.slice(0, 10).map(w => (
                      <button key={w.id} type="button" onMouseDown={() => handleWOSelect(w)}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors">
                        <p className="text-sm font-medium text-foreground">{w.title}</p>
                        {w.reference && <p className="text-xs text-muted-foreground font-mono">{w.reference}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Title + Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => set("title", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Description</Label>
              <Button type="button" variant="outline" size="sm" onClick={generateDescription} disabled={generatingDesc || !form.title}
                className="h-7 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/5">
                {generatingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generatingDesc ? "Generating..." : "AI Generate"}
              </Button>
            </div>
            <Textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Add description..."
              className="text-sm resize-none h-20"
            />
          </div>

          {/* Instructions / Notes */}
          <div className="space-y-1">
            <Label>Instructions / Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Add instructions or notes..."
              className="text-sm resize-none h-20"
            />
          </div>

          {/* Subtasks */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Subtasks / Instructions
              {subtasks.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {subtasks.filter(s => s.done).length}/{subtasks.length}
                </span>
              )}
            </Label>
            {subtasks.length > 0 && (
              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(subtasks.filter(s => s.done).length / subtasks.length) * 100}%` }} />
              </div>
            )}
            <div className="space-y-1">
              {subtasks.map(sub => (
                <div key={sub.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border group transition-colors ${sub.done ? "bg-emerald-50 border-emerald-100" : "bg-card border-border hover:bg-muted/30"}`}>
                  <button type="button" onClick={() => toggleSubtask(sub)} className="shrink-0">
                    {sub.done
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <Circle className="w-4 h-4 text-muted-foreground/40" />}
                  </button>
                  <input
                    type="text"
                    defaultValue={sub.title}
                    onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== sub.title) editSubtaskTitle(sub, e.target.value); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }}
                    className={`flex-1 text-sm bg-transparent outline-none focus:bg-background/50 focus:ring-1 focus:ring-primary/30 rounded px-1 py-0.5 ${sub.done ? "line-through text-muted-foreground" : "text-foreground"}`}
                  />
                  <button type="button"
                    onClick={() => deleteSubtask(sub)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                placeholder="Add subtask..." className="flex-1 text-sm" />
              <Button type="button" size="sm" variant="outline" onClick={addSubtask} disabled={!newSubtask.trim()}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Planning date */}
          <div className="space-y-1">
            <Label>Planning Date</Label>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant={form.planning_date === TODAY ? "default" : "outline"}
                className="h-8 text-xs" onClick={() => set("planning_date", TODAY)}>Today</Button>
              <Button type="button" size="sm" variant={form.planning_date === TOMORROW ? "default" : "outline"}
                className="h-8 text-xs" onClick={() => set("planning_date", TOMORROW)}>Tomorrow</Button>
              <Input type="date" value={form.planning_date} onChange={e => set("planning_date", e.target.value)} className="flex-1" />
            </div>
          </div>

          {/* Shifts + Time slot */}
          <div className="space-y-1.5">
            <Label>Time Slot</Label>
            {shifts.length > 0 && (
              <div className="flex flex-nowrap gap-1.5 mb-2 overflow-x-auto">
                {[...shifts].sort((a, b) => (a.time_in || "").localeCompare(b.time_in || "")).map(sh => (
                  <button key={sh.id} type="button"
                    onClick={() => setForm(f => ({ ...f, planning_time_in: sh.time_in, planning_time_out: sh.time_out }))}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      form.planning_time_in === sh.time_in && form.planning_time_out === sh.time_out
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    {sh.name} ({sh.time_in}–{sh.time_out})
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time In</Label>
                <Input type="time" value={form.planning_time_in} onChange={e => set("planning_time_in", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time Out</Label>
                <Input type="time" value={form.planning_time_out} onChange={e => set("planning_time_out", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Teams & Employees */}
          <div className="space-y-1.5">
            <Label>Teams & Employees</Label>
            {(form.assigned_employees || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.assigned_employee_names || []).map((name, i) => {
                  const emp = employees.find(e => e.id === (form.assigned_employees || [])[i]);
                  return (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                      {emp?.avatar_url
                        ? <img src={emp.avatar_url} className="w-4 h-4 rounded-full object-cover" alt="" />
                        : <div className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-[8px] font-bold">{name[0]}</div>
                      }
                      {name}
                      <button type="button" onClick={() => toggleEmployee({ id: (form.assigned_employees || [])[i], full_name: name })}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-44 overflow-y-auto">
              {teams.length === 0 && (
                <p className="text-xs text-muted-foreground p-2 text-center italic">No teams found</p>
              )}
              {teams.map(team => {
                const teamEmps = employees.filter(e => e.team_id === team.id);
                const selectedInTeam = teamEmps.filter(e => (form.assigned_employees || []).includes(e.id));
                const allSelected = teamEmps.length > 0 && selectedInTeam.length === teamEmps.length;
                const someSelected = selectedInTeam.length > 0 && !allSelected;
                const isExpanded = expandedTeams[team.id] !== false;

                return (
                  <div key={team.id} className={allSelected ? "bg-primary/5" : someSelected ? "bg-primary/3" : "bg-card"}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedTeams(p => ({ ...p, [team.id]: !isExpanded }))}>
                      <input type="checkbox" checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={e => { e.stopPropagation(); toggleAllInTeam(team); }}
                        onClick={e => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded accent-primary cursor-pointer" />
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                        style={{ backgroundColor: team.color || "#6366f1" }}>
                        {(team.name || "T")[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold flex-1 uppercase tracking-wide">{team.name}</span>
                      {selectedInTeam.length > 0 && (
                        <span className="text-[10px] text-primary font-medium">{selectedInTeam.length}/{teamEmps.length}</span>
                      )}
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    {isExpanded && teamEmps.map(emp => {
                      const isChecked = (form.assigned_employees || []).includes(emp.id);
                      const isLeader = team.leader_id === emp.id;
                      return (
                        <label key={emp.id} className={`flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-muted/30 transition-colors ${isChecked ? "bg-primary/5" : ""}`}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleEmployee(emp)}
                            className="w-3.5 h-3.5 rounded accent-primary cursor-pointer" />
                          {emp.avatar_url
                            ? <img src={emp.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                            : <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">{emp.full_name[0]}</div>
                          }
                          <span className="text-xs flex-1">{emp.full_name}</span>
                          {isLeader && <Crown className="w-2.5 h-2.5 text-amber-500" />}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task history */}
          {task?.id && (
            <TaskHistoryPanel taskId={task.id} taskReference={task.reference} refreshTrigger={0} />
          )}

          <div className="flex justify-between gap-2 pt-1">
            {task?.id && onDelete ? (
              <Button variant="destructive" onClick={() => onDelete(task)} disabled={saving}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}