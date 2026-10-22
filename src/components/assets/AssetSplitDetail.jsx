import React from "react";
import { formatDateValue } from "@/lib/dateOnly";
import { X, ChevronUp, ChevronDown, Pencil, Paperclip, User, FolderKanban, MapPin, Calendar, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_STYLES = {
  Available:          "bg-emerald-100 text-emerald-700",
  "In Use":           "bg-sky-100 text-sky-700",
  "Under Maintenance":"bg-amber-100 text-amber-700",
  Retired:            "bg-zinc-100 text-zinc-600",
};

const CATEGORY_STYLES = {
  Crane:     "bg-indigo-100 text-indigo-700",
  Hoist:     "bg-sky-100 text-sky-700",
  Platform:  "bg-teal-100 text-teal-700",
  Vehicle:   "bg-orange-100 text-orange-700",
  Tool:      "bg-purple-100 text-purple-700",
  Equipment: "bg-zinc-100 text-zinc-600",
  Other:     "bg-zinc-100 text-zinc-500",
};

function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}
function fmtMoney(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " " + currency;
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function AssetSplitDetail({ asset, group, fileCount = 0, onClose, onEdit, onPrev, onNext }) {
  if (!asset) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select an asset to preview
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(asset)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} title="Previous">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} title="Next">
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="text-xl font-bold text-foreground">{asset.name || "Asset"}</h2>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[asset.status] || "bg-muted text-muted-foreground"}`}>
              {asset.status || "Available"}
            </span>
            {asset.category && (
              <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${CATEGORY_STYLES[asset.category] || CATEGORY_STYLES.Other}`}>
                {asset.category}
              </span>
            )}
            {group && (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: (group.color || "#6366f1") + "22", color: group.color || "#6366f1" }}>
                {group.name}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono">{asset.reference || "—"}</p>
        </div>

        {/* Info grid */}
        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-b border-border">
          <InfoRow icon={User} label="Contact" value={asset.contact_name} />
          <InfoRow icon={FolderKanban} label="Project" value={asset.project_name} />
          <InfoRow icon={MapPin} label="Location" value={asset.location} />
          <InfoRow icon={Package} label="Serial number" value={asset.serial_number} />
          <InfoRow icon={Calendar} label="Purchase date" value={fmtDate(asset.purchase_date)} />
          <div className="flex items-start gap-2 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Purchase price</p>
              <p className="text-sm font-medium text-foreground">{fmtMoney(asset.purchase_price, asset.currency)}</p>
            </div>
          </div>
        </div>

        {/* Manufacturer / model */}
        {(asset.manufacturer || asset.model || asset.year) && (
          <div className="px-6 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground mb-1">Manufacturer</p>
            <p className="text-sm font-medium text-foreground">
              {[asset.manufacturer, asset.model, asset.year].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}

        {/* Work orders */}
        {Array.isArray(asset.work_order_names) && asset.work_order_names.length > 0 && (
          <div className="px-6 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground mb-1.5">Work orders</p>
            <div className="flex flex-wrap gap-1.5">
              {asset.work_order_names.map((w, i) => (
                <span key={i} className="text-xs font-medium px-2 py-1 rounded-md bg-muted text-foreground">{w}</span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {asset.notes && (
          <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{asset.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}