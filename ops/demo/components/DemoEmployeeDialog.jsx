import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Link2, UserPlus } from "lucide-react";

const EMPTY = {
  full_name: "",
  employee_no: "",
  bank_account: "",
  email: "",
  phone: "",
  role: "employee",
  department: "",
  status: "Active",
  hire_date: "",
  notes: "",
  avatar_url: "",
  team_id: "",
  team_name: "",
  user_id: "",
  user_email: "",
};

const DEFAULT_STATUSES = ["Active", "On Leave", "Inactive", "Terminated"];

export const DEMO_ROLES = [
  {
    key: "employee",
    name: "Employee",
    color: "#6366f1",
    description: "Field staff — tasks, timesheets, and own leave.",
  },
  {
    key: "supervisor",
    name: "Supervisor",
    color: "#f97316",
    description: "Team leads — planner, approvals, and crew oversight.",
  },
  {
    key: "administrator",
    name: "Administrator",
    color: "#ef4444",
    description: "Full access across the workspace.",
  },
];

function initials(name) {
  return (
    name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default function DemoEmployeeDialog({
  open,
  onClose,
  employee,
  teams = [],
  users = [],
  roles = DEMO_ROLES,
  statuses = DEFAULT_STATUSES,
}) {
  const [form, setForm] = useState(EMPTY);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      setForm({ ...EMPTY, ...employee });
    } else {
      setForm({ ...EMPTY });
    }
  }, [employee, open]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("avatar_url", reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {employee ? "Edit Employee" : "Add Employee"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center py-2">
          <div
            className="relative group cursor-pointer"
            onClick={() => fileRef.current?.click()}
            title="Demo — photo stays local only"
          >
            <Avatar className="w-20 h-20">
              <AvatarImage src={form.avatar_url} alt={form.full_name} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                {form.full_name ? initials(form.full_name) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        </div>
        <p className="text-xs text-center text-muted-foreground -mt-1 mb-1">
          Click avatar to upload photo
        </p>

        <div className="grid grid-cols-2 gap-4 py-1">
          <div className="col-span-2 space-y-1.5">
            <Label>Full Name *</Label>
            <Input
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Employee No</Label>
            <Input
              value={form.employee_no || ""}
              onChange={(e) => set("employee_no", e.target.value)}
              placeholder="e.g. 11824058244810"
            />
          </div>
          <div className="space-y-1.5">
            <Label>IBAN / Bank Account</Label>
            <Input
              value={form.bank_account || ""}
              onChange={(e) => set("bank_account", e.target.value)}
              placeholder="AE07 0123 4567 8901 2345 678"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={form.phone || ""}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select
              value={form.role || ""}
              onValueChange={(v) => set("role", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status || "Active"}
              onValueChange={(v) => set("status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Hire Date</Label>
            <Input
              type="date"
              value={form.hire_date || ""}
              onChange={(e) => set("hire_date", e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Team</Label>
            <Select
              value={form.team_id || ""}
              onValueChange={(v) => {
                const team = teams.find((t) => t.id === v);
                setForm((f) => ({
                  ...f,
                  team_id: v,
                  team_name: team?.name || "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team..." />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-primary" />
                Linked App User
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                title="Demo — view only"
                disabled={!form.email}
                onClick={(e) => e.preventDefault()}
              >
                <UserPlus className="w-3 h-3" />
                Invite {form.email ? form.email.split("@")[0] : "user"}
              </Button>
            </div>
            <Select
              value={form.user_id || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  set("user_id", "");
                  set("user_email", "");
                  return;
                }
                const u = users.find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  user_id: v,
                  user_email: u?.email || "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select app user..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No linked user —</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}{" "}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({u.email})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Don&apos;t see the email? Click &quot;Invite&quot; to send a
              registration link. They&apos;ll appear in the list once they
              register.
            </p>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Any additional information..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            title="Demo — view only"
            disabled={!form.full_name || !form.email}
            onClick={onClose}
          >
            {employee ? "Save Changes" : "Add Employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
