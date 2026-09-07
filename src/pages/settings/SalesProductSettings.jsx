import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Save, Package, Tag, Layers, Hash } from "lucide-react";

const DEFAULT = {
  default_product_tax_rate: 5,
  default_service_tax_rate: 5,
  track_inventory_by_default: false,
  show_product_code_on_docs: true,
  allow_negative_stock: false,
  default_unit_product: "pcs",
  default_unit_service: "hrs",
  low_stock_threshold: 5,
  enable_low_stock_alert: true,
  product_code_prefix: "ITM",
  product_code_padding: 4,
  product_code_include_year: false,
  product_code_next_number: 1,
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

export default function SalesProductSettings() {
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [productCount, setProductCount] = useState({ total: 0, products: 0, services: 0, lowStock: 0 });

  useEffect(() => {
    // Load settings stored in a special DocumentTemplate record
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const settings = list.find(t => t.name === "__product_settings__");
      if (settings) {
        setRecordId(settings.id);
        try {
          const parsed = JSON.parse(settings.footer_notes || "{}");
          setForm(f => ({ ...f, ...parsed }));
        } catch {}
      }
    });
    // Load product stats
    base44.entities.Product.list("-created_date", 500).then(products => {
      const total = products.length;
      const prods = products.filter(p => p.type === "Product").length;
      const servs = products.filter(p => p.type === "Service").length;
      const low = products.filter(p => p.track_inventory && (p.quantity ?? 0) <= (form.low_stock_threshold ?? 5)).length;
      setProductCount({ total, products: prods, services: servs, lowStock: low });
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const data = { name: "__product_settings__", footer_notes: JSON.stringify(form) };
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

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-2">
        {[
          { label: "Total Items", value: productCount.total, color: "text-foreground" },
          { label: "Products", value: productCount.products, color: "text-blue-600" },
          { label: "Services", value: productCount.services, color: "text-violet-600" },
          { label: "Low Stock", value: productCount.lowStock, color: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Products */}
      <Section title="Product Defaults" icon={Layers}>
        <FieldRow label="Default unit for Products" sublabel='e.g. pcs, kg, m'>
          <Input value={form.default_unit_product || ""} onChange={e => set("default_unit_product", e.target.value)} placeholder="pcs" />
        </FieldRow>
        <SwitchRow label="Track inventory by default" sublabel="New products will have inventory tracking enabled" checked={form.track_inventory_by_default === true} onChange={v => set("track_inventory_by_default", v)} />
        <SwitchRow label="Allow negative stock" sublabel="Allow selling items even when quantity is 0" checked={form.allow_negative_stock === true} onChange={v => set("allow_negative_stock", v)} />
      </Section>

      {/* Services */}
      <Section title="Service Defaults" icon={Tag}>
        <FieldRow label="Default tax rate for Services (%)" sublabel="Applied to new service line items">
          <Input type="number" min={0} max={100} step={0.5} value={form.default_service_tax_rate ?? 5} onChange={e => set("default_service_tax_rate", Number(e.target.value))} />
        </FieldRow>
        <FieldRow label="Default unit for Services" sublabel='e.g. hrs, days, job'>
          <Input value={form.default_unit_service || ""} onChange={e => set("default_unit_service", e.target.value)} placeholder="hrs" />
        </FieldRow>
      </Section>

      {/* Documents */}
      <Section title="Catalog on Documents" icon={Package}>
        <SwitchRow label="Show product code on documents" sublabel="Display the item code (e.g. SRV-001) on quotes and invoices" checked={form.show_product_code_on_docs !== false} onChange={v => set("show_product_code_on_docs", v)} />
      </Section>

      {/* Product Code Numbering */}
      <Section title="Product & Service Code Numbering" icon={Hash}>
        {(() => {
          const year = new Date().getFullYear();
          const padded = String(form.product_code_next_number || 1).padStart(form.product_code_padding || 4, "0");
          const preview = form.product_code_include_year
            ? `${form.product_code_prefix || "ITM"}-${year}-${padded}`
            : `${form.product_code_prefix || "ITM"}-${padded}`;
          return (
            <>
              <FieldRow label="Code prefix" sublabel={`Preview: ${preview}`}>
                <Input value={form.product_code_prefix || ""} onChange={e => set("product_code_prefix", e.target.value)} placeholder="ITM" />
              </FieldRow>
              <FieldRow label="Number padding" sublabel="Digits in the sequence number">
                <Input type="number" min={1} max={8} value={form.product_code_padding ?? 4} onChange={e => set("product_code_padding", Number(e.target.value))} />
              </FieldRow>
              <FieldRow label="Next number" sublabel="Starting sequence number">
                <Input type="number" min={1} value={form.product_code_next_number ?? 1} onChange={e => set("product_code_next_number", Number(e.target.value))} />
              </FieldRow>
              <SwitchRow label="Include year in code" sublabel="e.g. ITM-2026-0001" checked={!!form.product_code_include_year} onChange={v => set("product_code_include_year", v)} />
            </>
          );
        })()}
      </Section>

      {/* Inventory Alerts */}
      <Section title="Inventory Alerts" icon={Package}>
        <SwitchRow label="Enable low stock alerts" sublabel="Show warning when stock falls below threshold" checked={form.enable_low_stock_alert !== false} onChange={v => set("enable_low_stock_alert", v)} />
        <FieldRow label="Low stock threshold" sublabel="Show alert when quantity is at or below this number">
          <Input type="number" min={0} value={form.low_stock_threshold ?? 5} onChange={e => set("low_stock_threshold", Number(e.target.value))} />
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