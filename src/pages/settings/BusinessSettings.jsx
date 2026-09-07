import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, Building2, Plus, Pencil, Trash2, Users, FolderKanban, ClipboardList, Package, CheckSquare, Clock, UserCog
} from "lucide-react";
import ReferenceNumberingSection from "@/components/settings/ReferenceNumberingSection";
import FileSettingsSection from "@/components/shared/FileSettingsSection";
import AssetFieldsSection from "@/components/settings/AssetFieldsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TABS = [
  { key: "contacts", label: "Contacts", icon: Building2 },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "assets", label: "Assets", icon: Package },
];

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
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} yet. Add the first one.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftList({ shifts, onAdd, onEdit, onDelete }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Shifts
        </h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {shifts.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No shifts yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {shifts.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.time_in} – {item.time_out}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{item ? `Edit ${title}` : `Add ${title}`}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Morning Shift" />
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
              <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#6366f1" className="flex-1" />
            </div>
          </div>
          {isShift && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Time In</Label>
                <Input type="time" value={form.time_in} onChange={e => setForm(f => ({ ...f, time_in: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Time Out</Label>
                <Input type="time" value={form.time_out} onChange={e => setForm(f => ({ ...f, time_out: e.target.value }))} />
              </div>
            </div>
          )}
          {!isShift && (
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving..." : item ? "Update" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



export default function BusinessSettings() {
  const [activeTab, setActiveTab] = useState("contacts");
  const [data, setData] = useState({
    contactCategories: [], contactStatuses: [], contactGroups: [],
    projectCategories: [], projectStatuses: [],
    woCategories: [], woStatuses: [],
    assetGroups: [], assetCategories: [], assetStatuses: [],
    taskCategories: [], taskStatuses: [], taskShifts: [],
    employeeGroups: [], employeeStatuses: [], teams: [],
  });
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);

  const tabLoaders = {
    contacts: async () => {
      const [cc, cs, cg] = await Promise.all([
        base44.entities.ContactCategory.list("name", 100),
        base44.entities.ContactStatus.list("name", 100),
        base44.entities.ContactGroup.list("name", 200),
      ]);
      return { contactCategories: cc, contactStatuses: cs, contactGroups: cg };
    },
    projects: async () => {
      const [pc, ps] = await Promise.all([
        base44.entities.ProjectCategory.list("name", 100),
        base44.entities.ProjectStatus.list("name", 100),
      ]);
      return { projectCategories: pc, projectStatuses: ps };
    },
    assets: async () => {
      const [ag, ac, as] = await Promise.all([
        base44.entities.AssetGroup.list("name", 200),
        base44.entities.AssetCategory.list("name", 100),
        base44.entities.AssetStatus.list("name", 100),
      ]);
      return { assetGroups: ag, assetCategories: ac, assetStatuses: as };
    },
    tasks: async () => {
      const [tc, ts, tsh] = await Promise.all([
        base44.entities.TaskCategory.list("name", 100),
        base44.entities.TaskStatus.list("name", 100),
        base44.entities.TaskShift.list("name", 100),
      ]);
      return { taskCategories: tc, taskStatuses: ts, taskShifts: tsh };
    },
    employees: async () => {
      const [eg, es, tm] = await Promise.all([
        base44.entities.EmployeeGroup.list("name", 100),
        base44.entities.EmployeeStatus.list("name", 100),
        base44.entities.Team.list("name", 200),
      ]);
      return { employeeGroups: eg, employeeStatuses: es, teams: tm };
    },
    workorders: async () => {
      const [wc, ws] = await Promise.all([
        base44.entities.WorkOrderCategory.list("name", 100),
        base44.entities.WorkOrderStatus.list("name", 100),
      ]);
      return { woCategories: wc, woStatuses: ws };
    },
  };

  const load = async (tab) => {
    setLoading(true);
    const result = await tabLoaders[tab]();
    setData(d => ({ ...d, ...result }));
    setLoading(false);
  };

  useEffect(() => { load(activeTab); }, [activeTab]);

  const entityMap = {
    contactCategory: base44.entities.ContactCategory,
    contactStatus: base44.entities.ContactStatus,
    contactGroup: base44.entities.ContactGroup,
    projectCategory: base44.entities.ProjectCategory,
    projectStatus: base44.entities.ProjectStatus,
    woCategory: base44.entities.WorkOrderCategory,
    woStatus: base44.entities.WorkOrderStatus,
    assetGroup: base44.entities.AssetGroup,
    assetCategory: base44.entities.AssetCategory,
    assetStatus: base44.entities.AssetStatus,
    taskCategory: base44.entities.TaskCategory,
    taskStatus: base44.entities.TaskStatus,
    taskShift: base44.entities.TaskShift,
    employeeGroup: base44.entities.EmployeeGroup,
    employeeStatus: base44.entities.EmployeeStatus,
    team: base44.entities.Team,
  };

  const modalTitles = {
    contactCategory: "Contact Category", contactStatus: "Contact Status", contactGroup: "Contact Group",
    projectCategory: "Project Category", projectStatus: "Project Status",
    woCategory: "Work Order Category", woStatus: "Work Order Status",
    assetGroup: "Asset Group", assetCategory: "Asset Category", assetStatus: "Asset Status",
    taskCategory: "Task Category", taskStatus: "Task Status", taskShift: "Task Shift",
    employeeGroup: "Employee Group", employeeStatus: "Employee Status", team: "Team",
  };

  const openAdd = (entity) => { setModal(entity); setEditing(null); };
  const openEdit = (entity, item) => { setModal(entity); setEditing(item); };
  const closeModal = () => { setModal(null); setEditing(null); };

  const handleSave = async (form) => {
    if (editing) await entityMap[modal].update(editing.id, form);
    else await entityMap[modal].create(form);
    closeModal();
    load(activeTab);
  };

  const handleDelete = async (entity, id) => {
    if (!confirm("Delete this item?")) return;
    await entityMap[entity].delete(id);
    load(activeTab);
  };

  const { contactCategories, contactStatuses, contactGroups, projectCategories, projectStatuses,
    woCategories, woStatuses, assetGroups, assetCategories, assetStatuses, taskCategories, taskStatuses, taskShifts,
    employeeGroups, employeeStatuses, teams } = data;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Business Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage categories and statuses for contacts and projects</p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-12">Loading...</div>
      ) : (
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
          {activeTab === "contacts" && (
            <div className="space-y-4">
              <ReferenceNumberingSection storageKey="__contact_numbering__" defaultPrefix="CMP" label="Contact" entityName="Contact" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <LabelItemList title="Categories" items={contactCategories}
                onAdd={() => openAdd("contactCategory")}
                onEdit={item => openEdit("contactCategory", item)}
                onDelete={id => handleDelete("contactCategory", id)} />
              <LabelItemList title="Statuses" items={contactStatuses}
                onAdd={() => openAdd("contactStatus")}
                onEdit={item => openEdit("contactStatus", item)}
                onDelete={id => handleDelete("contactStatus", id)} />
              <LabelItemList title="Groups" items={contactGroups}
                onAdd={() => openAdd("contactGroup")}
                onEdit={item => openEdit("contactGroup", item)}
                onDelete={id => handleDelete("contactGroup", id)} />
              </div>
              <FileSettingsSection storageKey="__contact_file_numbering__" defaultPrefix="FILE" label="Contact File" entityName="ContactFile" scope="Contact" />
            </div>
          )}
          {activeTab === "projects" && (
            <div className="space-y-4">
              <ReferenceNumberingSection storageKey="__project_numbering__" defaultPrefix="PRJ" label="Project" entityName="Project" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <LabelItemList title="Categories" items={projectCategories}
                onAdd={() => openAdd("projectCategory")}
                onEdit={item => openEdit("projectCategory", item)}
                onDelete={id => handleDelete("projectCategory", id)} />
              <LabelItemList title="Statuses" items={projectStatuses}
                onAdd={() => openAdd("projectStatus")}
                onEdit={item => openEdit("projectStatus", item)}
                onDelete={id => handleDelete("projectStatus", id)} />
              </div>
              <FileSettingsSection storageKey="__project_file_numbering__" defaultPrefix="FILE" label="Project File" entityName="ProjectFile" scope="Project" />
            </div>
          )}
          {activeTab === "assets" && (
            <div className="space-y-4">
              <ReferenceNumberingSection storageKey="__asset_numbering__" defaultPrefix="AST" label="Asset" entityName="Asset" />
              <AssetFieldsSection />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <LabelItemList title="Categories" items={assetCategories}
                onAdd={() => openAdd("assetCategory")}
                onEdit={item => openEdit("assetCategory", item)}
                onDelete={id => handleDelete("assetCategory", id)} />
              <LabelItemList title="Groups" items={assetGroups}
                onAdd={() => openAdd("assetGroup")}
                onEdit={item => openEdit("assetGroup", item)}
                onDelete={id => handleDelete("assetGroup", id)} />
              <LabelItemList title="Statuses" items={assetStatuses}
                onAdd={() => openAdd("assetStatus")}
                onEdit={item => openEdit("assetStatus", item)}
                onDelete={id => handleDelete("assetStatus", id)} />
              </div>
              <FileSettingsSection storageKey="__asset_file_numbering__" defaultPrefix="FILE" label="Asset File" entityName="AssetFile" scope="Asset" />
            </div>
          )}
          {activeTab === "tasks" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <LabelItemList title="Categories" items={taskCategories}
                onAdd={() => openAdd("taskCategory")}
                onEdit={item => openEdit("taskCategory", item)}
                onDelete={id => handleDelete("taskCategory", id)} />
              <LabelItemList title="Statuses" items={taskStatuses}
                onAdd={() => openAdd("taskStatus")}
                onEdit={item => openEdit("taskStatus", item)}
                onDelete={id => handleDelete("taskStatus", id)} />
              <ShiftList shifts={taskShifts}
                onAdd={() => openAdd("taskShift")}
                onEdit={item => openEdit("taskShift", item)}
                onDelete={id => handleDelete("taskShift", id)} />
            </div>
          )}
          {activeTab === "employees" && (
            <div className="space-y-4">
              <ReferenceNumberingSection storageKey="__employee_numbering__" defaultPrefix="EMP" label="Employee" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <LabelItemList title="Groups" items={employeeGroups}
                onAdd={() => openAdd("employeeGroup")}
                onEdit={item => openEdit("employeeGroup", item)}
                onDelete={id => handleDelete("employeeGroup", id)} />
              <LabelItemList title="Statuses" items={employeeStatuses}
                onAdd={() => openAdd("employeeStatus")}
                onEdit={item => openEdit("employeeStatus", item)}
                onDelete={id => handleDelete("employeeStatus", id)} />
              <LabelItemList title="Teams" items={teams}
                onAdd={() => openAdd("team")}
                onEdit={item => openEdit("team", item)}
                onDelete={id => handleDelete("team", id)} />
            </div>
            </div>
          )}

        </motion.div>
      )}

      <ItemModal
        open={!!modal}
        onClose={closeModal}
        onSave={handleSave}
        item={editing}
        title={modalTitles[modal] || ""}
      />
    </div>
  );
}