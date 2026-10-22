import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Tag, Layers, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuickProductModal from "@/components/sales/QuickProductModal";

function fmtPrice(n) {
  if (!n && n !== 0) return "";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function ProductPickerModal({ open, onClose, onSelect }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const loadProducts = () => {
    setLoading(true);
    base44.entities.Product.filter({ is_sold: true }).then(d => {
      setProducts(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    setSearch("");
    loadProducts();
  }, [open]);

  const handleQuickCreated = (created) => {
    setProducts(prev => [created, ...prev]);
    onSelect(created);
    onClose();
  };

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    return !s ||
      p.code?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.sale_description?.toLowerCase().includes(s);
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[75vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm font-semibold">Select a product or service</DialogTitle>
            <Button type="button" size="sm" className="h-7 gap-1.5 text-xs"
              onClick={() => setQuickOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> New Product
            </Button>
          </div>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input autoFocus placeholder="Search by code, name..." className="pl-9"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading items...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No items found.</div>
          ) : (
            filtered.map(p => (
              <button key={p.id} onClick={() => { onSelect(p); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 text-left last:border-0">
                <div className="p-1.5 rounded-lg bg-muted shrink-0">
                  {p.type === "Service"
                    ? <Tag className="w-4 h-4 text-violet-500" />
                    : <Layers className="w-4 h-4 text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground border border-border">{p.code}</span>
                    <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                  </div>
                  {p.sale_description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{p.sale_description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">{fmtPrice(p.sale_price)}</div>
                  {p.sale_tax_rate > 0 && (
                    <div className="text-xs text-muted-foreground">{p.sale_tax_rate}% tax</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>

      <QuickProductModal open={quickOpen} onClose={() => setQuickOpen(false)} onCreated={handleQuickCreated} initialProducts={products} />
    </Dialog>
  );
}