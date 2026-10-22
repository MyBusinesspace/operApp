import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Shield, Check, X, Lock, Pencil, DollarSign, FileText,
  ClipboardList, Briefcase, User, Eye, ChevronDown,
  Users, Settings, Wrench, Truck, HardHat, Crown, Star, Zap,
  Building2, Cpu, Heart,
} from "lucide-react";
import {
  DEPARTMENTS, PERMISSIONS, MODULE_LABELS, ALL_MODULE_KEYS,
  getDefaultPerms, cellOn, categoryStatus,
} from "@/lib/rolePermissionsConfig";
import { useRoles } from "@/hooks/useRoles";
import { getScopeFlagsForRole, getFinanceFlagsForRole, getPlatformRoleForKey, isLastAdministrator } from "@/lib/syncRoleScope";
import { useToast } from "@/components/ui/use-toast";

const ICONS = {
  Shield, Lock, DollarSign, FileText, Pencil, ClipboardList, Briefcase,
  User, Eye, Users, Settings, Wrench, Truck, HardHat, Crown, Star, Zap,
  Building2, Cpu, Heart,
};

function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

const STATUS_PILL = {
  full: { label: "Full access", className: "bg-emerald-100 text-emerald-700", Icon: Lock },
  some: { label: "Some access", className: "bg-amber-100 text-amber-700", Icon: Pencil },
  none: { label: "No access", className: "bg-slate-100 text-slate-500", Icon: Lock },
};

export default function EmployeePermissionsModal({ open, onClose, employee, onSaved }) {
  const [allPerms, setAllPerms] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [activeCategory, setActiveCategory] = useState(DEPARTMENTS[0].key);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { roles } = useRoles();
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !employee) return;
    setLoading(true);
    base44.entities.RolePermission.list("-created_date", 500).then(p => {
      setAllPerms(p);
      const current = roles.find(r => r.key === employee.role || r.name === employee.role);
      setSelectedRoleKey(current?.key || "");
      setDirty(false);
      setActiveCategory(DEPARTMENTS[0].key);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, employee]);

  const selectedRole = roles.find(r => r.key === selectedRoleKey);
  const isAdminRole = selectedRoleKey === "administrator";

  // Build a perms map for the selected role (fill defaults for missing combos).
  const permsMap = {};
  if (selectedRoleKey) {
    ALL_MODULE_KEYS.forEach(mk => {
      const found = allPerms.find(p => p.role === selectedRoleKey && p.module === mk);
      permsMap[`${selectedRoleKey}|${mk}`] = found || { role: selectedRoleKey, module: mk, ...getDefaultPerms(selectedRoleKey, mk) };
    });
  }

  const handleRoleChange = (key) => {
    setSelectedRoleKey(key);
    setDropdownOpen(false);
    const currentKey = roles.find(r => r.key === employee?.role || r.name === employee?.role)?.key;
    setDirty(key !== currentKey);
  };

  const handleSave = async () => {
    const role = roles.find(r => r.key === selectedRoleKey);
    if (!role) return;
    // Prevent demoting the last administrator
    const currentRoleKey = roles.find(r => r.key === employee?.role || r.name === employee?.role)?.key;
    if (currentRoleKey === "administrator" && selectedRoleKey !== "administrator") {
      try {
        if (await isLastAdministrator(employee.id)) {
          toast({ title: "Cannot remove last administrator", description: "At least one administrator is required. Assign another administrator first.", variant: "destructive" });
          return;
        }
      } catch (e) { /* allow on error */ }
    }
    setSaving(true);
    try {
      await base44.entities.Employee.update(employee.id, { role: role.key });
      // Sync data-scope flags (leave / payroll / documents) from the role to the linked app User
      // so RLS grants the correct cross-employee visibility.
      if (employee.user_id) {
        const scopeFlags = getScopeFlagsForRole(role);
        const platformRole = getPlatformRoleForKey(role.key);
        const financeFlags = await getFinanceFlagsForRole(role.key);
        try {
          await base44.entities.User.update(employee.user_id, { role: platformRole, ...scopeFlags, ...financeFlags });
        } catch (e) {
          console.warn("Could not sync role/scope flags to user:", e.message);
        }
      }
      setDirty(false);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const dept = DEPARTMENTS.find(d => d.key === activeCategory) || DEPARTMENTS[0];
  const SelectedIcon = selectedRole ? (ICONS[selectedRole.icon] || Shield) : Shield;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 shrink-0">
              <AvatarImage src={employee?.avatar_url} alt={employee?.full_name} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials(employee?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground leading-tight truncate">
                {employee?.full_name}
              </h2>
              <p className="text-sm text-muted-foreground truncate">{employee?.email}</p>
            </div>
          </div>

          {/* Role selector (Xero-style dropdown with descriptions) */}
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Permissions
            </label>
            <p className="text-xs text-muted-foreground mb-2">Select the role most suited to this user. You can edit permissions for certain areas in Settings.</p>

            <div className="relative">
              <button type="button"
                onClick={() => setDropdownOpen(o => !o)}
                disabled={loading}
                className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-md border border-input bg-transparent text-left hover:bg-accent/50 transition-colors disabled:opacity-50">
                <span className="flex items-center gap-2 min-w-0">
                  {selectedRole ? (
                    <>
                      <span className="flex items-center justify-center w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: (selectedRole.color || "#6366f1") + "22", color: selectedRole.color || "#6366f1" }}>
                        <SelectedIcon className="w-3.5 h-3.5" />
                      </span>
                      <span className="font-medium text-foreground truncate">{selectedRole.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{loading ? "Loading..." : "Select a role"}</span>
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-72 overflow-y-auto dropdown-glass">
                  {roles.map(role => {
                    const Icon = ICONS[role.icon] || Shield;
                    const active = role.key === selectedRoleKey;
                    return (
                      <button key={role.key} type="button"
                        onClick={() => handleRoleChange(role.key)}
                        className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-border/50 last:border-0 ${
                          active ? "bg-muted/60" : "hover:bg-muted/40"
                        }`}>
                        <span className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: (role.color || "#6366f1") + "22", color: role.color || "#6366f1" }}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">{role.name}</span>
                          <span className="block text-xs text-muted-foreground leading-snug">{role.description}</span>
                        </span>
                        {active && <Check className="w-4 h-4 text-primary shrink-0 mt-1" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body: category sidebar + feature matrix (read-only reflection of the role) */}
        <div className="flex min-h-[320px] max-h-[52vh]">
          {/* Sidebar */}
          <div className="w-52 shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
            <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-muted/20">
              Categories
            </div>
            <div className="px-2 pb-3 space-y-0.5">
              {DEPARTMENTS.map(d => {
                const status = selectedRoleKey ? categoryStatus(permsMap, selectedRoleKey, d) : "none";
                const pill = STATUS_PILL[isAdminRole ? "full" : status];
                const active = d.key === activeCategory;
                return (
                  <button key={d.key} type="button"
                    onClick={() => setActiveCategory(d.key)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                      active ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                    }`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="truncate">{d.label}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${pill.className}`}>
                      <pill.Icon className="w-2.5 h-2.5" />
                      {isAdminRole ? "Full" : pill.label.replace(" access", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature matrix (read-only) */}
          <div className="flex-1 overflow-auto">
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dept.color }} />
                <h3 className="text-sm font-semibold text-foreground">{dept.label}</h3>
                <span className="text-xs text-muted-foreground">· {dept.documents}</span>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature</th>
                      {PERMISSIONS.map(p => (
                        <th key={p.key} className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dept.modules.map((mk, i) => (
                      <tr key={mk} className={i % 2 === 1 ? "bg-muted/10" : ""}>
                        <td className="px-4 py-2.5 text-foreground font-medium">
                          {MODULE_LABELS[mk] || mk}
                        </td>
                        {PERMISSIONS.map(p => {
                          const on = isAdminRole || (selectedRoleKey ? cellOn(permsMap, selectedRoleKey, mk, p) : false);
                          return (
                            <td key={p.key} className="px-3 py-2.5 text-center">
                              {on
                                ? <Check className="w-4 h-4 text-emerald-600 inline-block" />
                                : <X className="w-4 h-4 text-muted-foreground/30 inline-block" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isAdminRole && (
                <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> Administrator role always has full access to every category.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t border-border flex items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "No changes have been made"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !selectedRoleKey || !dirty}>
              {saving ? "Saving..." : "Update role"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}