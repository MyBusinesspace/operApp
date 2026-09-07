import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Save, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { logSalaryChange } from "@/lib/salaryAudit";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Two-step flow: EDIT → REVIEW & CONFIRM
export default function BulkSalaryEditModal({ open, onClose }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({}); // { [profile.id]: { basic_salary, hourly_rate } }
  const [step, setStep] = useState("edit"); // "edit" | "review"
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());

  useEffect(() => {
    if (!open) return;
    setStep("edit");
    setEdits({});
    setSavedIds(new Set());
    const load = async () => {
      setLoading(true);
      const data = await base44.entities.EmployeePayrollProfile.filter({ is_active: true });
      const sorted = (Array.isArray(data) ? data : []).sort((a, b) =>
        (a.employee_name || "").localeCompare(b.employee_name || "")
      );
      setProfiles(sorted);
      // Seed edits with current values
      const seed = {};
      sorted.forEach(p => {
        seed[p.id] = {
          basic_salary: p.basic_salary ?? 0,
          hourly_rate: p.hourly_rate ?? 0,
        };
      });
      setEdits(seed);
      setLoading(false);
    };
    load();
  }, [open]);

  const setEdit = (id, field, val) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  // Only profiles whose value actually changed
  const changed = profiles.filter(p => {
    const e = edits[p.id];
    if (!e) return false;
    if (p.pay_type === "salary") return parseFloat(e.basic_salary) !== (p.basic_salary ?? 0);
    return parseFloat(e.hourly_rate) !== (p.hourly_rate ?? 0);
  });

  const handleConfirm = async () => {
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    const done = new Set();
    for (const p of changed) {
      const e = edits[p.id];
      const field = p.pay_type === "salary" ? "basic_salary" : "hourly_rate";
      const oldValue = currentVal(p);
      const newValue = parseFloat(e[field]) || 0;
      await base44.entities.EmployeePayrollProfile.update(p.id, { [field]: newValue });
      await logSalaryChange({
        employeeId: p.employee_id,
        employeeName: p.employee_name,
        profileId: p.id,
        field,
        oldValue,
        newValue,
        user,
        source: "bulk_edit",
      });
      done.add(p.id);
      setSavedIds(new Set(done));
    }
    setSaving(false);
    if (done.size > 0) {
      setTimeout(onClose, 800);
    }
  };

  const payLabel = (p) => p.pay_type === "salary" ? "Salary" : "Hourly Rate";
  const currentVal = (p) => p.pay_type === "salary" ? (p.basic_salary ?? 0) : (p.hourly_rate ?? 0);
  const editVal = (p) => edits[p.id]?.[p.pay_type === "salary" ? "basic_salary" : "hourly_rate"] ?? currentVal(p);
  const diff = (p) => {
    const cur = currentVal(p);
    const nw = parseFloat(editVal(p)) || 0;
    return nw - cur;
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold">
            {step === "edit" ? "Bulk Edit Salaries" : "Review Changes"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {step === "edit"
              ? "Edit salary or hourly rate for any employee below, then click Review Changes."
              : `${changed.length} employee${changed.length !== 1 ? "s" : ""} will be updated. Confirm to save.`}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading profiles...
            </div>
          ) : profiles.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No active payroll profiles found.
            </div>
          ) : step === "edit" ? (
            /* ── EDIT TABLE ── */
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Employee</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Pay Basis</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Current (AED)</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">New Value (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {profiles.map(p => {
                  const field = p.pay_type === "salary" ? "basic_salary" : "hourly_rate";
                  const cur = currentVal(p);
                  const val = edits[p.id]?.[field] ?? cur;
                  const isDirty = parseFloat(val) !== cur;
                  return (
                    <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${isDirty ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-foreground">{p.employee_name || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground capitalize">{(p.employment_type || "").replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          p.pay_type === "salary" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                        }`}>{payLabel(p)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmt(cur)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          value={val}
                          onChange={e => setEdit(p.id, field, e.target.value)}
                          className={`h-8 w-32 text-right ml-auto tabular-nums ${isDirty ? "border-primary ring-1 ring-primary/30" : ""}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* ── REVIEW TABLE ── */
            changed.length === 0 ? (
              <div className="py-16 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No changes detected. Go back and edit some values.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Employee</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Pay Basis</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Current</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground w-6" />
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">New Value</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Change</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {changed.map(p => {
                    const cur = currentVal(p);
                    const nw = parseFloat(editVal(p)) || 0;
                    const delta = diff(p);
                    const isSaved = savedIds.has(p.id);
                    return (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium text-foreground">{p.employee_name || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            p.pay_type === "salary" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                          }`}>{payLabel(p)}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(cur)}</td>
                        <td className="py-3 text-center">
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mx-auto" />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{fmt(nw)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={`font-semibold ${delta > 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {delta > 0 ? "+" : ""}{fmt(delta)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isSaved
                            ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                            : <span className="text-xs text-muted-foreground">Pending</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {step === "edit" && !loading && (
              <span>{changed.length > 0 ? `${changed.length} change${changed.length !== 1 ? "s" : ""} pending` : "No changes yet"}</span>
            )}
          </div>
          <div className="flex gap-2">
            {step === "edit" ? (
              <>
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" disabled={changed.length === 0} onClick={() => setStep("review")} className="gap-1.5">
                  Review Changes <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setStep("edit")} disabled={saving}>← Back to Edit</Button>
                <Button size="sm" disabled={saving || changed.length === 0} onClick={handleConfirm} className="gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? "Saving..." : `Confirm ${changed.length} Update${changed.length !== 1 ? "s" : ""}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}