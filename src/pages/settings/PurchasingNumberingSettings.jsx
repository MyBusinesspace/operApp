import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Save, Hash, FileText, ShoppingCart } from "lucide-react";
import {
  DEFAULT_PURCHASING_NUMBERING,
  savePurchasingNumberingSettings,
  previewPurchasingNumber,
} from "@/lib/purchasingNumbering";

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

function PurchasingNumberingSettingsInner() {
  const [form, setForm] = useState(DEFAULT_PURCHASING_NUMBERING);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordId, setRecordId] = useState(null);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const settings = list.find(t => t.name === "__purchasing_numbering_settings__");
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
    try {
      const id = await savePurchasingNumberingSettings(form, recordId);
      setRecordId(id);
    } finally {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const billPreview = previewPurchasingNumber(form.bill_prefix || "BILL", 1, form);
  const poPreview = previewPurchasingNumber(form.po_prefix || "PO", 1, form);

  return (
    <div className="space-y-4">
      {/* Bill Numbering */}
      <Section title="Bill defaults" icon={FileText}>
        <FieldRow label="Bill reference prefix" sublabel={`Preview: ${billPreview}`}>
          <Input value={form.bill_prefix || ""} onChange={e => set("bill_prefix", e.target.value)} placeholder="BILL" />
        </FieldRow>
        <FieldRow label="Payment due (days)" sublabel="Due date of new bills = issue date + these days">
          <Input type="number" min={1} value={form.bill_due_days || 30} onChange={e => set("bill_due_days", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default bill notes" sublabel="Pre-filled in the notes of new bills">
          <textarea
            value={form.bill_default_notes || ""}
            onChange={e => set("bill_default_notes", e.target.value)}
            className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-none"
            placeholder="e.g. Please process payment within due date..."
          />
        </FieldRow>
      </Section>

      {/* Purchase Order Numbering */}
      <Section title="Purchase order defaults" icon={ShoppingCart}>
        <FieldRow label="PO number prefix" sublabel={`Preview: ${poPreview}`}>
          <Input value={form.po_prefix || ""} onChange={e => set("po_prefix", e.target.value)} placeholder="PO" />
        </FieldRow>
        <FieldRow label="Delivery (days)" sublabel="Delivery date of new purchase orders = issue date + these days">
          <Input type="number" min={1} value={form.po_delivery_days || 7} onChange={e => set("po_delivery_days", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default PO notes" sublabel="Pre-filled in the notes of new purchase orders">
          <textarea
            value={form.po_default_notes || ""}
            onChange={e => set("po_default_notes", e.target.value)}
            className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-none"
            placeholder="e.g. Please deliver to site..."
          />
        </FieldRow>
      </Section>

      {/* General */}
      <Section title="Numbering format" icon={Hash}>
        <SwitchRow label="Include year in number" sublabel="e.g. BILL-2026-0001" checked={form.include_year !== false} onChange={v => set("include_year", v)} />
        <SwitchRow label="Reset sequence each year" sublabel="Counter resets to 1 on Jan 1st" checked={form.reset_yearly !== false} onChange={v => set("reset_yearly", v)} />
      </Section>

      <Section title="Numbering notes (read-only)" icon={Hash}>
        <div className="text-xs text-muted-foreground space-y-1 py-1">
          <div>Imported Xero bills and purchase orders keep their numbers as they are. They are never renumbered.</div>
          <div>The prefix and year options above apply to new documents only.</div>
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


export default function PurchasingNumberingSettings(props) {
  return <PurchasingNumberingSettingsInner {...props} />;
}
