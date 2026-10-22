/**
 * Credit-note PDF — same shared DocContent, auto-fit and pagination stack as the
 * invoice and quote PDFs, so the printed credit note matches the A4 Quick View
 * pixel for pixel. Uses the credit note's own number (including a custom series)
 * and its credit-note title. No journals are posted here.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { DocContent } from "@/components/sales/InvoicePreviewModal";
import { appendIncludedFiles } from "@/components/sales/annexFilesPdf";
import { computeDocPages } from "@/lib/docPagination";
import { autoFitBodyFontSize } from "@/lib/docAutoFit";
import { getSignedUrl } from "@/lib/privateFile";
import { creditNoteTitle } from "@/lib/creditNoteTemplate";

const A4_W = 794;
const A4_H = 1123;

// Inline cross-origin images as data URLs so html2canvas can paint them.
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

async function measureFullDoc(container, props) {
  const html = renderToString(React.createElement(DocContent, {
    ...props,
    page: { itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false },
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
}

export async function printCreditNotePdfFromHtml({ creditNote, contact, template }) {
  const t = template || {};
  const accentColor = t.accent_color || "#6366f1";
  const currency = creditNote.currency || "AED";
  const title = creditNoteTitle(t, creditNote.status);

  const annexPhotos = (creditNote.annex_photos || []).filter(p => p.include !== false);
  const resolvedPhotos = await Promise.all(annexPhotos.map(async p => ({ ...p, url: await getSignedUrl(p.url) })));
  const resolvedNote = { ...creditNote, annex_photos: resolvedPhotos };

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  const docProps = (extra) => ({
    invoice: resolvedNote, contact, accentColor, currency, title, numberLabel: "Credit Note Number", ...extra,
  });

  const renderMeasure = (fs) => measureFullDoc(container, docProps({ template: { ...t, body_font_size: fs } }));
  const autoFs = t.auto_text_scale === false ? (t.body_font_size || 8.5) : await autoFitBodyFontSize(renderMeasure);
  const fitT = { ...t, body_font_size: autoFs };
  const measureWrapper = await measureFullDoc(container, docProps({ template: fitT }));
  const pages = computeDocPages(measureWrapper, A4_H);
  container.innerHTML = "";

  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const canvas = await capturePage(container, docProps({ template: fitT, page: pages[i] }));
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pw, ph);
    }

    // Included file attachments (images + PDFs) as additional annex pages, where present
    await appendIncludedFiles(pdf, container, "credit_note", creditNote.id, t);

    const clientName = contact?.company || contact?.full_name || creditNote.contact_name || "";
    const parts = [creditNote.number || "CN", clientName, creditNote.reference || ""].filter(Boolean);
    pdf.save(`${parts.join(" - ")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}