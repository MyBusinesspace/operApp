/**
 * Printable A4 bill document — mirrors the sales DocContent structure.
 * Used by billPdfFromHtml to generate a clean PDF (not a screenshot of the UI).
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

export function billAsInvoice(bill) {
  return {
    ...bill,
    number: bill.number || "Assigned on approval",
    reference: bill.reference || "",
    terms: "",
    subtotal: bill.subtotal ?? 0,
    line_items: (bill.line_items || []).map(l => ({ ...l, quantity: l.quantity ?? 1 })),
  };
}

export function BillDocContent({ bill, contact, template: t = {}, currency, title = "Bill", measure = true }) {
  const accentColor = t.accent_color || "#6366f1";
  const cur = currency || bill.currency || "AED";
  const inv = {
    ...bill,
    number: bill.number || "Assigned on approval",
    reference: bill.reference || "",
    notes: bill.notes || "",
    terms: "",
    subtotal: bill.subtotal ?? 0,
    line_items: (bill.line_items || []).map(l => ({ ...l, quantity: l.quantity ?? 1 })),
  };
  return (
    <div style={{ width: A4_W, minHeight: 1123, background: "#fff", boxSizing: "border-box" }}>
      <DocContent invoice={inv} contact={contact} template={t} accentColor={accentColor} currency={cur} title={title || "Bill"} measure={true} numberLabel="Bill No." />
    </div>
  );
}
