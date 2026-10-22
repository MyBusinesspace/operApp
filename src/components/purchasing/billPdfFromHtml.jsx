/**
 * Generates a bill PDF from BillDocContent — mirrors invoicePdfFromHtml.
 * Renders a clean A4 document (not a screenshot of the UI).
 */
import React from "react";
import { renderToString } from "react-dom/server";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { BillDocContent } from "./BillPrintDocument";
import { getSignedUrl } from "@/lib/privateFile";

const A4_W = 794;
const A4_H = 1123;

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

async function renderBill(container, props) {
  const html = renderToString(React.createElement(BillDocContent, props));
  const wrapper = document.createElement("div");
  wrapper.style.width = A4_W + "px";
  wrapper.style.background = "#ffffff";
  wrapper.innerHTML = html;
  container.innerHTML = "";
  container.appendChild(wrapper);
  await inlineImages(wrapper);
  return wrapper;
}

export async function printBillPdfFromHtml({ bill, contact, template }) {
  const t = template || {};
  const currency = bill.currency || "AED";
  const title = "Bill";
  const annexPhotos = (bill.annex_photos || []).filter(p => p.include !== false);
  const resolvedPhotos = await Promise.all(annexPhotos.map(async p => ({ ...p, url: await getSignedUrl(p.url) })));
  const resolvedBill = { ...bill, annex_photos: resolvedPhotos };

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  try {
    const wrapper = await renderBill(container, { bill: resolvedBill, contact, template: t, currency, title });
    const fullHeight = wrapper.scrollHeight;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const scale = pw / A4_W; // mm per px

    // Capture the full document as one tall canvas, then slice into A4 pages
    const canvas = await html2canvas(wrapper, {
      scale: 2, width: A4_W, height: fullHeight, useCORS: true, backgroundColor: "#ffffff", logging: false,
    });

    const pxPerA4 = A4_H; // px equivalent of one A4 page at our render width
    const totalPages = Math.max(1, Math.ceil(fullHeight / pxPerA4));

    for (let i = 0; i < totalPages; i++) {
      const sliceHeight = Math.min(pxPerA4, fullHeight - i * pxPerA4);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight * 2; // scale 2
      const ctx = sliceCanvas.getContext("2d");
      ctx.drawImage(canvas, 0, i * pxPerA4 * 2, canvas.width, sliceHeight * 2, 0, 0, canvas.width, sliceHeight * 2);
      const imgData = sliceCanvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      const renderHeight = sliceHeight * scale;
      pdf.addImage(imgData, "PNG", 0, 0, pw, renderHeight);
    }

    const supplierName = contact?.company || contact?.full_name || bill.contact_name || "";
    const numPart = bill.number || "BILL";
    const parts = [numPart, supplierName, bill.reference].filter(Boolean);
    pdf.save(`${parts.join(" - ")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}