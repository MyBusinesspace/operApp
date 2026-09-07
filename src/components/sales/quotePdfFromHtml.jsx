/**
 * Generates a quote PDF from the SAME DocContent HTML used by QuotePreviewModal.
 * This guarantees the PDF and the on-screen A4 "Quick View" are pixel-identical
 * (same layout, same pagination, same footer placement) because they share one
 * rendering source. Uses html2canvas to capture each A4 page and jsPDF to assemble.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { DocContent } from "./QuotePreviewModal";
import { appendIncludedFiles } from "./annexFilesPdf.jsx";
import { loadIncoterms, getIncotermExplanation } from "@/lib/incoterms";
import { computeDocPages } from "@/lib/docPagination";
import { autoFitBodyFontSize } from "@/lib/docAutoFit";

const A4_W = 794;
const A4_H = 1123;

// Fetch every <img> and replace its src with a data URL so html2canvas can paint
// cross-origin images (logo, stamp, annex photos) without tainting the canvas.
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
    } catch {
      /* leave original src; html2canvas useCORS may still succeed */
    }
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
    scale: 2,
    width: A4_W,
    height: A4_H,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
}

function AnnexPage({ quote, template: t }) {
  const photos = (quote.annex_photos || []).filter(p => p.include !== false);
  const companyName = t.company_name || "";
  const docNum = quote.number || "";
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
  return html2canvas(wrapper, {
    scale: 2, width: A4_W, height: A4_H, useCORS: true, backgroundColor: "#ffffff", logging: false,
  });
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

export async function printQuotePdfFromHtml({ quote, contact, template }) {
  const t = template || {};
  const accentColor = t.accent_color || "#6366f1";
  const currency = quote.currency || "AED";
  const title = quote.status === "Draft" ? (t.quote_title || "Quotation") : (t.quote_title_sent || t.quote_title || "Quotation");
  const annexPhotos = (quote.annex_photos || []).filter(p => p.include !== false);

  const incoterms = await loadIncoterms().catch(() => []);
  const incotermExplanation = getIncotermExplanation(incoterms, quote.incoterm);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  // Auto-fit the body font size so the content fills the page nicely (few
  // items → larger font, many items → compact), then paginate at that size.
  const renderMeasure = (fs) => measureFullDoc(container, { quote, contact, template: { ...t, body_font_size: fs }, accentColor, currency, title, incotermExplanation });
  const autoFs = t.auto_text_scale === false ? (t.body_font_size || 8.5) : await autoFitBodyFontSize(renderMeasure);
  const fitT = { ...t, body_font_size: autoFs };
  const measureWrapper = await measureFullDoc(container, { quote, contact, template: fitT, accentColor, currency, title, incotermExplanation });
  const pages = computeDocPages(measureWrapper, A4_H);
  container.innerHTML = "";

  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const canvas = await capturePage(container, {
        quote, contact, template: fitT, accentColor, currency, title, page: pages[i], incotermExplanation,
      });
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pw, ph);
    }

    if (annexPhotos.length > 0) {
      const annexCanvas = await captureAnnex(container, { quote, template: t });
      const annexData = annexCanvas.toDataURL("image/png");
      pdf.addPage();
      pdf.addImage(annexData, "PNG", 0, 0, pw, ph);
    }

    // Included file attachments (images + PDFs) as additional annex pages
    await appendIncludedFiles(pdf, container, "quote", quote.id, t);

    const clientName = contact?.company || contact?.full_name || quote.contact_name || "";
    const ref = quote.reference || "";
    const numPart = quote.number || "Q";
    const parts = [numPart, clientName, ref].filter(Boolean);
    pdf.save(`${parts.join(" - ")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}