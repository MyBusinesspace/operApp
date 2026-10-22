import React from "react";
import { formatDateValue } from "@/lib/dateOnly";
import { X, ChevronUp, ChevronDown, Pencil, Copy, Paperclip, Printer, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lineTaxPct } from "@/lib/docTaxSemantics";

function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}
function fmtMoney(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

const STATUS_STYLES = {
  Draft: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  "Awaiting Payment": "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Repeating: "bg-violet-100 text-violet-700",
  Cancelled: "bg-orange-100 text-orange-600",
  Sent: "bg-blue-100 text-blue-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Declined: "bg-red-100 text-red-600",
  Invoiced: "bg-violet-100 text-violet-700",
};

/**
 * Read-only split detail preview for Quotes and Invoices.
 * kind: "quote" | "invoice"
 */
export default function SalesSplitDetail({ doc, kind, contact, fileCount = 0, onClose, onEdit, onDuplicate, onPrint, onPreview, onExtra, extraAction, onPrev, onNext }) {
  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select a {kind} to preview
      </div>
    );
  }

  const currency = doc.currency || "AED";
  const isInvoice = kind === "invoice";
  const items = (doc.line_items || []).filter(l => l.description || l.unit_price);
  const paid = isInvoice ? (doc.amount_paid || (doc.payments || []).reduce((s, p) => s + (p.amount || 0), 0)) : 0;
  const due = isInvoice ? (doc.total || 0) - paid : 0;
  const title = isInvoice ? "Invoice" : "Quote";

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          {onPreview && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onPreview(doc)}>
              <Eye className="w-3.5 h-3.5" /> Preview
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onPrint(doc)}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onDuplicate?.(doc)}>
            <Copy className="w-3.5 h-3.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(doc)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          {extraAction && extraAction.show !== false && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onExtra?.(doc)}>
              {extraAction.icon ? <extraAction.icon className="w-3.5 h-3.5" /> : null} {extraAction.label}
            </Button>
          )}
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
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[doc.status] || "bg-muted text-muted-foreground"}`}>
              {doc.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{doc.number || "—"}</p>
        </div>

        {/* Sub-header info */}
        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-b border-border">
          <div><p className="text-xs text-muted-foreground">Contact</p><p className="font-medium text-foreground truncate">{doc.contact_name || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Issue date</p><p className="font-medium text-foreground">{fmtDate(doc.issue_date)}</p></div>
          <div><p className="text-xs text-muted-foreground">{isInvoice ? "Due date" : "Expiry date"}</p><p className="font-medium text-foreground">{fmtDate(isInvoice ? doc.due_date : doc.expiry_date)}</p></div>
          <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-medium text-foreground truncate">{doc.reference || "—"}</p></div>
          {doc.project_name && <div><p className="text-xs text-muted-foreground">Project</p><p className="font-medium text-foreground truncate">{doc.project_name}</p></div>}
          {doc.work_order_name && <div><p className="text-xs text-muted-foreground">Work order</p><p className="font-medium text-foreground truncate">{doc.work_order_name}</p></div>}
          <div><p className="text-xs text-muted-foreground">Tax</p><p className="font-medium text-foreground">{fmtMoney(doc.tax_amount, currency)}</p></div>
        </div>

        {/* Line items */}
        <div className="px-6 py-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Price</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Account</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Tax</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No line items</td></tr>
                ) : items.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{l.description || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.unit_price, currency)}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">{l.account_name || l.account_code || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.tax_rate != null ? `${lineTaxPct(l, doc)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(l.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="px-6 pb-4 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoney(doc.subtotal, currency)}</span></div>
            {!isInvoice && doc.discount_total ? (
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{fmtMoney(doc.discount_total, currency)}</span></div>
            ) : null}
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{fmtMoney(doc.tax_amount, currency)}</span></div>
            <div className="flex justify-between font-semibold border-t border-border pt-1.5"><span>Total</span><span className="tabular-nums">{fmtMoney(doc.total, currency)}</span></div>
            {isInvoice && paid > 0 && (
              <div className="flex justify-between text-emerald-600"><span>Payment</span><span className="tabular-nums">-{fmtMoney(paid, currency)}</span></div>
            )}
            {isInvoice && (
              <div className="flex justify-between font-semibold border-t border-border pt-1.5"><span>Amount due</span><span className="tabular-nums">{fmtMoney(due, currency)}</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}