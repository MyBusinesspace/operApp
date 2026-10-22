import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Shield, Save, Loader2, Lock, Plus, Pencil, Trash2,
  DollarSign, FileText, ClipboardList, Briefcase, User, Eye,
  Users, Settings, Wrench, Truck, HardHat, Crown, Star, Zap,
  Building2, Cpu, Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  DEPARTMENTS, PERMISSIONS, ALL_MODULE_KEYS, MODULE_LABELS,
  getDefaultPerms, resolveKeys, cellOn, categoryStatus, slugifyRoleKey,
} from "@/lib/rolePermissionsConfig";
import { useRoles } from "@/hooks/useRoles";
import RoleEditModal from "@/components/settings/RoleEditModal";
import { syncRoleScopeToUsers, syncFinanceFlagsAllRoles } from "@/lib/syncRoleScope";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { listAll } from "@/lib/apiHelpers";

const ICONS = {
  Shield, Lock, DollarSign, FileText, Pencil, ClipboardList, Briefcase,
  User, Eye, Users, Settings, Wrench, Truck, HardHat, Crown, Star, Zap,
  Building2, Cpu, Heart,
};

const STATUS_PILL = {
  full: "bg-emerald-100 text-emerald-700",
  some: "bg-amber-100 text-amber-700",
  none: "bg-slate-100 text-slate-500",
};

// Data-scope toggles — when enabled for a role, all users with that role can
// view & edit ALL employees' records in that area (not just their own).
// Controlled per-role via checkboxes in the Data Scope bar.
const SCOPE_AREAS = [
  { key: "employees", viewFlag: "can_view_all_employees", editFlag: "can_edit_all_employees", label: "Profiles & HR documents",
    help: "Own: only their own record. View: read every employee. Edit: change any employee record." },
  { key: "leave", viewFlag: "can_view_all_leave", editFlag: "can_edit_all_leave", label: "Leave",
    help: "Own: only their own leave. View: see everyone's leave. Edit: act on anyone's leave." },
  { key: "payroll", viewFlag: "can_view_all_payroll", editFlag: "can_edit_all_payroll", label: "Payroll",
    help: "Own: no payroll access. View: read everyone's payroll. Edit: change any payroll record." },
  { key: "petty_cash", viewFlag: "can_view_all_petty_cash", editFlag: "can_edit_all_petty_cash", label: "Petty cash",
    help: "Own: only their own wallet. View: see all wallets. Edit: add entries in any wallet." },
];
const SCOPE_LEVELS = [
  { key: "own", label: "Own only" },
  { key: "view", label: "View everyone's" },
  { key: "edit", label: "View & edit everyone's" },
];
// Map a role's flags to a scope level. Legacy roles with only the view flag set
// are treated as full edit (that is what the flag granted).
function roleScopeLevel(role, area) {
  if (!role) return "own";
  if (!role[area.viewFlag]) return "own";
  if (role[area.editFlag] === false) return "view";
  return "edit";
}
// Map a scope level back to persisted flags.
function scopeLevelToFlags(area, level) {
  return {
    [area.viewFlag]: level !== "own",
    [area.editFlag]: level === "edit",
  };
}

function RoleIcon({ name, className }) {
  const Ic = ICONS[name] || Shield;
  return <Ic className={className} />;
}

export default function RolePermissionsSection() {
  const { roles, reload: reloadRoles } = useRoles();
  const [perms, setPerms] = useState({});
  const [selectedRoleKey, setSelectedRoleKey] = useState("administrator");
  const [activeCategory, setActiveCategory] = useState(DEPARTMENTS[0].key);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [scopeLevels, setScopeLevels] = useState({ employees: "own", leave: "own", payroll: "own", petty_cash: "own" });
  const [scopeDirty, setScopeDirty] = useState(false);
  const { toast } = useToast();
  const { can } = usePermissionsMatrix();
  const canEdit = can("hr_settings", "can_edit");
  const canCreate = can("hr_settings", "can_create");
  const canDelete = can("hr_settings", "can_delete");
  const readOnly = !canEdit;

  // Load RolePermission records and seed missing combos for all known roles.
  // Guarded against concurrent runs (React StrictMode double-fires effects in dev)
  // and chunked to stay under API rate limits.
  const loadingRef = useRef(false);
  const permListRef = useRef(null); // fired on mount, independent of roles
  const loadPerms = async (roleList) => {
    if (!roleList.length || loadingRef.current) return;
    loadingRef.current = true;
    try {
      if (!permListRef.current) permListRef.current = listAll(base44.entities.RolePermission, "-created_date", 500).catch(() => []);
      const permList = await permListRef.current;
      const map = {};
      const permsToCreate = [];
      // Dedupe: first record wins (list is -created_date, so newest first).
      permList.forEach(p => { const k = `${p.role}|${p.module}`; if (!map[k]) map[k] = p; });
      roleList.forEach(role => {
        ALL_MODULE_KEYS.forEach(mk => {
          const k = `${role.key}|${mk}`;
          if (!map[k]) {
            const def = getDefaultPerms(role.key, mk);
            map[k] = { role: role.key, module: mk, ...def };
            permsToCreate.push({ role: role.key, module: mk, ...def });
          }
        });
      });
      if (permsToCreate.length) {
        const BATCH = 30;
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < permsToCreate.length; i += BATCH) {
          const batch = permsToCreate.slice(i, i + BATCH);
          const created = await base44.entities.RolePermission.bulkCreate(batch);
          created.forEach(c => { map[`${c.role}|${c.module}`] = c; });
          if (i + BATCH < permsToCreate.length) await sleep(300);
        }
      }
      setPerms(map);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (roles.length) loadPerms(roles);
  }, [roles]);

  // Load scope levels from the selected role whenever it changes.
  useEffect(() => {
    const role = roles.find(r => r.key === selectedRoleKey);
    if (role) {
      const next = {};
      SCOPE_AREAS.forEach(a => { next[a.key] = roleScopeLevel(role, a); });
      setScopeLevels(next);
      setScopeDirty(false);
    }
  }, [selectedRoleKey, roles]);

  const isAdminRole = (key) => key === "administrator";

  const setScopeLevel = (areaKey, level) => {
    setScopeLevels(prev => ({ ...prev, [areaKey]: level }));
    setScopeDirty(true);
  };

  const toggleCell = (roleKey, moduleKey, perm) => {
    const newVal = !cellOn(perms, roleKey, moduleKey, perm);
    const keys = resolveKeys(perm);
    setPerms(prev => {
      const next = { ...prev };
      const k = `${roleKey}|${moduleKey}`;
      const updated = { ...next[k] };
      keys.forEach(kk => { updated[kk] = newVal; });
      next[k] = updated;
      return next;
    });
  };

  const toggleCategory = (roleKey, dept) => {
    const allOn = dept.modules.every(mk => PERMISSIONS.every(p => cellOn(perms, roleKey, mk, p)));
    setPerms(prev => {
      const next = { ...prev };
      dept.modules.forEach(mk => {
        const k = `${roleKey}|${mk}`;
        const updated = { ...next[k] };
        PERMISSIONS.forEach(p => {
          resolveKeys(p).forEach(kk => { updated[kk] = !allOn; });
        });
        next[k] = updated;
      });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.values(perms);
      const toUpdate = entries.filter(e => e.id).map(({ id, ...data }) => ({ id, ...data }));
      const toCreate = entries.filter(e => !e.id).map(({ id, ...data }) => data);
      const createdRecs = [];
      if (toUpdate.length) {
        await base44.entities.RolePermission.bulkUpdate(toUpdate);
      }
      if (toCreate.length) {
        const recs = await base44.entities.RolePermission.bulkCreate(toCreate);
        recs.forEach(c => createdRecs.push({ key: `${c.role}|${c.module}`, id: c.id }));
      }
      if (createdRecs.length) {
        setPerms(prev => {
          const next = { ...prev };
          createdRecs.forEach(c => { next[c.key] = { ...next[c.key], id: c.id }; });
          return next;
        });
      }
      // Save data-scope flags to the selected role and sync to all users with that role.
      if (scopeDirty && selectedRole && !isAdminRole(selectedRole.key)) {
        const flagPayload = {};
        SCOPE_AREAS.forEach(a => Object.assign(flagPayload, scopeLevelToFlags(a, scopeLevels[a.key])));
        await base44.entities.EmployeeRole.update(selectedRole.id, flagPayload);
        try {
          const res = await syncRoleScopeToUsers(selectedRole.key, flagPayload);
          if (res.failed > 0) {
            toast({
              title: "Partial sync",
              description: `${res.updated} user(s) updated, ${res.failed} failed.`,
              variant: "destructive",
            });
          }
        } catch (e) {
          console.warn("Could not sync scope flags to users:", e.message);
        }
        setScopeDirty(false);
      }
      try { await syncFinanceFlagsAllRoles(); } catch (e) { console.warn("Could not sync finance flags:", e.message); }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Permissions saved", description: "Role permissions updated successfully." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRole = async (data) => {
    const currentRoles = await base44.entities.EmployeeRole.list("name", 500);
    const normalizedName = data.name.trim().toLowerCase();
    if (currentRoles.some(r => r.id !== editingRole?.id && r.name?.trim().toLowerCase() === normalizedName)) {
      throw new Error("A role with this name already exists.");
    }
    if (editingRole) {
      // Rename / edit existing role (key stays the same).
      await base44.entities.EmployeeRole.update(editingRole.id, {
        name: data.name, icon: data.icon, color: data.color, description: data.description,
      });
      toast({ title: "Role updated", description: `${data.name} saved.` });
    } else {
      // Create new role.
      const key = slugifyRoleKey(data.name, currentRoles.map(r => r.key));
      await base44.entities.EmployeeRole.create({
        key, name: data.name, icon: data.icon, color: data.color,
        description: data.description, is_system: false,
      });
      toast({ title: "Role created", description: `${data.name} added. Configure its permissions below.` });
    }
    setEditOpen(false);
    setEditingRole(null);
    await reloadRoles();
  };

  const handleDeleteRole = async (role) => {
    // Block deletion if employees are assigned to this role.
    const assigned = await base44.entities.Employee.filter({ role: role.key }, "-created_date", 1);
    if (assigned && assigned.length) {
      toast({
        title: "Cannot delete role",
        description: `${assigned.length === 1 ? "1 employee is" : `${assigned.length} employees are`} assigned to "${role.name}". Reassign them first.`,
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Delete the role "${role.name}"? This cannot be undone.`)) return;
    // Delete RolePermission records for this role.
    const rolePerms = await base44.entities.RolePermission.filter({ role: role.key });
    if (rolePerms.length) {
      await base44.entities.RolePermission.deleteMany({ role: role.key });
    }
    await base44.entities.EmployeeRole.delete(role.id);
    // Clean local state.
    setPerms(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${role.key}|`)) delete next[k]; });
      return next;
    });
    if (selectedRoleKey === role.key) setSelectedRoleKey("administrator");
    toast({ title: "Role deleted", description: `${role.name} has been removed.` });
    await reloadRoles();
  };

  const dept = DEPARTMENTS.find(d => d.key === activeCategory) || DEPARTMENTS[0];
  const selectedRole = roles.find(r => r.key === selectedRoleKey);

  if (loading || !roles.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading permissions...
      </div>
    );
  }

  const toggleColumn = (roleKey, dept, perm) => {
    const allOn = dept.modules.every(mk => cellOn(perms, roleKey, mk, perm));
    setPerms(prev => {
      const next = { ...prev };
      dept.modules.forEach(mk => {
        const k = `${roleKey}|${mk}`;
        const updated = { ...next[k] };
        resolveKeys(perm).forEach(kk => { updated[kk] = !allOn; });
        next[k] = updated;
      });
      return next;
    });
  };

  const categoryCount = (d) => {
    if (isAdminRole(selectedRoleKey)) return `${d.modules.length}/${d.modules.length}`;
    const n = d.modules.filter(mk => PERMISSIONS.some(p => cellOn(perms, selectedRoleKey, mk, p))).length;
    return `${n}/${d.modules.length}`;
  };

  return (
    <div className="flex gap-4 items-start">
      {/* Roles sidebar */}
      <div className="w-60 shrink-0 bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Roles</span>
        </div>
        <div className="p-1.5 space-y-0.5 max-h-[520px] overflow-y-auto">
          {roles.map(role => {
            const active = role.key === selectedRoleKey;
            return (
              <button key={role.key} type="button"
                onClick={() => setSelectedRoleKey(role.key)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted/50"
                }`}>
                <RoleIcon name={role.icon} className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{role.name}</span>
                {isAdminRole(role.key) && <Lock className="w-3 h-3 ml-auto shrink-0" />}
              </button>
            );
          })}
          {canCreate && (
            <button type="button"
              onClick={() => { setEditingRole(null); setEditOpen(true); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Role
            </button>
          )}
        </div>
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <RoleIcon name={selectedRole?.icon} className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{selectedRole?.name || "Role"}</h3>
          <span className="text-xs text-muted-foreground">— Admin always has full access</span>
          <div className="ml-auto flex items-center gap-2">
            {selectedRole && !isAdminRole(selectedRole.key) && canEdit && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5"
                onClick={() => { setEditingRole(selectedRole); setEditOpen(true); }}>
                <Pencil className="w-3 h-3" /> Rename
              </Button>
            )}
            {selectedRole && !isAdminRole(selectedRole.key) && canDelete && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                onClick={() => handleDeleteRole(selectedRole)}>
                <Trash2 className="w-3 h-3" /> Delete
              </Button>
            )}
            {canEdit && (
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
              </Button>
            )}
          </div>
        </div>

        {/* Data Scope card */}
        {selectedRole && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data Scope</span>
              <span className="text-[11px] text-muted-foreground">
                {isAdminRole(selectedRole.key) ? "Admin sees everything" : "Whose records this role can see in each area"}
              </span>
              {scopeDirty && <span className="text-[10px] text-amber-600 font-medium ml-auto">Unsaved scope changes</span>}
            </div>
            <div className="divide-y divide-border">
              {SCOPE_AREAS.map(area => {
                const level = isAdminRole(selectedRole.key) ? "edit" : (scopeLevels[area.key] || "own");
                const disabled = isAdminRole(selectedRole.key) || readOnly;
                return (
                  <div key={area.key} className="px-4 py-2.5 flex items-center gap-4 flex-wrap">
                    <div className="w-44 shrink-0">
                      <div className="text-xs font-medium text-foreground">{area.label}</div>
                    </div>
                    <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                      {SCOPE_LEVELS.map(l => (
                        <button key={l.key} type="button" disabled={disabled}
                          onClick={() => setScopeLevel(area.key, l.key)}
                          className={`px-3 py-1.5 text-[11px] font-medium transition-colors border-r border-border last:border-r-0 ${
                            level === l.key
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          } ${disabled ? "opacity-70 cursor-default" : "cursor-pointer"}`}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] text-muted-foreground min-w-0 flex-1 hidden lg:block">{area.help}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Permission matrix card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Categories with counters */}
          <div className="px-3 pt-3 pb-0 border-b border-border flex items-stretch gap-0 overflow-x-auto -mb-px">
            {DEPARTMENTS.map(d => {
              const active = d.key === activeCategory;
              return (
                <button key={d.key} type="button"
                  onClick={() => setActiveCategory(d.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap border border-b-0 border-slate-300 dark:border-slate-600 transition-colors ${
                    active
                      ? "bg-white dark:bg-slate-900 text-black dark:text-white border-t-2 border-t-primary shadow-sm"
                      : "bg-slate-50 dark:bg-slate-800/60 text-primary dark:text-primary/80 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.label}
                  <span className={`text-[10px] font-bold ${active ? "text-black dark:text-white" : "text-primary dark:text-primary/70"}`}>{categoryCount(d)}</span>
                </button>
              );
            })}
          </div>

          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/95 dark:bg-slate-800/95 border-b border-border backdrop-blur">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {dept.label}
                    <span className="normal-case font-normal text-muted-foreground/80"> · {dept.documents}</span>
                  </th>
                  {PERMISSIONS.map(p => {
                    const colAllOn = !isAdminRole(selectedRoleKey) && dept.modules.every(mk => cellOn(perms, selectedRoleKey, mk, p));
                    return (
                      <th key={p.key} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{p.label}</span>
                          {!isAdminRole(selectedRoleKey) && canEdit && (
                            <button type="button" onClick={() => toggleColumn(selectedRoleKey, dept, p)}
                              className="text-[9px] font-medium text-primary hover:underline normal-case">
                              {colAllOn ? "Clear all" : "Toggle all"}
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {dept.modules.map((mk, i) => (
                  <tr key={mk} className={i % 2 === 1 ? "bg-muted/10" : ""}>
                    <td className="px-4 py-1.5 text-foreground font-medium text-xs">
                      {MODULE_LABELS[mk] || mk}
                    </td>
                    {PERMISSIONS.map(p => {
                      const on = isAdminRole(selectedRoleKey) ? true : cellOn(perms, selectedRoleKey, mk, p);
                      return (
                        <td key={p.key} className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={on}
                            onChange={() => !readOnly && toggleCell(selectedRoleKey, mk, p)}
                            disabled={isAdminRole(selectedRoleKey) || readOnly}
                            className="w-4 h-4 accent-primary cursor-pointer rounded" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t border-border bg-muted/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {isAdminRole(selectedRoleKey) ? (
              <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Administrator role always has full access to every category.</span>
            ) : (
              <>
                <span className="font-medium text-foreground">Legend:</span>
                <span><span className="font-semibold">V</span> = View</span>
                <span><span className="font-semibold">E</span> = Edit (Create · Edit · Delete)</span>
                <span><span className="font-semibold">A</span> = Approve</span>
              </>
            )}
          </div>
        </div>
      </div>

      <RoleEditModal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditingRole(null); }}
        onSave={handleSaveRole}
        role={editingRole}
      />
    </div>
  );
}
