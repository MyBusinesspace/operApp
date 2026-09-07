import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { Search, X, Clock, Users, User, Plus, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp, GripVertical, Crown, AlertTriangle, AlertCircle, ClipboardList, RefreshCw, ImagePlus, Loader2, ChevronDown as DropdownArrow, Sparkles, FileText } from "lucide-react";
import TaskHistoryPanel from "@/components/tasks/TaskHistoryPanel.jsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const PLACEHOLDERS = [
  { label: "Month", value: "[Month]", example: "June" },
  { label: "Week", value: "[Week]", example: "W25" },
  { label: "Year", value: "[Year]", example: "2026" },
  { label: "Month Year", value: "[MonthYear]", example: "June 2026" },
  { label: "Week Year", value: "[WeekYear]", example: "W25-2026" },
];

function previewTitle(title) {
  if (!title) return "";
  const now = new Date();
  const month = now.toLocaleString("en", { month: "long" });
  const year = now.getFullYear();
  const week = `W${Math.ceil(now.getDate() / 7)}`;
  return title
    .replace(/\[Month\]/g, month)
    .replace(/\[Week\]/g, week)
    .replace(/\[Year\]/g, year)
    .replace(/\[MonthYear\]/g, `${month} ${year}`)
    .replace(/\[WeekYear\]/g, `${week}-${year}`);
}
import { Switch } from "@/components/ui/switch";
import { format, addDays } from "date-fns";
import { getEffectiveStatus } from "@/lib/taskStatus";
import { usePermission } from "@/hooks/usePermissions";
import { useToast } from "@/components/ui/use-toast";

const TODAY = format(new Date(), "yyyy-MM-dd");
const TOMORROW = format(addDays(new Date(), 1), "yyyy-MM-dd");

const EMPTY = {
  reference: "", title: "", description: "", status: "Queued", category: "", priority: "Medium",
  work_order_id: "", work_order_name: "", project_id: "", project_name: "",
  contact_id: "", contact_name: "",
  asset_id: "", asset_name: "",
  assigned_users: [], assigned_user_names: [],
  assigned_employees: [], assigned_employee_names: [],
  assigned_team_ids: [], assigned_team_names: [],
  planning_date: "", planning_time_in: "", planning_time_out: "", notes: "",
  is_recurring: false, recurrence_frequency: "monthly", recurrence_end_date: "", recurrence_day_of_month: null,
};

import { generateTaskReference } from "@/lib/taskReference";
import { logTaskHistory } from "@/components/tasks/TaskHistoryPanel";
import { computeChanges } from "@/lib/changeLog";

export default function TaskFormModal({ open, onClose, onSave, onSaved, task, workOrders = [], initialDate }) {
  const { allowed: canEditStatus, loading: loadingPerm } = usePermission("tasks", "can_edit");
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtask, setNewSubtask] = useState("");
  const subtaskInputRef = useRef();
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [assets, setAssets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjects, setShowProjects] = useState(false);
  const [woSearch, setWoSearch] = useState("");
  const [showWO, setShowWO] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [showAssets, setShowAssets] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [showUsers, setShowUsers] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState({});
  const [generatedDates, setGeneratedDates] = useState(new Set());
  const [generatedDatesLoaded, setGeneratedDatesLoaded] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [existingTasks, setExistingTasks] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const generateDescription = async () => {
    setGeneratingDesc(true);
    try {
      const project = projects.find(p => p.id === form.project_id);
      const asset = assets.find(a => a.id === form.asset_id);
      const contact = contacts.find(c => c.id === form.contact_id);

      const contextParts = [];
      if (form.title) contextParts.push(`Task title: ${form.title}`);
      if (project?.name) contextParts.push(`Project: ${project.name}`);
      if (project?.type) contextParts.push(`Project type: ${project.type}`);
      if (project?.location) contextParts.push(`Project location: ${project.location}`);
      if (form.work_order_name) contextParts.push(`Work order: ${form.work_order_name}`);
      if (asset?.name) contextParts.push(`Asset: ${asset.name}`);
      if (asset?.category) contextParts.push(`Asset category: ${asset.category}`);
      if (asset?.manufacturer) contextParts.push(`Asset manufacturer: ${asset.manufacturer}`);
      if (asset?.model) contextParts.push(`Asset model: ${asset.model}`);
      if (contact?.full_name) contextParts.push(`Client: ${contact.full_name}`);
      if (form.priority) contextParts.push(`Priority: ${form.priority}`);

      const prompt = `You are a field operations assistant for a maintenance/service company. Based on the following task context, write a clear, professional task description (2-3 sentences) explaining what needs to be done. Keep it concise and actionable, in English. Do not add bullet points or headings — just plain text.

Context:
${contextParts.join("\n")}

Write the description:`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      const text = typeof result === "string" ? result : result?.text || result?.response || "";
      if (text) setForm(f => ({ ...f, description: text }));
    } catch {
      // silently fail
    }
    setGeneratingDesc(false);
  };

  useEffect(() => {
    if (open) {
      if (task?.id) {
        setForm({ ...EMPTY, ...task });
        // Load generated child tasks to know which dates are already sent
        if (task.is_recurring && task.id) {
          setGeneratedDatesLoaded(false);
          base44.entities.Task.filter({ recurrence_template_id: task.id }).catch(() => []).then(children => {
            const dates = new Set(children.map(c => c.planning_date).filter(Boolean));
            setGeneratedDates(dates);
            setGeneratedDatesLoaded(true);
          });
        } else {
          setGeneratedDates(new Set());
          setGeneratedDatesLoaded(true);
        }
      } else {
        setGeneratedDates(new Set());
        setGeneratedDatesLoaded(true);
        // If task data was passed without an id (e.g. cloning from a template),
        // pre-populate the form with those fields — it's still a NEW task.
        const templateData = task || {};
        setForm({ ...EMPTY, ...templateData, planning_date: initialDate || "", status: "Queued" });

        generateTaskReference().then(ref => setForm(f => ({ ...f, reference: ref })));
      }
      setWoSearch(""); setUserSearch(""); setAssetSearch(""); setContactSearch(""); setProjectSearch("");
      setExpandedTeams({});
      setNewSubtask("");
      // Load existing subtasks if editing, or clone from template data
      if (task?.id) {
        base44.entities.TaskSubtask.filter({ task_id: task.id }).catch(() => []).then(subs => setSubtasks([...subs].sort((a, b) => {
          const sa = a.sort_order ?? 0;
          const sb = b.sort_order ?? 0;
          if (sa !== sb) return sa - sb;
          return (a.created_date || "").localeCompare(b.created_date || "") || (a.id || "").localeCompare(b.id || "");
        })));
      } else if (task?._template_subtasks?.length > 0) {
        // Clone template subtasks as temp (unsaved) items for the new task
        setSubtasks(task._template_subtasks.map(s => ({ _temp: true, id: `tmp_${Date.now()}_${s.id}`, title: s.title, done: false })));
      } else {
        setSubtasks([]);
      }
      Promise.all([
        base44.entities.User?.list("full_name", 200).catch(() => []),
        base44.entities.TaskCategory.list("name", 100).catch(() => []),
        base44.entities.TaskStatus.list("name", 100).catch(() => []),
        base44.entities.TaskShift.list("name", 100).catch(() => []),
        base44.entities.Asset.list("name", 500).catch(() => []),
        base44.entities.Employee.list("full_name", 500).catch(() => []),
        base44.entities.Team.list("name", 200).catch(() => []),
        base44.entities.Contact.list("full_name", 200).catch(() => []),
        base44.entities.Project.list("name", 200).catch(() => []),
      ]).then(([u, c, s, sh, a, emp, tm, ct, pr]) => { setUsers(u); setCategories(c); setStatuses(s); setShifts(sh); setAssets(a); setEmployees(emp); setTeams(tm); setContacts(ct); setProjects(pr); });
    }
  }, [open, task]);

  // Fetch existing Scheduled / Not Completed tasks for the selected project (+ optional WO)
  // so the user can see if the task they want to create already exists (new tasks only).
  useEffect(() => {
    if (task?.id) { setExistingTasks([]); return; }
    if (!form.project_id) { setExistingTasks([]); return; }
    setLoadingExisting(true);
    const fetchExisting = async () => {
      try {
        const byProject = await base44.entities.Task.filter(
          { project_id: form.project_id },
          "-planning_date",
          200
        ).catch(() => []);
        let filtered = (byProject || []).filter(
          t => t.status === "Scheduled" || t.status === "Not Completed"
        );
        if (form.work_order_id) {
          filtered = filtered.filter(t => t.work_order_id === form.work_order_id);
        }
        setExistingTasks(filtered);
      } catch {
        setExistingTasks([]);
      } finally {
        setLoadingExisting(false);
      }
    };
    fetchExisting();
  }, [task?.id, form.project_id, form.work_order_id]);

  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v };
    // Auto-advance to Scheduled when a planning date is set on a Queued task
    if (k === "planning_date" && v && f.status === "Queued") {
      updated.status = "Scheduled";
    }
    return updated;
  });

  const applyShift = (shift) => {
    setForm(f => ({ ...f, planning_time_in: shift.time_in, planning_time_out: shift.time_out }));
  };

  const handleWOSelect = (wo) => {
    setForm(f => ({
      ...f,
      work_order_id: wo.id, work_order_name: wo.title,
      project_id: wo.project_id || f.project_id,
      project_name: wo.project_name || f.project_name,
      // Always use the WO's linked contact (it is the authoritative source)
      contact_id: wo.contact_id || f.contact_id || "",
      contact_name: wo.contact_name || f.contact_name || "",
      // Auto-fill asset from WO if not already set
      asset_id: f.asset_id || wo.asset_id || "",
      asset_name: f.asset_name || wo.asset_name || "",
    }));
    setShowWO(false); setWoSearch("");
  };

  // Filtered Work Orders: scoped by project → contact → asset, then search
  const filteredWOList = workOrders.filter(w => {
    if (form.project_id && w.project_id !== form.project_id) return false;
    if (form.contact_id && w.contact_id !== form.contact_id) return false;
    if (form.asset_id && w.asset_id !== form.asset_id) return false;
    const q = woSearch.toLowerCase();
    return !q || w.title?.toLowerCase().includes(q) || w.reference?.toLowerCase().includes(q);
  });

  // Filtered Assets: scoped by WO → project → contact, then search
  const filteredAssets = assets.filter(a => {
    if (form.work_order_id) {
      const wo = workOrders.find(w => w.id === form.work_order_id);
      return wo?.asset_id === a.id;
    }
    if (form.project_id) {
      // Only assets that appear in WOs linked to this project
      const projectAssetIds = new Set(workOrders.filter(w => w.project_id === form.project_id && w.asset_id).map(w => w.asset_id));
      if (projectAssetIds.size > 0 && !projectAssetIds.has(a.id)) return false;
    }
    if (form.contact_id) {
      return a.contact_id === form.contact_id;
    }
    const q = assetSearch.toLowerCase();
    return !q || a.name?.toLowerCase().includes(q) || a.serial_number?.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q);
  });

  const toggleUser = (u) => {
    setForm(f => {
      const ids = f.assigned_users || [];
      const names = f.assigned_user_names || [];
      if (ids.includes(u.id)) {
        return { ...f, assigned_users: ids.filter(x => x !== u.id), assigned_user_names: names.filter(x => x !== u.full_name) };
      }
      return { ...f, assigned_users: [...ids, u.id], assigned_user_names: [...names, u.full_name] };
    });
  };

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

  const toggleTeam = (team) => {
    setForm(f => {
      const ids = f.assigned_team_ids || [];
      const names = f.assigned_team_names || [];
      if (ids.includes(team.id)) {
        return { ...f, assigned_team_ids: ids.filter(x => x !== team.id), assigned_team_names: names.filter(x => x !== team.name) };
      }
      return { ...f, assigned_team_ids: [...ids, team.id], assigned_team_names: [...names, team.name] };
    });
  };

  const toggleExpandTeam = (teamId) => setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks(prev => [...prev, { _temp: true, id: `tmp_${Date.now()}`, title, done: false }]);
    setNewSubtask("");
    subtaskInputRef.current?.focus();
  };

  const toggleSubtask = async (sub) => {
    const next = !sub.done;
    // Optimistic update so the checkbox reacts instantly
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, done: next } : s));
    if (sub._temp) return;
    // Persist with a short retry on rate-limit (429); revert + notify on hard failure
    let attempt = 0;
    while (attempt < 3) {
      try {
        await base44.entities.TaskSubtask.update(sub.id, { done: next });
        return;
      } catch (err) {
        attempt++;
        const status = err?.status || err?.statusCode || err?.response?.status;
        const isRateLimit = status === 429 || /429/.test(String(err?.message || ""));
        if (isRateLimit && attempt < 3) {
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
        setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, done: !next } : s));
        toast({
          variant: "destructive",
          title: "Couldn't update subtask",
          description: isRateLimit ? "Server is busy — please try again in a moment." : "An unexpected error occurred.",
        });
        return;
      }
    }
  };

  const deleteSubtask = async (sub) => {
    if (!sub._temp) await base44.entities.TaskSubtask.delete(sub.id);
    setSubtasks(prev => prev.filter(s => s.id !== sub.id));
  };

  const onDragEndSubtask = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const reordered = [...subtasks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withOrder = reordered.map((s, i) => ({ ...s, sort_order: i }));
    setSubtasks(withOrder);
    // Persist new sort_order for saved subtasks whose order changed
    withOrder.forEach((s) => {
      const orig = subtasks.find(x => x.id === s.id);
      if (!s._temp && orig && (orig.sort_order ?? 0) !== s.sort_order) {
        base44.entities.TaskSubtask.update(s.id, { sort_order: s.sort_order }).catch(() => {});
      }
    });
  };

  const handleSubmit = async (e, options = {}) => {
    e.preventDefault();
    setSaving(true);
    let submitForm = { ...form };
    // A task must be linked to at least one of: customer, project, or work order
    if (!submitForm.contact_id && !submitForm.project_id && !submitForm.work_order_id) {
      toast({
        variant: "destructive",
        title: "Link required",
        description: "Please select a customer, project, or work order before saving the task.",
      });
      setSaving(false);
      return;
    }
    // Remove internal-only fields before saving
    delete submitForm._template_subtasks;

    // Sync assigned_team_ids/names from the teams of currently selected employees
    const selectedEmps = (submitForm.assigned_employees || [])
      .map(id => employees.find(e => e.id === id))
      .filter(Boolean);
    const syncedTeamIds = [...new Set(selectedEmps.map(e => e.team_id).filter(Boolean))];
    const syncedTeamNames = syncedTeamIds
      .map(tid => teams.find(t => t.id === tid)?.name)
      .filter(Boolean);
    submitForm.assigned_team_ids = syncedTeamIds;
    submitForm.assigned_team_names = syncedTeamNames;

    // Ensure numeric recurrence fields are null (not empty string) when unset
    if (submitForm.recurrence_day_of_month === "" || submitForm.recurrence_day_of_month === undefined) {
      submitForm.recurrence_day_of_month = null;
    }

    // Save as Draft / Template overrides auto status logic
    if (options.asDraft) {
      // Only force Queued/Scheduled for editable statuses — never revert
      // Completed / Not Completed / Archived / Template back to Queued/Scheduled
      const cur = submitForm.status;
      if (cur !== "Completed" && cur !== "Not Completed" && cur !== "Active" && cur !== "Archived" && cur !== "Template") {
        submitForm.status = submitForm.planning_date ? "Scheduled" : "Queued";
      }
    } else if (options.asTemplate) {
      // Copy as Template: create a NEW Template task, leaving the original untouched
      submitForm.status = "Template";
      delete submitForm.reference;
    } else {
      const hasDate = !!submitForm.planning_date;

      // Queued → Scheduled when a planning date is set (time is optional)
      if (submitForm.status === "Queued" && hasDate) {
        submitForm.status = "Scheduled";
      }
      // Scheduled → Queued if the date is removed
      if (submitForm.status === "Scheduled" && !hasDate) {
        submitForm.status = "Queued";
      }
      // Not Completed tasks always stay Not Completed — they are never reverted to Scheduled or Queued by editing
    }

    // Safety net: ensure a reference exists before saving (templates intentionally
    // have no reference). Covers the race where the async generateTaskReference
    // on modal open hadn't resolved yet, or returned empty before the fix.
    if (!options.asTemplate && !submitForm.reference) {
      submitForm.reference = await generateTaskReference();
    }

    let savedTask;
    if (onSave) {
      savedTask = await onSave(submitForm, options);
    } else {
      // onSaved mode: create/update directly
      // Copy as Template always creates a new task, leaving the original untouched
      const wasEditing = task?.id && !options.asTemplate;
      if (wasEditing) {
        savedTask = await base44.entities.Task.update(task.id, submitForm);
      } else {
        savedTask = await base44.entities.Task.create(submitForm);
      }
      // Log history for standalone (onSaved) mode — parents using onSave log themselves
      const userName = currentUser?.full_name || currentUser?.email || "Unknown";
      if (!options.asTemplate) {
        if (wasEditing && task) {
          if (task.status !== submitForm.status) {
            await logTaskHistory({
              taskId: task.id, taskReference: submitForm.reference || task.reference || "",
              action: "Status Changed",
              detail: `Status changed from ${task.status || "Queued"} to ${submitForm.status}`,
              userName,
            }).catch(() => {});
          } else {
            const taskChanges = computeChanges(task, submitForm, [
              ["title", "Title"], ["description", "Description"], ["category", "Category"],
              ["work_order_name", "Work Order"], ["project_name", "Project"],
              ["contact_name", "Client"], ["asset_name", "Asset"],
              ["assigned_employee_names", "Workers"], ["assigned_user_names", "Users"],
              ["planning_date", "Planning Date"], ["planning_time_in", "Time In"],
              ["planning_time_out", "Time Out"], ["priority", "Priority"],
              ["notes", "Notes"], ["location_address", "Location"],
            ]);
            await logTaskHistory({
              taskId: task.id, taskReference: submitForm.reference || task.reference || "",
              action: "Updated",
              detail: taskChanges.length > 0 ? taskChanges.join(" · ") : "Task details updated",
              userName,
            }).catch(() => {});
          }
        } else if (savedTask?.id) {
          await logTaskHistory({
            taskId: savedTask.id, taskReference: savedTask.reference || "",
            action: "Created",
            detail: `Task ${savedTask.reference || savedTask.title} created`,
            userName,
          }).catch(() => {});
        }
      }
    }
    // For new tasks, save the temp subtasks after creation
    const taskId = options.asTemplate ? savedTask?.id : (task?.id || savedTask?.id);
    // If status was auto-updated, reflect it locally
    if (submitForm.status !== form.status) setForm(f => ({ ...f, status: submitForm.status }));
    if (taskId) {
      const tempSubs = subtasks.filter(s => s._temp);
      for (const s of tempSubs) {
        await base44.entities.TaskSubtask.create({ task_id: taskId, title: s.title, done: s.done, sort_order: s.sort_order ?? 0 });
      }
    }
    setSaving(false);
    if (onSaved) onSaved(savedTask);
    return { savedTask, submitForm };
  };

  // Save the task, then spin up a draft Quote pre-filled from it and open it for editing.
  const handleSaveAndQuote = async (e) => {
    e.preventDefault();
    if (!form.contact_id) return;
    const { savedTask, submitForm: sf } = await handleSubmit(e, { asDraft: true });
    const taskId = task?.id || savedTask?.id;
    if (!taskId) return;
    try {
      const quote = await base44.entities.Quote.create({
        status: "Draft",
        contact_id: sf.contact_id,
        contact_name: sf.contact_name,
        project_id: sf.project_id,
        project_name: sf.project_name,
        work_order_id: sf.work_order_id,
        work_order_name: sf.work_order_name,
        task_ids: [taskId],
        task_names: [sf.title],
        task_references: [sf.reference || ""],
        title: sf.title,
        doc_summary: sf.description || "",
        issue_date: new Date().toISOString().slice(0, 10),
        currency: "AED",
        line_items: [],
        annex_photos: (sf.photos || []).map(p => ({ url: p.url, caption: p.caption || "" })),
      });
      navigate(`/sales/quotes?open=true&id=${quote.id}`);
    } catch (err) {
      alert("Task saved, but the quote could not be created: " + (err?.message || err));
    }
  };

  // filteredWO alias for the search-aware list
  const filteredWO = filteredWOList.filter(w => {
    const q = woSearch.toLowerCase();
    return !q || w.title?.toLowerCase().includes(q) || w.reference?.toLowerCase().includes(q);
  });

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  // Compute the effective status for live display — reflects what the status
  // will be after saving, based on current form values.
  const displayStatus = getEffectiveStatus(form);

  const statusOptions = statuses.length > 0 ? statuses.map(s => s.name) : ["Queued","Scheduled","Not Completed","Completed"];
  const categoryOptions = categories.map(c => c.name);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task?.id ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {/* Step 1 — Link Project / Company / Work Order (required first to avoid duplicates) */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                1 · Select a project / customer first to check for existing tasks
              </p>
              <span className="text-[10px] font-medium text-destructive uppercase tracking-wide">
                At least 1 required
              </span>
            </div>

            {/* Contact */}
            <div className="space-y-1.5">
              <Label>Linked Company</Label>
              {form.contact_id ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30">
                  <span className="text-sm font-medium text-foreground">{form.contact_name}</span>
                  {/* Only allow removing contact if no WO is linked (WO owns the contact) */}
                  {!form.work_order_id && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, contact_id: "", contact_name: "" }))}
                      className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input className="pl-9" placeholder="Search contact..." value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setShowContacts(true); }}
                    onFocus={() => setShowContacts(true)} onBlur={() => setTimeout(() => setShowContacts(false), 150)} />
                  {showContacts && (() => {
                    let pool = contacts;
                    if (form.project_id) {
                      const ids = [...new Set(workOrders.filter(w => w.project_id === form.project_id && w.contact_id).map(w => w.contact_id))];
                      if (ids.length > 0) pool = contacts.filter(c => ids.includes(c.id));
                    } else if (form.asset_id) {
                      const ids = [...new Set(workOrders.filter(w => w.asset_id === form.asset_id && w.contact_id).map(w => w.contact_id))];
                      if (ids.length > 0) pool = contacts.filter(c => ids.includes(c.id));
                    }
                    const q = contactSearch.toLowerCase();
                    const filtered = pool.filter(c => !q || c.full_name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q));
                    if (filtered.length === 0) return null;
                    return (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filtered.slice(0, 10).map(c => (
                          <button key={c.id} type="button" onMouseDown={() => { setForm(f => ({ ...f, contact_id: c.id, contact_name: c.company || c.full_name })); setShowContacts(false); setContactSearch(""); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors">
                            <p className="text-sm font-medium text-foreground">{c.company || c.full_name}</p>
                            {c.company && c.full_name && <p className="text-xs text-muted-foreground">{c.full_name}</p>}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Linked Project */}
            <div className="space-y-1.5">
              <Label>Linked Project</Label>
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
                  {showProjects && (() => {
                    const q = projectSearch.toLowerCase();
                    let pool = projects;
                    if (form.contact_id) {
                      pool = projects.filter(p => p.contact_id === form.contact_id);
                    }
                    const filtered = pool.filter(p => !q || p.name?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q));
                    if (filtered.length === 0) return null;
                    return (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filtered.slice(0, 10).map(p => (
                          <button key={p.id} type="button" onMouseDown={() => {
                          setForm(f => ({
                            ...f,
                            project_id: p.id,
                            project_name: p.name,
                            contact_id: p.contact_id || f.contact_id || "",
                            contact_name: p.contact_name || f.contact_name || "",
                            contact_phone: p.contact_phone || f.contact_phone || "",
                            contact_email: p.contact_email || f.contact_email || "",
                          }));
                          setShowProjects(false); setProjectSearch("");
                        }}
                            className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors">
                            <p className="text-sm font-medium text-foreground">{p.name}</p>
                            {p.reference && <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Work Order */}
            <div className="space-y-1.5">
              <Label>Linked Work Order</Label>
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

            {/* Existing Scheduled / Not Completed tasks for this selection (new tasks only) */}
            {!task?.id && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Existing tasks
                  <span className="text-xs font-normal text-muted-foreground">
                    ({loadingExisting ? "loading…" : form.project_id ? `${existingTasks.length} scheduled / not completed` : "select a project first"})
                  </span>
                </Label>
                {loadingExisting ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading existing tasks…
                  </div>
                ) : existingTasks.length > 0 ? (
                  <div className="rounded-md border border-border bg-background max-h-44 overflow-y-auto divide-y divide-border">
                    {existingTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                        <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{t.title}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{t.reference}{t.planning_date ? ` · ${t.planning_date}` : ""}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          t.status === "Scheduled" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                        }`}>{t.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-md border border-dashed border-border bg-background">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {form.project_id ? "No existing Scheduled / Not Completed tasks for this selection." : "Select a project to see existing tasks here."}
                  </div>
                )}
                {existingTasks.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    If the task you need is already listed above, consider using it instead of creating a duplicate.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Title + Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!form.is_recurring && (
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">{form.reference || "—"}</div>
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Title *</Label>
                {form.is_recurring && (
                  <div className="relative group">
                    <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline">
                      Insert Placeholder <ChevronDown className="w-3 h-3" />
                    </button>
                    <div className="absolute right-0 top-5 z-50 hidden group-hover:block bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
                      {PLACEHOLDERS.map(p => (
                        <button key={p.value} type="button"
                          onMouseDown={() => set("title", (form.title || "") + p.value)}
                          className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-muted/50 transition-colors flex items-center justify-between gap-2">
                          <span>{p.label}</span>
                          <span className="text-xs text-muted-foreground">{p.example}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Input value={form.title} onChange={e => set("title", e.target.value)} required
                placeholder={form.is_recurring ? "e.g. EMC Maintenance [Month] [Year]" : ""} />
              {form.is_recurring && form.title && form.title.includes("[") && (
                <p className="text-xs text-muted-foreground">Preview: <span className="font-medium text-foreground">{previewTitle(form.title)}</span></p>
              )}
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
                <Button type="button" variant="outline" size="sm" onClick={generateDescription} disabled={generatingDesc || !form.title}
                  className="h-7 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/5">
                  {generatingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generatingDesc ? "Generating..." : "AI Generate"}
                </Button>
              </div>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
            </div>

            {/* Subtasks / Instructions */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  Instructions / Subtasks
                  <span className="text-xs font-normal text-muted-foreground">(tick items to mark done)</span>
                  {subtasks.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {subtasks.filter(s => s.done).length}/{subtasks.length}
                    </span>
                  )}
                </Label>
              </div>
              {subtasks.length > 0 && (
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${subtasks.length ? (subtasks.filter(s => s.done).length / subtasks.length) * 100 : 0}%` }} />
                </div>
              )}
              <DragDropContext onDragEnd={onDragEndSubtask}>
                <Droppable droppableId="subtasks">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                      {subtasks.map((sub, index) => (
                        <Draggable key={sub.id} draggableId={sub.id} index={index}>
                          {(p) => (
                            <div ref={p.innerRef} {...p.draggableProps}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors group
                                ${sub.done ? "bg-emerald-50 border-emerald-100" : "bg-card border-border hover:bg-muted/30"}`}>
                              <span {...p.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none">
                                <GripVertical className="w-4 h-4" />
                              </span>
                              <button type="button" onClick={() => toggleSubtask(sub)} className="flex items-center gap-2.5 flex-1 text-left">
                                {sub.done
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                  : <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                                <span className={`flex-1 text-sm ${sub.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                  {sub.title}
                                </span>
                              </button>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); deleteSubtask(sub); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <div className="flex gap-2">
                <Input
                  ref={subtaskInputRef}
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                  placeholder="Add instruction or subtask..."
                  className="flex-1 text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={addSubtask} disabled={!newSubtask.trim()}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Status — read-only in create/edit; only changed via rules or Tasks table */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/40 text-sm">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  displayStatus === "Completed" ? "bg-emerald-100 text-emerald-700" :
                  (displayStatus === "Not Completed" || displayStatus === "Active") ? "bg-orange-100 text-orange-700" :
                  displayStatus === "Scheduled" ? "bg-violet-100 text-violet-700" :
                  "bg-amber-100 text-amber-700"
                }`}>{displayStatus || "Queued"}</span>
                <span className="text-xs text-muted-foreground">
                  {displayStatus === "Queued" && "Becomes Scheduled once a date and time slot are set"}
                  {displayStatus === "Scheduled" && "Becomes Active when the employee clocks in"}
                  {(displayStatus === "Not Completed" || displayStatus === "Active") && "Task is Not Completed. It can be moved to the Planner if a date is set. Can only transition to Completed."}
                  {displayStatus === "Completed" && "Task has been completed"}
                </span>
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Low","Medium","High","Urgent"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Category</Label>
              {categoryOptions.length > 0 ? (
                <Select value={form.category} onValueChange={v => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Maintenance, Inspection..." />
              )}
            </div>
          </div>

          {/* Planning date with Today/Tomorrow shortcuts */}
          {!form.is_recurring && <div className="space-y-1.5">
            <Label>Planning Date</Label>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant={form.planning_date === TODAY ? "default" : "outline"}
                className="h-8 text-xs" onClick={() => set("planning_date", TODAY)}>
                Today
              </Button>
              <Button type="button" size="sm" variant={form.planning_date === TOMORROW ? "default" : "outline"}
                className="h-8 text-xs" onClick={() => set("planning_date", TOMORROW)}>
                Tomorrow
              </Button>
              <Input type="date" value={form.planning_date} onChange={e => set("planning_date", e.target.value)} className="flex-1" />
            </div>
          </div>}

          {/* Shift + Time */}
          {!form.is_recurring && <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Time Slot</Label>
            {shifts.length > 0 && (
              <div className="flex flex-nowrap gap-1.5 mb-2 overflow-x-auto">
                {[...shifts].sort((a, b) => (a.time_in || "").localeCompare(b.time_in || "")).map(sh => (
                  <button key={sh.id} type="button"
                    onClick={() => applyShift(sh)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      form.planning_time_in === sh.time_in && form.planning_time_out === sh.time_out
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }`}
                    style={form.planning_time_in === sh.time_in ? {} : { borderColor: sh.color + "60", color: sh.color }}>
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
                <div className="flex gap-1 mt-1">
                  {[1, 3, 6, 9].map(h => (
                    <button key={h} type="button"
                      onClick={() => {
                        if (!form.planning_time_in) return;
                        const [hh, mm] = form.planning_time_in.split(":").map(Number);
                        const d = new Date();
                        d.setHours(hh, mm, 0, 0);
                        d.setHours(d.getHours() + h);
                        const nh = String(d.getHours()).padStart(2, "0");
                        const nm = String(d.getMinutes()).padStart(2, "0");
                        set("planning_time_out", `${nh}:${nm}`);
                      }}
                      className="flex-1 text-[11px] px-1.5 py-1 rounded-md border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 hover:text-primary text-muted-foreground font-medium transition-colors"
                    >
                      +{h} hr
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>}

          {/* Asset */}
          <div className="space-y-1.5">
            <Label>Linked Asset</Label>
            {form.asset_id ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30">
                <span className="text-sm font-medium text-foreground">{form.asset_name}</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, asset_id: "", asset_name: "" }))}
                  className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Search asset..." value={assetSearch}
                  onChange={e => { setAssetSearch(e.target.value); setShowAssets(true); }}
                  onFocus={() => setShowAssets(true)} onBlur={() => setTimeout(() => setShowAssets(false), 150)} />
                {showAssets && filteredAssets.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredAssets.slice(0, 10).map(a => (
                      <button key={a.id} type="button" onMouseDown={() => { setForm(f => ({ ...f, asset_id: a.id, asset_name: a.name })); setShowAssets(false); setAssetSearch(""); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors">
                        <p className="text-sm font-medium text-foreground">{a.name}</p>
                        {a.serial_number && <p className="text-xs text-muted-foreground font-mono">{a.serial_number}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assigned To — Team Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Team Selection
              <span className="text-xs font-normal text-muted-foreground">(Click team to select, check individual workers)</span>
            </Label>

            {/* Selected Workers chips */}
            {(form.assigned_employees || []).length > 0 && (
              <div className="border border-border rounded-lg p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground mb-2">Selected Workers ({(form.assigned_employees || []).length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {(form.assigned_employee_names || []).map((name, i) => {
                    const emp = employees.find(e => e.id === (form.assigned_employees||[])[i]);
                    return (
                      <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-white border border-border px-2 py-1 rounded-full shadow-sm">
                        {emp?.avatar_url ? (
                          <img src={emp.avatar_url} className="w-4 h-4 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">{name[0]}</div>
                        )}
                        {name}
                        <button type="button" onClick={() => toggleEmployee({ id: (form.assigned_employees||[])[i], full_name: name })} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Team cards */}
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {teams.length === 0 && (
                <p className="text-xs text-muted-foreground p-4 text-center italic">No teams found. Create teams first.</p>
              )}
              {teams.map((team) => {
                const teamEmps = employees.filter(e => e.team_id === team.id && !e.absence_status && e.status !== "On Leave");
                const selectedInTeam = teamEmps.filter(e => (form.assigned_employees || []).includes(e.id));
                const allSelected = teamEmps.length > 0 && selectedInTeam.length === teamEmps.length;
                const someSelected = selectedInTeam.length > 0 && !allSelected;
                const isExpanded = expandedTeams[team.id] !== false; // default expanded

                const toggleAllInTeam = () => {
                  if (allSelected) {
                    // deselect all
                    teamEmps.forEach(e => {
                      if ((form.assigned_employees || []).includes(e.id)) toggleEmployee(e);
                    });
                  } else {
                    // select all not yet selected
                    teamEmps.forEach(e => {
                      if (!(form.assigned_employees || []).includes(e.id)) toggleEmployee(e);
                    });
                  }
                };

                return (
                  <div key={team.id} className={`${allSelected ? "bg-primary/5" : someSelected ? "bg-primary/3" : "bg-card"}`}>
                    {/* Team header */}
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpandTeam(team.id)}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={(e) => { e.stopPropagation(); toggleAllInTeam(); }}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-primary cursor-pointer"
                      />
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: team.color || "#6366f1" }}>
                        {(team.name || "T")[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground uppercase tracking-wide">{team.name}</p>
                        {selectedInTeam.length > 0 && (
                          <p className="text-xs text-primary font-medium">{selectedInTeam.length}/{teamEmps.length} selected</p>
                        )}
                      </div>
                      {/* Avatar previews of selected */}
                      <div className="flex -space-x-1 mr-2">
                        {selectedInTeam.slice(0, 4).map(e => (
                          e.avatar_url
                            ? <img key={e.id} src={e.avatar_url} className="w-6 h-6 rounded-full border-2 border-white object-cover" alt="" />
                            : <div key={e.id} className="w-6 h-6 rounded-full border-2 border-white bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">{e.full_name[0]}</div>
                        ))}
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>

                    {/* No leader warning + inline assign */}
                    {isExpanded && !team.leader_id && teamEmps.length > 0 && (
                      <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-amber-700 font-medium">No team leader assigned.</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {teamEmps.map(emp => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={async () => {
                                  await base44.entities.Team.update(team.id, { leader_id: emp.id, leader_name: emp.full_name });
                                  // Refresh teams list
                                  const updated = await base44.entities.Team.list("name", 200);
                                  setTeams(updated);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded-full border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors"
                              >
                                Set {emp.full_name.split(" ")[0]} as leader
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Team members */}
                    {isExpanded && teamEmps.length > 0 && (
                      <div className="mx-4 mb-3 border border-border rounded-lg overflow-hidden divide-y divide-border bg-white">
                        {teamEmps.map(emp => {
                          const isChecked = (form.assigned_employees || []).includes(emp.id);
                          const isLeader = team.leader_id === emp.id;
                          return (
                            <label key={emp.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors ${isChecked ? "bg-primary/5" : ""}`}>
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleEmployee(emp)}
                                className="w-4 h-4 rounded accent-primary cursor-pointer"
                              />
                              {emp.avatar_url ? (
                                <img src={emp.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{emp.full_name[0]}</div>
                              )}
                              <span className="text-sm font-medium text-foreground">{emp.full_name}</span>
                              {isLeader && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" title="Team Leader" />}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {isExpanded && teamEmps.length === 0 && (
                      <p className="text-xs text-muted-foreground italic px-4 pb-3">No members in this team</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Technical Photos */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> Technical Photos</Label>
            <div className="flex flex-wrap gap-2">
              {(form.photos || []).map((photo, idx) => (
                <div key={idx} className="relative group w-20 h-20">
                  <img src={photo.url} alt={photo.caption || ""} className="w-20 h-20 object-cover rounded-lg border border-border" />
                  <button
                    type="button"
                    onClick={() => set("photos", (form.photos || []).filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className={`w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors ${uploadingPhoto ? "opacity-60 pointer-events-none" : ""}`}>
                {uploadingPhoto ? (
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Add photo</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    setUploadingPhoto(true);
                    for (const file of files) {
                      const { file_url } = await base44.integrations.Core.UploadFile({ file });
                      set("photos", [...(form.photos || []), { url: file_url, caption: "" }]);
                    }
                    setUploadingPhoto(false);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>

          {/* Recurring */}
          <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" />
                <Label className="text-sm font-semibold cursor-pointer">Recurring Task</Label>
              </div>
              <Switch checked={!!form.is_recurring} onCheckedChange={v => set("is_recurring", v)} />
            </div>
            {form.is_recurring && (
              <div className="space-y-3 pt-1">
                {/* Row 1: Frequency + Interval */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Repeat every</Label>
                    <Select value={form.recurrence_frequency || "monthly"} onValueChange={v => set("recurrence_frequency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Day</SelectItem>
                        <SelectItem value="weekly">Week</SelectItem>
                        <SelectItem value="monthly">Month</SelectItem>
                        <SelectItem value="quarterly">3 Months (Quarterly)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Day of month picker for monthly/quarterly */}
                  {(form.recurrence_frequency === "monthly" || form.recurrence_frequency === "quarterly" || !form.recurrence_frequency) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">On day of month</Label>
                      <Input
                        type="number" min={1} max={31}
                        placeholder="e.g. 15"
                        value={form.recurrence_day_of_month || ""}
                        onChange={e => set("recurrence_day_of_month", e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                  )}
                  {/* Day of week picker for weekly */}
                  {form.recurrence_frequency === "weekly" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">On day of week</Label>
                      <Select
                        value={form.recurrence_day_of_week !== undefined && form.recurrence_day_of_week !== "" ? String(form.recurrence_day_of_week) : "1"}
                        onValueChange={v => set("recurrence_day_of_week", Number(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                          <SelectItem value="6">Saturday</SelectItem>
                          <SelectItem value="0">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {/* Row 2: End Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">End Date</Label>
                  <Input type="date" value={form.recurrence_end_date || ""} onChange={e => set("recurrence_end_date", e.target.value)} />
                </div>
                {/* Preview upcoming dates */}
                {form.recurrence_end_date && !generatedDatesLoaded && (
                  <div className="text-xs text-muted-foreground italic px-1 py-1">Loading sent occurrences...</div>
                )}
                {form.recurrence_end_date && generatedDatesLoaded && (() => {
                  const freq = form.recurrence_frequency || "monthly";
                  const dayOfMonth = form.recurrence_day_of_month ? Number(form.recurrence_day_of_month) : null;
                  const dayOfWeek = form.recurrence_day_of_week !== undefined && form.recurrence_day_of_week !== "" ? Number(form.recurrence_day_of_week) : 1;
                  const end = new Date(form.recurrence_end_date);
                  const allDates = [];

                  const toLocalStr = (d) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const day = String(d.getDate()).padStart(2, "0");
                    return `${y}-${m}-${day}`;
                  };

                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const todayStr = toLocalStr(today);

                  // Build first occurrence: start from the current period's occurrence
                  // (even if it's still in the future this month/week — don't skip to next period)
                  let first = new Date(today);
                  if ((freq === "monthly" || freq === "quarterly") && dayOfMonth) {
                    // Start from this month's day — if already past, go to next period
                    first = new Date(first.getFullYear(), first.getMonth(), dayOfMonth);
                    if (toLocalStr(first) < todayStr) first.setMonth(first.getMonth() + (freq === "quarterly" ? 3 : 1));
                  } else if (freq === "weekly") {
                    const dow = first.getDay();
                    let daysUntil = (dayOfWeek - dow + 7) % 7;
                    // Include current week's day if it's today or in future; else next week
                    if (daysUntil < 0) daysUntil += 7;
                    first.setDate(first.getDate() + daysUntil);
                  } else if (freq === "daily") {
                    // daily: start from today
                  } else {
                    first = new Date(first.getFullYear(), first.getMonth(), 1);
                  }

                  let cur = new Date(first);
                  while (cur <= end && allDates.length < 36) {
                    allDates.push(new Date(cur));
                    if (freq === "daily") cur.setDate(cur.getDate() + 1);
                    else if (freq === "weekly") cur.setDate(cur.getDate() + 7);
                    else if (freq === "quarterly") cur.setMonth(cur.getMonth() + 3);
                    else cur.setMonth(cur.getMonth() + 1);
                  }

                  // Deduplicated sent dates
                  const sentDateStrings = [...new Set([...generatedDates])].sort();
                  const sentDateObjects = sentDateStrings.map(dStr => new Date(dStr + "T00:00:00"));
                  const upcomingFiltered = allDates.filter(d => !generatedDates.has(toLocalStr(d)));
                  const upcoming = upcomingFiltered;
                  // Merge: last 2 sent + all upcoming (up to 24), deduplicated by date string
                  const shownRaw = [...sentDateObjects.slice(-2), ...upcomingFiltered.slice(0, 24)];
                  const seenStrs = new Set();
                  const shown = shownRaw.filter(d => {
                    const s = toLocalStr(d);
                    if (seenStrs.has(s)) return false;
                    seenStrs.add(s);
                    return true;
                  });

                  if (shown.length === 0) return null;
                  const freqNote = freq === "weekly"
                    ? "Weekly tasks are sent during the week they fall in."
                    : freq === "monthly" || freq === "quarterly"
                    ? "Monthly tasks are sent during the month they fall in."
                    : null;

                  return (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-primary">Scheduled occurrences ({upcoming.length} upcoming):</p>
                        {freqNote && <p className="text-[10px] text-muted-foreground italic">{freqNote}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        {shown.map((d, i) => {
                          const dStr = toLocalStr(d);
                          const isSent = generatedDates.has(dStr);
                          const isToday = dStr === todayStr;
                          const month = d.toLocaleString("en", { month: "long" });
                          const year = d.getFullYear();
                          const week = `W${Math.ceil(d.getDate() / 7)}`;
                          const resolved = (form.title || "")
                            .replace(/\[Month\]/g, month)
                            .replace(/\[Week\]/g, week)
                            .replace(/\[Year\]/g, year)
                            .replace(/\[MonthYear\]/g, `${month} ${year}`)
                            .replace(/\[WeekYear\]/g, `${week}-${year}`);
                          return (
                            <div key={i} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${
                              isSent ? "bg-muted/40 border-border" : isToday ? "bg-amber-50 border-amber-200" : "bg-white border-primary/20"
                            }`}>
                              <span className={`font-semibold shrink-0 ${isSent ? "text-muted-foreground line-through" : isToday ? "text-amber-600" : "text-primary"}`}>
                                {d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              <span className="text-muted-foreground">·</span>
                              <span className={`truncate ${isSent ? "text-muted-foreground line-through" : "text-foreground/80"}`}>{resolved}</span>
                              {isSent && <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Sent</span>}
                              {isToday && !isSent && <span className="ml-auto shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Today</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  🔁 A new <strong>Queued</strong> task will be auto-created from this template on each scheduled date. The template itself stays in the Recurring tab.
                </p>
              </div>
            )}
          </div>

          {task?.id && (
            <TaskHistoryPanel taskId={task.id} taskReference={form.reference} />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" variant="secondary" disabled={saving}
              className="bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
              onClick={(e) => handleSubmit(e, { asTemplate: true })}>
              {saving ? "Saving..." : "Copy as Template"}
            </Button>
            <Button type="button" variant="outline" disabled={saving || !form.contact_id}
              title={!form.contact_id ? "Link a company to enable quote creation" : "Save this task and open a draft quote"}
              className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              onClick={handleSaveAndQuote}>
              <FileText className="w-4 h-4" /> {saving ? "Saving..." : "Save & Quote"}
            </Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : task?.id ? "Update" : "Create Task"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}