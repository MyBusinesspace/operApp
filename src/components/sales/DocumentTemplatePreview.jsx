import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { renderToString } from "react-dom/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DocContent as QuoteDocContent } from "@/components/sales/QuotePreviewModal";
import { DocContent as InvoiceDocContent } from "@/components/sales/InvoicePreviewModal";
import { computeDocPages, samePlan } from "@/lib/docPagination";
import { autoFitBodyFontSize, inlineImages } from "@/lib/docAutoFit";
import { loadIncoterms, getIncotermExplanation } from "@/lib/incoterms";
import { addDaysISO, todayLocalISO } from "@/lib/dateOnly";

const A4_W = 794;
const A4_H = 1123;
const SCALE = 0.48;
const FULL_PAGE = { itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false };

// Sample data only. A long multi-line description and long terms are included on
// purpose: the preview paginates exactly like the PDF, so nothing is clipped.
const SAMPLE_LINES = [
  { description: "Service – Equipment Rental (Day 1-15)", quantity: 15, unit_price: 450, tax_rate: 5, total: 6750 },
  { description: "Mobilization & Site Setup", quantity: 1, unit_price: 1200, tax_rate: 5, total: 1200 },
  { description: "Operator Labour (hrs)", quantity: 40, unit_price: 85, tax_rate: 5, total: 3400 },
  {
    description: "Planned maintenance scope of work:\n• Inspect and service all rotating equipment on site\n• Replace worn seals, filters and lubricants\n• Record vibration and temperature readings for each unit\n• Report findings with photographs and recommended follow-up works",
    quantity: 1, unit_price: 2600, tax_rate: 5, total: 2600,
  },
];

const LONG_TERMS = `PAYMENT AND DELIVERY TERMS:
1. Payment is due within 7 days of the document date unless agreed otherwise in writing.
2. Prices are exclusive of any duties, permits or third-party charges not listed above.
3. All works are carried out during normal working hours (08:00 – 17:00), Monday to Friday.
4. Any additional scope requested on site is quoted separately and approved before execution.
5. Equipment remains the property of the supplier until paid in full.
6. A daily standby charge applies to equipment kept on site beyond the agreed rental period.
7. This document is governed by the laws of the jurisdiction stated in the company details above.`;

export default function DocumentTemplatePreview({ template, docType = "quote", state = "Draft" }) {
  const t = template || {};
  const isQuote = docType === "quote";
  const isCreditNote = docType === "credit_note";
  const accentColor = t.accent_color || "#6366f1";
  const currency = "AED";

  const [incoterms, setIncoterms] = useState([]);
  useEffect(() => { loadIncoterms().then(setIncoterms).catch(err => console.error(err)); }, []);
  const sampleIncoterm = "CFR";
  const incotermExplanation = getIncotermExplanation(incoterms, sampleIncoterm);

  // Real status titles: invoices Draft / Approved / Overdue, quotes Draft / Sent,
  // credit notes Draft / Approved.
  const title = isQuote
    ? (state === "Draft" ? (t.quote_title || "Quotation") : (t.quote_title_sent || t.quote_title || "Quotation"))
    : isCreditNote
      ? (state === "Draft" ? (t.credit_note_title_draft || t.credit_note_title || "Credit Note") : (t.credit_note_title || "Credit Note"))
      : (state === "Draft"
        ? (t.invoice_title_draft || t.invoice_title || "Proforma Invoice")
        : state === "Overdue"
          ? (t.invoice_title_overdue || t.invoice_title || "Tax Invoice")
          : (t.invoice_title || "Tax Invoice"));

  const issueDate = todayLocalISO();
  const expiry = addDaysISO(issueDate, 30);

  const subtotal = SAMPLE_LINES.reduce((s, l) => s + l.total, 0);
  const taxAmt = SAMPLE_LINES.reduce((s, l) => s + l.total * (l.tax_rate / 100), 0);

  const status = isQuote
    ? (state === "Draft" ? "Draft" : "Sent")
    : isCreditNote
      ? (state === "Draft" ? "Draft" : "Awaiting Application")
      : "Awaiting Payment";

  const baseSample = {
    number: isQuote ? "Q-2026-0018" : isCreditNote ? "CN-2026-0007" : "INV-2026-0042",
    issue_date: issueDate,
    reference: "SA/SE-001",
    project_name: "Sample Project",
    work_order_name: "Sample Work Order",
    task_names: [],
    task_references: [],
    title: "Office Maintenance & Equipment Services",
    doc_summary: "This document covers the full scope of planned maintenance work including equipment rental, site mobilization, and on-site operator support for the period specified below. All prices are inclusive of applicable taxes.",
    line_items: SAMPLE_LINES,
    subtotal,
    tax_amount: taxAmt,
    total: subtotal + taxAmt,
    currency,
    notes: "",
    terms: (isQuote ? t.quote_terms : t.footer_notes) || LONG_TERMS,
    status,
    contact_name: "Sample Customer LLC",
    incoterm: sampleIncoterm,
    annex_photos: [],
  };

  // Quote uses expiry_date; invoice/credit note use due_date (credit note: none needed)
  const sampleDoc = isQuote
    ? { ...baseSample, expiry_date: expiry }
    : isCreditNote
      ? { ...baseSample, reason: "Service credit — cancelled visit" }
      : { ...baseSample, due_date: state === "Overdue" ? addDaysISO(issueDate, -10) : expiry };

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

  const DocComp = isQuote ? QuoteDocContent : InvoiceDocContent;
  const docPropName = isQuote ? "quote" : "invoice";
  const numberLabel = isCreditNote ? "Credit Note Number" : "Invoice Number";

  const docProps = (extra) => ({
    [docPropName]: sampleDoc,
    contact: sampleContact,
    accentColor,
    currency,
    title,
    incotermExplanation,
    numberLabel,
    ...extra,
  });

  const measureRef = useRef(null);
  const [pages, setPages] = useState([FULL_PAGE]);
  const [pageIdx, setPageIdx] = useState(0);
  const [autoFs, setAutoFs] = useState(null);

  // Auto-fit the body font size exactly like the real PDF does
  useLayoutEffect(() => {
    if (t.auto_text_scale === false) { setAutoFs(null); return; }
    let cancelled = false;
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.zIndex = "-1";
    document.body.appendChild(container);
    const renderMeasure = async (fs) => {
      const html = renderToString(React.createElement(DocComp, {
        [docPropName]: sampleDoc,
        contact: sampleContact,
        template: { ...t, body_font_size: fs },
        accentColor,
        currency,
        title,
        incotermExplanation,
        numberLabel,
        page: FULL_PAGE,
        measure: true,
      }));
      const wrapper = document.createElement("div");
      wrapper.style.width = A4_W + "px";
      wrapper.style.background = "#ffffff";
      wrapper.innerHTML = html;
      container.innerHTML = "";
      container.appendChild(wrapper);
      await inlineImages(wrapper);
      return wrapper;
    };
    (async () => {
      const fs = await autoFitBodyFontSize(renderMeasure);
      if (!cancelled) setAutoFs(fs);
    })();
    return () => { cancelled = true; document.body.removeChild(container); };
  }, [template, docType, state]);

  const fitT = { ...t, body_font_size: autoFs ?? (t.body_font_size || 8.5) };

  // Same block-aware pagination the preview modals and the PDF use
  useLayoutEffect(() => {
    const compute = () => {
      if (!measureRef.current) { setPages([FULL_PAGE]); return; }
      const plan = computeDocPages(measureRef.current, A4_H);
      setPages(prev => (samePlan(prev, plan) ? prev : plan));
    };
    compute();
    const id = setTimeout(compute, 300);
    return () => clearTimeout(id);
  }, [template, docType, state, autoFs]);

  // Moving to another document type restarts at page 1
  useEffect(() => { setPageIdx(0); }, [docType, state]);

  const safeIdx = Math.min(pageIdx, Math.max(pages.length - 1, 0));

  return (
    <div className="w-full">
      <div style={{ width: A4_W * SCALE, height: A4_H * SCALE, position: "relative", overflow: "hidden" }} className="mx-auto">
        <div className="bg-white" style={{ width: A4_W, height: A4_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
          <DocComp {...docProps({ template: fitT, page: pages[safeIdx] })} />
        </div>
      </div>

      {/* Page navigation — the page count is always visible */}
      <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setPageIdx(i => Math.max(0, i - 1))}
          disabled={safeIdx <= 0}
          className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
          title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="tabular-nums">Page {safeIdx + 1} of {pages.length}</span>
        <button
          type="button"
          onClick={() => setPageIdx(i => Math.min(pages.length - 1, i + 1))}
          disabled={safeIdx >= pages.length - 1}
          className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
          title="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hidden measurement render — the full document, used for auto-fit + pagination */}
      <div aria-hidden style={{ position: "fixed", left: "-10000px", top: 0, width: A4_W, pointerEvents: "none", opacity: 0 }}>
        <div ref={measureRef} style={{ width: A4_W }}>
          <DocComp {...docProps({ template: fitT, page: FULL_PAGE, measure: true })} />
        </div>
      </div>
    </div>
  );
}