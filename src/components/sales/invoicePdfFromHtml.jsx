/**
 * Generates an invoice PDF from the SAME DocContent HTML used by InvoicePreviewModal.
 * Mirrors quotePdfFromHtml so the PDF and the on-screen A4 "Quick View" are pixel-identical.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { DocContent } from "./InvoicePreviewModal";
import { appendIncludedFiles } from "./annexFilesPdf.jsx";
import { loadIncoterms, getIncotermExplanation } from "@/lib/incoterms";
import { computeDocPages } from "@/lib/docPagination";
import { autoFitBodyFontSize } from "@/lib/docAutoFit";

const A4_W = 794;
const A4_H = 1123;

// Inline cross-origin images as data URLs so html2canvas can paint them without tainting the canvas.
async function inlineImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) return;
    try {
      const res = await fetch(src, { mode: "cors" });
      const blob = await res.blob();
      const dataUrl = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob);
      });
      img.setAttribute("src", dataUrl);
    } catch { /* leave original src */ }
  }));
}

async function capturePage(container, props) {
  const html = renderToString(React.createElement(DocContent, props));
  const wrapper = document.createElement("div");
  wrapper.style.width = A4_W + "px";
  wrapper.style.height = A4_H + "px";
  wrapper.style.background = "#ffffff";
  wrapper.innerHTML = html;
  container.innerHTML = "";
  container.appendChild(wrapper);
  await inlineImages(wrapper);
  return html2canvas(wrapper, {
    scale: 2, width: A4_W, height: A4_H, useCORS: true, backgroundColor: "#ffffff", logging: false,
  });
}

function AnnexPage({ invoice, template: t }) {
  const photos = (invoice.annex_photos || []).filter(p => p.include !== false);
  const companyName = t.company_name || "";
  const docNum = invoice.number || "";
  return (
    <div style={{ fontFamily: t.font || "Inter", fontSize: 10, color: "#1a1a2e", padding: "24px 30px", boxSizing: "border-box", height: "100%", position: "relative" }}>
      <div style={{ borderBottom: "2px solid #1a1a2e", paddingBottom: 6, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Annex – Photos</div>
        <div style={{ fontSize: 9, color: "#888" }}>{docNum}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ border: "1px solid #ddd", padding: 4, borderRadius: 4 }}>
            <img src={p.url} alt={p.caption || `Photo ${i + 1}`} style={{ width: "100%", height: 200, objectFit: "contain" }} />
            <div style={{ fontSize: 8.5, color: "#555", marginTop: 4 }}>{p.caption || `Photo ${i + 1}`}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 30, right: 30, bottom: 16, borderTop: "1px solid #ccc", paddingTop: 5, fontSize: 7.5, color: "#888", textAlign: "center" }}>
        {[companyName, t.company_email, t.company_phone].filter(Boolean).join("   ·   ")}
      </div>
    </div>
  );
}

async function captureAnnex(container, props) {
  const html = renderToString(React.createElement(AnnexPage, props));
  const wrapper = document.createElement("div");
  wrapper.style.width = A4_W + "px";
  wrapper.style.height = A4_H + "px";
  wrapper.style.background = "#ffffff";
  wrapper.innerHTML = html;
  container.innerHTML = "";
  container.appendChild(wrapper);
  await inlineImages(wrapper);
  return html2canvas(wrapper, { scale: 2, width: A4_W, height: A4_H, useCORS: true, backgroundColor: "#ffffff", logging: false });
}

function FileImageAnnexPage({ file, template: t }) {
  return (
    <div style={{ fontFamily: t.font || "Inter", fontSize: 10, color: "#1a1a2e", padding: "24px 30px", boxSizing: "border-box", height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: "2px solid #1a1a2e", paddingBottom: 6, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Annex</div>
        <div style={{ fontSize: 9, color: "#888" }}>{file.file_name}</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
        <img src={file.file_url} alt={file.file_name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", left: 30, right: 30, bottom: 16, borderTop: "1px solid #ccc", paddingTop: 5, fontSize: 7.5, color: "#888", textAlign: "center" }}>
        {[t.company_name, t.company_email, t.company_phone].filter(Boolean).join("   ·   ")}
      </div>
    </div>
  );
}

async function captureComponent(container, component) {
  const html = renderToString(component);
  const wrapper = document.createElement("div");
  wrapper.style.width = A4_W + "px";
  wrapper.style.height = A4_H + "px";
  wrapper.style.background = "#ffffff";
  wrapper.innerHTML = html;
  container.innerHTML = "";
  container.appendChild(wrapper);
  await inlineImages(wrapper);
  return html2canvas(wrapper, { scale: 2, width: A4_W, height: A4_H, useCORS: true, backgroundColor: "#ffffff", logging: false });
}

// Render the full document (all items + totals + notes + terms) at natural height
// into the live (off-screen) DOM so computeDocPages can measure real block heights.
async function measureFullDoc(container, props) {
  const html = renderToString(React.createElement(DocContent, { ...props, page: { itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false }, measure: true }));
  const wrapper = document.createElement("div");
  wrapper.style.width = A4_W + "px";
  wrapper.style.background = "#ffffff";
  wrapper.innerHTML = html;
  container.innerHTML = "";
  container.appendChild(wrapper);
  await inlineImages(wrapper);
  return wrapper;
}

export async function printInvoicePdfFromHtml({ invoice, contact, template }) {
  const t = template || {};
  const accentColor = t.accent_color || "#6366f1";
  const currency = invoice.currency || "AED";

  // Status-based title (mirrors InvoicePreviewModal)
  const title = (() => {
    const status = invoice.status || "Draft";
    if (status === "Draft") return t.invoice_title_draft || t.invoice_title || "Proforma Invoice";
    const overdue = invoice.due_date && !["Paid", "Cancelled"].includes(status) && new Date(invoice.due_date) < new Date();
    if (overdue) return t.invoice_title_overdue || t.invoice_title || "Tax Invoice";
    return t.invoice_title || "Tax Invoice";
  })();

  const annexPhotos = (invoice.annex_photos || []).filter(p => p.include !== false);

  const incoterms = await loadIncoterms().catch(() => []);
  const incotermExplanation = getIncotermExplanation(incoterms, invoice.incoterm);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  // Auto-fit the body font size so the content fills the page nicely (few
  // items → larger font, many items → compact), then paginate at that size.
  const renderMeasure = (fs) => measureFullDoc(container, { invoice, contact, template: { ...t, body_font_size: fs }, accentColor, currency, title, incotermExplanation });
  const autoFs = t.auto_text_scale === false ? (t.body_font_size || 8.5) : await autoFitBodyFontSize(renderMeasure);
  const fitT = { ...t, body_font_size: autoFs };
  const measureWrapper = await measureFullDoc(container, { invoice, contact, template: fitT, accentColor, currency, title, incotermExplanation });
  const pages = computeDocPages(measureWrapper, A4_H);
  container.innerHTML = "";

  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const canvas = await capturePage(container, {
        invoice, contact, template: fitT, accentColor, currency, title, page: pages[i], incotermExplanation,
      });
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pw, ph);
    }

    if (annexPhotos.length > 0) {
      const annexCanvas = await captureAnnex(container, { invoice, template: t });
      const annexData = annexCanvas.toDataURL("image/png");
      pdf.addPage();
      pdf.addImage(annexData, "PNG", 0, 0, pw, ph);
    }

    // Included file attachments (images + PDFs) as additional annex pages
    await appendIncludedFiles(pdf, container, "invoice", invoice.id, t);

    const clientName = contact?.company || contact?.full_name || invoice.contact_name || "";
    const ref = invoice.reference || "";
    const numPart = invoice.number || "INV";
    const parts = [numPart, clientName, ref].filter(Boolean);
    pdf.save(`${parts.join(" - ")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}