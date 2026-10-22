import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Paperclip, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

const EMPTY = {
  employee_id: "",
  employee_name: "",
  leave_type: "vacation",
  status: "pending",
  start_date: "",
  end_date: "",
  reason: "",
  admin_notes: "",
  documents: [],
};

const TYPE_OPTIONS = [
  { value: "vacation", label: "Vacation / Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "other", label: "Other" },
  { value: "unjustified", label: "Unjustified Absence" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default function DemoLeaveDialog({
  open,
  onClose,
  request,
  employees = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const isEdit = !!request;

  useEffect(() => {
    if (!open) return;
    if (request) {
      setForm({
        ...EMPTY,
        ...request,
        documents: request.documents || [],
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [request, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const totalDays = useMemo(() => {
    if (!form.start_date || !form.end_date) return 0;
    try {
      return Math.max(
        0,
        differenceInCalendarDays(
          parseISO(form.end_date),
          parseISO(form.start_date)
        ) + 1
      );
    } catch {
      return 0;
    }
  }, [form.start_date, form.end_date]);

  const addDoc = () => {
    setForm((f) => ({
      ...f,
      documents: [
        ...(f.documents || []),
        {
          title: "Supporting document",
          file_name: `leave-doc-${(f.documents || []).length + 1}.pdf`,
          file_type: "application/pdf",
        },
      ],
    }));
  };

  const removeDoc = (idx) => {
    setForm((f) => ({
      ...f,
      documents: (f.documents || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Leave Request" : "New Leave Request"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${request.employee_name || "Employee"} — modify type, status, dates, and notes.`
              : "Submit a leave request. Demo is view-only — nothing is saved."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select
                value={form.employee_id || "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") {
                    set("employee_id", "");
                    set("employee_name", "");
                    return;
                  }
                  const emp = employees.find((e) => e.id === v);
                  setForm((f) => ({
                    ...f,
                    employee_id: v,
                    employee_name: emp?.full_name || "",
                  }));
                }}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select —</SelectItem>
                  {employees
                    .filter((e) => e.status !== "Terminated")
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Leave Type</Label>
                <Select
                  value={form.leave_type || "vacation"}
                  onValueChange={(v) => set("leave_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isEdit && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={form.status || "pending"}
                    onValueChange={(v) => set("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date *</Label>
                <Input
                  type="date"
                  value={form.start_date || ""}
                  onChange={(e) => set("start_date", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>End date *</Label>
                <Input
                  type="date"
                  value={form.end_date || ""}
                  onChange={(e) => set("end_date", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total days: </span>
              <span className="font-semibold text-foreground tabular-nums">
                {totalDays || "—"}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={form.reason || ""}
                onChange={(e) => set("reason", e.target.value)}
                placeholder="Optional reason…"
              />
            </div>

            {isEdit && (
              <div className="space-y-1.5">
                <Label>Admin notes</Label>
                <Textarea
                  rows={2}
                  value={form.admin_notes || ""}
                  onChange={(e) => set("admin_notes", e.target.value)}
                  placeholder="Manager notes…"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" /> Supporting documents
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={addDoc}
                  title="Demo — adds a sample file chip"
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {(form.documents || []).length === 0 ? (
                <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
                  No documents attached.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(form.documents || []).map((d, i) => (
                    <li
                      key={`${d.file_name}-${i}`}
                      className="flex items-center gap-2 text-xs rounded-md border border-border bg-card px-2.5 py-1.5"
                    >
                      <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate font-medium">
                        {d.title || d.file_name}
                      </span>
                      <span className="text-muted-foreground truncate max-w-[100px]">
                        {d.file_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDoc(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" title="Demo — view only">
              {isEdit ? "Save" : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
