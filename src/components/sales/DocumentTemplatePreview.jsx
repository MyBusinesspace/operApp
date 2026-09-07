import React, { useEffect, useState } from "react";
import { DocContent as QuoteDocContent } from "./QuotePreviewModal";
import { DocContent as InvoiceDocContent } from "./InvoicePreviewModal";
import { loadIncoterms, getIncotermExplanation } from "@/lib/incoterms";

const A4_W = 794;
const A4_H = 1123;

const SAMPLE_LINES = [
  { description: "Service – Equipment Rental (Day 1-15)", quantity: 15, unit_price: 450, tax_rate: 5, total: 6750 },
  { description: "Mobilization & Site Setup", quantity: 1, unit_price: 1200, tax_rate: 5, total: 1200 },
  { description: "Operator Labour (hrs)", quantity: 40, unit_price: 85, tax_rate: 5, total: 3400 },
];

export default function DocumentTemplatePreview({ template, docType = "quote" }) {
  const t = template || {};
  const accentColor = t.accent_color || "#6366f1";
  const currency = "AED";
  const isInvoice = docType === "invoice";

  const [incoterms, setIncoterms] = useState([]);
  useEffect(() => { loadIncoterms().then(setIncoterms).catch(() => {}); }, []);
  const sampleIncoterm = "CFR";
  const incotermExplanation = getIncotermExplanation(incoterms, sampleIncoterm);

  // Status-based title — mirrors the preview modals / PDF generators
  const title = isInvoice
    ? (t.invoice_title_draft || t.invoice_title || "Proforma Invoice")
    : (t.quote_title || "Quotation");

  const today = new Date();
  const issueDate = today.toISOString().slice(0, 10);
  const expiry = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const subtotal = SAMPLE_LINES.reduce((s, l) => s + l.total, 0);
  const taxAmt = SAMPLE_LINES.reduce((s, l) => s + l.total * (l.tax_rate / 100), 0);

  const baseSample = {
    number: isInvoice ? "INV-2026-0042" : "QTE-2026-0018",
    issue_date: issueDate,
    reference: "SA/SE-001",
    project_name: "Sample Project",
    work_order_name: "Sample Work Order",
    task_names: [],
    task_references: [],
    title: "Office Maintenance & Equipment Services",
    doc_summary: "This quotation covers the full scope of planned maintenance work including equipment rental, site mobilization, and on-site operator support for the period specified below. All prices are inclusive of applicable taxes.",
    line_items: SAMPLE_LINES,
    subtotal,
    tax_amount: taxAmt,
    total: subtotal + taxAmt,
    currency,
    notes: "",
    terms: isInvoice ? (t.footer_notes || "") : (t.quote_terms || ""),
    status: "Draft",
    contact_name: "Sample Customer LLC",
    incoterm: sampleIncoterm,
  };

  // Quote uses expiry_date; Invoice uses due_date
  const sampleDoc = isInvoice
    ? { ...baseSample, due_date: expiry }
    : { ...baseSample, expiry_date: expiry };

  const sampleContact = {
    company: "Sample Customer LLC",
    full_name: "Sample Customer LLC",
    tax_id: "100123456700003",
    fiscal_address: "P.O. Box 1234",
    city: "Dubai",
    country: "UAE",
    phone: "+971 4 000 0000",
    email: "john@samplecustomer.com",
  };

  const SCALE = 0.48;
  const scaledW = A4_W * SCALE;
  const scaledH = A4_H * SCALE;

  const DocComp = isInvoice ? InvoiceDocContent : QuoteDocContent;
  const docPropName = isInvoice ? "invoice" : "quote";

  return (
    <div style={{ width: scaledW, height: scaledH, position: "relative", overflow: "hidden" }}>
      <div className="bg-white" style={{ width: A4_W, height: A4_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
        <DocComp
          {...{ [docPropName]: sampleDoc }}
          contact={sampleContact}
          template={t}
          accentColor={accentColor}
          currency={currency}
          title={title}
          page={{ itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false }}
          incotermExplanation={incotermExplanation}
        />
      </div>
    </div>
  );
}