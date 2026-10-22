import React, { useState } from "react";
import { X, ChevronUp, ChevronDown, Pencil, Tag, Layers, FileText, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import SignedImage from "@/components/shared/SignedImage";
import FilePreviewModal from "@/components/shared/FilePreviewModal";

function isImage(url = "") {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
}
function isPdf(url = "") {
  return /\.pdf$/i.test(url);
}

const TYPE_STYLES = {
  Product: "bg-blue-100 text-blue-700",
  Service: "bg-violet-100 text-violet-700",
};

function fmtPrice(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function Row({ label, value }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

export default function ProductSplitDetail({ product, onClose, onEdit, onPrev, onNext }) {
  const [preview, setPreview] = useState(null);
  if (!product) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select an item to preview
      </div>
    );
  }

  const Icon = product.type === "Service" ? Tag : Layers;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(product)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} title="Previous"><ChevronUp className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} title="Next"><ChevronDown className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{product.name || "—"}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-xs font-mono font-semibold text-foreground border border-border">{product.code}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_STYLES[product.type] || "bg-muted text-muted-foreground"}`}>
                {product.type || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Sales */}
        <div className="px-6 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sales</p>
          <Row label="Sold" value={product.is_sold ? "Yes" : null} />
          <Row label="Sale price" value={product.is_sold ? fmtPrice(product.sale_price) : null} />
          <Row label="Sales tax" value={product.is_sold ? `${product.sale_tax_rate ?? 0}%` : null} />
          {product.is_sold && product.sale_description && (
            <div className="py-1.5">
              <p className="text-xs text-muted-foreground mb-1">Sale description</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{product.sale_description}</p>
            </div>
          )}
        </div>

        {/* Purchasing */}
        <div className="px-6 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Purchasing</p>
          <Row label="Purchased" value={product.is_purchased ? "Yes" : null} />
          <Row label="Cost price" value={product.is_purchased ? fmtPrice(product.cost_price) : null} />
          <Row label="Purchase tax" value={product.is_purchased ? `${product.purchase_tax_rate ?? 0}%` : null} />
          {product.is_purchased && product.purchase_description && (
            <div className="py-1.5">
              <p className="text-xs text-muted-foreground mb-1">Purchase description</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{product.purchase_description}</p>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div className="px-6 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Inventory</p>
          <Row label="Track inventory" value={product.track_inventory ? "Yes" : null} />
          <Row label="Quantity on hand" value={product.track_inventory ? `${product.quantity ?? 0}${product.unit ? " " + product.unit : ""}` : null} />
          <Row label="Unit" value={product.unit} />
        </div>

        {/* Notes */}
        {product.notes && (
          <div className="px-6 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{product.notes}</p>
          </div>
        )}

        {/* Annex files */}
        <div className="px-6 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Annex files ({(product.annex_photos || []).length})
          </p>
          {(product.annex_photos || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No files attached.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(product.annex_photos || []).map((f, i) => {
                const img = isImage(f.url);
                const pdf = isPdf(f.url);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPreview({ file_url: f.url, file_name: f.caption || `File ${i + 1}` })}
                    className="relative aspect-square rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition"
                  >
                    {img ? (
                      <SignedImage src={f.url} alt={f.caption || `File ${i + 1}`} className="w-full h-full object-cover" />
                    ) : pdf ? (
                      <div className="flex flex-col items-center gap-1 text-red-600">
                        <FileText className="w-7 h-7" />
                        <span className="text-[9px] font-medium text-muted-foreground">PDF</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-sky-600">
                        <FileIcon className="w-7 h-7" />
                        <span className="text-[9px] font-medium text-muted-foreground">File</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}