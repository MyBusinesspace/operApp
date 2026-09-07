/**
 * Generates a PDF from a document template + actual document data.
 * Uses jsPDF (already installed).
 */
import { jsPDF } from "jspdf";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export async function printDocumentPDF({ template, document: doc, docType = "quote", contact }) {
  const t = template || {};
  const accent = t.accent_color || "#6366f1";
  const [ar, ag, ab] = hexToRgb(accent);

  const pageSize = t.page_size === "US Letter" ? "letter" : "a4";
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: pageSize });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const colW = pw - margin * 2;

  let y = margin;

  const setAccent = () => pdf.setTextColor(ar, ag, ab);
  const setDark = () => pdf.setTextColor(30, 30, 46);
  const setGray = () => pdf.setTextColor(120, 120, 130);
  const setMid = () => pdf.setTextColor(80, 80, 95);

  const FOOTER_H = 18; // reserved space at bottom of each page for footer
  const pageBottom = ph - FOOTER_H; // content must stay above this

  // Declare early so drawFooter can reference them
  const companyName = t.company_name || "Your Company";
  const companyAddr = t.company_address || "";

  const drawFooter = (pageNum) => {
    const fy = ph - 10;
    pdf.setFillColor(ar, ag, ab);
    pdf.rect(margin, fy - 3, colW, 0.5, "F");
    setGray();
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    const fp = [companyName, t.company_email, t.company_phone].filter(Boolean);
    pdf.text(fp.join("  ·  "), pw / 2, fy + 2, { align: "center" });
    if (pageNum > 1) {
      pdf.setFontSize(7);
      pdf.text(`Page ${pageNum}`, pw - margin, fy + 2, { align: "right" });
    }
  };

  let currentPage = 1;
  const addNewPage = () => {
    drawFooter(currentPage);
    pdf.addPage();
    currentPage++;
    y = margin;
  };

  // Title — pick based on document status
  let title;
  if (docType === "invoice") {
    const status = doc?.status || "Draft";
    if (status === "Draft") title = t.invoice_title_draft || "Proforma Invoice";
    else if (status === "Awaiting Approval" || status === "Awaiting Payment") title = t.invoice_title || "Tax Invoice";
    else if (status === "Paid") title = t.invoice_title || "Tax Invoice";
    else if (status === "Repeating") title = t.invoice_title || "Tax Invoice";
    else title = t.invoice_title_overdue || t.invoice_title || "Tax Invoice";
  } else {
    const status = doc?.status || "Draft";
    if (status === "Draft") title = t.quote_title || "Quotation";
    else title = t.quote_title_sent || t.quote_title || "Quotation";
  }

  // ── HEADER: Title (left) · Logo + Company name (right, compact) ──
  setDark();
  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, margin, y + 8);

  // Company name (right, doubled) with logo to its left
  const nameSize = 20;
  setAccent();
  pdf.setFontSize(nameSize);
  pdf.setFont("helvetica", "bold");
  const nameW = pdf.getTextWidth(companyName);
  const nameX = pw - margin;
  pdf.text(companyName, nameX, y + 8, { align: "right" });

  if (t.show_logo !== false && t.logo_url) {
    try {
      const imgData = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = t.logo_url;
      });
      const logoScale = (t.logo_size || 60) / 60;
      const maxW = 42 * logoScale, maxH = 22 * logoScale;
      const ratio = imgData.naturalWidth / imgData.naturalHeight;
      let lw = maxW, lh = lw / ratio;
      if (lh > maxH) { lh = maxH; lw = lh * ratio; }
      const imgType = t.logo_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
      const logoX = nameX - nameW - 4 - lw;
      const logoY = y + 8 - lh / 2;
      pdf.addImage(t.logo_url, imgType, logoX, logoY, lw, lh);
    } catch { /* skip */ }
  }

  // Doc number + date
  const docNum = doc?.number || (docType === "invoice" ? "INV-0001" : "QTE-0001");
  const reference = doc?.reference || "";
  const issueDate = doc?.issue_date ? new Date(doc.issue_date).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");
  const expiryDate = doc?.expiry_date ? new Date(doc.expiry_date).toLocaleDateString("en-GB") : "";

  setGray();
  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "normal");
  const metaParts = [`${docType === "invoice" ? "Invoice" : "Quote"} Number: ${docNum}`, `Date: ${issueDate}`];
  if (expiryDate) metaParts.push(`Expiry: ${expiryDate}`);
  pdf.text(metaParts.join("   |   "), margin, y + 15);

  y += 20;

  // Bill To + Company contact info
  const billName = contact?.fiscal_legal_name || contact?.company || contact?.full_name || doc?.contact_name || "Customer Name";
  const billAddr = contact?.fiscal_address || contact?.address || "";
  const billCity = [contact?.fiscal_city || contact?.city, contact?.fiscal_country || contact?.country].filter(Boolean).join(", ");
  const billZip = contact?.fiscal_zip || "";
  const billPhone = contact?.phone || "";
  const billEmail = contact?.email || "";
  const billTax = contact?.tax_id || "";

  setGray();
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "bold");
  pdf.text("BILL TO", margin, y);
  pdf.text("FROM", pw - margin, y, { align: "right" });

  y += 4;
  setDark();
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text(billName, margin, y);

  setMid();
  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "normal");

  // Build Bill To left column lines
  const billLines = [];
  if (billTax) billLines.push(`TRN / VAT: ${billTax}`);
  if (billAddr) billLines.push(billAddr);
  if (billCity) billLines.push(billCity);
  if (billZip) billLines.push(billZip);
  if (billPhone) billLines.push(`Tel: ${billPhone}`);
  if (billEmail) billLines.push(billEmail);

  // Build FROM right column lines (company name shown at top)
  const fromLines = [];
  if (companyAddr) companyAddr.split("\n").forEach(l => fromLines.push(l));
  if (t.company_phone) fromLines.push(`T: ${t.company_phone}`);
  if (t.company_email) fromLines.push(t.company_email);
  if (t.show_tax_number !== false && t.tax_id) fromLines.push(`TRN: ${t.tax_id}`);

  const maxLines = Math.max(billLines.length, fromLines.length);
  for (let i = 0; i < maxLines; i++) {
    const rowY = y + 4.5 + i * 4.5;
    if (billLines[i]) pdf.text(billLines[i], margin, rowY);
    if (fromLines[i]) pdf.text(fromLines[i], pw - margin, rowY, { align: "right" });
  }

  y += 4.5 + maxLines * 4.5 + 4;

  // Relative to: linked client / project / work order / task
  const _taskRefs = (doc?.task_references?.length ? doc.task_references : doc?.task_names || []).filter(Boolean);
  const relSlots = [
    reference ? `Ref: ${reference}` : "",
    doc?.project_name ? `Project: ${doc.project_name}` : "",
    doc?.work_order_name ? `WO: ${doc.work_order_name}` : "",
    _taskRefs.length ? `Task: ${_taskRefs.join(", ")}` : "",
  ];
  if (relSlots.some(s => s)) {
    setGray();
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("RELATIVE TO:", margin, y);
    y += 4;
    setMid();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    for (let i = 0; i < relSlots.length; i++) {
      if (relSlots[i]) {
        pdf.text(relSlots[i], margin, y);
        y += 4;
      }
    }
    y += 2;
  }

  // Accent divider
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(margin, y, colW, 1, "F");
  y += 6;

  // Doc title & summary (optional)
  if (doc?.title) {
    setDark();
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text(doc.title, margin, y);
    y += 7;
  }
  if (doc?.doc_summary) {
    setMid();
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    const summaryLines = pdf.splitTextToSize(doc.doc_summary, colW);
    pdf.text(summaryLines, margin, y);
    y += summaryLines.length * 4.5 + 4;
  }
  if (doc?.title || doc?.doc_summary) {
    pdf.setDrawColor(230, 230, 235);
    pdf.line(margin, y, pw - margin, y);
    y += 5;
  }

  // Table header
  const qtyW = 18;
  const upW = 28;
  const taxW = 20;
  const amtW = 28;
  const otherW = (t.show_unit_price !== false ? qtyW + upW : 0) + (t.show_tax_column !== false ? taxW : 0) + amtW;
  const descW = colW - otherW;

  let cols = [
    { label: "Description", w: descW, align: "left" },
  ];
  if (t.show_unit_price !== false) {
    cols.push({ label: "Qty", w: qtyW, align: "right" });
    cols.push({ label: "Unit Price", w: upW, align: "right" });
  }
  if (t.show_tax_column !== false) {
    cols.push({ label: "Tax %", w: taxW, align: "right" });
  }
  cols.push({ label: "Amount", w: amtW, align: "right" });

  // Header row background
  pdf.setFillColor(ar, ag, ab, 0.08);
  pdf.setFillColor(Math.min(ar + 220, 255), Math.min(ag + 220, 255), Math.min(ab + 220, 255));
  pdf.rect(margin, y - 1, colW, 8, "F");

  setAccent();
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  let cx = margin;
  cols.forEach(col => {
    pdf.text(col.label, col.align === "right" ? cx + col.w : cx, y + 4, { align: col.align === "right" ? "right" : "left" });
    cx += col.w;
  });
  y += 8;

  // Rows
  const lineItems = (doc?.line_items || []).filter(item => (item.description || "").trim() !== "" || (Number(item.total) || 0) > 0);
  const lineH = 3.5; // height per text line — compact so multiple items fit per page
  const rowPad = 1.5;  // top + bottom padding within row

  lineItems.forEach((item, i) => {
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    // Collapse all whitespace/newlines: blank lines inside the description are removed entirely
    const rawDesc = (item.description || "")
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\n[ \t]*\n/g, '\n')   // collapse blank lines in the middle
      .replace(/\n{2,}/g, '\n')
      .replace(/[\n\s]+$/g, '')
      .trim();
    const paragraphs = rawDesc.split('\n').filter(p => p.trim() !== '');
    const descLines = [];
    paragraphs.forEach(p => {
      const wrapped = pdf.splitTextToSize(p, descW - 2);
      descLines.push(...wrapped);
    });
    const rowH = Math.max(descLines.length * lineH + rowPad * 2, 9);

    if (y + rowH > pageBottom) { addNewPage(); }

    if (i % 2 === 0) {
      pdf.setFillColor(250, 250, 252);
      pdf.rect(margin, y - 1, colW, rowH, "F");
    }
    setDark();
    cx = margin;
    cols.forEach(col => {
      if (col.label === "Description") {
        pdf.text(descLines, cx, y + rowPad + lineH * 0.8);
      } else {
        let val = "";
        if (col.label === "Qty") val = String(item.quantity || "");
        else if (col.label === "Unit Price") val = fmt(item.unit_price);
        else if (col.label === "Tax %") val = `${item.tax_rate || 0}%`;
        else if (col.label === "Amount") val = fmt(item.total);
        pdf.text(val, col.align === "right" ? cx + col.w : cx, y + rowPad + lineH * 0.8, { align: "right" });
      }
      cx += col.w;
    });
    y += rowH;
    pdf.setDrawColor(240, 240, 245);
    pdf.line(margin, y, margin + colW, y);
  });

  y += 6;

  // Totals — use doc-level values if available (already computed correctly)
  const subtotal = doc?.subtotal ?? lineItems.reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0);
  const taxTotal = doc?.tax_amount ?? lineItems.reduce((s, l) => {
    const sub = (l.quantity || 0) * (l.unit_price || 0);
    return s + sub * ((l.tax_rate || 0) / 100);
  }, 0);
  const grandTotal = doc?.total ?? (subtotal + taxTotal);
  const currency = doc?.currency || "AED";

  const totW = 80;
  const totX = pw - margin - totW;

  const drawTotalRow = (label, value, bold = false, highlight = false) => {
    if (highlight) {
      pdf.setFillColor(Math.min(ar + 215, 255), Math.min(ag + 215, 255), Math.min(ab + 215, 255));
      pdf.rect(totX - 2, y - 1, totW + 2, 8, "F");
    }
    pdf.setFontSize(bold ? 10 : 8.5);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    bold ? setAccent() : setGray();
    pdf.text(label, totX, y + 5);
    bold ? setAccent() : setDark();
    pdf.text(`${currency} ${value}`, pw - margin, y + 5, { align: "right" });
    y += 8;
  };

  drawTotalRow("Subtotal", fmt(subtotal));
  pdf.setDrawColor(230, 230, 235);
  pdf.line(totX, y - 1, pw - margin, y - 1);
  drawTotalRow("VAT", fmt(taxTotal));
  pdf.setDrawColor(ar, ag, ab);
  pdf.line(totX, y - 1, pw - margin, y - 1);
  drawTotalRow("TOTAL", fmt(grandTotal), true, true);

  y += 8;

  // Notes (shown on document)
  if (doc?.notes) {
    const noteLines = pdf.splitTextToSize(doc.notes, colW);
    if (y + 16 > pageBottom) { addNewPage(); }
    pdf.setDrawColor(235, 235, 240);
    pdf.line(margin, y, pw - margin, y);
    y += 6;
    setGray();
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("Notes", margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    setMid();
    pdf.setFontSize(8.5);
    const noteStep = 4.5;
    for (const nline of noteLines) {
      if (y + noteStep > pageBottom) { addNewPage(); setMid(); pdf.setFontSize(8.5); pdf.setFont("helvetica", "normal"); }
      pdf.text(nline, margin, y);
      y += noteStep;
    }
    y += 4;
  }

  // Terms — only show if the document has its own terms written
  const terms = doc?.terms;
  if (terms && terms.trim()) {
    const termLines = pdf.splitTextToSize(terms, colW);
    // Minimum space needed: divider(6) + heading(5) + at least one line(4.5)
    if (y + 16 > pageBottom) { addNewPage(); }

    pdf.setDrawColor(235, 235, 240);
    pdf.line(margin, y, pw - margin, y);
    y += 6;
    setGray();
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("Terms & Conditions", margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    setMid();
    pdf.setFontSize(8.5);
    const lineStep = 4.5;
    for (const tline of termLines) {
      if (y + lineStep > pageBottom) { addNewPage(); setMid(); pdf.setFontSize(8.5); pdf.setFont("helvetica", "normal"); }
      pdf.text(tline, margin, y);
      y += lineStep;
    }
    y += 4;
  }

  // Stamp
  if (t.show_stamp && t.stamp_url) {
    try {
      const stampImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = t.stamp_url;
      });
      const sSize = 28;
      const ratio = stampImg.naturalWidth / stampImg.naturalHeight;
      const sW = sSize * ratio;
      const sH = sSize;
      const stampX = pw - margin - sW;
      if (y + sH < ph - 18) {
        const imgType = t.stamp_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        pdf.addImage(t.stamp_url, imgType, stampX, y, sW, sH);
        y += sH + 4;
      }
    } catch { /* skip */ }
  }

  // Footer on last content page
  drawFooter(currentPage);

  // Annex photos (quotes only)
  const annexPhotos = docType === "quote" ? (doc?.annex_photos || []) : [];
  if (annexPhotos.length > 0) {
    // New page for annex
    addNewPage();
    let ay = margin;

    // Annex header
    pdf.setFillColor(ar, ag, ab);
    pdf.rect(margin, ay, colW, 1, "F");
    ay += 6;
    setDark();
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("Annex – Photos", margin, ay);
    ay += 5;
    setGray();
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${docNum} · ${issueDate}`, margin, ay);
    ay += 8;

    // Layout: 2 photos per row
    const imgColW = (colW - 6) / 2;
    const imgH = imgColW * 0.65;
    let col = 0;
    let rowStartY = ay;

    for (let i = 0; i < annexPhotos.length; i++) {
      const photo = annexPhotos[i];
      if (!photo.url) continue;

      const xPos = margin + col * (imgColW + 6);

      // Check page overflow
      if (rowStartY + imgH + 12 > pageBottom) {
        drawFooter(currentPage);
        pdf.addPage();
        currentPage++;
        rowStartY = margin;
        col = 0;
      }

      try {
        const imgEl = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = photo.url;
        });
        const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
        const fitH = imgColW / ratio > imgH ? imgH : imgColW / ratio;
        const fitW = fitH * ratio;
        const offsetX = xPos + (imgColW - fitW) / 2;
        const imgType = photo.url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        // Border rect
        pdf.setDrawColor(220, 220, 228);
        pdf.rect(xPos, rowStartY, imgColW, imgH, "S");
        pdf.addImage(photo.url, imgType, offsetX, rowStartY + (imgH - fitH) / 2, fitW, fitH);
      } catch {
        pdf.setDrawColor(220, 220, 228);
        pdf.rect(xPos, rowStartY, imgColW, imgH, "S");
        setGray();
        pdf.setFontSize(7);
        pdf.text("Image unavailable", xPos + imgColW / 2, rowStartY + imgH / 2, { align: "center" });
      }

      // Caption
      if (photo.caption) {
        setMid();
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "italic");
        const captionLines = pdf.splitTextToSize(`${i + 1}. ${photo.caption}`, imgColW);
        pdf.text(captionLines, xPos, rowStartY + imgH + 4);
      } else {
        setGray();
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Photo ${i + 1}`, xPos, rowStartY + imgH + 4);
      }

      col++;
      if (col >= 2) {
        col = 0;
        rowStartY += imgH + 14;
      }
    }

    // Annex footer
    pdf.setFillColor(ar, ag, ab);
    pdf.rect(margin, ph - 10 - 3, colW, 0.5, "F");
    setGray();
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${companyName}  ·  Annex to ${docNum}`, pw / 2, ph - 10 + 2, { align: "center" });
  }

  const clientName = contact?.company || contact?.full_name || doc?.contact_name || "";
  const ref = doc?.reference || "";
  const numPart = doc?.number || (docType === "invoice" ? "INV" : "QTE");
  const parts = [numPart, clientName, ref].filter(Boolean);
  pdf.save(`${parts.join(" - ")}.pdf`);
}