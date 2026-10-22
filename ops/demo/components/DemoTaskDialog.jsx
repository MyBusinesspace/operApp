import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock,
  Crown,
  FolderKanban,
  ImagePlus,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEMO_TASK_SHIFTS } from "../fixtures/settingsDefaults.js";

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

const EMPTY = {
  reference: "",
  title: "",
  description: "",
  status: "Queued",
  category: "",
  priority: "Medium",
  work_order_id: "",
  work_order_name: "",
  project_id: "",
  project_name: "",
  contact_id: "",
  contact_name: "",
  asset_id: "",
  asset_name: "",
  currency: "AED",
  assigned_employees: [],
  assigned_employee_names: [],
  assigned_team_ids: [],
  assigned_team_names: [],
  planning_date: "",
  planning_time_in: "",
  planning_time_out: "",
  notes: "",
  location_address: "",
  photos: [],
  is_recurring: false,
  recurrence_frequency: "monthly",
  recurrence_end_date: "",
};

const CATEGORIES = ["Site Work", "Admin", "Safety", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const CURRENCIES = [
  "AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR", "MXN", "BRL", "INR", "PKR", "EGP", "JOD",
];

function nameToIds(names = [], employees = []) {
  return names
    .map((n) => employees.find((e) => e.full_name === n)?.id)
    .filter(Boolean);
}

export default function DemoTaskDialog({
  open,
  onClose,
  task,
  contacts = [],
  projects = [],
  assets = [],
  workOrders = [],
  employees = [],
  teams = [],
  allTasks = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [expandedTeams, setExpandedTeams] = useState({});
  const [woSearch, setWoSearch] = useState("");
  const [woDropdown, setWoDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDropdown, setProjectDropdown] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdown, setContactDropdown] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetDropdown, setAssetDropdown] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (task) {
      const ids =
        task.assigned_employees?.length
          ? task.assigned_employees
          : nameToIds(task.assigned_employee_names, employees);
      const names =
        task.assigned_employee_names?.length
          ? task.assigned_employee_names
          : ids.map((id) => employees.find((e) => e.id === id)?.full_name).filter(Boolean);
      setForm({
        ...EMPTY,
        ...task,
        assigned_employees: ids,
        assigned_employee_names: names,
        photos: task.photos || [],
      });
      const count = task.subtasks_count || 0;
      setSubtasks(
        count > 0
          ? Array.from({ length: Math.min(count, 5) }, (_, i) => ({
              id: `sub-${task.id}-${i}`,
              title: `Step ${i + 1}`,
              done: i === 0 && task.status === "Completed",
            }))
          : []
      );
    } else {
      setForm({
        ...EMPTY,
        reference: "TSK-DEMO",
        status: "Queued",
        priority: "Medium",
        currency: "AED",
      });
      setSubtasks([]);
    }
    setNewSubtask("");
    setExpandedTeams({});
    setWoSearch("");
    setWoDropdown(false);
    setProjectSearch("");
    setProjectDropdown(false);
    setContactSearch("");
    setContactDropdown(false);
    setAssetSearch("");
    setAssetDropdown(false);
  }, [task, open, employees]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const existingTasks = useMemo(() => {
    if (!form.project_id) return [];
    return allTasks.filter(
      (t) =>
        t.project_id === form.project_id &&
        (t.status === "Scheduled" || t.status === "Not Completed") &&
        (!form.work_order_id || t.work_order_id === form.work_order_id) &&
        t.id !== task?.id
    );
  }, [allTasks, form.project_id, form.work_order_id, task?.id]);

  const displayStatus = form.planning_date && form.planning_time_in && form.status === "Queued"
    ? "Scheduled"
    : form.status || "Queued";

  const handleWOSelect = (woId) => {
    if (woId === "__none__") {
      setForm((f) => ({ ...f, work_order_id: "", work_order_name: "" }));
      return;
    }
    const wo = workOrders.find((w) => w.id === woId);
    if (!wo) return;
    setForm((f) => ({
      ...f,
      work_order_id: wo.id,
      work_order_name: wo.title,
      project_id: wo.project_id || f.project_id,
      project_name: wo.project_name || f.project_name,
      contact_id: wo.contact_id || f.contact_id,
      contact_name: wo.contact_name || f.contact_name,
      asset_id: wo.asset_id || f.asset_id,
      asset_name: wo.asset_name || f.asset_name,
    }));
  };

  const handleProjectChange = (pid) => {
    if (pid === "__none__") {
      set("project_id", "");
      set("project_name", "");
      return;
    }
    const p = projects.find((x) => x.id === pid);
    setForm((f) => ({
      ...f,
      project_id: pid,
      project_name: p?.name || "",
      contact_id: p?.contact_id || f.contact_id,
      contact_name: p?.contact_name || f.contact_name,
      location_address: p?.location || f.location_address,
      currency: p?.currency || f.currency || "AED",
    }));
  };

  const handleContactChange = (cid) => {
    if (cid === "__none__") {
      set("contact_id", "");
      set("contact_name", "");
      return;
    }
    const c = contacts.find((x) => x.id === cid);
    set("contact_id", cid);
    set("contact_name", c ? c.company || c.full_name : "");
  };

  const handleAssetChange = (aid) => {
    if (aid === "__none__") {
      set("asset_id", "");
      set("asset_name", "");
      return;
    }
    const a = assets.find((x) => x.id === aid);
    set("asset_id", aid);
    set("asset_name", a?.name || "");
  };

  const toggleEmployee = (emp) => {
    setForm((f) => {
      const ids = f.assigned_employees || [];
      const names = f.assigned_employee_names || [];
      if (ids.includes(emp.id)) {
        return {
          ...f,
          assigned_employees: ids.filter((x) => x !== emp.id),
          assigned_employee_names: names.filter((x) => x !== emp.full_name),
        };
      }
      return {
        ...f,
        assigned_employees: [...ids, emp.id],
        assigned_employee_names: [...names, emp.full_name],
      };
    });
  };

  const applyShift = (sh) => {
    setForm((f) => ({
      ...f,
      planning_time_in: sh.time_in,
      planning_time_out: sh.time_out,
    }));
  };

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, title, done: false },
    ]);
    setNewSubtask("");
  };

  const filteredWOs = workOrders.filter(
    (w) =>
      !woSearch ||
      w.title?.toLowerCase().includes(woSearch.toLowerCase()) ||
      w.reference?.toLowerCase().includes(woSearch.toLowerCase())
  );
  const filteredProjects = projects.filter(
    (p) =>
      !projectSearch ||
      p.name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.reference?.toLowerCase().includes(projectSearch.toLowerCase())
  );
  const filteredContacts = contacts.filter(
    (c) =>
      !contactSearch ||
      c.full_name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.company?.toLowerCase().includes(contactSearch.toLowerCase())
  );
  const filteredAssets = assets.filter(
    (a) =>
      !assetSearch ||
      a.name?.toLowerCase().includes(assetSearch.toLowerCase()) ||
      a.reference?.toLowerCase().includes(assetSearch.toLowerCase())
  );

  const LinkPicker = ({
    label,
    icon: Icon,
    selectedId,
    selectedName,
    search,
    setSearch,
    dropdown,
    setDropdown,
    items,
    onSelect,
    onClear,
    renderItem,
  }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        {selectedId ? (
          <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium truncate">{selectedName}</p>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDropdown(true);
              }}
              onFocus={() => setDropdown(true)}
              onBlur={() => setTimeout(() => setDropdown(false), 150)}
            />
          </div>
        )}
        {dropdown && !selectedId && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2"
                onMouseDown={() => {
                  onSelect(item);
                  setDropdown(false);
                }}
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                {renderItem(item)}
              </button>
            ))}
            {items.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No results</p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
          className="space-y-5 pt-1"
        >
          {/* Links */}
          <div className="space-y-3 p-3 rounded-xl border border-border bg-muted/10">
            <LinkPicker
              label="Linked Work Order"
              icon={ClipboardList}
              selectedId={form.work_order_id}
              selectedName={form.work_order_name}
              search={woSearch}
              setSearch={setWoSearch}
              dropdown={woDropdown}
              setDropdown={setWoDropdown}
              items={filteredWOs}
              onSelect={(w) => handleWOSelect(w.id)}
              onClear={() => handleWOSelect("__none__")}
              renderItem={(w) => (
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{w.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">{w.reference}</p>
                </div>
              )}
            />
            <LinkPicker
              label="Linked Project"
              icon={FolderKanban}
              selectedId={form.project_id}
              selectedName={form.project_name}
              search={projectSearch}
              setSearch={setProjectSearch}
              dropdown={projectDropdown}
              setDropdown={setProjectDropdown}
              items={filteredProjects}
              onSelect={(p) => handleProjectChange(p.id)}
              onClear={() => handleProjectChange("__none__")}
              renderItem={(p) => (
                <p className="text-sm font-medium">{p.name}</p>
              )}
            />
            <LinkPicker
              label="Linked Company"
              icon={Building2}
              selectedId={form.contact_id}
              selectedName={form.contact_name}
              search={contactSearch}
              setSearch={setContactSearch}
              dropdown={contactDropdown}
              setDropdown={setContactDropdown}
              items={filteredContacts}
              onSelect={(c) => handleContactChange(c.id)}
              onClear={() => handleContactChange("__none__")}
              renderItem={(c) => (
                <p className="text-sm font-medium">{c.company || c.full_name}</p>
              )}
            />
            <LinkPicker
              label="Linked Asset"
              icon={Package}
              selectedId={form.asset_id}
              selectedName={form.asset_name}
              search={assetSearch}
              setSearch={setAssetSearch}
              dropdown={assetDropdown}
              setDropdown={setAssetDropdown}
              items={filteredAssets}
              onSelect={(a) => handleAssetChange(a.id)}
              onClear={() => handleAssetChange("__none__")}
              renderItem={(a) => (
                <p className="text-sm font-medium">{a.name}</p>
              )}
            />

            {!task?.id && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Existing tasks
                  <span className="text-xs font-normal text-muted-foreground">
                    ({form.project_id
                      ? `${existingTasks.length} scheduled / not completed`
                      : "select a project first"})
                  </span>
                </Label>
                {existingTasks.length > 0 ? (
                  <div className="rounded-md border border-border bg-background max-h-36 overflow-y-auto divide-y divide-border">
                    {existingTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                        <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{t.title}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {t.reference}
                            {t.planning_date ? ` · ${t.planning_date}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-md border border-dashed border-border">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {form.project_id
                      ? "No existing Scheduled / Not Completed tasks for this selection."
                      : "Select a project to see existing tasks here."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Title / description / subtasks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!form.is_recurring && (
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">
                  {form.reference || "—"}
                </div>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                required
                placeholder={
                  form.is_recurring ? "e.g. EMC Maintenance [Month] [Year]" : ""
                }
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description || ""}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label className="flex items-center gap-2">
                Instructions / Subtasks
                {subtasks.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {subtasks.filter((s) => s.done).length}/{subtasks.length}
                  </span>
                )}
              </Label>
              <div className="space-y-1">
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border group ${
                      sub.done
                        ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20"
                        : "bg-card border-border"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSubtasks((prev) =>
                          prev.map((s) =>
                            s.id === sub.id ? { ...s, done: !s.done } : s
                          )
                        )
                      }
                      className="flex items-center gap-2.5 flex-1 text-left"
                    >
                      {sub.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      )}
                      <span
                        className={`text-sm ${
                          sub.done
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {sub.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSubtasks((prev) => prev.filter((s) => s.id !== sub.id))
                      }
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                  placeholder="Add instruction or subtask..."
                  className="flex-1 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addSubtask}
                  disabled={!newSubtask.trim()}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/40 text-sm">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                  {displayStatus}
                </span>
                <span className="text-xs text-muted-foreground">
                  {displayStatus === "Queued" &&
                    "Becomes Scheduled once a date and time slot are set"}
                  {displayStatus === "Scheduled" &&
                    "Becomes Active when the employee clocks in"}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority || "Medium"}
                onValueChange={(v) => set("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select
                value={form.currency || "AED"}
                onValueChange={(v) => set("currency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category || ""}
                onValueChange={(v) => set("category", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Planning */}
          {!form.is_recurring && (
            <>
              <div className="space-y-1.5">
                <Label>Planning Date</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={form.planning_date === TODAY ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => set("planning_date", TODAY)}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      form.planning_date === TOMORROW ? "default" : "outline"
                    }
                    className="h-8 text-xs"
                    onClick={() => set("planning_date", TOMORROW)}
                  >
                    Tomorrow
                  </Button>
                  <Input
                    type="date"
                    value={form.planning_date || ""}
                    onChange={(e) => set("planning_date", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Time Slot
                </Label>
                <div className="flex flex-nowrap gap-1.5 mb-2 overflow-x-auto">
                  {DEMO_TASK_SHIFTS.map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => applyShift(sh)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium whitespace-nowrap ${
                        form.planning_time_in === sh.time_in &&
                        form.planning_time_out === sh.time_out
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      {sh.name} ({sh.time_in}–{sh.time_out})
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time In</Label>
                    <Input
                      type="time"
                      value={form.planning_time_in || ""}
                      onChange={(e) => set("planning_time_in", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time Out</Label>
                    <Input
                      type="time"
                      value={form.planning_time_out || ""}
                      onChange={(e) => set("planning_time_out", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Team Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Team Selection
              <span className="text-xs font-normal text-muted-foreground">
                (Click team to select, check individual workers)
              </span>
            </Label>

            {(form.assigned_employees || []).length > 0 && (
              <div className="border border-border rounded-lg p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground mb-2">
                  Selected Workers ({form.assigned_employees.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(form.assigned_employee_names || []).map((name, i) => (
                    <span
                      key={`${name}-${i}`}
                      className="inline-flex items-center gap-1.5 text-xs bg-muted/40 border border-border px-2 py-1 rounded-full shadow-sm"
                    >
                      <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                        {name[0]}
                      </div>
                      {name}
                      <button
                        type="button"
                        onClick={() => {
                          const emp = employees.find(
                            (e) => e.id === form.assigned_employees[i]
                          ) || { id: form.assigned_employees[i], full_name: name };
                          toggleEmployee(emp);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {teams.length === 0 && (
                <p className="text-xs text-muted-foreground p-4 text-center italic">
                  No teams found.
                </p>
              )}
              {teams.map((team) => {
                const teamEmps = employees.filter(
                  (e) => e.team_id === team.id && e.status !== "Inactive"
                );
                const selectedInTeam = teamEmps.filter((e) =>
                  (form.assigned_employees || []).includes(e.id)
                );
                const allSelected =
                  teamEmps.length > 0 &&
                  selectedInTeam.length === teamEmps.length;
                const someSelected =
                  selectedInTeam.length > 0 && !allSelected;
                const isExpanded = expandedTeams[team.id] === true;

                const toggleAllInTeam = () => {
                  if (allSelected) {
                    teamEmps.forEach((e) => {
                      if ((form.assigned_employees || []).includes(e.id))
                        toggleEmployee(e);
                    });
                  } else {
                    teamEmps.forEach((e) => {
                      if (!(form.assigned_employees || []).includes(e.id))
                        toggleEmployee(e);
                    });
                  }
                };

                return (
                  <div
                    key={team.id}
                    className={
                      allSelected
                        ? "bg-primary/5"
                        : someSelected
                          ? "bg-primary/[0.03]"
                          : "bg-card"
                    }
                  >
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() =>
                        setExpandedTeams((prev) => ({
                          ...prev,
                          [team.id]: !isExpanded,
                        }))
                      }
                    >
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleAllInTeam();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-primary cursor-pointer"
                      />
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: team.color || "#6366f1" }}
                      >
                        {(team.name || "T")[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground uppercase tracking-wide">
                          {team.name}
                        </p>
                        {selectedInTeam.length > 0 && (
                          <p className="text-xs text-primary font-medium">
                            {selectedInTeam.length}/{teamEmps.length} selected
                          </p>
                        )}
                      </div>
                      <div className="flex -space-x-1 mr-2">
                        {selectedInTeam.slice(0, 4).map((e) => (
                          <div
                            key={e.id}
                            className="w-6 h-6 rounded-full border-2 border-background bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary"
                          >
                            {e.full_name[0]}
                          </div>
                        ))}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    {isExpanded && teamEmps.length > 0 && (
                      <div className="mx-4 mb-3 border border-border rounded-lg overflow-hidden divide-y divide-border bg-card">
                        {teamEmps.map((emp) => {
                          const isChecked = (form.assigned_employees || []).includes(
                            emp.id
                          );
                          const isLeader = team.leader_id === emp.id;
                          return (
                            <label
                              key={emp.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors ${
                                isChecked ? "bg-primary/5" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleEmployee(emp)}
                                className="w-4 h-4 rounded accent-primary cursor-pointer"
                              />
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {emp.full_name[0]}
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {emp.full_name}
                              </span>
                              {isLeader && (
                                <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {isExpanded && teamEmps.length === 0 && (
                      <p className="text-xs text-muted-foreground italic px-4 pb-3">
                        No members in this team
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Photos stub */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5" /> Technical Photos
            </Label>
            <div className="flex flex-wrap gap-2">
              <div
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-default text-muted-foreground"
                title="Demo — view only"
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px]">Add photo</span>
              </div>
            </div>
          </div>

          {/* Recurring */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/30">
            <div>
              <p className="text-sm font-semibold text-foreground">Recurring task</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate future instances from a template
              </p>
            </div>
            <Switch
              checked={!!form.is_recurring}
              onCheckedChange={(v) => set("is_recurring", v)}
            />
          </div>
          {form.is_recurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Frequency</Label>
                <Select
                  value={form.recurrence_frequency || "monthly"}
                  onValueChange={(v) => set("recurrence_frequency", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["daily", "weekly", "monthly"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.recurrence_end_date || ""}
                  onChange={(e) => set("recurrence_end_date", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={form.location_address || ""}
              onChange={(e) => set("location_address", e.target.value)}
              placeholder="Site address / pin description"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" title="Demo — view only">
              {task ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
