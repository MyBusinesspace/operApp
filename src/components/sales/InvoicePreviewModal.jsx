import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Pencil, X, ChevronLeft, ChevronRight } from "lucide-react";
import { amountToWords } from "@/lib/numberToWords";
import { loadIncoterms, getIncotermExplanation } from "@/lib/incoterms";
import { computeDocPages, samePlan } from "@/lib/docPagination";
import { autoFitBodyFontSize, inlineImages } from "@/lib/docAutoFit";
import { renderToString } from "react-dom/server";

const A4_W = 794;
const A4_H = 1123;

const fmt = (n, currency = "AED") =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Collapse blank lines inside descriptions so the preview matches the compact PDF layout
function normalizeDesc(text) {
  return (text || "")
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n[ \t]*\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[\n\s]+$/g, '')
    .trim();
}

const FULL_PAGE = { itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false };

export function DocContent({ invoice, contact, template: t, accentColor, currency, title, page = FULL_PAGE, incotermExplanation = "", measure = false }) {
  const { itemStart = 0, itemEnd = 9999, showTotals = true, showNotes = true, showTerms = true, isContinuation = false } = page;
  const bodyFs = t.body_font_size || 8.5;
  const headFs = bodyFs - 0.5;
  const headFill = { background: accentColor, color: "#ffffff", padding: "4px 10px", fontWeight: 700, borderRadius: "4px 4px 0 0" };
  const bodyBox = { padding: "8px 10px" };
  const billName = contact?.fiscal_legal_name || contact?.full_name || contact?.company || invoice.contact_name || "—";
  const billAddress = contact?.fiscal_address || contact?.address;
  const billCity = [contact?.fiscal_city || contact?.city, contact?.fiscal_country || contact?.country].filter(Boolean).join(", ");
  const billZip = contact?.fiscal_zip;
  const billPhone = contact?.phone;
  const billEmail = contact?.email;
  const billTax = contact?.tax_id;

  const lineItems = (invoice.line_items || []).filter(l => (l.description || "").trim() !== "" || (Number(l.total) || 0) > 0);
  const showLines = lineItems.slice(itemStart, itemEnd);
  const hasItems = itemEnd > itemStart;
  const logoPos = t.logo_position || "right";
  const logoJustify = logoPos === "left" ? "flex-start" : logoPos === "center" ? "center" : "flex-end";
  const coTextAlign = logoPos === "left" ? "left" : logoPos === "center" ? "center" : "right";
  const coNameFs = t.company_name_font_size || 19;

  return (
    <div data-doc-root style={{ fontFamily: t.font || "Inter", fontSize: 9.5, color: "#1a1a2e", padding: "24px 30px 64px", boxSizing: "border-box", height: measure ? "auto" : "100%", position: "relative", display: "flex", flexDirection: "column" }}>

      {!isContinuation && (
        <div data-block="header">
          {/* Main header: title+meta+client (left) | company (right) */}
          <div style={{ display: "flex", gap: 16, marginBottom: 14, alignItems: "flex-start" }}>

            {/* Left: title + meta line + bill to + relative to */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 8.5, color: "#666", marginBottom: 10 }}>
                {[
                  invoice.number && `Invoice Number: ${invoice.number}`,
                  invoice.issue_date && `Date: ${fmtDate(invoice.issue_date)}`,
                  invoice.due_date && `Due: ${fmtDate(invoice.due_date)}`,
                  invoice.incoterm && `Incoterm: ${invoice.incoterm}`,
                ].filter(Boolean).join("   |   ")}
              </div>
              <div style={{ fontWeight: 600, fontSize: 10 }}>{billName}</div>
              {billTax && <div style={{ fontSize: 8.5, color: "#555" }}>TRN No . {billTax}</div>}
              {billAddress && <div style={{ fontSize: 8.5, color: "#555" }}>{billAddress}</div>}
              {billCity && <div style={{ fontSize: 8.5, color: "#555" }}>{billCity}</div>}
              {billZip && <div style={{ fontSize: 8.5, color: "#555" }}>{billZip}</div>}
              {billPhone && <div style={{ fontSize: 8.5, color: "#555" }}>T: {billPhone}</div>}
              {billEmail && <div style={{ fontSize: 8.5, color: "#555" }}>{billEmail}</div>}
              {(() => {
                const _taskRefs = (invoice.task_references?.length ? invoice.task_references : invoice.task_names || []).filter(Boolean);
                const rel = [
                  invoice.reference ? `Ref: ${invoice.reference}` : "",
                  invoice.project_name ? `Project: ${invoice.project_name}` : "",
                  invoice.work_order_name ? `WO: ${invoice.work_order_name}` : "",
                  _taskRefs.length ? `Task: ${_taskRefs.join(", ")}` : "",
                ];
                if (!rel.some(Boolean)) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 8, fontWeight: 800, color: "#777", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>Relative to:</div>
                    {rel.map((l, i) => l ? <div key={i} style={{ fontSize: 8.5, color: "#555", lineHeight: 1.5 }}>{l}</div> : null)}
                  </div>
                );
              })()}
            </div>

            {/* Right: company — logo + name aligned per logo_position */}
            <div style={{ flex: "0 0 38%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: logoJustify, marginBottom: 3 }}>
                {t.logo_url && (() => { const ls = t.logo_size || 60; return <img src={t.logo_url} alt="logo" style={{ maxHeight: ls, maxWidth: ls * 2.5, objectFit: "contain" }} />; })()}
                {t.company_name && <div style={{ fontWeight: 800, fontSize: coNameFs, lineHeight: 1 }}>{t.company_name}</div>}
              </div>
              <div style={{ textAlign: coTextAlign }}>
                {t.tax_id && <div style={{ fontSize: 8.5, color: "#555" }}>TRN: {t.tax_id}</div>}
                {t.company_address && <div style={{ fontSize: 8.5, color: "#555", whiteSpace: "pre-line" }}>{t.company_address}</div>}
                {t.company_phone && <div style={{ fontSize: 8.5, color: "#555" }}>T: {t.company_phone}</div>}
                {t.company_email && <div style={{ fontSize: 8.5, color: "#555" }}>{t.company_email}</div>}
                {t.company_website && <div style={{ fontSize: 8.5, color: "#555" }}>{t.company_website}</div>}
              </div>
            </div>
          </div>

          {/* Doc title & summary */}
          {(invoice.title || invoice.doc_summary) && (
            <div style={{ marginBottom: 12 }}>
              {invoice.title && <div style={{ ...headFill, fontSize: 12 }}>{invoice.title}</div>}
              {invoice.doc_summary && <div style={{ ...bodyBox, fontSize: 8.5, color: "#555", lineHeight: 1.6 }}>{invoice.doc_summary}</div>}
            </div>
          )}
        </div>
      )}

      {/* Page 2 continuation header */}
      {isContinuation && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid #ddd` }}>
          <div style={{ fontSize: 9, color: "#888" }}>{title} {invoice.number ? `#${invoice.number}` : ""} — continued</div>
          {t.company_name && <div style={{ fontSize: 9, color: "#888" }}>{t.company_name}</div>}
        </div>
      )}

      {/* Line items table */}
      {hasItems && (
        <table data-block="items" style={{ width: "100%", borderCollapse: "collapse", fontSize: bodyFs, marginBottom: 8 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid #1a1a2e` }}>
              <th style={{ textAlign: "left", padding: "4px 5px", fontSize: headFs, fontWeight: 700, color: "#1a1a2e" }}>Description</th>
              <th style={{ textAlign: "right", padding: "4px 5px", fontSize: headFs, fontWeight: 700, color: "#1a1a2e", width: "10%" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "4px 5px", fontSize: headFs, fontWeight: 700, color: "#1a1a2e", width: "15%" }}>Unit Price</th>
              <th style={{ textAlign: "right", padding: "4px 5px", fontSize: headFs, fontWeight: 700, color: "#1a1a2e", width: "11%" }}>Tax %</th>
              <th style={{ textAlign: "right", padding: "4px 5px", fontSize: headFs, fontWeight: 700, color: "#1a1a2e", width: "16%" }}>Amount {currency}</th>
            </tr>
          </thead>
          <tbody>
            {showLines.length === 0 && !isContinuation ? (
              <tr><td colSpan={5} style={{ padding: "10px 5px", textAlign: "center", color: "#aaa", fontSize: bodyFs }}>No line items</td></tr>
            ) : showLines.map((l, i) => (
              <tr key={i} data-item-row style={{ borderBottom: "1px solid #e8e8e8" }}>
                <td style={{ padding: "7px 5px", verticalAlign: "top", lineHeight: 1.4, whiteSpace: "pre-line" }}>{normalizeDesc(l.description)}</td>
                <td style={{ padding: "7px 5px", textAlign: "right", verticalAlign: "top" }}>{Number(l.quantity || 0).toFixed(2)}</td>
                <td style={{ padding: "7px 5px", textAlign: "right", verticalAlign: "top" }}>{Number(l.unit_price || 0).toFixed(2)}</td>
                <td style={{ padding: "7px 5px", textAlign: "right", verticalAlign: "top" }}>{l.tax_rate ?? 0}%</td>
                <td style={{ padding: "7px 5px", textAlign: "right", verticalAlign: "top", fontWeight: 500 }}>{Number(l.total || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Totals — only on the page that shows them */}
      {showTotals && (
        <div data-block="totals" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, gap: 16 }}>
          <div style={{ fontSize: 8, color: "#555", fontStyle: "italic", maxWidth: 340, paddingBottom: 4, lineHeight: 1.4 }}>
            {Number(invoice.total || 0) > 0 && (
              <span><strong style={{ fontStyle: "normal" }}>Amount in words:</strong> {amountToWords(invoice.total, currency)}</span>
            )}
            {invoice.incoterm && incotermExplanation && (
              <div style={{ marginTop: 4, fontStyle: "normal", fontSize: 7.5, color: "#777", lineHeight: 1.4 }}>
                <strong style={{ fontWeight: 700 }}>{invoice.incoterm}</strong> — {incotermExplanation}
              </div>
            )}
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555", marginBottom: 3, paddingBottom: 3, borderBottom: "1px solid #eee" }}>
              <span>Subtotal</span><span>{Number(invoice.subtotal || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, paddingTop: 4 }}>
              <span>Total {invoice.incoterm || "(including Tax)"} {currency}</span><span>{Number(invoice.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && showNotes && (
        <div data-block="notes" style={{ marginBottom: 12 }}>
          <div style={{ ...headFill, fontSize: bodyFs + 0.5 }}>Notes</div>
          <div style={{ ...bodyBox, fontSize: bodyFs, color: "#444", whiteSpace: "pre-line", lineHeight: 1.6 }}>{invoice.notes}</div>
        </div>
      )}

      {/* Terms & Conditions (shown on document) */}
      {invoice.terms && invoice.terms.trim() && showTerms && (
        <div data-block="terms" style={{ marginBottom: 12 }}>
          <div style={{ ...headFill, fontSize: bodyFs + 0.5 }}>Terms &amp; Conditions</div>
          <div style={{ ...bodyBox, fontSize: bodyFs, color: "#444", whiteSpace: "pre-line", lineHeight: 1.6 }}>{invoice.terms}</div>
        </div>
      )}

      {/* Stamp — absolutely positioned so it never overflows the A4 page; shown on every page when enabled */}
      {t.show_stamp && t.stamp_url && (
        <div style={{ position: "absolute", right: 30, bottom: 48 }}>
          <img src={t.stamp_url} alt="stamp" style={{ width: 80, height: 80, objectFit: "contain", opacity: 0.85 }} />
        </div>
      )}

      {/* Footer — pinned to bottom of A4 page */}
      {!measure && (
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 16, borderTop: `1px solid #ccc`, paddingTop: 5, fontSize: 7.5, color: "#888", textAlign: "center" }}>
          {[t.company_name, t.company_address, t.company_phone, t.company_email].filter(Boolean).join("   ·   ")}
        </div>
      )}
    </div>
  );
}

// Kept as a lightweight fallback for the PDF generator when DOM measurement
// is not available. The preview and PDF now prefer computeDocPages (real DOM).
export function calcPageBreak(invoice, template) {
  const bodyFs = (template && template.body_font_size) || 8.5;
  const lineItems = (invoice.line_items || []).filter(l => (l.description || "").trim() !== "" || (Number(l.total) || 0) > 0);
  const CHAR_PER_LINE = Math.max(20, Math.round(90 * (8.5 / bodyFs)));
  const hasTitleBlock = !!(invoice.title || invoice.doc_summary);
  const baseMax = hasTitleBlock ? 40 : 48;
  const availableRows = baseMax * (8.5 / bodyFs);

  const itemRowUnits = (l) => {
    const desc = normalizeDesc(l.description || "");
    return desc.split('\n').reduce((a, s) => a + Math.max(1, Math.ceil(s.length / CHAR_PER_LINE)), 0);
  };
  const textRowUnits = (text) => {
    if (!text || !text.trim()) return 0;
    const lines = text.split('\n').reduce((a, s) => a + Math.max(1, Math.ceil((s || '').length / CHAR_PER_LINE)), 0);
    return lines * 0.6 + 1.5;
  };
  const tailRows = textRowUnits(invoice.notes) + textRowUnits(invoice.terms) + 2;
  const totalItemRows = lineItems.reduce((a, l) => a + itemRowUnits(l), 0);

  if (totalItemRows + tailRows <= availableRows) {
    return { page1End: lineItems.length, hasPage2: false };
  }

  let usedRows = 0;
  let page1End = 0;
  for (let i = 0; i < lineItems.length; i++) {
    const rows = itemRowUnits(lineItems[i]);
    if (usedRows + rows > availableRows) break;
    usedRows += rows;
    page1End = i + 1;
  }
  if (page1End === 0) page1End = Math.min(1, lineItems.length);
  return { page1End, hasPage2: true };
}

export default function InvoicePreviewModal({ open, onClose, invoice, contact, template, onPrint, onEdit }) {
  const [incoterms, setIncoterms] = useState([]);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    loadIncoterms().then(setIncoterms).catch(() => {});
  }, [open]);

  const [annexView, setAnnexView] = useState(null);
  const measureRef = useRef(null);
  const [pages, setPages] = useState([FULL_PAGE]);
  const [autoFs, setAutoFs] = useState(null);

  // Derived values (defensive against null invoice/template) — needed by the
  // auto-fit + pagination effects below.
  const t = template || {};
  const accentColor = t.accent_color || "#6366f1";
  const currency = invoice?.currency || "AED";
  const incotermExplanation = getIncotermExplanation(incoterms, invoice?.incoterm);

  // Status-based title
  const title = (() => {
    const status = invoice?.status || "Draft";
    if (status === "Draft") return t.invoice_title_draft || t.invoice_title || "Proforma Invoice";
    const overdue = invoice?.due_date && !["Paid", "Cancelled"].includes(status) && new Date(invoice.due_date) < new Date();
    if (overdue) return t.invoice_title_overdue || t.invoice_title || "Tax Invoice";
    return t.invoice_title || "Tax Invoice";
  })();

  // Auto-fit the body font size so the content fills the page nicely: few line
  // items → larger font, many items → compact. Measured off-screen with the
  // same DocContent used for rendering and for the PDF.
  useLayoutEffect(() => {
    if (!open || !invoice) return;
    if (t.auto_text_scale === false) { setAutoFs(null); return; }
    let cancelled = false;
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.zIndex = "-1";
    document.body.appendChild(container);
    const renderMeasure = async (fs) => {
      const html = renderToString(React.createElement(DocContent, {
        invoice, contact, template: { ...t, body_font_size: fs }, accentColor, currency, title, page: FULL_PAGE, incotermExplanation, measure: true,
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
  }, [open, invoice, template, accentColor, currency, title, incotermExplanation]);

  // Pagination — recompute whenever the auto-fit font size settles.
  useLayoutEffect(() => {
    if (!open || !invoice) return;
    const compute = () => {
      if (!measureRef.current) return;
      const plan = computeDocPages(measureRef.current);
      setPages(prev => (samePlan(prev, plan) ? prev : plan));
    };
    compute();
    const id = setTimeout(compute, 350);
    return () => clearTimeout(id);
  }, [open, invoice, template, accentColor, currency, title, incotermExplanation, autoFs]);

  if (!open || !invoice) return null;
  const fitT = { ...t, body_font_size: autoFs ?? (t.body_font_size || 8.5) };

  const annexPhotos = (invoice.annex_photos || []).filter(p => p.include !== false);

  const SCALE = 0.9;
  const scaledW = A4_W * SCALE;
  const scaledH = A4_H * SCALE;
  const wrapperStyle = { width: scaledW, height: scaledH, position: "relative", overflow: "hidden" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden relative"
        style={{ width: "min(96vw, 1200px)", maxHeight: "96vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <span className="font-semibold text-sm">Invoice Preview — {invoice.number || "Draft"}</span>
          <div className="flex items-center gap-2">
            {onPrint && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onPrint}>
                <Printer className="w-3.5 h-3.5" /> Print PDF
              </Button>
            )}
            {onEdit && (
              <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 bg-slate-200 dark:bg-slate-800 p-6 flex flex-col items-center gap-6">
          {pages.map((page, idx) => (
            <div key={idx} className="relative shrink-0" style={wrapperStyle}>
              <div className="bg-white shadow-xl rounded-sm overflow-hidden" style={{ width: A4_W, height: A4_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
                <DocContent invoice={invoice} contact={contact} template={fitT} accentColor={accentColor} currency={currency} title={title} page={page} incotermExplanation={incotermExplanation} />
              </div>
              <div className="absolute -top-5 left-0 text-[10px] text-slate-400 font-mono">Page {idx + 1} — A4</div>
            </div>
          ))}

          {/* Annex photos — clickable; also printed in the PDF */}
          {annexPhotos.length > 0 && (
            <div className="w-full max-w-3xl mt-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-300 p-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <div>
                    <div className="text-sm font-bold text-slate-800">Annex – Photos</div>
                    <div className="text-[10px] text-slate-400">{invoice.number || ""}</div>
                  </div>
                  <span className="text-[10px] text-slate-400">{annexPhotos.length} photo(s)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {annexPhotos.map((p, i) => (
                    <button key={i} type="button" onClick={() => setAnnexView(i)} className="group border border-slate-200 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition text-left">
                      <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="w-full h-28 object-cover" />
                      <div className="px-2 py-1 text-[10px] text-slate-500 truncate">{p.caption || `Photo ${i + 1}`}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Annex quick view */}
          {annexView !== null && annexPhotos[annexView] && (
            <div className="w-full max-w-3xl sticky bottom-0 z-10 bg-background border border-border rounded-xl shadow-2xl p-4 flex items-center gap-3">
              <button type="button" onClick={() => setAnnexView(null)} className="text-muted-foreground hover:text-foreground shrink-0" title="Close">
                <X className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={annexPhotos.length <= 1}
                onClick={() => setAnnexView(v => (v - 1 + annexPhotos.length) % annexPhotos.length)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0"
                title="Previous"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <img src={annexPhotos[annexView].url} alt={annexPhotos[annexView].caption || `Photo ${annexView + 1}`} className="max-h-40 object-contain rounded border border-border shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{annexPhotos[annexView].caption || `Photo ${annexView + 1}`}</div>
                <div className="text-xs text-muted-foreground">Photo {annexView + 1} of {annexPhotos.length}</div>
              </div>
              <button
                type="button"
                disabled={annexPhotos.length <= 1}
                onClick={() => setAnnexView(v => (v + 1) % annexPhotos.length)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0"
                title="Next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
        {/* hidden measurement render — full document used to compute block-aware pagination */}
        <div aria-hidden style={{ position: "fixed", left: "-10000px", top: 0, width: A4_W, pointerEvents: "none", opacity: 0 }}>
          <div ref={measureRef} style={{ width: A4_W }}>
            <DocContent invoice={invoice} contact={contact} template={fitT} accentColor={accentColor} currency={currency} title={title} page={FULL_PAGE} incotermExplanation={incotermExplanation} measure />
          </div>
        </div>
      </div>
    </div>
  );
}