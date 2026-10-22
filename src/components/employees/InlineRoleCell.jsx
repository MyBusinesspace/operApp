import React, { useState } from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useRoles } from "@/hooks/useRoles";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { isLastAdministrator, syncUserFromRole } from "@/lib/syncRoleScope";
import { Loader2 } from "lucide-react";

export default function InlineRoleCell({ employee, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { roles } = useRoles();
  const { toast } = useToast();

  const r = roles.find(x => x.key === employee.role || x.name === employee.role);
  const badgeStyle = r
    ? { backgroundColor: (r.color || "#6366f1") + "22", color: r.color || "#6366f1" }
    : { backgroundColor: "#f1f5f9", color: "#64748b" };
  const displayName = r?.name || employee.role || "—";

  const handleChange = async (newKey) => {
    if (newKey === employee.role) { setEditing(false); return; }
    // Prevent demoting the last administrator
    const currentRoleKey = roles.find(x => x.key === employee.role || x.name === employee.role)?.key;
    if (currentRoleKey === "administrator" && newKey !== "administrator") {
      try {
        if (await isLastAdministrator(employee.id)) {
          toast({ title: "Cannot remove last administrator", description: "At least one administrator is required. Assign another administrator first.", variant: "destructive" });
          setEditing(false);
          return;
        }
      } catch (e) { /* allow on error */ }
    }
    setSaving(true);
    try {
      await base44.entities.Employee.update(employee.id, { role: newKey });
      // Sync linked User.role + scope flags so RLS reflects the new role
      if (employee.user_id) {
        const roleObj = roles.find(x => x.key === newKey);
        try { await syncUserFromRole(employee.user_id, roleObj); } catch (e) { console.warn("Role sync failed:", e.message); }
      }
      onUpdated?.({ ...employee, role: newKey });
      const roleObj = roles.find(x => x.key === newKey);
      toast({ title: "Role updated", description: `${employee.full_name} is now ${roleObj?.name || newKey}` });
    } catch (e) {
      toast({ title: "Error", description: "Could not update role", variant: "destructive" });
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="w-[180px]">
        <Select value={employee.role || ""} onValueChange={handleChange} open={true} onOpenChange={(o) => { if (!o && !saving) setEditing(false); }}>
          <SelectTrigger className="h-7 text-xs" disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <SelectValue placeholder="Select role..." />}
          </SelectTrigger>
          <SelectContent>
            {roles.map(role => (
              <SelectItem key={role.key} value={role.key}>{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full transition-opacity hover:opacity-70 cursor-pointer"
      style={badgeStyle}
      title="Click to change role"
    >
      {displayName}
    </button>
  );
}