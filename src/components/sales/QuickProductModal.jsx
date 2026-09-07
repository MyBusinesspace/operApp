import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { generateProductCode, incrementProductCodeCounter } from "@/lib/productCodeGenerator";
import { Search, Tag, Layers } from "lucide-react";

const EMPTY = { code: "", name: "", sale_price: 0, sale_description: "", type: "Service" };

function fmtPrice(n) {
  if (!n && n !== 0) return "";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function QuickProductModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setSearch("");
    setShowResults(false);
    setLoadingCode(true);
    generateProductCode().then(code => {
      setForm(f => ({ ...f, code }));
      setLoadingCode(false);
    });
    base44.entities.Product.filter({ is_sold: true }).then(setProducts).catch(() => {});
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    return !s ||
      p.code?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.sale_description?.toLowerCase().includes(s);
  });

  const handleSelect = (p) => {
    onCreated(p);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code || !form.name) return;
    setSaving(true);
    const created = await base44.entities.Product.create(form);
    await incrementProductCodeCounter(form.code);
    setSaving(false);
    onCreated(created);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick Create Product / Service</DialogTitle>
        </DialogHeader>

        {/* Catalog search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-sm pl-8"
            placeholder="Search catalog..."
            value={search}
            autoComplete="off"
            onChange={e => { setSearch(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
          />
          {showResults && search && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No matches — fill the form below to create new.</div>
              ) : (
                filtered.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left border-b border-border/50 last:border-0"
                    onClick={() => handleSelect(p)}
                  >
                    <div className="p-1 rounded bg-muted shrink-0">
                      {p.type === "Service"
                        ? <Tag className="w-3 h-3 text-violet-500" />
                        : <Layers className="w-3 h-3 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded border border-border">{p.code}</span>
                        <span className="text-xs font-medium truncate">{p.name}</span>
                      </div>
                      {p.sale_description && (
                        <p className="text-xs text-muted-foreground truncate">{p.sale_description}</p>
                      )}
                    </div>
                    <span className="text-xs font-semibold tabular-nums shrink-0">{fmtPrice(p.sale_price)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Or create a new one:</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Code <span className="text-destructive">*</span></label>
                <Input className="h-8 text-sm" placeholder={loadingCode ? "Generating..." : ""} value={loadingCode ? "" : form.code} onChange={e => set("code", e.target.value)} disabled={loadingCode} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.type}
                  onChange={e => set("type", e.target.value)}
                >
                  <option value="Service">Service</option>
                  <option value="Product">Product</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name <span className="text-destructive">*</span></label>
              <Input className="h-8 text-sm" value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Enter product name"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sales Description</label>
              <Input className="h-8 text-sm" value={form.sale_description} onChange={e => set("sale_description", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sale Price</label>
              <Input className="h-8 text-sm" type="number" min="0" step="0.01" value={form.sale_price} onChange={e => set("sale_price", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex justify-end gap-2 pt-1 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving || loadingCode || !form.code || !form.name}>
                {saving ? "Creating..." : "Create & Add"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}