import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY = {
  code: "",
  name: "",
  type: "Service",
  track_inventory: false,
  is_purchased: true,
  cost_price: 0,
  purchase_tax_rate: 0,
  purchase_description: "",
  is_sold: true,
  sale_price: 0,
  sale_tax_rate: 5,
  sale_description: "",
  quantity: 0,
  unit: "",
  notes: "",
  status: "Active",
};

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ label, checked, onChange, description }) {
  return (
    <div className="flex items-start gap-3 py-3 border-t border-border">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
      />
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function nextCode() {
  const n = String(Math.floor(100 + Math.random() * 800));
  return `ITM-${n}`;
}

export default function DemoProductDialog({ open, onClose, product }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        ...EMPTY,
        ...product,
        cost_price: product.cost_price ?? product.purchase_price ?? 0,
        is_purchased: product.is_purchased ?? true,
        is_sold: product.is_sold ?? true,
      });
    } else {
      setForm({ ...EMPTY, code: nextCode() });
    }
  }, [open, product]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.id ? "Edit Item" : "New item"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" required>
              <Input
                placeholder="e.g. SRV-001"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                required
              />
            </Field>
            <Field label="Name">
              <Input
                placeholder="Item name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Service">Service</SelectItem>
                  <SelectItem value="Product">Product</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit of Measure">
              <Input
                placeholder="pcs, hrs, kg..."
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select
                value={form.status || "Active"}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
            <input
              type="checkbox"
              id="demo_track_inv"
              checked={!!form.track_inventory}
              onChange={(e) => set("track_inventory", e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
            />
            <div>
              <label
                htmlFor="demo_track_inv"
                className="text-sm font-medium cursor-pointer"
              >
                Track inventory item
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track the quantity and value of stock on hand.
              </p>
            </div>
            {form.track_inventory && (
              <div className="ml-auto">
                <Field label="Qty on hand">
                  <Input
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={(e) => set("quantity", Number(e.target.value))}
                    className="w-24"
                  />
                </Field>
              </div>
            )}
          </div>

          <SectionHeader
            label="Purchase"
            checked={!!form.is_purchased}
            onChange={(v) => set("is_purchased", v)}
            description="Add item to bills, purchase orders, and other purchase transactions"
          />
          {form.is_purchased && (
            <div className="space-y-3 ml-7">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cost price">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => set("cost_price", Number(e.target.value))}
                  />
                </Field>
                <Field label="Tax rate %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.purchase_tax_rate}
                    onChange={(e) =>
                      set("purchase_tax_rate", Number(e.target.value))
                    }
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                  placeholder="Description for purchase documents..."
                  value={form.purchase_description}
                  onChange={(e) =>
                    set("purchase_description", e.target.value)
                  }
                />
              </Field>
            </div>
          )}

          <SectionHeader
            label="Sell"
            checked={!!form.is_sold}
            onChange={(v) => set("is_sold", v)}
            description="Add item to invoices, quotes, and other sales transactions"
          />
          {form.is_sold && (
            <div className="space-y-3 ml-7">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sale price">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sale_price}
                    onChange={(e) => set("sale_price", Number(e.target.value))}
                  />
                </Field>
                <Field label="Tax rate %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.sale_tax_rate}
                    onChange={(e) =>
                      set("sale_tax_rate", Number(e.target.value))
                    }
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                  placeholder="Description for invoices and quotes..."
                  value={form.sale_description}
                  onChange={(e) => set("sale_description", e.target.value)}
                />
              </Field>
            </div>
          )}

          <Field label="Internal notes">
            <textarea
              className="w-full min-h-[56px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Internal notes..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.code} className="gap-2">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
