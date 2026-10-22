import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, Plus, Pencil, Trash2, UserCog, Shield, Clock, DollarSign, CalendarDays, History
} from "lucide-react";
import RolePermissionsSection from "@/components/settings/RolePermissionsSection";
import OvertimeSettingsSection from "@/components/settings/OvertimeSettingsSection";
import PayrollComponentsSection from "@/components/settings/PayrollComponentsSection";
import LeaveSettingsSection from "@/components/settings/LeaveSettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

function ColorDot({ color }) {
  return <span className="w-3 h-3 rounded-full shrink-0 inline-block" style={{ backgroundColor: color || "#6366f1" }} />;
}

function LabelItemList({ title, items, onAdd, onEdit, onDelete }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {onAdd && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={onAdd}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">No {title.toLowerCase()} yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{item.name}</p>
                {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
              </div>
              {(onEdit || onDelete) && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onEdit && (
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onDelete && (
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmpDocTypeList({ items, onAdd, onEdit, onDelete }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-xs font-semibold text-foreground">Document Types</h3>
        {onAdd && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={onAdd}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">No document types yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.requires_expiry ? "Requires expiry date" : "No expiry required"}</p>
              </div>
              {(onEdit || onDelete) && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onEdit && (
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onDelete && (
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemModal({ open, onClose, onSave, item, title }) {
  const isDocType = title === "Employee Document Type";
  const [form, setForm] = useState({ name: "", color: "#6366f1", description: "", requires_expiry: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(item
      ? { name: item.name || "", color: item.color || "#6366f1", description: item.description || "", requires_expiry: item.requires_expiry || false }
      : { name: "", color: "#6366f1", description: "", requires_expiry: false });
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
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
              <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#6366f1" className="flex-1" />
            </div>
          </div>
          {!isDocType && (
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
            </div>
          )}
          {isDocType && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="requires_expiry" checked={form.requires_expiry}
                onChange={e => setForm(f => ({ ...f, requires_expiry: e.target.checked }))}
                className="w-4 h-4 rounded border-input accent-primary cursor-pointer" />
              <Label htmlFor="requires_expiry" className="cursor-pointer">Requires expiry date</Label>
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

export default function HRSettings() {
  const { can } = usePermissionsMatrix();
  const canCreate = can("hr_settings", "can_create");
  const canEdit = can("hr_settings", "can_edit");
  const canDelete = can("hr_settings", "can_delete");
  const [empDocTypes, setEmpDocTypes] = useState([]);
  const [employeeStatuses, setEmployeeStatuses] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const [edt, es, tm] = await Promise.all([
      base44.entities.EmployeeDocumentType.list("name", 100),
      base44.entities.EmployeeStatus.list("name", 100),
      base44.entities.Team.list("name", 200),
    ]);
    setEmpDocTypes(edt);
    setEmployeeStatuses(es);
    setTeams(tm);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const entityMap = {
    empDocType: base44.entities.EmployeeDocumentType,
    employeeStatus: base44.entities.EmployeeStatus,
    team: base44.entities.Team,
  };

  const openAdd = (entity) => { setModal(entity); setEditing(null); };
  const openEdit = (entity, item) => { setModal(entity); setEditing(item); };
  const closeModal = () => { setModal(null); setEditing(null); };

  const handleSave = async (form) => {
    if (editing) await entityMap[modal].update(editing.id, form);
    else await entityMap[modal].create(form);
    closeModal();
    load();
  };

  const handleDelete = async (entity, id) => {
    if (!confirm("Delete this item?")) return;
    await entityMap[entity].delete(id);
    load();
  };

  const modalTitle = {
    empDocType: "Employee Document Type",
    employeeStatus: "Employee Status",
    team: "Team",
  }[modal] || "";

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">HR Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage employee statuses, teams and document types</p>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="text-center text-muted-foreground text-xs py-12">Loading...</div>
      ) : (
        <Tabs defaultValue="employee" className="w-full">
          <TabsList className="h-10">
            <TabsTrigger value="employee" className="gap-1.5"><UserCog className="w-3.5 h-3.5" /> Employee</TabsTrigger>
            <TabsTrigger value="leave" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Leave</TabsTrigger>
            <TabsTrigger value="overtime" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Overtime</TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Payroll</TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Roles & Permissions</TabsTrigger>
          </TabsList>

          {/* ── Employee tab ── */}
          <TabsContent value="employee" className="space-y-8 mt-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
              <div className="flex items-center gap-2 mb-3">
                <UserCog className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Employees</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <LabelItemList
                  title="Statuses"
                  items={employeeStatuses}
                  onAdd={canCreate ? () => openAdd("employeeStatus") : undefined}
                  onEdit={canEdit ? (item) => openEdit("employeeStatus", item) : undefined}
                  onDelete={canDelete ? (id) => handleDelete("employeeStatus", id) : undefined}
                />
                <LabelItemList
                  title="Teams"
                  items={teams}
                  onAdd={canCreate ? () => openAdd("team") : undefined}
                  onEdit={canEdit ? (item) => openEdit("team", item) : undefined}
                  onDelete={canDelete ? (id) => handleDelete("team", id) : undefined}
                />
                <EmpDocTypeList
                  items={empDocTypes}
                  onAdd={canCreate ? () => openAdd("empDocType") : undefined}
                  onEdit={canEdit ? (item) => openEdit("empDocType", item) : undefined}
                  onDelete={canDelete ? (id) => handleDelete("empDocType", id) : undefined}
                />
              </div>
            </motion.div>
          </TabsContent>

          {/* ── Roles & Permissions tab ── */}
          <TabsContent value="roles" className="space-y-8 mt-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Roles & Permissions</h2>
              </div>
              <RolePermissionsSection />
            </motion.div>
          </TabsContent>

          {/* ── Leave tab ── */}
          <TabsContent value="leave" className="space-y-8 mt-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Leave Defaults</h2>
              </div>
              <LeaveSettingsSection />
            </motion.div>
          </TabsContent>

          {/* ── Overtime tab ── */}
          <TabsContent value="overtime" className="space-y-8 mt-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Overtime Rules</h2>
              </div>
              <OvertimeSettingsSection />
            </motion.div>
          </TabsContent>

          {/* ── Payroll tab ── */}
          <TabsContent value="payroll" className="space-y-8 mt-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.095 }}>
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Payroll Components</h2>
              </div>
              <PayrollComponentsSection />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Historical Payments</h2>
              </div>
              <Link to="/settings/historical-payments">
                <div className="bg-card rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                    <History className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-foreground">Import Historical Gratuity & Leave Bonus</p>
                    <p className="text-xs text-muted-foreground">Bulk-import past payments from before this system was in use to keep each employee's history and "last paid year" status accurate.</p>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                </div>
              </Link>
            </motion.div>
          </TabsContent>
        </Tabs>
      )}

      <ItemModal
        open={!!modal}
        onClose={closeModal}
        onSave={handleSave}
        item={editing}
        title={modalTitle}
      />
    </div>
  );
}