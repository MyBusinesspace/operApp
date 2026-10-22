/**
 * Printable A4 purchase order document — mirrors BillPrintDocument.
 * Used by purchaseOrderPdfFromHtml to generate a clean PDF.
 */
import React from "react";
import { DocContent } from "@/components/sales/InvoicePreviewModal";

const A4_W = 794;

function fmtMoney(n, currency = "AED") {
  const v = Number(n || 0);
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function PODocContent({ purchaseOrder, contact, template: t = {}, currency, title = "Purchase Order", measure = true }) {
  const accentColor = t.accent_color || "#6366f1";
  const cur = currency || purchaseOrder.currency || "AED";
  const po = purchaseOrder;
  const inv = {
    ...po,
    number: po.number || "Assigned on approval",
    due_date: "",
    terms: "",
    subtotal: po.subtotal ?? 0,
    doc_summary: po.doc_summary || (po.delivery_date ? `Delivery date: ${fmtDate(po.delivery_date)}` : ""),
    line_items: (po.line_items || []).map(l => ({ ...l, quantity: l.quantity ?? 1 })),
  };
  return (
    <div style={{ width: A4_W, minHeight: 1123, background: "#fff", boxSizing: "border-box" }}>
      <DocContent invoice={inv} contact={contact} template={t} accentColor={accentColor} currency={cur} title={title || "Purchase Order"} measure={true} numberLabel="PO No." />
    </div>
  );
}
