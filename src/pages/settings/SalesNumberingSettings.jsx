import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Save, Hash, FileText, FileCheck } from "lucide-react";

const DEFAULT = {
  quote_prefix: "Q",
  invoice_prefix: "INV",
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
        <div className="text-xs font-medium text-foreground">{label}</div>
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
        <div className="text-xs font-medium text-foreground">{label}</div>
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
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SalesNumberingSettingsInner() {
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
          // Migrate legacy draft/confirmed prefixes to the unified single prefix.
          const migrated = { ...parsed };
          if (!migrated.quote_prefix) {
            migrated.quote_prefix = parsed.quote_confirmed_prefix || parsed.quote_draft_prefix || DEFAULT.quote_prefix;
          }
          if (!migrated.invoice_prefix) {
            migrated.invoice_prefix = parsed.invoice_confirmed_prefix || parsed.invoice_draft_prefix || DEFAULT.invoice_prefix;
          }
          setForm(f => ({ ...f, ...migrated }));
        } catch {}
      }
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [seriesError, setSeriesError] = useState("");
  const setSeries = (i, patch) => setForm(f => ({ ...f, series: (f.series || []).map((s, j) => j === i ? { ...s, ...patch } : s) }));
  const setSeriesDefault = (i, on) => setForm(f => {
    const list = f.series || [];
    const dt = list[i]?.doc_type;
    return { ...f, series: list.map((s, j) => ({ ...s, is_default: j === i ? on : (s.doc_type === dt ? false : s.is_default) })) };
  });
  const removeSeries = (i) => setForm(f => ({ ...f, series: (f.series || []).filter((_, j) => j !== i) }));

  const handleSave = async () => {
    const list = form.series || [];
    const reserved = ["INV", "CN", "Q"];
    for (const s of list) {
      if (!/^[A-Z]{1,6}$/.test(s.code || "")) { setSeriesError("Each series needs a code of 1-6 capital letters."); return; }
      if (reserved.includes(s.code)) { setSeriesError("INV, CN and Q are the standard series and cannot be reused."); return; }
    }
    const codes = list.map(s => s.code);
    if (new Set(codes).size !== codes.length) { setSeriesError("Series codes must be unique."); return; }
    setSeriesError("");
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
    return form.include_year ? `${prefix}-${year}-${num}` : `${prefix}-${num}`;
  };

  return (
    <div className="space-y-4">
      {/* Quote Numbering */}
      <Section title="Quote defaults" icon={FileText}>
        <FieldRow label="Quote validity (days)" sublabel="Default expiry from issue date">
          <Input type="number" min={1} value={form.quote_validity_days || 30} onChange={e => set("quote_validity_days", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default quote notes" sublabel="Pre-filled in quote notes field">
          <textarea
            value={form.quote_default_notes || ""}
            onChange={e => set("quote_default_notes", e.target.value)}
            className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-none"
            placeholder="e.g. Thank you for the opportunity..."
          />
        </FieldRow>
      </Section>

      {/* Invoice Numbering */}
      <Section title="Invoice defaults" icon={FileCheck}>
        <FieldRow label="Payment due (days)" sublabel="Default due date from issue date">
          <Input type="number" min={1} value={form.invoice_due_days || 30} onChange={e => set("invoice_due_days", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default invoice notes" sublabel="Pre-filled in invoice notes field">
          <textarea
            value={form.invoice_default_notes || ""}
            onChange={e => set("invoice_default_notes", e.target.value)}
            className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-none"
            placeholder="e.g. Please pay within due date..."
          />
        </FieldRow>
      </Section>

      <Section title="Document series" icon={Hash}>
        <div className="text-xs text-muted-foreground pb-3">
          Empty by default: documents use the standard series (INV, CN, Q). Add a series (for example EX for export invoices) to choose it when creating a document. A series number looks like EX-2026-0001, with its own counter each year. The series is locked once the document is numbered. Codes are 1-6 capital letters and cannot be INV, CN or Q.
        </div>
        {(form.series || []).map((s, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-border last:border-0">
            <Input className="col-span-2" placeholder="EX" value={s.code || ""} onChange={e => setSeries(i, { code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) })} />
            <Input className="col-span-4" placeholder="Label (e.g. Export)" value={s.label || ""} onChange={e => setSeries(i, { label: e.target.value })} />
            <select className="col-span-3 h-9 rounded-md border border-input bg-transparent px-2 text-xs" value={s.doc_type || "invoice"} onChange={e => setSeries(i, { doc_type: e.target.value })}>
              <option value="invoice">Invoice</option>
              <option value="credit_note">Credit note</option>
              <option value="quote">Quote</option>
            </select>
            <label className="col-span-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={!!s.is_default} onChange={e => setSeriesDefault(i, e.target.checked)} /> Default</label>
            <button type="button" className="col-span-1 text-xs text-destructive" onClick={() => removeSeries(i)}>Remove</button>
          </div>
        ))}
        <div className="pt-3 flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => set("series", [...(form.series || []), { code: "", label: "", doc_type: "invoice", is_default: false }])}>Add series</Button>
          {seriesError && <span className="text-xs text-destructive">{seriesError}</span>}
        </div>
      </Section>

      <Section title="Document numbering (automatic, read-only)" icon={Hash}>
        <div className="text-xs text-muted-foreground space-y-1 py-1">
          <div>Standard series: Invoices INV-YYYY-0001, Credit notes CN-YYYY-0001, Quotes Q-YYYY-0001. Custom series (see Document series above) use their own code and counter, for example EX-YYYY-0001.</div>
          <div>The year is the issue date year and the sequence restarts at 0001 each year. There is no maximum (0001 is a minimum width).</div>
          <div>The number is assigned when the document is approved (quotes: when sent). Drafts have no number. Numbers imported from Xero are kept as they are.</div>
        </div>
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


export default function SalesNumberingSettings(props) {
  return <SalesNumberingSettingsInner {...props} />;
}
