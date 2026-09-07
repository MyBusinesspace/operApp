import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Shield, Save, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

// Departments group the permissionable modules. Each department row shows
// the documents it covers (in parentheses) and manages the flags at the
// department level — toggling a flag applies it uniformly to all its modules.
const DEPARTMENTS = [
  {
    key: "administration",
    label: "Administration",
    documents: "Contacts, Projects, Assets, Settings",
    modules: ["contacts", "projects", "assets", "settings"],
    color: "#6366f1",
  },
  {
    key: "operations",
    label: "Operations",
    documents: "Work Orders, Tasks, Timesheets, Planner",
    modules: ["work_orders", "tasks", "timesheets", "planner"],
    color: "#0ea5e9",
  },
  {
    key: "hr",
    label: "HR",
    documents: "Employees, Leave, Payroll",
    modules: ["employees", "leave", "payroll"],
    color: "#ec4899",
  },
  {
    key: "sales",
    label: "Sales",
    documents: "Invoices, Quotes, Products, Customers, Statements",
    modules: ["sales"],
    color: "#22c55e",
  },
  {
    key: "purchasing",
    label: "Purchasing",
    documents: "Bills, Purchase Orders, Suppliers, Petty Cash",
    modules: ["purchases", "petty_cash"],
    color: "#f59e0b",
  },
  {
    key: "accounting",
    label: "Accounting",
    documents: "Chart of Accounts, Bank Accounts, Journal Entries",
    modules: ["accounting"],
    color: "#14b8a6",
  },
  {
    key: "finance",
    label: "Finance",
    documents: "Dashboard, Reports",
    modules: ["dashboard", "reports"],
    color: "#8b5cf6",
    delicate: true,
  },
];

const ALL_MODULE_KEYS = DEPARTMENTS.flatMap(d => d.modules);

// "Edit" is a composite column that toggles can_create, can_edit and can_delete
// together — they are conceptually the same "modify" capability.
const PERMISSIONS = [
  { key: "can_view", label: "View", abbr: "V" },
  { key: "can_edit", label: "Edit", abbr: "E", composite: ["can_create", "can_edit", "can_delete"] },
  { key: "can_approve", label: "Approve", abbr: "A" },
  { key: "can_create_on_behalf", label: "On Behalf", abbr: "O" },
];

const DEFAULT_PERMS = { can_view: true, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_create_on_behalf: false };

function RoleModal({ open, onClose, onSave, role }) {
  const [form, setForm] = useState({ name: "", key: "", color: "#6366f1", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role) {
      setForm({ name: role.name || "", key: role.key || "", color: role.color || "#6366f1", description: role.description || "" });
    } else {
      setForm({ name: "", key: "", color: "#6366f1", description: "" });
    }
  }, [role, open]);

  const handleNameChange = (v) => {
    setForm(f => ({
      ...f,
      name: v,
      // Auto-generate key only when creating new
      ...(!role ? { key: v.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") } : {}),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.key.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{role ? "Edit Role" : "Add Role"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Role Name *</Label>
            <Input value={form.name} onChange={e => handleNameChange(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Key *</Label>
            <Input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") }))} placeholder="e.g. field_staff" required disabled={!!role} />
            <p className="text-xs text-muted-foreground">Used internally. Cannot be changed after creation.</p>
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
              <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#6366f1" className="flex-1" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.key.trim()}>
              {saving ? "Saving..." : role ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RolePermissionsSection() {
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const { toast } = useToast();

  const loadRoles = async () => {
    const [roleList, permList] = await Promise.all([
      base44.entities.EmployeeRole.list("name", 100),
      base44.entities.RolePermission.list("-created_date", 200),
    ]);

    const map = {};
    permList.forEach(p => { map[`${p.role}|${p.module}`] = p; });

    // Fill defaults for missing combos
    roleList.forEach(r => {
      ALL_MODULE_KEYS.forEach(mk => {
        const k = `${r.key}|${mk}`;
        if (!map[k]) map[k] = { role: r.key, module: mk, ...DEFAULT_PERMS };
      });
    });

    setRoles(roleList);
    setPerms(map);
    setLoading(false);
  };

  useEffect(() => { loadRoles(); }, []);

  // Admin role is always fully permitted and not editable from the matrix.
  const isAdmin = (role) => role.key === "admin";

  // Resolve the underlying flags a column controls (handles composite "Edit").
  const resolveKeys = (perm) => (perm.composite ? perm.composite : [perm.key]);

  // A cell is "on" only when ALL modules in the department have ALL underlying flags on.
  const cellValue = (roleKey, dept, perm) => {
    const keys = resolveKeys(perm);
    return dept.modules.every(mk => keys.every(k => perms[`${roleKey}|${mk}`]?.[k]));
  };

  const toggleCell = (roleKey, dept, perm) => {
    const newVal = !cellValue(roleKey, dept, perm);
    const keys = resolveKeys(perm);
    setPerms(prev => {
      const next = { ...prev };
      dept.modules.forEach(mk => {
        const k = `${roleKey}|${mk}`;
        const updated = { ...next[k] };
        keys.forEach(kk => { updated[kk] = newVal; });
        next[k] = updated;
      });
      return next;
    });
  };

  const toggleCol = (roleKey, perm) => {
    const allChecked = DEPARTMENTS.every(d => cellValue(roleKey, d, perm));
    const keys = resolveKeys(perm);
    setPerms(prev => {
      const next = { ...prev };
      DEPARTMENTS.forEach(d => d.modules.forEach(mk => {
        const k = `${roleKey}|${mk}`;
        const updated = { ...next[k] };
        keys.forEach(kk => { updated[kk] = !allChecked; });
        next[k] = updated;
      }));
      return next;
    });
  };

  const isColAllChecked = (roleKey, perm) =>
    DEPARTMENTS.every(d => cellValue(roleKey, d, perm));

  const handleSavePerms = async () => {
    setSaving(true);
    const entries = Object.values(perms);
    await Promise.all(entries.map(async p => {
      const { id, ...data } = p;
      if (id) {
        await base44.entities.RolePermission.update(id, data);
      } else {
        const created = await base44.entities.RolePermission.create(data);
        setPerms(prev => ({ ...prev, [`${data.role}|${data.module}`]: { ...prev[`${data.role}|${data.module}`], id: created.id } }));
      }
    }));
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    toast({ title: "Permissions saved", description: "Role permissions updated successfully." });
  };

  const handleSaveRole = async (form) => {
    if (editingRole) {
      await base44.entities.EmployeeRole.update(editingRole.id, form);
      // Cascade rename: keep employees linked by name in sync when a role is renamed.
      if (form.name && form.name !== editingRole.name) {
        try {
          const emps = await base44.entities.Employee.filter({ role: editingRole.name });
          if (emps.length) await base44.entities.Employee.bulkUpdate(emps.map(e => ({ id: e.id, role: form.name })));
        } catch { /* non-critical */ }
      }
    } else {
      await base44.entities.EmployeeRole.create(form);
    }
    setRoleModal(false); setEditingRole(null);
    setLoading(true);
    await loadRoles();
  };

  const handleDeleteRole = async (role) => {
    if (role.is_system) return;
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    await base44.entities.EmployeeRole.delete(role.id);
    setLoading(true);
    await loadRoles();
  };

  // Roles rendered as matrix columns, ordered by sort_order (roles without an
  // explicit sort_order keep their original fetched order).
  const sortedRoles = [...roles].sort((a, b) => {
    const sa = a.sort_order ?? null;
    const sb = b.sort_order ?? null;
    if (sa != null && sb != null) return sa - sb;
    if (sa != null) return -1;
    if (sb != null) return 1;
    return 0;
  });

  const moveRole = async (role, dir) => {
    const ordered = [...sortedRoles];
    const i = ordered.findIndex(r => r.id === role.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    const updates = ordered.map((r, idx) => ({ id: r.id, sort_order: idx }));
    setRoles(prev => prev.map(r => {
      const u = updates.find(x => x.id === r.id);
      return u ? { ...r, sort_order: u.sort_order } : r;
    }));
    await base44.entities.EmployeeRole.bulkUpdate(updates);
  };

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading permissions...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Roles & Permissions</h3>
            <span className="text-xs text-muted-foreground">— Admin always has full access</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7"
              onClick={() => { setEditingRole(null); setRoleModal(true); }}>
              <Plus className="w-3.5 h-3.5" /> Add Role
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSavePerms} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Cross matrix: rows = departments, columns = roles, cells = V/E/A/O */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-border">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th rowSpan={2} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-muted/10 z-10">Department</th>
                {sortedRoles.map((role, rIdx) => (
                  <th key={role.id} colSpan={PERMISSIONS.length} className="text-center px-1 py-2 border-l border-border">
                    <div className="flex items-center justify-center gap-1 group">
                      <button type="button" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default"
                        onClick={() => moveRole(role, -1)} disabled={rIdx === 0} title="Move left">
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color || "#6366f1" }} />
                      <span className="text-xs font-semibold text-foreground whitespace-nowrap">{role.name}</span>
                      <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingRole(role); setRoleModal(true); }} title="Edit role">
                          <Pencil className="w-3 h-3" />
                        </button>
                        {!role.is_system && (
                          <button type="button" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRole(role)} title="Delete role">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                      <button type="button" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default"
                        onClick={() => moveRole(role, 1)} disabled={rIdx === sortedRoles.length - 1} title="Move right">
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border bg-muted/10">
                {sortedRoles.map(role => PERMISSIONS.map(perm => (
                  <th key={`${role.id}-${perm.key}`} className="px-1 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-l border-border w-10">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{perm.abbr}</span>
                      <input type="checkbox"
                        checked={isAdmin(role) ? true : isColAllChecked(role.key, perm)}
                        onChange={() => toggleCol(role.key, perm)}
                        disabled={isAdmin(role)}
                        className="w-3 h-3 accent-primary cursor-pointer rounded"
                        title={`Toggle all ${perm.label} for ${role.name}`} />
                    </div>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {DEPARTMENTS.map((dept, dIdx) => {
                const alt = dIdx % 2 === 1;
                return (
                <tr key={dept.key}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/20"
                  style={{ backgroundColor: dept.delicate ? "rgba(254, 243, 199, 0.35)" : alt ? "rgba(248, 250, 252, 0.7)" : "transparent" }}>
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground sticky left-0 z-10"
                    style={{
                      backgroundColor: dept.delicate ? "rgba(254, 243, 199, 0.85)" : alt ? "rgba(248, 250, 252, 0.95)" : "#ffffff",
                      borderLeft: `4px solid ${dept.color || "#6366f1"}`,
                      boxShadow: "2px 0 0 0 rgba(0,0,0,0.03)",
                    }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dept.color || "#6366f1" }} />
                        {dept.label}
                        {dept.delicate && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">sensitive</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">{dept.documents}</span>
                    </div>
                  </td>
                  {sortedRoles.map(role => PERMISSIONS.map(perm => {
                    const checked = isAdmin(role) ? true : cellValue(role.key, dept, perm);
                    return (
                      <td key={`${role.id}-${perm.key}`} className="px-1 py-2 text-center border-l border-border w-10">
                        <input type="checkbox" checked={checked}
                          onChange={() => toggleCell(role.key, dept, perm)}
                          disabled={isAdmin(role)}
                          className="w-3.5 h-3.5 accent-primary cursor-pointer rounded" />
                      </td>
                    );
                  }))}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border bg-muted/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Legend:</span>
          <span><span className="font-semibold">V</span> = View</span>
          <span><span className="font-semibold">E</span> = Edit (Create · Edit · Delete)</span>
          <span><span className="font-semibold">A</span> = Approve</span>
          <span><span className="font-semibold">O</span> = On Behalf</span>
        </div>
      </div>

      <RoleModal
        open={roleModal}
        onClose={() => { setRoleModal(false); setEditingRole(null); }}
        onSave={handleSaveRole}
        role={editingRole}
      />
    </div>
  );
}