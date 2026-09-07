import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["earning", "deduction", "tax", "benefit"];
const METHODS = ["fixed", "percentage_of_basic", "percentage_of_gross"];

const TYPE_STYLES = {
  earning:   "bg-emerald-100 text-emerald-700",
  deduction: "bg-red-100 text-red-600",
  tax:       "bg-amber-100 text-amber-700",
  benefit:   "bg-blue-100 text-blue-700",
};

function fmtLabel(s) {
  return s?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "";
}

const blank = {
  name: "", code: "", type: "earning", calculation_method: "fixed",
  default_value: 0, is_active: true, is_recurring: true, is_taxable: false, description: "",
};

function ComponentModal({ open, onClose, onSave, editing }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editing ? { ...blank, ...editing } : blank);
  }, [editing, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const isPercent = form.calculation_method !== "fixed";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Component" : "Add Payroll Component"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Housing Allowance" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={form.code || ""} onChange={e => set("code", e.target.value)} placeholder="HRA" />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{fmtLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Calculation</Label>
              <Select value={form.calculation_method} onValueChange={v => set("calculation_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map(m => <SelectItem key={m} value={m}>{fmtLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Default {isPercent ? "(%)" : "(AED)"}</Label>
              <Input type="number" value={form.default_value ?? ""} onChange={e => set("default_value", parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => set("is_active", e.target.checked)} className="w-4 h-4 accent-primary" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_recurring} onChange={e => set("is_recurring", e.target.checked)} className="w-4 h-4 accent-primary" />
              Recurring
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_taxable} onChange={e => set("is_taxable", e.target.checked)} className="w-4 h-4 accent-primary" />
              Taxable
            </label>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {editing ? "Update" : "Add Component"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SYSTEM_COMPONENTS = [
  { name: "Annual Leave Bonus", code: "ALB", type: "earning", calculation_method: "fixed", default_value: 0, is_recurring: false, is_system: true, description: "One month basic salary paid as annual leave bonus" },
  { name: "Annual Gratuity", code: "GRAT", type: "earning", calculation_method: "fixed", default_value: 0, is_recurring: false, is_system: true, description: "End-of-service gratuity payment" },
  { name: "Bonus", code: "BONUS", type: "earning", calculation_method: "fixed", default_value: 0, is_recurring: false, is_system: true, description: "One-time bonus payment — maps to the Bonus field in payroll entries" },
  { name: "Absence Deduction", code: "ABS", type: "deduction", calculation_method: "fixed", default_value: 0, is_recurring: false, is_system: true, description: "Deduction for unpaid absent days — maps to the Absence Deduction field" },
  { name: "Late Deduction", code: "LATE", type: "deduction", calculation_method: "fixed", default_value: 0, is_recurring: false, is_system: true, description: "Deduction for late arrivals — maps to the Late Deduction field" },
  { name: "Loan / Advance", code: "LOAN", type: "deduction", calculation_method: "fixed", default_value: 0, is_recurring: true, is_system: true, description: "Monthly loan/advance repayment — maps to the Loan / Advance field" },
  { name: "Other Deductions", code: "OTH_DED", type: "deduction", calculation_method: "fixed", default_value: 0, is_recurring: false, is_system: true, description: "Miscellaneous deductions — maps to the Other Deductions field" },
  { name: "Tax", code: "TAX", type: "tax", calculation_method: "fixed", default_value: 0, is_recurring: true, is_system: true, description: "Income tax deduction — maps to the Tax Amount field" },
  { name: "Others", code: "OTH", type: "earning", calculation_method: "fixed", default_value: 0, is_recurring: true, is_taxable: true, is_system: true, description: "Miscellaneous earnings" },
];

export default function PayrollComponentsSection() {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.PayrollComponent.list("name", 200);
    const arr = Array.isArray(list) ? list : [];

    // Seed missing system components
    const existingNames = arr.map(c => c.name.toLowerCase());
    const missing = SYSTEM_COMPONENTS.filter(sc => !existingNames.includes(sc.name.toLowerCase()));
    let finalList = arr;
    if (missing.length > 0) {
      await base44.entities.PayrollComponent.bulkCreate(missing);
      finalList = await base44.entities.PayrollComponent.list("name", 200);
      finalList = Array.isArray(finalList) ? finalList : arr;
    }
    // Sort: system components first, then by name
    finalList.sort((a, b) => (b.is_system ? 1 : 0) - (a.is_system ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));
    setComponents(finalList);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (editing) await base44.entities.PayrollComponent.update(editing.id, form);
    else await base44.entities.PayrollComponent.create(form);
    setModal(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    const comp = components.find(c => c.id === id);
    if (comp?.is_system) return;
    if (!confirm("Delete this payroll component?")) return;
    await base44.entities.PayrollComponent.delete(id);
    load();
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <DollarSign className="w-4 h-4 text-emerald-600" /> Payroll Components
        </h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7"
          onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : components.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No payroll components yet. Add allowances, deductions, taxes & benefits to assign them to employees.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {components.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  {c.code && <span className="text-xs text-muted-foreground font-mono">({c.code})</span>}
                  {!c.is_active && <span className="text-[10px] text-muted-foreground italic">inactive</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtLabel(c.calculation_method)} · {c.calculation_method === "fixed" ? `AED ${c.default_value || 0}` : `${c.default_value || 0}%`}
                  {c.is_recurring && " · recurring"}
                  {c.is_taxable && " · taxable"}
                </p>
                {c.description && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{c.description}</p>
                )}
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-center w-20 shrink-0 ${TYPE_STYLES[c.type] || "bg-muted text-muted-foreground"}`}>
                {fmtLabel(c.type)}
              </span>
              <div className="flex gap-1 shrink-0">
                {c.is_system ? (
                  <span className="text-[10px] text-muted-foreground italic px-2 py-1">system</span>
                ) : (
                  <>
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { setEditing(c); setModal(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ComponentModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        editing={editing}
      />
    </div>
  );
}