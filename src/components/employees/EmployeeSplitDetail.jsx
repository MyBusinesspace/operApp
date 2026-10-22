import React from "react";
import { formatDateValue } from "@/lib/dateOnly";
import { X, ChevronUp, ChevronDown, Pencil, Paperclip, ShieldCheck, Mail, Phone, Calendar, Briefcase, CreditCard, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const STATUS_STYLES = {
  Active:     "bg-emerald-100 text-emerald-700",
  "On Leave": "bg-amber-100 text-amber-700",
  Inactive:   "bg-slate-100 text-slate-600",
  Terminated: "bg-red-100 text-red-600",
};

function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}
function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function EmployeeSplitDetail({ employee, role, fileCount = 0, onClose, onEdit, onPermissions, onPrev, onNext }) {
  if (!employee) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select an employee to preview
      </div>
    );
  }

  const roleRec = role || {};
  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          {onPermissions && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onPermissions(employee)}>
              <ShieldCheck className="w-3.5 h-3.5" /> Permissions
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(employee)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} title="Previous">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} title="Next">
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 mb-1">
            <Avatar className="w-14 h-14 shrink-0">
              <AvatarImage src={employee.avatar_url} alt={employee.full_name} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials(employee.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{employee.full_name || "Employee"}</h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {roleRec.name && (
                  <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: (roleRec.color || "#6366f1") + "22", color: roleRec.color || "#6366f1" }}>
                    {roleRec.name}
                  </span>
                )}
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[employee.status] || "bg-muted text-muted-foreground"}`}>
                  {employee.status || "Active"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-b border-border">
          <InfoRow icon={Briefcase} label="Employee No" value={employee.employee_no} />
          <InfoRow icon={Briefcase} label="Department" value={employee.department} />
          <InfoRow icon={Mail} label="Email" value={employee.email} />
          <InfoRow icon={Phone} label="Phone" value={employee.phone} />
          <InfoRow icon={Calendar} label="Hire date" value={fmtDate(employee.hire_date)} />
          <InfoRow icon={CreditCard} label="Bank account" value={employee.bank_account} />
          <InfoRow icon={Users} label="Team" value={employee.team_name} />
        </div>

        {/* Notes */}
        {employee.notes && (
          <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{employee.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}