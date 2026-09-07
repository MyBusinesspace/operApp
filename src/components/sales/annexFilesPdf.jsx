/**
 * Shared helper for appending DocumentFile records (marked include_in_pdf) as annex
 * pages to a generated quote/invoice PDF. Supports images (framed annex page) and
 * PDF attachments (each page rendered and merged in).
 */
import React from "react";
import { renderToString } from "react-dom/server";
import html2canvas from "html2canvas";
import { base44 } from "@/api/base44Client";

const A4_W = 794;
const A4_H = 1123;

// Inline cross-origin images as data URLs so html2canvas can paint them.
export async function inlineImages(container) {
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

export async function captureComponent(container, component) {
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

export function FileImageAnnexPage({ file, template: t }) {
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

// Render every page of an attached PDF and merge each as an annex page.
// Uses JPEG at a moderate scale to keep the final jsPDF string within limits.
async function addPdfAnnexPages(pdf, fileUrl, pw, ph) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const loadingTask = pdfjsLib.getDocument(fileUrl);
  const pdfDoc = await loadingTask.promise;
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imgData = canvas.toDataURL("image/jpeg", 0.85);
    pdf.addPage();
    // Fit page to A4, centered
    const ratio = Math.min(pw / viewport.width, ph / viewport.height);
    const w = viewport.width * ratio;
    const h = viewport.height * ratio;
    const x = (pw - w) / 2;
    const y = (ph - h) / 2;
    pdf.addImage(imgData, "JPEG", x, y, w, h);
  }
}

/**
 * Append all DocumentFile records marked include_in_pdf as annex pages.
 * Images → framed annex page; PDFs → each page merged in; other types skipped.
 */
export async function appendIncludedFiles(pdf, container, docType, docId, template) {
  if (!docId) return;
  const attached = await base44.entities.DocumentFile.filter({ doc_type: docType, doc_id: docId }).catch(() => []);
  const included = attached.filter(f => f.include_in_pdf);
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  for (const f of included) {
    const ft = (f.file_type || "").toLowerCase();
    const fname = (f.file_name || "").toLowerCase();
    const isImage = ft.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fname);
    const isPdf = ft === "application/pdf" || fname.endsWith(".pdf");
    try {
      if (isImage) {
        const canvas = await captureComponent(container, React.createElement(FileImageAnnexPage, { file: f, template }));
        const imgData = canvas.toDataURL("image/png");
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pw, ph);
      } else if (isPdf) {
        await addPdfAnnexPages(pdf, f.file_url, pw, ph);
      }
    } catch { /* skip file on error */ }
  }
}