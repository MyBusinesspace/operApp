import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateProductCode, incrementProductCodeCounter, productCodeExists } from "@/lib/productCodeGenerator";
import AnnexPhotosSection from "@/components/shared/AnnexPhotosSection";

const EMPTY = {
  code: "", name: "", type: "Service",
  track_inventory: false,
  is_purchased: true, cost_price: 0, purchase_tax_rate: 0, purchase_description: "",
  is_sold: true, sale_price: 0, sale_tax_rate: 0, sale_description: "",
  quantity: 0, unit: "", notes: "",
  annex_photos: [],
};

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ label, checked, onChange, description }) {
  return (
    <div className="flex items-start gap-3 py-3 border-t border-border">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer" />
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function ProductFormModal({ open, onClose, onSave, product }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCodeError("");
    if (product) {
      setForm({ ...EMPTY, ...product });
    } else {
      setForm({ ...EMPTY });
      setLoadingCode(true);
      generateProductCode().then(async code => {
        let d = {};
        try {
          const list = await base44.entities.DocumentTemplate.list("name", 100);
          const st = list.find(t => t.name === "__product_settings__");
          const ps = st ? JSON.parse(st.footer_notes || "{}") : {};
          d = { unit: (ps.default_unit_service || "hrs"), track_inventory: false };
          d._ps = ps;
        } catch {}
        const ps = d._ps || {};
        setForm(f => ({ ...f, code, unit: f.unit || (f.type === "Product" ? (ps.default_unit_product || "") : (ps.default_unit_service || "")), track_inventory: f.type === "Product" ? !!ps.track_inventory_by_default : f.track_inventory }));
        setLoadingCode(false);
      });
    }
  }, [open, product]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (await productCodeExists(form.code, product?.id)) {
      setCodeError(`Code ${form.code} already exists. Use a different code.`);
      setSaving(false);
      return;
    }
    if (!product?.id) await incrementProductCodeCounter(form.code);
    await onSave(form);
    setSaving(false);
  };

  const handleSaveAndDuplicate = async () => {
    setSaving(true);
    if (await productCodeExists(form.code, product?.id)) {
      setCodeError(`Code ${form.code} already exists. Use a different code.`);
      setSaving(false);
      return;
    }
    await incrementProductCodeCounter(form.code);
    await onSave(form, true);
    // Generate next code for the duplicate
    const nextCode = await generateProductCode();
    setForm(f => ({ ...f, code: nextCode, name: "" }));
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.id ? "Edit Item" : "New item"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {/* Code + Name + Type */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" required>
              <Input placeholder={loadingCode ? "Generating..." : "e.g. SRV-001"} value={loadingCode ? "" : form.code} onChange={e => { setCodeError(""); set("code", e.target.value); }} disabled={loadingCode} required />
              {codeError && <p className="text-xs text-destructive mt-1">{codeError}</p>}
            </Field>
            <Field label="Name">
              <Input placeholder="Item name" value={form.name} onChange={e => set("name", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Service">Service</SelectItem>
                  <SelectItem value="Product">Product</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit of Measure">
              <Input placeholder="pcs, hrs, kg..." value={form.unit} onChange={e => set("unit", e.target.value)} />
            </Field>
          </div>

          {/* Track inventory */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
            <input type="checkbox" id="track_inv" checked={form.track_inventory} onChange={e => set("track_inventory", e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
            <div>
              <label htmlFor="track_inv" className="text-sm font-medium cursor-pointer">Track inventory item</label>
              <p className="text-xs text-muted-foreground mt-0.5">Track the quantity and value of stock on hand.</p>
            </div>
            {form.track_inventory && (
              <div className="ml-auto">
                <Field label="Qty on hand">
                  <Input type="number" min="0" value={form.quantity} onChange={e => set("quantity", Number(e.target.value))} className="w-24" />
                </Field>
              </div>
            )}
          </div>

          {/* Purchase section */}
          <SectionHeader
            label="Purchase"
            checked={form.is_purchased}
            onChange={v => set("is_purchased", v)}
            description="Add item to bills, purchase orders, and other purchase transactions"
          />
          {form.is_purchased && (
            <div className="space-y-3 ml-7">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cost price">
                  <Input type="number" min="0" step="0.01" value={form.cost_price} onChange={e => set("cost_price", Number(e.target.value))} />
                </Field>
                <Field label="Tax rate %">
                  <Input type="number" min="0" max="100" step="0.01" value={form.purchase_tax_rate} onChange={e => set("purchase_tax_rate", Number(e.target.value))} />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                  placeholder="Description for purchase documents..."
                  value={form.purchase_description}
                  onChange={e => set("purchase_description", e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Sell section */}
          <SectionHeader
            label="Sell"
            checked={form.is_sold}
            onChange={v => set("is_sold", v)}
            description="Add item to invoices, quotes, and other sales transactions"
          />
          {form.is_sold && (
            <div className="space-y-3 ml-7">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sale price">
                  <Input type="number" min="0" step="0.01" value={form.sale_price} onChange={e => set("sale_price", Number(e.target.value))} />
                </Field>
                <Field label="Tax rate %">
                  <Input type="number" min="0" max="100" step="0.01" value={form.sale_tax_rate} onChange={e => set("sale_tax_rate", Number(e.target.value))} />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                  placeholder="Description for invoices and quotes..."
                  value={form.sale_description}
                  onChange={e => set("sale_description", e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Notes */}
          <Field label="Internal notes">
            <textarea
              className="w-full min-h-[56px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Internal notes..."
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
            />
          </Field>

          {/* Annex files */}
          <AnnexPhotosSection files={form.annex_photos} onChange={(files) => set("annex_photos", files)} />

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            {!product?.id && (
              <Button type="button" variant="outline" onClick={handleSaveAndDuplicate} disabled={saving || loadingCode || !form.code}>
                Save & duplicate
              </Button>
            )}
            <Button type="submit" disabled={saving || loadingCode || !form.code} className="gap-2">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}