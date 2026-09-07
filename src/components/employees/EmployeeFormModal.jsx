import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Link2, UserPlus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import AvatarCropperModal from "@/components/employees/AvatarCropperModal";

const DEPARTMENTS = ["Operations", "Finance", "HR", "Sales", "IT", "Field Services", "Management"];
const STATUSES = ["Active", "On Leave", "Inactive", "Terminated"];

function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export default function EmployeeFormModal({ open, onClose, onSave, employee }) {
  const [form, setForm] = useState({
    full_name: "", employee_no: "", bank_account: "", email: "", phone: "", role: "Staff",
    department: "", status: "Active", hire_date: "", notes: "", avatar_url: ""
  });
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const [cropperOpen, setCropperOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    base44.entities.Team.list("name", 200).then(setTeams).catch(() => {});
    base44.entities.User.list("full_name", 200).then(setUsers).catch(() => {});
    base44.entities.EmployeeRole.list("name", 100).then(setRoles).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (employee) {
      setForm({ full_name: "", employee_no: "", bank_account: "", email: "", phone: "", role: "Staff", department: "", status: "Active", hire_date: "", notes: "", avatar_url: "", user_id: "", user_email: "", ...employee });
    } else {
      setForm({ full_name: "", employee_no: "", bank_account: "", email: "", phone: "", role: "Staff", department: "", status: "Active", hire_date: "", notes: "", avatar_url: "", user_id: "", user_email: "" });
    }
  }, [employee, open]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result);
      setCropperOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = (file_url) => {
    set("avatar_url", file_url);
    setCropperOpen(false);
    setRawImageSrc(null);
  };

  const handleInviteUser = async () => {
    if (!form.email) {
      toast({ title: "Email required", description: "Enter the employee's email first to send an invite.", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      await base44.users.inviteUser(form.email, "user");
      toast({ title: "Invite sent", description: `Invitation email sent to ${form.email}. They'll appear in the list once they register.` });
      const refreshed = await base44.entities.User.list("full_name", 200);
      setUsers(refreshed);
    } catch (err) {
      toast({ title: "Invite failed", description: err?.message || "Could not send invite.", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit Employee" : "Add Employee"}</DialogTitle>
        </DialogHeader>

        {/* Avatar upload */}
        <div className="flex justify-center py-2">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <Avatar className="w-20 h-20">
              <AvatarImage src={form.avatar_url} alt={form.full_name} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                {form.full_name ? initials(form.full_name) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-5 h-5 text-white" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
        </div>
        <p className="text-xs text-center text-muted-foreground -mt-1 mb-1">Click avatar to upload photo</p>

        <div className="grid grid-cols-2 gap-4 py-1">
          <div className="col-span-2 space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="space-y-1.5">
            <Label>Employee No</Label>
            <Input value={form.employee_no || ""} onChange={e => set("employee_no", e.target.value)} placeholder="e.g. 11824058244810" />
          </div>
          <div className="space-y-1.5">
            <Label>IBAN / Bank Account</Label>
            <Input value={form.bank_account || ""} onChange={e => set("bank_account", e.target.value)} placeholder="AE07 0123 4567 8901 2345 678" />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1 555 000 0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={v => set("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map(r => <SelectItem key={r.key} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.department || ""} onValueChange={v => set("department", v)}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hire Date</Label>
            <Input type="date" value={form.hire_date || ""} onChange={e => set("hire_date", e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Team</Label>
            <Select value={form.team_id || ""} onValueChange={v => {
              const team = teams.find(t => t.id === v);
              set("team_id", v);
              set("team_name", team?.name || "");
            }}>
              <SelectTrigger><SelectValue placeholder="Select team..." /></SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-primary" />Linked App User</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleInviteUser} disabled={inviting || !form.email}>
                {inviting ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                Invite {form.email ? form.email.split("@")[0] : "user"}
              </Button>
            </div>
            <Select value={form.user_id || "none"} onValueChange={v => {
              if (v === "none") { set("user_id", ""); set("user_email", ""); return; }
              const u = users.find(u => u.id === v);
              set("user_id", v);
              set("user_email", u?.email || "");
            }}>
              <SelectTrigger><SelectValue placeholder="Select app user..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No linked user —</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name} <span className="text-muted-foreground text-xs ml-1">({u.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Don't see the email? Click "Invite" to send a registration link. They'll appear in the list once they register.</p>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Any additional information..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploading || !form.full_name || !form.email}>
            {saving ? "Saving..." : employee ? "Save Changes" : "Add Employee"}
          </Button>
        </DialogFooter>

        <AvatarCropperModal
          open={cropperOpen}
          imageSrc={rawImageSrc}
          onClose={() => { setCropperOpen(false); setRawImageSrc(null); }}
          onCropComplete={handleCropComplete}
        />
      </DialogContent>
    </Dialog>
  );
}