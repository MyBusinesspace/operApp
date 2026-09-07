import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, MapPin, Camera, Save, Clock, ArrowLeft, FileText, ChevronRight, ClipboardList, CheckSquare, Plus, Pencil, Trash2, Hash, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import TaskNumberingSection from "@/components/settings/TaskNumberingSection";
import WorkingReportLogicInfo from "@/components/timesheets/WorkingReportLogicInfo";

// ── Shared helpers (from ServiceSettings) ─────────────────────────────────────
function ColorDot({ color }) {
  return <span className="w-3 h-3 rounded-full shrink-0 inline-block" style={{ backgroundColor: color || "#6366f1" }} />;
}

function LabelItemList({ title, items, onAdd, onEdit, onDelete }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {items.length === 0
        ? <div className="p-8 text-center text-sm text-muted-foreground">No {title.toLowerCase()} yet.</div>
        : <div className="divide-y divide-border">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
                <ColorDot color={item.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /></button>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function ShiftList({ shifts, onAdd, onEdit, onDelete }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Shifts</h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {shifts.length === 0
        ? <div className="p-8 text-center text-sm text-muted-foreground">No shifts yet.</div>
        : <div className="divide-y divide-border">
            {shifts.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
                <ColorDot color={item.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.time_in} – {item.time_out}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /></button>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function ItemModal({ open, onClose, onSave, item, title }) {
  const isShift = title === "Task Shift";
  const [form, setForm] = useState({ name: "", color: "#6366f1", description: "", time_in: "07:00", time_out: "15:00" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setForm(item
      ? { name: item.name || "", color: item.color || "#6366f1", description: item.description || "", time_in: item.time_in || "07:00", time_out: item.time_out || "15:00" }
      : { name: "", color: "#6366f1", description: "", time_in: "07:00", time_out: "15:00" });
  }, [item, open]);
  const handleSave = async (e) => { e.preventDefault(); if (!form.name.trim()) return; setSaving(true); await onSave(form); setSaving(false); };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{item ? `Edit ${title}` : `Add ${title}`}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div className="space-y-1"><Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
              <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="flex-1" />
            </div>
          </div>
          {isShift && <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Time In</Label><Input type="time" value={form.time_in} onChange={e => setForm(f => ({ ...f, time_in: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Time Out</Label><Input type="time" value={form.time_out} onChange={e => setForm(f => ({ ...f, time_out: e.target.value }))} /></div>
          </div>}
          {!isShift && <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" /></div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving..." : item ? "Update" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceNumberingSection({ storageKey, defaultPrefix, label }) {
  const defaultForm = { prefix: defaultPrefix, number_padding: 4, include_year: false, next_number: 1 };
  const [form, setForm] = useState(defaultForm);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const s = list.find(t => t.name === storageKey);
      if (s) { setRecordId(s.id); try { setForm(f => ({ ...f, ...JSON.parse(s.footer_notes || "{}") })); } catch {} }
    });
  }, [storageKey]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const preview = () => { const year = new Date().getFullYear(); const padded = String(form.next_number || 1).padStart(form.number_padding || 4, "0"); return form.include_year ? `${form.prefix}-${year}-${padded}` : `${form.prefix}-${padded}`; };
  const handleSave = async () => {
    setSaving(true);
    const data = { name: storageKey, footer_notes: JSON.stringify(form) };
    if (recordId) await base44.entities.DocumentTemplate.update(recordId, data);
    else { const c = await base44.entities.DocumentTemplate.create(data); setRecordId(c.id); }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Hash className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{label} Reference Numbering</h3>
        <span className="ml-auto text-xs text-muted-foreground">Preview: <span className="font-mono text-foreground">{preview()}</span></span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1"><Label className="text-xs">Prefix</Label><Input className="h-8 text-sm" value={form.prefix || ""} onChange={e => set("prefix", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Number padding</Label><Input className="h-8 text-sm" type="number" min={1} max={8} value={form.number_padding || 4} onChange={e => set("number_padding", Number(e.target.value))} /></div>
        <div className="space-y-1"><Label className="text-xs">Next number</Label><Input className="h-8 text-sm" type="number" min={1} value={form.next_number || 1} onChange={e => set("next_number", Number(e.target.value))} /></div>
        <div className="space-y-1"><Label className="text-xs">Include year</Label>
          <div className="flex items-center gap-2 h-8">
            <input type="checkbox" checked={!!form.include_year} onChange={e => set("include_year", e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm text-muted-foreground">e.g. {defaultPrefix}-2026-0001</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-7 text-xs"><Save className="w-3 h-3" /> {saving ? "Saving..." : saved ? "Saved!" : "Save"}</Button>
      </div>
    </div>
  );
}

const DEFAULTS = {
  track_gps_location: true,
  require_work_order: false,
  allow_manual_edit: true,
  enable_alarms: false,
  alarm_minutes_before: 5,
  gps_accuracy_threshold_m: 15,
  tracking_interval_min: 15,
  require_photo_clock_in: false,
  require_photo_clock_out: false,
  require_photo_task_switch: false,
  show_timesheet_photos_column: true,
};

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

export default function OperationsSettings() {
  const [activeTab, setActiveTab] = useState("workorders");
  const [settings, setSettings] = useState(DEFAULTS);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Work Orders & Tasks data
  const [woCategories, setWoCategories] = useState([]);
  const [woStatuses, setWoStatuses] = useState([]);
  const [taskCategories, setTaskCategories] = useState([]);
  const [taskShifts, setTaskShifts] = useState([]);
  const [loadingWO, setLoadingWO] = useState(false);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    base44.entities.OperationsSettings.list("-created_date", 10).then(records => {
      if (records.length > 0) { setRecordId(records[0].id); setSettings({ ...DEFAULTS, ...records[0] }); }
    });
    loadWOData();
  }, []);

  const loadWOData = async () => {
    setLoadingWO(true);
    const [wc, ws, tc, tsh] = await Promise.all([
      base44.entities.WorkOrderCategory.list("name", 100),
      base44.entities.WorkOrderStatus.list("name", 100),
      base44.entities.TaskCategory.list("name", 100),
      base44.entities.TaskShift.list("name", 100),
    ]);
    setWoCategories(wc); setWoStatuses(ws); setTaskCategories(tc); setTaskShifts(tsh);
    setLoadingWO(false);
  };

  const entityMap = {
    woCategory: base44.entities.WorkOrderCategory,
    woStatus: base44.entities.WorkOrderStatus,
    taskCategory: base44.entities.TaskCategory,
    taskShift: base44.entities.TaskShift,
  };
  const modalTitle = { woCategory: "Work Order Category", woStatus: "Work Order Status", taskCategory: "Task Category", taskShift: "Task Shift" }[modal] || "";
  const openAdd = (entity) => { setModal(entity); setEditing(null); };
  const openEditItem = (entity, item) => { setModal(entity); setEditing(item); };
  const closeModal = () => { setModal(null); setEditing(null); };
  const handleWOSave = async (form) => { if (editing) await entityMap[modal].update(editing.id, form); else await entityMap[modal].create(form); closeModal(); loadWOData(); };
  const handleWODelete = async (entity, id) => { if (!confirm("Delete this item?")) return; await entityMap[entity].delete(id); loadWOData(); };

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    if (recordId) await base44.entities.OperationsSettings.update(recordId, settings);
    else { const rec = await base44.entities.OperationsSettings.create(settings); setRecordId(rec.id); }
    setSaving(false);
    toast({ title: "Settings saved", description: "Operations settings updated successfully." });
  };

  const tabs = [
    { id: "workorders", label: "Work Orders & Tasks", icon: Wrench },
    { id: "general", label: "Timesheet", icon: Settings },
    { id: "location", label: "Location", icon: MapPin },
    { id: "photos", label: "Photos", icon: Camera },
    { id: "report", label: "Working Report", icon: FileText },
  ];

  const intervalOptions = [
    { value: "0", label: "Disabled" },
    { value: "5", label: "Every 5 minutes" },
    { value: "10", label: "Every 10 minutes" },
    { value: "15", label: "Every 15 minutes" },
    { value: "30", label: "Every 30 minutes" },
    { value: "60", label: "Every 60 minutes" },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Operations Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure timesheet, GPS, and photo requirements</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className={`bg-card border border-border rounded-xl p-6 space-y-4 ${activeTab === "workorders" ? "max-w-4xl" : "max-w-2xl"}`}>

        {/* Work Orders & Tasks Tab */}
        {activeTab === "workorders" && (
          loadingWO ? <div className="text-center text-muted-foreground text-sm py-12">Loading...</div> :
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Work Orders</h2>
              </div>
              <ReferenceNumberingSection storageKey="__workorder_numbering__" defaultPrefix="WO" label="Work Order" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LabelItemList title="Categories" items={woCategories} onAdd={() => openAdd("woCategory")} onEdit={item => openEditItem("woCategory", item)} onDelete={id => handleWODelete("woCategory", id)} />
                <LabelItemList title="Statuses" items={woStatuses} onAdd={() => openAdd("woStatus")} onEdit={item => openEditItem("woStatus", item)} onDelete={id => handleWODelete("woStatus", id)} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Tasks</h2>
              </div>
              <TaskNumberingSection />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LabelItemList title="Categories" items={taskCategories} onAdd={() => openAdd("taskCategory")} onEdit={item => openEditItem("taskCategory", item)} onDelete={id => handleWODelete("taskCategory", id)} />
                <ShiftList shifts={taskShifts} onAdd={() => openAdd("taskShift")} onEdit={item => openEditItem("taskShift", item)} onDelete={id => handleWODelete("taskShift", id)} />
              </div>
            </div>
            <ItemModal open={!!modal} onClose={closeModal} onSave={handleWOSave} item={editing} title={modalTitle} />
          </div>
        )}

        {/* General Tab */}
        {activeTab === "general" && (
          <>
            <ToggleRow
              label="Track GPS Location"
              desc="Record location when clocking in/out"
              value={settings.track_gps_location}
              onChange={v => set("track_gps_location", v)}
            />
            <ToggleRow
              label="Require Work Order"
              desc="Employees must select a work order to clock in"
              value={settings.require_work_order}
              onChange={v => set("require_work_order", v)}
            />
            <ToggleRow
              label="Allow Manual Edit"
              desc="Employees can edit their timesheet times"
              value={settings.allow_manual_edit}
              onChange={v => set("allow_manual_edit", v)}
            />
            <ToggleRow
              label="Enable Alarms"
              desc="Notify employees before work order start time"
              value={settings.enable_alarms}
              onChange={v => set("enable_alarms", v)}
            />
            {settings.enable_alarms && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Alarm Minutes Before</label>
                <Input
                  type="number"
                  min={1}
                  value={settings.alarm_minutes_before}
                  onChange={e => set("alarm_minutes_before", Number(e.target.value))}
                  className="max-w-xs"
                />
              </div>
            )}
          </>
        )}

        {/* Location Tab */}
        {activeTab === "location" && (
          <>
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
              Configure GPS tracking settings including accuracy requirements and how often location points are recorded during active timesheets.
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">GPS Accuracy Threshold (meters)</label>
              <Input
                type="number"
                min={1}
                value={settings.gps_accuracy_threshold_m}
                onChange={e => set("gps_accuracy_threshold_m", Number(e.target.value))}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">Minimum GPS accuracy required for location tracking</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Tracking Interval</label>
              <Select
                value={String(settings.tracking_interval_min)}
                onValueChange={v => set("tracking_interval_min", Number(v))}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervalOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">How often to record GPS location while employees are clocked in. Set to 0 to disable.</p>
            </div>

            {/* Summary card */}
            <div className="bg-secondary/40 rounded-xl border border-border p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Current Configuration</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GPS Accuracy:</span>
                <span className="font-medium">{settings.gps_accuracy_threshold_m}m</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tracking Interval:</span>
                <span className="font-medium">
                  {settings.tracking_interval_min === 0 ? "Disabled" : `${settings.tracking_interval_min} minutes`}
                </span>
              </div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
              <strong>Note:</strong> GPS tracking pins are automatically recorded at clock-in and clock-out regardless of this interval setting. This setting only affects automatic tracking during active timesheets.
            </div>
          </>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <>
            <ToggleRow
              label="Require Photo on Clock In"
              desc="Employees must take a photo when clocking in"
              value={settings.require_photo_clock_in}
              onChange={v => set("require_photo_clock_in", v)}
            />
            <ToggleRow
              label="Require Photo on Clock Out"
              desc="Employees must take a photo when clocking out"
              value={settings.require_photo_clock_out}
              onChange={v => set("require_photo_clock_out", v)}
            />
            <ToggleRow
              label="Require Photo on Task Switch"
              desc="Employees must take a photo when switching tasks"
              value={settings.require_photo_task_switch}
              onChange={v => set("require_photo_task_switch", v)}
            />
            <div className="border-t border-border pt-4">
              <ToggleRow
                label="Show Photos Column in Timesheets"
                desc="Display clock-in/out photo thumbnails in the timesheet table"
                value={settings.show_timesheet_photos_column}
                onChange={v => set("show_timesheet_photos_column", v)}
              />
            </div>
          </>
        )}

        {/* Working Report Tab */}
        {activeTab === "report" && (
          <div className="space-y-3">
            <WorkingReportLogicInfo />
            <Link
              to="/settings/operations/working-report"
              className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border hover:bg-secondary/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Working Report Template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Configure logo, colors, and company details for Service & Maintenance Reports</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              to="/settings/operations/daily-schedule"
              className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border hover:bg-secondary/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Daily Schedule Report</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Configure company branding for the Working Day Schedule document sent to employees</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        )}

        {/* Save Button (not shown on report tab) */}
        {activeTab !== "report" && (
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : `Save ${tabs.find(t => t.id === activeTab)?.label} Settings`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}