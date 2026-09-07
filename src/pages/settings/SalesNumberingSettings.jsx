import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Save, Hash, FileText, FileCheck } from "lucide-react";

const DEFAULT = {
  quote_draft_prefix: "QD",
  quote_confirmed_prefix: "Q",
  invoice_draft_prefix: "ID",
  invoice_confirmed_prefix: "INV",
  number_padding: 4,
  include_year: true,
  reset_yearly: true,
  default_payment_terms: "Net 30",
  default_currency: "AED",
  tax_rates: [{ label: "Standard VAT", rate: 5, is_default: true }, { label: "Zero Rated", rate: 0, is_default: false }],
  quote_validity_days: 30,
  invoice_due_days: 30,
  quote_default_notes: "",
  invoice_default_notes: "",
};

function FieldRow({ label, sublabel, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
      </div>
      <div className="w-56 shrink-0">{children}</div>
    </div>
  );
}

function SwitchRow({ label, sublabel, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function SalesNumberingSettings() {
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordId, setRecordId] = useState(null);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      // Store numbering settings in a special DocumentTemplate record named "__settings__"
      const settings = list.find(t => t.name === "__numbering_settings__");
      if (settings) {
        setRecordId(settings.id);
        try {
          const parsed = JSON.parse(settings.footer_notes || "{}");
          setForm(f => ({ ...f, ...parsed }));
        } catch {}
      }
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const data = { name: "__numbering_settings__", footer_notes: JSON.stringify(form) };
    if (recordId) {
      await base44.entities.DocumentTemplate.update(recordId, data);
    } else {
      const created = await base44.entities.DocumentTemplate.create(data);
      setRecordId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const preview = (prefix, num) => {
    const year = new Date().getFullYear();
    const padded = String(num).padStart(form.number_padding || 4, "0");
    return form.include_year ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  };

  return (
    <div className="space-y-4">
      {/* Quote Numbering */}
      <Section title="Quote Numbering" icon={FileText}>
        <FieldRow label="Draft prefix" sublabel={`Preview: ${preview(form.quote_draft_prefix || "QD", 1)}`}>
          <Input value={form.quote_draft_prefix || ""} onChange={e => set("quote_draft_prefix", e.target.value)} placeholder="QD" />
        </FieldRow>
        <FieldRow label="Confirmed prefix" sublabel={`Preview: ${preview(form.quote_confirmed_prefix || "Q", 1)}`}>
          <Input value={form.quote_confirmed_prefix || ""} onChange={e => set("quote_confirmed_prefix", e.target.value)} placeholder="Q" />
        </FieldRow>
        <FieldRow label="Quote validity (days)" sublabel="Default expiry from issue date">
          <Input type="number" min={1} value={form.quote_validity_days || 30} onChange={e => set("quote_validity_days", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default quote notes" sublabel="Pre-filled in quote notes field">
          <textarea
            value={form.quote_default_notes || ""}
            onChange={e => set("quote_default_notes", e.target.value)}
            className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none"
            placeholder="e.g. Thank you for the opportunity..."
          />
        </FieldRow>
      </Section>

      {/* Invoice Numbering */}
      <Section title="Invoice Numbering" icon={FileCheck}>
        <FieldRow label="Draft prefix" sublabel={`Preview: ${preview(form.invoice_draft_prefix || "ID", 1)}`}>
          <Input value={form.invoice_draft_prefix || ""} onChange={e => set("invoice_draft_prefix", e.target.value)} placeholder="ID" />
        </FieldRow>
        <FieldRow label="Confirmed prefix" sublabel={`Preview: ${preview(form.invoice_confirmed_prefix || "INV", 1)}`}>
          <Input value={form.invoice_confirmed_prefix || ""} onChange={e => set("invoice_confirmed_prefix", e.target.value)} placeholder="INV" />
        </FieldRow>
        <FieldRow label="Payment due (days)" sublabel="Default due date from issue date">
          <Input type="number" min={1} value={form.invoice_due_days || 30} onChange={e => set("invoice_due_days", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default invoice notes" sublabel="Pre-filled in invoice notes field">
          <textarea
            value={form.invoice_default_notes || ""}
            onChange={e => set("invoice_default_notes", e.target.value)}
            className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none"
            placeholder="e.g. Please pay within due date..."
          />
        </FieldRow>
      </Section>

      {/* General */}
      <Section title="Numbering Format" icon={Hash}>
        <FieldRow label="Number padding" sublabel={`e.g. padding 4 → ${String(1).padStart(form.number_padding || 4, "0")}`}>
          <Input type="number" min={1} max={8} value={form.number_padding || 4} onChange={e => set("number_padding", Number(e.target.value))} />
        </FieldRow>
        <SwitchRow label="Include year in number" sublabel="e.g. Q-2026-0001" checked={form.include_year !== false} onChange={v => set("include_year", v)} />
        <SwitchRow label="Reset sequence each year" sublabel="Counter resets to 1 on Jan 1st" checked={form.reset_yearly !== false} onChange={v => set("reset_yearly", v)} />
      </Section>

      {/* Defaults */}
      <Section title="Sales Defaults" icon={FileText}>
        <FieldRow label="Default currency" sublabel="Used for new quotes & invoices">
          <select value={form.default_currency || "AED"} onChange={e => set("default_currency", e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            {["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FieldRow>

        <FieldRow label="Default payment terms" sublabel="e.g. Net 30, Due on Receipt">
          <Input value={form.default_payment_terms || ""} onChange={e => set("default_payment_terms", e.target.value)} placeholder="Net 30" />
        </FieldRow>
      </Section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}