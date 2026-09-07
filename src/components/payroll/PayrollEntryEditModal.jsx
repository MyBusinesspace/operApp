import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Save, CalendarCheck, Award } from "lucide-react";
import PayrollQuickView from "./PayrollQuickView";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const num = (v) => (parseFloat(v) || 0);

const TYPE_STYLES = {
  earning: "bg-emerald-100 text-emerald-700",
  deduction: "bg-red-100 text-red-600",
  tax: "bg-amber-100 text-amber-700",
  benefit: "bg-slate-100 text-slate-600",
};

// Editable top-level figure fields shown in the "Adjust Figures" section.
// `code` links a field to its backing PayrollComponent (system-managed in settings).
// When the component is "fixed" with a default_value > 0, that value pre-fills the field.
const FIGURE_FIELDS = [
  { key: "basic_salary", label: "Basic Salary", group: "earnings" },
  { key: "overtime_pay", label: "Overtime Pay", group: "earnings" },
  { key: "bonus", label: "Bonus", group: "earnings", code: "BONUS" },
  { key: "absence_deduction", label: "Absence Deduction", group: "deductions", code: "ABS" },
  { key: "late_deduction", label: "Late Deduction", group: "deductions", code: "LATE" },
  { key: "loan_deduction", label: "Loan / Advance", group: "deductions", code: "LOAN" },
  { key: "other_deductions", label: "Other Deductions", group: "deductions", code: "OTH_DED" },
  { key: "tax_amount", label: "Tax Amount", group: "deductions", code: "TAX" },
];

export default function PayrollEntryEditModal({ entry, period, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [components, setComponents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [paidFlags, setPaidFlags] = useState({ leave: false, gratuity: false });

  useEffect(() => {
    if (!entry) return;
    setForm({
      ...entry,
      line_items: (entry.line_items || []).map(li => ({ ...li })),
    });
    base44.entities.PayrollComponent.filter({ is_active: true })
      .then(list => setComponents(Array.isArray(list) ? list : []))
      .catch(() => setComponents([]));
    base44.entities.EmployeePayrollProfile.filter({ employee_id: entry.employee_id })
      .then(list => setProfile(Array.isArray(list) && list[0] ? list[0] : null))
      .catch(() => setProfile(null));
    base44.entities.PayrollSettings.list()
      .then(list => setSettings(Array.isArray(list) && list[0] ? list[0] : null))
      .catch(() => setSettings(null));
    base44.entities.Employee.get(entry.employee_id)
      .then(emp => setEmployee(emp || null))
      .catch(() => setEmployee(null));
  }, [entry]);

  // Pre-fill fixed defaults from backing PayrollComponents once they load.
  // Only fills fields that are currently 0 so existing calculated values aren't overwritten.
  useEffect(() => {
    if (!form || components.length === 0) return;
    const compByCode = {};
    for (const c of components) if (c.code) compByCode[c.code] = c;
    let changed = false;
    const updates = {};
    for (const f of FIGURE_FIELDS) {
      if (!f.code) continue;
      const comp = compByCode[f.code];
      if (!comp || comp.calculation_method !== "fixed") continue;
      const currentVal = num(form[f.key]);
      const defaultVal = num(comp.default_value);
      if (currentVal === 0 && defaultVal > 0) {
        updates[f.key] = defaultVal;
        changed = true;
      }
    }
    if (changed) setForm(prev => ({ ...prev, ...updates }));
  }, [components, form?.id]);

  if (!form) return null;

  const compByCode = {};
  for (const c of components) if (c.code) compByCode[c.code] = c;

  const currentYear = new Date().getFullYear();
  const leaveAlreadyPaid = (profile?.last_annual_bonus_year === currentYear) || paidFlags.leave;
  const gratuityAlreadyPaid = (profile?.last_gratuity_year === currentYear) || paidFlags.gratuity;

  const yearsOfService = (() => {
    if (!employee?.hire_date) return 0;
    const ms = Date.now() - new Date(employee.hire_date).getTime();
    return Math.max(0, ms / (365.25 * 24 * 3600 * 1000));
  })();

  const computeLeaveBonus = () => {
    const basic = num(profile?.basic_salary || form.basic_salary);
    return basic; // one month of basic salary
  };

  const computeGratuity = () => {
    const basic = num(profile?.basic_salary || form.basic_salary);
    const daysPerYear = num(settings?.gratuity_days_per_year ?? 21);
    const threshold = num(settings?.gratuity_years_threshold ?? 1);
    const eligibleYears = yearsOfService >= threshold ? yearsOfService : threshold;
    return (basic / 30) * daysPerYear * eligibleYears;
  };

  const addLeaveBonus = () => {
    const amount = computeLeaveBonus();
    if (amount <= 0) return;
    const comp = components.find(c => c.code === "ALB" || /annual leave bonus/i.test(c.name));
    set("line_items", [...(form.line_items || []), {
      component_id: comp?.id,
      component_name: comp?.name || "Annual Leave Bonus",
      component_code: comp?.code || "ALB",
      type: "earning",
      amount,
      notes: `Auto-calculated · 1 month basic salary · ${currentYear}`,
    }]);
    setPaidFlags(f => ({ ...f, leave: true }));
  };

  const addGratuity = () => {
    const amount = computeGratuity();
    if (amount <= 0) return;
    const comp = components.find(c => c.code === "GRAT" || /annual gratuity/i.test(c.name));
    set("line_items", [...(form.line_items || []), {
      component_id: comp?.id,
      component_name: comp?.name || "Annual Gratuity",
      component_code: comp?.code || "GRAT",
      type: "earning",
      amount,
      notes: `Auto-calculated · ${(num(profile?.basic_salary || form.basic_salary) / 30).toFixed(2)}/day × ${num(settings?.gratuity_days_per_year ?? 21)} days × ${yearsOfService.toFixed(1)} yrs · ${currentYear}`,
    }]);
    setPaidFlags(f => ({ ...f, gratuity: true }));
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Totals derived from current form state
  const earningsFromItems = (form.line_items || []).filter(li => li.type === "earning").reduce((s, li) => s + num(li.amount), 0);
  const deductionsFromItems = (form.line_items || []).filter(li => li.type === "deduction" || li.type === "tax").reduce((s, li) => s + num(li.amount), 0);

  const grossPay = num(form.basic_salary) + num(form.overtime_pay) + num(form.bonus) + earningsFromItems;
  const totalDeductions = num(form.absence_deduction) + num(form.late_deduction) + num(form.loan_deduction) + num(form.other_deductions) + deductionsFromItems;
  const netPay = grossPay - totalDeductions;

  const updateLineItem = (idx, field, value) => {
    setForm(prev => {
      const updated = [...prev.line_items];
      updated[idx] = { ...updated[idx], [field]: field === "amount" ? num(value) : value };
      return { ...prev, line_items: updated };
    });
  };

  const updateLineItemFields = (idx, fields) => {
    setForm(prev => {
      const updated = [...prev.line_items];
      updated[idx] = { ...updated[idx], ...fields };
      return { ...prev, line_items: updated };
    });
  };

  const addLineItem = () => {
    const defaultComp = components.find(c => /gratuity/i.test(c.name))
      || components.find(c => /basic/i.test(c.name))
      || components.find(c => /annual leave/i.test(c.name))
      || components[0];
    if (defaultComp) {
      set("line_items", [...(form.line_items || []), {
        component_id: defaultComp.id,
        component_name: defaultComp.name,
        component_code: defaultComp.code || "",
        type: defaultComp.type,
        amount: defaultComp.default_value || 0,
        notes: "",
      }]);
    } else {
      set("line_items", [...(form.line_items || []), { component_name: "", type: "earning", amount: 0, notes: "" }]);
    }
  };

  const addFromComponent = (comp) => {
    if (!comp) return;
    set("line_items", [...(form.line_items || []), {
      component_id: comp.id,
      component_name: comp.name,
      component_code: comp.code || "",
      type: comp.type,
      amount: comp.default_value || 0,
      notes: "",
    }]);
  };

  const removeLineItem = (idx) => {
    const updated = [...form.line_items];
    updated.splice(idx, 1);
    set("line_items", updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        basic_salary: num(form.basic_salary),
        overtime_pay: num(form.overtime_pay),
        bonus: num(form.bonus),
        absence_deduction: num(form.absence_deduction),
        late_deduction: num(form.late_deduction),
        loan_deduction: num(form.loan_deduction),
        other_deductions: num(form.other_deductions),
        tax_amount: num(form.tax_amount),
        line_items: form.line_items,
        gross_pay: grossPay,
        total_deductions: totalDeductions,
        net_pay: netPay,
        allowances_total: earningsFromItems,
        notes: form.notes || "",
      };
      const updated = await base44.entities.PayrollEntry.update(entry.id, payload);

      // Persist annual-leave / gratuity "last paid year" markers on the worker profile
      if (profile && (paidFlags.leave || paidFlags.gratuity)) {
        const profileUpdate = {};
        if (paidFlags.leave) profileUpdate.last_annual_bonus_year = currentYear;
        if (paidFlags.gratuity) profileUpdate.last_gratuity_year = currentYear;
        await base44.entities.EmployeePayrollProfile.update(profile.id, profileUpdate).catch(() => {});
      }

      onSaved?.(updated);
      onClose();
    } catch (e) {
      console.error("Save payroll entry error:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Payroll Entry — {entry.employee_name}</DialogTitle>
          <p className="text-xs text-muted-foreground">{period?.name} · Adjust figures and add custom concepts (gratuity, overtime, extras…)</p>
        </DialogHeader>

        <div className="overflow-auto flex-1 space-y-5 pr-1">
          {/* Adjust Figures */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Adjust Figures</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FIGURE_FIELDS.map(f => {
                const comp = f.code ? compByCode[f.code] : null;
                const isFixed = comp && comp.calculation_method === "fixed" && num(comp.default_value) > 0;
                return (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      {isFixed && (
                        <span className="text-[9px] text-primary font-medium bg-primary/10 px-1 rounded" title={`Fixed default from ${comp.name} (settings)`}>
                          {comp.default_value}
                        </span>
                      )}
                    </div>
                    <Input type="number" value={form[f.key] ?? 0}
                      onChange={e => set(f.key, num(e.target.value))}
                      className="h-8 text-sm" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Line items / concepts */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concepts / Line Items</p>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="gap-1 h-7" onClick={addLeaveBonus} disabled={leaveAlreadyPaid || !profile}
                  title={leaveAlreadyPaid ? "Already paid this year" : "Pay one month basic salary as annual leave bonus"}>
                  <CalendarCheck className="w-3.5 h-3.5" /> Annual Leave
                </Button>
                <Button size="sm" variant="outline" className="gap-1 h-7" onClick={addGratuity} disabled={gratuityAlreadyPaid || !profile}
                  title={gratuityAlreadyPaid ? "Already paid this year" : "Pay annual gratuity (manual)"}>
                  <Award className="w-3.5 h-3.5" /> Gratuity
                </Button>
                <Button size="sm" variant="outline" className="gap-1 h-7" onClick={addLineItem}>
                  <Plus className="w-3.5 h-3.5" /> Add custom
                </Button>
              </div>
            </div>

            {components.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <select id="comp-add" defaultValue=""
                  className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="" disabled>Add from payroll components…</option>
                  {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                </select>
                <Button size="sm" variant="secondary" className="h-8 shrink-0"
                  onClick={() => {
                    const sel = document.getElementById("comp-add");
                    const comp = components.find(c => c.id === sel.value);
                    if (comp) { addFromComponent(comp); sel.value = ""; }
                  }}>Add</Button>
              </div>
            )}

            {(form.line_items || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom concepts. Add gratuity, extra time, or any other payment.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">Concept</th>
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
                      <th className="px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">Notes</th>
                      <th className="px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.line_items.map((li, idx) => (
                      <tr key={idx} className="border-b border-border/50 last:border-0">
                        <td className="px-2 py-1.5">
                          <select
                            value={li.component_id || ""}
                            onChange={e => {
                              const comp = components.find(c => c.id === e.target.value);
                              if (comp) {
                                updateLineItemFields(idx, {
                                  component_id: comp.id,
                                  component_name: comp.name,
                                  component_code: comp.code || "",
                                  type: comp.type,
                                  amount: li.component_id ? num(li.amount) : (comp.default_value || 0),
                                });
                              }
                            }}
                            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs w-full min-w-[120px]"
                          >
                            {!li.component_id && li.component_name ? (
                              <option value="" disabled>{li.component_name}</option>
                            ) : (
                              <option value="" disabled>Select concept…</option>
                            )}
                            {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[li.type] || TYPE_STYLES.earning}`}>
                            {li.type || "earning"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" value={li.amount ?? 0} onChange={e => updateLineItem(idx, "amount", e.target.value)}
                            className="h-7 w-24 text-right text-sm ml-auto" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input value={li.notes || ""} onChange={e => updateLineItem(idx, "notes", e.target.value)}
                            placeholder="optional" className="h-7 text-sm" />
                        </td>
                        <td className="px-1 py-1.5">
                          <button onClick={() => removeLineItem(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* HR Notes */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">HR Notes</Label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={2}
              placeholder="Internal notes for this entry…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" />
          </div>

          {/* Quick View — live breakdown of the full payroll */}
          <PayrollQuickView form={form} />
        </div>

        {/* Totals + actions */}
        <div className="flex items-center gap-3 shrink-0 pt-3 border-t border-border">
          <div className="grid grid-cols-3 gap-3 flex-1">
            <div className="bg-muted/30 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Gross Pay</p>
              <p className="text-sm font-bold text-foreground">AED {fmt(grossPay)}</p>
            </div>
            <div className="bg-muted/30 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Deductions</p>
              <p className="text-sm font-bold text-destructive">-{fmt(totalDeductions)}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-emerald-600">Net Pay</p>
              <p className="text-sm font-bold text-emerald-700">AED {fmt(netPay)}</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}