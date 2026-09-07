import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Building2, CreditCard, DollarSign, ChevronDown, ChevronUp, Save, Loader2, History } from "lucide-react";
import { logSalaryChange, logProfileCreated } from "@/lib/salaryAudit";
import SalaryAuditLogPanel from "@/components/payroll/SalaryAuditLogPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPLOYMENT_TYPES = ["full_time", "part_time", "hourly", "contractor"];
const PAY_TYPES = ["salary", "hourly"];
const CALC_METHODS = ["fixed", "percentage_of_basic", "percentage_of_gross"];
const TAX_STATUSES = ["resident", "non_resident", "expat", "exempt"];
const TAX_COUNTRIES = [
  { code: "AE", label: "🇦🇪 UAE (0%)" },
  { code: "SA", label: "🇸🇦 Saudi Arabia" },
  { code: "US", label: "🇺🇸 United States" },
  { code: "UK", label: "🇬🇧 United Kingdom" },
  { code: "IN", label: "🇮🇳 India" },
  { code: "PH", label: "🇵🇭 Philippines" },
  { code: "PK", label: "🇵🇰 Pakistan" },
  { code: "EG", label: "🇪🇬 Egypt" },
  { code: "DE", label: "🇩🇪 Germany" },
  { code: "FR", label: "🇫🇷 France" },
];

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="w-4 h-4 text-primary" />{title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectField({ value, onChange, options, labelMap }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
      {options.map(o => (
        <option key={o} value={o}>{labelMap ? labelMap[o] : o.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
      ))}
    </select>
  );
}

export default function EmployeePayrollProfileTab({ employeeId, employeeName, readOnly = false }) {
  const [profile, setProfile] = useState(null);
  const [allComponents, setAllComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(null);

  const blankProfile = () => ({
    employee_id: employeeId,
    employee_name: employeeName,
    employment_type: "full_time",
    pay_type: "salary",
    basic_salary: 0,
    hourly_rate: 0,
    effective_date: new Date().toISOString().split("T")[0],
    components: [],
    bank_name: "",
    iban: "",
    bank_routing: "",
    wps_id: "",
    tax_id: "",
    tax_country: "AE",
    tax_status: "resident",
    tax_rate_override: null,
    annual_leave_days: 30,
    leave_used_override: null,
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [profiles, components] = await Promise.all([
        base44.entities.EmployeePayrollProfile.filter({ employee_id: employeeId }),
        base44.entities.PayrollComponent.filter({ is_active: true }),
      ]);
      const existing = Array.isArray(profiles) ? profiles[0] : null;
      setProfile(existing || null);
      setForm(existing ? { ...existing } : blankProfile());
      setAllComponents(Array.isArray(components) ? components : []);
      setLoading(false);
    };
    load();
  }, [employeeId]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    if (profile?.id) {
      // Log salary/rate changes if they changed
      const salaryField = form.pay_type === "salary" ? "basic_salary" : "hourly_rate";
      const oldVal = profile[salaryField] ?? 0;
      const newVal = form[salaryField] ?? 0;
      await base44.entities.EmployeePayrollProfile.update(profile.id, form);
      if (oldVal !== newVal) {
        await logSalaryChange({
          employeeId: employeeId,
          employeeName: employeeName,
          profileId: profile.id,
          field: salaryField,
          oldValue: oldVal,
          newValue: newVal,
          user,
          source: "individual_edit",
        });
      }
    } else {
      const created = await base44.entities.EmployeePayrollProfile.create(form);
      setProfile(created);
      await logProfileCreated({ employeeId, employeeName, profileId: created.id, user });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Components management
  const addComponent = (comp) => {
    if (!comp) return;
    if (form.components?.find(c => c.component_id === comp.id)) return;
    const newLine = {
      component_id: comp.id,
      component_name: comp.name,
      component_code: comp.code || "",
      type: comp.type,
      calculation_method: comp.calculation_method,
      value: comp.default_value || 0,
    };
    set("components", [...(form.components || []), newLine]);
  };

  const removeComponent = (idx) => {
    const updated = [...(form.components || [])];
    updated.splice(idx, 1);
    set("components", updated);
  };

  const updateComponentValue = (idx, value) => {
    const updated = [...(form.components || [])];
    updated[idx] = { ...updated[idx], value: parseFloat(value) || 0 };
    set("components", updated);
  };

  const assignedIds = new Set((form?.components || []).map(c => c.component_id));
  const availableToAdd = allComponents.filter(c => !assignedIds.has(c.id));

  const fmtLabel = (s) => s?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "";

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading payroll profile...</div>;
  if (!form) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Payroll Profile</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{profile ? "Manage salary structure and payment details" : "No payroll profile yet — set one up below"}</p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Profile"}
          </Button>
        )}
      </div>

      {/* Employment & Pay */}
      <Section title="Employment & Pay" icon={DollarSign}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Employment Type">
            <SelectField value={form.employment_type} onChange={v => set("employment_type", v)} options={EMPLOYMENT_TYPES} />
          </Field>
          <Field label="Pay Type">
            <SelectField value={form.pay_type} onChange={v => set("pay_type", v)} options={PAY_TYPES} />
          </Field>
          {form.pay_type === "salary" && (
            <Field label="Basic Salary (AED / month)">
              <Input type="number" value={form.basic_salary || ""} onChange={e => set("basic_salary", parseFloat(e.target.value) || 0)} placeholder="0.00" />
            </Field>
          )}
          {form.pay_type === "hourly" && (
            <Field label="Hourly Rate (AED / hour)">
              <Input type="number" value={form.hourly_rate || ""} onChange={e => set("hourly_rate", parseFloat(e.target.value) || 0)} placeholder="0.00" />
            </Field>
          )}
          <Field label="Effective Date">
            <Input type="date" value={form.effective_date || ""} onChange={e => set("effective_date", e.target.value)} />
          </Field>
          <Field label="Annual Leave Days">
            <Input type="number" value={form.annual_leave_days ?? ""} onChange={e => set("annual_leave_days", parseFloat(e.target.value) || 0)} placeholder="30" />
          </Field>
          <Field label="Days Already Used This Year (override)">
            <Input type="number" value={form.leave_used_override ?? ""} onChange={e => set("leave_used_override", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="Auto (from approved leave)" />
          </Field>
        </div>
      </Section>

      {/* Allowances & Deductions */}
      <Section title="Allowances & Deductions" icon={DollarSign}>
        {(form.components || []).length === 0 && (
          <p className="text-xs text-muted-foreground mb-3">No components assigned yet. Add from the list below.</p>
        )}
        {(form.components || []).length > 0 && (
          <div className="mb-4 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Component</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Method</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Value</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(form.components || []).map((c, idx) => (
                  <tr key={idx} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{c.component_name}</span>
                      {c.component_code && <span className="ml-1.5 text-xs text-muted-foreground">({c.component_code})</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.type === "earning" ? "bg-emerald-100 text-emerald-700" :
                        c.type === "deduction" ? "bg-red-100 text-red-600" :
                        "bg-slate-100 text-slate-600"
                      }`}>{c.type}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtLabel(c.calculation_method)}</td>
                    <td className="px-3 py-2">
                      <Input type="number" value={c.value ?? ""} onChange={e => updateComponentValue(idx, e.target.value)}
                        className="h-7 w-24 text-right text-sm ml-auto" />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeComponent(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {availableToAdd.length > 0 && (
          <div className="flex items-center gap-2">
            <select id="comp-select" defaultValue=""
              className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="" disabled>Add a component...</option>
              {availableToAdd.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
              onClick={() => {
                const sel = document.getElementById("comp-select");
                const comp = allComponents.find(c => c.id === sel.value);
                if (comp) { addComponent(comp); sel.value = ""; }
              }}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        )}
        {availableToAdd.length === 0 && allComponents.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            No payroll components configured yet. Go to <span className="font-medium text-primary">Settings → Payroll</span> to create components.
          </p>
        )}
      </Section>

      {/* Bank & Payment */}
      <Section title="Bank & Payment Details" icon={CreditCard}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Bank Name">
            <Input value={form.bank_name || ""} onChange={e => set("bank_name", e.target.value)} placeholder="e.g. Emirates NBD" />
          </Field>
          <Field label="IBAN">
            <Input value={form.iban || ""} onChange={e => set("iban", e.target.value)} placeholder="AE07..." />
          </Field>
          <Field label="SWIFT / Routing Code">
            <Input value={form.bank_routing || ""} onChange={e => set("bank_routing", e.target.value)} placeholder="EBILAEAD" />
          </Field>
          <Field label="WPS Worker ID">
            <Input value={form.wps_id || ""} onChange={e => set("wps_id", e.target.value)} placeholder="UAE Wage Protection ID" />
          </Field>
        </div>
      </Section>

      {/* Salary Change History */}
      <Section title="Salary Change History" icon={History} defaultOpen={false}>
        <SalaryAuditLogPanel employeeId={employeeId} />
      </Section>

      {/* Tax & Compliance */}
      <Section title="Tax & Compliance" icon={Building2} defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tax Country / Jurisdiction">
            <select value={form.tax_country || "AE"} onChange={e => set("tax_country", e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {TAX_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Tax Status">
            <SelectField value={form.tax_status || "resident"} onChange={v => set("tax_status", v)} options={TAX_STATUSES} />
          </Field>
          <Field label="Tax ID (if applicable)">
            <Input value={form.tax_id || ""} onChange={e => set("tax_id", e.target.value)} placeholder="—" />
          </Field>
          <Field label="Manual Tax Rate Override (%)">
            <Input type="number" value={form.tax_rate_override ?? ""} onChange={e => set("tax_rate_override", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="Leave blank to use country/status rate" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="HR Notes">
              <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)}
                rows={2} placeholder="Internal notes..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
            </Field>
          </div>
        </div>
      </Section>
    </div>
  );
}