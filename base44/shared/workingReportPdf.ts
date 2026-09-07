/**
 * Shared Working Report PDF renderer.
 *
 * Single source of truth for the Service & Maintenance Report PDF, imported by
 * every backend function that needs to produce it (apiTimesheet mobile API and
 * generateWorkingReport web/mobile link API).
 *
 * The drawing logic is a faithful port of the web client renderer
 * (src/components/timesheets/WorkingReportPrint.jsx → _buildReport), so the
 * server-generated PDF is identical to the PDF printed from the Timesheets page.
 * The template (branding: company, logo, accent, title, stamp, tax, footer) is
 * the primary criterion; section order follows the default layout.
 */

import { jsPDF } from "npm:jspdf@2.5.2";

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function fetchAsDataUrl(url) {
  if (!url) return null;
  if (typeof url === 'string' && url.startsWith('data:')) return url;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const contentType = (resp.headers.get('content-type') || 'image/png').split(';')[0].trim();
  return `data:${contentType};base64,${arrayBufferToBase64(buf)}`;
}

export function dataUrlImageType(dataUrl) {
  if (!dataUrl) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return 'PNG';
}

/** Embed a data-URL or remote image into jsPDF (Deno-safe). */
export function addPdfImage(pdf, src, x, y, w, h) {
  if (!src || typeof src !== 'string') return false;
  const type = dataUrlImageType(src);
  try {
    pdf.addImage(src, type, x, y, w, h);
    return true;
  } catch {
    try {
      const raw = src.includes(',') ? src.slice(src.indexOf(',') + 1) : src;
      pdf.addImage(raw, type, x, y, w, h);
      return true;
    } catch {
      return false;
    }
  }
}

export function dataUrlToBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const b64 = dataUrl.slice(comma + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function getImageDimensionsFromBytes(bytes) {
  if (!bytes || bytes.length < 24) return null;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (width > 0 && height > 0) return { width, height };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        if (width > 0 && height > 0) return { width, height };
        break;
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
  }

  return null;
}

export function getJpegExifOrientation(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }

    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (!len || i + 2 + len > bytes.length) break;

    if (marker === 0xe1) {
      const start = i + 4;
      if (
        start + 6 < bytes.length &&
        bytes[start] === 0x45 && bytes[start + 1] === 0x78 &&
        bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66 &&
        bytes[start + 4] === 0x00 && bytes[start + 5] === 0x00
      ) {
        const tiff = start + 6;
        if (tiff + 8 >= bytes.length) return null;

        const isLE = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
        const isBE = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
        if (!isLE && !isBE) return null;

        const readU16 = (pos) =>
          isLE ? (bytes[pos] | (bytes[pos + 1] << 8)) : ((bytes[pos] << 8) | bytes[pos + 1]);
        const readU32 = (pos) => {
          if (isLE) {
            return (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0;
          }
          return ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
        };

        const ifd0Offset = readU32(tiff + 4);
        const ifd0 = tiff + ifd0Offset;
        if (ifd0 + 2 > bytes.length) return null;

        const entryCount = readU16(ifd0);
        let entryPos = ifd0 + 2;
        for (let e = 0; e < entryCount; e++) {
          if (entryPos + 12 > bytes.length) break;
          const tag = readU16(entryPos);
          if (tag === 0x0112) return readU16(entryPos + 8);
          entryPos += 12;
        }
      }
    }

    i += 2 + len;
  }

  return null;
}

export function hexToRgb(hex) {
  const h = (hex || '#cc0000').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
export function fmtTime(iso) {
  if (!iso) return '—';
  // Business timezone + 24h — matches timesheets / Dubai ops (not server UTC, not device TZ).
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
export function fmtDuration(mins) {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Load active asset custom-field definitions (sorted) so the Equipment row
 *  shows the real field names instead of the generic "FIELD 1 / FIELD 2". */
export async function loadActiveAssetFields(base44) {
  try {
    const af = await base44.asServiceRole.entities.AssetField.list('sort_order', 50);
    return (af || []).filter((f) => f.is_active !== false);
  } catch {
    return [];
  }
}

/** Business-day key (Asia/Dubai) used to group time entries belonging to the same report day. */
export function dayKey(iso, timeZone = 'Asia/Dubai') {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Resolve the natural dimensions of an image data URL (EXIF-aware). */
function naturalDims(dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  const dims = getImageDimensionsFromBytes(bytes);
  if (!dims || dims.width <= 0 || dims.height <= 0) return null;
  let w = dims.width;
  let h = dims.height;
  const orientation = getJpegExifOrientation(bytes);
  if (orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8) {
    const tmp = w; w = h; h = tmp;
  }
  const ratio = w / h;
  return Number.isFinite(ratio) && ratio > 0 ? { ratio } : null;
}

/**
 * Layout-driven PDF — faithful port of web WorkingReportPrint.jsx _buildReport.
 * Creates and returns a jsPDF instance. Callers upload pdf.output("arraybuffer").
 */
export async function buildWorkingReportPdf({ template, entry, task, asset, woContactLabel, assetFields }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const t = template || {};
  const e = entry || {};
  const tk = task || {};
  const accent = t.accent_color || '#cc0000';
  const [ar, ag, ab] = hexToRgb(accent);
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ml = 12;
  const mr = pw - 12;
  const cw = mr - ml;

  const fillAccent = () => pdf.setFillColor(ar, ag, ab);
  const textWhite = () => pdf.setTextColor(255, 255, 255);
  const textDark = () => pdf.setTextColor(30, 30, 30);
  const textGray = () => pdf.setTextColor(100, 100, 100);
  const textAccent = () => pdf.setTextColor(ar, ag, ab);

  let y = 12;

  // ── Logo (Deno-compatible: fetch → data URL → byte-parsed dimensions) ──────
  let logoData = null;
  let logoW = 0, logoH = 0;
  if (t.show_logo !== false && t.logo_url) {
    try {
      logoData = await fetchAsDataUrl(t.logo_url);
      const dims = naturalDims(logoData);
      if (dims) {
        const maxW = 30, maxH = 12;
        logoW = maxW; logoH = logoW / dims.ratio;
        if (logoH > maxH) { logoH = maxH; logoW = logoH * dims.ratio; }
      }
    } catch { /* skip */ }
  }

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const headerTopY = 10;
  const logoGap = 4;
  const textX = logoData ? ml + logoW + logoGap : ml;

  if (logoData) {
    addPdfImage(pdf, logoData, ml, headerTopY - 1, logoW, logoH);
  }

  textAccent();
  pdf.setFontSize(t.company_name_font_size || 22);
  pdf.setFont('helvetica', 'bold');
  pdf.text(t.company_name || 'Company Name', textX, headerTopY + 4);

  textGray();
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  const subParts = [];
  if (t.company_phone) subParts.push(`Tel: ${t.company_phone}`);
  if (t.company_email) subParts.push(t.company_email);
  if (t.show_tax_number !== false && t.tax_id) subParts.push(`TRN: ${t.tax_id}`);
  if (subParts.length) pdf.text(subParts.join('  '), textX, headerTopY + 8);

  const headerBottom = headerTopY + Math.max(logoH, 10) + 2;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(ml, headerBottom, mr, headerBottom);
  y = headerBottom + 4;

  // ── Report meta (right aligned) ─────────────────────────────────────────────
  textGray();
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  let reportRef = e.report_reference || e.reference || '';
  if (!reportRef && tk.reference) {
    const tNumMatch = String(tk.reference).match(/(\d+)$/);
    const tNum = tNumMatch ? tNumMatch[1] : '';
    const _prefix = t.ref_prefix || 'WR';
    const _includeYear = t.ref_include_year !== false;
    const _year = new Date().getFullYear();
    reportRef = tNum ? (_includeYear ? `${_prefix}-${_year}-${tNum}.1` : `${_prefix}-${tNum}.1`) : tk.reference;
  }
  if (!reportRef) reportRef = '—';
  pdf.text(`Report N: ${reportRef}`, mr, y, { align: 'right' });
  y += 8;

  // ── Report title (left) + status badge (right) ───────────────────────────────
  const isCompleted = tk.status === 'Completed';
  const reportTitle = t.report_title || 'SERVICE & MAINTENANCE REPORT';
  textDark();
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.text(reportTitle, ml, y);

  const sBadgeW = 45;
  const sBadgeH = 7;
  const sBadgeX = mr - sBadgeW;
  const sBadgeY = y - 5;
  pdf.setFillColor(isCompleted ? 34 : 204, isCompleted ? 139 : 0, isCompleted ? 87 : 0);
  pdf.roundedRect(sBadgeX, sBadgeY, sBadgeW, sBadgeH, 1.5, 1.5, 'F');
  textWhite();
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(isCompleted ? 'COMPLETED' : 'NOT COMPLETED', sBadgeX + sBadgeW / 2, sBadgeY + 5, { align: 'center' });
  y += 11;

  // ── Section header helper ────────────────────────────────────────────────────
  const sectionHeader = (label) => {
    fillAccent();
    pdf.rect(ml, y, cw, 6, 'F');
    textWhite();
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, ml + 2, y + 4.3);
    y += 8;
  };

  // ── General info table helpers ──────────────────────────────────────────────
  const colLabelW = 38;
  const halfW = cw / 2;
  const colValX = ml + colLabelW;
  const col2X = ml + halfW;
  const col2LabelX = col2X;
  const col2ValX = col2X + colLabelW;

  const infoRow = (col1Label, col1Val, col2Label, col2Val) => {
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(ml, y, halfW, 6.5);
    pdf.rect(ml + halfW, y, halfW, 6.5);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    textDark();
    pdf.text(String(col1Label || ''), ml + 2, y + 4);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    textDark();
    pdf.text(fitText(String(col1Val || '—'), halfW - colLabelW - 2), colValX, y + 4);
    if (col2Label !== undefined) {
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'bold');
      textDark();
      pdf.text(String(col2Label || ''), col2LabelX + 2, y + 4);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      textDark();
      pdf.text(fitText(String(col2Val || '—'), halfW - colLabelW - 2), col2ValX, y + 4);
    }
    y += 6.5;
  };

  const infoRowFull = (label, value) => {
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(ml, y, cw, 6.5);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    textDark();
    pdf.text(String(label || ''), ml + 2, y + 4);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    const val = String(value || '—');
    pdf.text(val, ml + cw - pdf.getTextWidth(val) - 3, y + 4);
    y += 6.5;
  };

  const fitText = (text, maxWidth) => {
    pdf.setFontSize(8);
    const str = String(text || '');
    if (pdf.getTextWidth(str) <= maxWidth) return str;
    let s = str;
    while (s.length > 0 && pdf.getTextWidth(s + '…') > maxWidth) s = s.slice(0, -1);
    return (s || '—') + '…';
  };

  const infoRowTriple = (l1, v1, l2, v2, l3, v3) => {
    const colW = cw / 3;
    const rowH = 10;
    for (let i = 0; i < 3; i++) {
      const cx = ml + i * colW;
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(cx, y, colW, rowH);
      const label = [l1, l2, l3][i];
      const val = [v1, v2, v3][i];
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(85, 85, 85);
      pdf.text(String(label || ''), cx + 2, y + 4);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      textDark();
      pdf.text(fitText(val, colW - 4) || '—', cx + 2, y + 8);
    }
    y += rowH;
  };

  const infoRowEquipment = (assetObj, taskObj) => {
    const rowH = 10;
    const labelColW = 22;
    const colW = (cw - labelColW) / 5;

    pdf.setDrawColor(180, 180, 180);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(ml, y, labelColW, rowH, 'FD');
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(85, 85, 85);
    pdf.text('EQUIPMENT', ml + 2, y + 4);

    const cfDefs = (assetFields || []).filter((f) => f.is_active !== false).slice(0, 2);
    const cfLabel = (i, fallback) => String((cfDefs[i] && cfDefs[i].name) || fallback);
    const cfVal = (i) => {
      const id = cfDefs[i] && cfDefs[i].id;
      if (!id || !assetObj?.custom_fields) return '';
      const v = assetObj.custom_fields[id];
      return v == null ? '' : String(v);
    };
    const cols = [
      { label: 'NAME',     val: taskObj?.asset_name || assetObj?.name },
      { label: 'CATEGORY', val: assetObj?.category },
      { label: 'STATUS',   val: assetObj?.status },
      { label: cfLabel(0, 'FIELD 1'), val: cfVal(0) },
      { label: cfLabel(1, 'FIELD 2'), val: cfVal(1) },
    ];
    for (let i = 0; i < 5; i++) {
      const cx = ml + labelColW + i * colW;
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(cx, y, colW, rowH);
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(85, 85, 85);
      pdf.text(String(cols[i].label), cx + 2, y + 4);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      textDark();
      pdf.text(fitText(cols[i].val, colW - 4) || '—', cx + 2, y + 8);
    }
    y += rowH;
  };

  // ── 1. GENERAL INFORMATION (two compact columns) ────────────────────────────
  sectionHeader('1. GENERAL INFORMATION');

  const giRowH = 5.5;
  const giHalfW = cw / 2;
  const giLabelW = 24;
  const giLeftX = ml;
  const giRightX = ml + giHalfW;

  const giCfDefs = (assetFields || []).filter((f) => f.is_active !== false).slice(0, 2);
  const giCfVal = (i) => {
    const id = giCfDefs[i] && giCfDefs[i].id;
    if (!id || !asset?.custom_fields) return '';
    const v = asset.custom_fields[id];
    return v == null ? '' : String(v);
  };

  const giLeftRows = [
    { label: 'COMPANY',    val: e.contact_name || tk.contact_name },
    { label: 'LOCATION',   val: tk.location_address },
    { label: 'PROJECT',    val: e.project_name || tk.project_name },
    { label: 'WORK ORDER', val: e.work_order_name || tk.work_order_name },
    { label: 'CONTACT',    val: woContactLabel && woContactLabel !== '—' ? woContactLabel : '' },
  ];
  const giRightRows = [
    { label: 'EQUIPMENT NAME', val: tk.asset_name || asset?.name },
    { label: 'CATEGORY',       val: asset?.category },
    { label: 'STATUS',         val: asset?.status },
    { label: (giCfDefs[0] && giCfDefs[0].name) || 'SERIAL NUMBER', val: giCfVal(0) },
    { label: (giCfDefs[1] && giCfDefs[1].name) || 'LOAD / MAX LOAD', val: giCfVal(1) },
  ];

  for (let i = 0; i < 5; i++) {
    pdf.setDrawColor(180, 180, 180);
    // Left cell
    pdf.rect(giLeftX, y, giHalfW, giRowH);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(giLeftX, y, giLabelW, giRowH, 'F');
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(85, 85, 85);
    pdf.text(String(giLeftRows[i].label), giLeftX + 2, y + 3.5);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    textDark();
    pdf.text(fitText(String(giLeftRows[i].val || '—'), giHalfW - giLabelW - 3), giLeftX + giLabelW + 1, y + 3.5);
    // Right cell
    pdf.rect(giRightX, y, giHalfW, giRowH);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(giRightX, y, giLabelW, giRowH, 'F');
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(85, 85, 85);
    pdf.text(String(giRightRows[i].label), giRightX + 2, y + 3.5);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    textDark();
    pdf.text(fitText(String(giRightRows[i].val || '—'), giHalfW - giLabelW - 3), giRightX + giLabelW + 1, y + 3.5);
    y += giRowH;
  }
  y += 2;

  // ── 2. TASK DETAILS ─────────────────────────────────────────────────────────
  if (y > ph - 50) { pdf.addPage(); y = 14; }
  sectionHeader('2. TASK DETAILS');

  const drawLabeledBlock = (label, text) => {
    if (!text) return;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(String(text), cw - 4);
    const rowH = Math.max(8, lines.length * 4 + 8);
    pdf.setDrawColor(180, 180, 180);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(ml, y, cw, rowH, 'FD');
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(85, 85, 85);
    pdf.text(label, ml + 2, y + 4);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', label === 'TITLE' ? 'bold' : 'normal');
    textDark();
    pdf.text(lines, ml + 2, y + 8);
    y += rowH;
  };

  drawLabeledBlock('TITLE', e.task_title || tk.title);
  drawLabeledBlock('DESCRIPTION', tk.description);
  drawLabeledBlock('NOTES', tk.notes);

  const taskSubtasks = tk.subtasks || [];
  if (taskSubtasks.length > 0) {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, 'F');
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SUBTASKS', ml + 2, y + 4);
    y += 6;

    const subRowH = 7;
    const cbColW = 8;
    for (let si = 0; si < taskSubtasks.length; si++) {
      const sub = taskSubtasks[si];
      const isDone = sub.done === true;
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(ml, y, cw, subRowH);
      const cbSize = 3.5;
      const cbX = ml + (cbColW - cbSize) / 2;
      const cbY = y + (subRowH - cbSize) / 2;
      if (isDone) {
        pdf.setFillColor(34, 139, 87);
        pdf.roundedRect(cbX, cbY, cbSize, cbSize, 0.6, 0.6, 'F');
        pdf.setLineWidth(0.5);
        pdf.setDrawColor(255, 255, 255);
        const ccx = cbX + cbSize / 2, ccy = cbY + cbSize / 2;
        const ss = cbSize * 0.28;
        pdf.line(ccx - ss * 0.8, ccy, ccx - ss * 0.2, ccy + ss * 0.7);
        pdf.line(ccx - ss * 0.2, ccy + ss * 0.7, ccx + ss, ccy - ss * 0.7);
      } else {
        pdf.setDrawColor(160, 160, 160);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(cbX, cbY, cbSize, cbSize, 0.6, 0.6);
      }
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      textDark();
      const subText = pdf.splitTextToSize(String(sub.title || sub.name || ''), cw - cbColW - 4);
      pdf.text(subText[0] || '', ml + cbColW + 2, y + 4.5);
      y += subRowH;
    }
  }
  y += 2;

  // ── 3. SITE REPORT ─────────────────────────────────────────────────────────
  if (y > ph - 50) { pdf.addPage(); y = 14; }
  sectionHeader('3. SITE REPORT');

  // 3a. Describe your work — bulleted lines (only if present)
  if (e.report_work_description) {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, 'F');
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DESCRIBE YOUR WORK', ml + 2, y + 4);
    y += 6;

    const lineH = 5.5;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    textDark();
    const rawLines = String(e.report_work_description).split('\n').filter((l) => l.trim());
    const rows = [];
    for (const rl of rawLines) {
      const wrapped = pdf.splitTextToSize(rl, cw - 8);
      for (const w of wrapped) rows.push(w);
    }
    if (y + rows.length * lineH + 4 > ph - 20) { pdf.addPage(); y = 14; }
    let ry = y + 4;
    for (const r of rows) {
      pdf.text('•', ml + 2, ry);
      pdf.text(r, ml + 5, ry);
      ry += lineH;
    }
    y = ry + 2;
  }

  // 3b. Balance work — bulleted lines (only if present)
  if (e.report_balance_work) {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, 'F');
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text('BALANCE WORK', ml + 2, y + 4);
    y += 6;

    const lineH = 5.5;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    textDark();
    const rawLines = String(e.report_balance_work).split('\n').filter((l) => l.trim());
    const rows = [];
    for (const rl of rawLines) {
      const wrapped = pdf.splitTextToSize(rl, cw - 8);
      for (const w of wrapped) rows.push(w);
    }
    if (y + rows.length * lineH + 4 > ph - 20) { pdf.addPage(); y = 14; }
    let ry = y + 4;
    for (const r of rows) {
      pdf.text('•', ml + 2, ry);
      pdf.text(r, ml + 5, ry);
      ry += lineH;
    }
    y = ry + 2;
  }

  // ── 4. TIME TRACKER DATA (workers participation, one line per worker) ───────
  if (y > ph - 55) { pdf.addPage(); y = 14; }
  sectionHeader('4. TIME TRACKER DATA');

  const participants = Array.isArray(e.participants) ? e.participants : [];
  const reportAuthor = e.report_leader_name || e.employee_name || '';

  const workerRows = [];
  let totalMinutes = 0;
  if (participants.length > 0) {
    for (const p of participants) {
      const name = p.employee_name || '—';
      const isAuthor = reportAuthor && name === reportAuthor;
      const mins = p.duration_minutes || 0;
      totalMinutes += mins;
      workerRows.push({
        date: fmtDate(p.clock_in_time || e.clock_in_time || tk.planning_date),
        name: isAuthor ? `${name} *` : name,
        timeIn: fmtTime(p.clock_in_time),
        timeOut: fmtTime(p.clock_out_time),
        duration: mins ? fmtDuration(mins) : '—',
      });
    }
  } else {
    const workers = [
      ...(tk.assigned_employee_names || []),
      e.employee_name ? e.employee_name : null,
    ].filter((v, i, a) => v && a.indexOf(v) === i);
    for (const w of workers) {
      const isAuthor = reportAuthor && w === reportAuthor;
      const isEntry = w === e.employee_name;
      const mins = isEntry && e.duration_minutes ? e.duration_minutes : 0;
      totalMinutes += mins;
      workerRows.push({
        date: fmtDate(e.clock_in_time || tk.planning_date),
        name: isAuthor ? `${w} *` : w,
        timeIn: isEntry ? fmtTime(e.clock_in_time) : '—',
        timeOut: isEntry ? fmtTime(e.clock_out_time) : '—',
        duration: mins ? fmtDuration(mins) : '—',
      });
    }
  }

  if (workerRows.length > 0) {
    const dateW = cw * 0.18;
    const nameW = cw * 0.32;
    const timeW = cw * 0.16;
    const rowH = 4.5;
    for (const wr of workerRows) {
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(ml, y, cw, rowH);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      textDark();
      pdf.text(fitText(wr.date, dateW - 4), ml + 2, y + 3.2);
      pdf.text(fitText(wr.name, nameW - 4), ml + dateW + 2, y + 3.2);
      textGray();
      pdf.text(String(wr.timeIn), ml + dateW + nameW + 2, y + 3.2);
      pdf.text(String(wr.timeOut), ml + dateW + nameW + timeW + 2, y + 3.2);
      pdf.text(String(wr.duration), ml + dateW + nameW + timeW * 2 + 2, y + 3.2);
      y += rowH;
    }
    // Total duration row (accent-filled, right-aligned value)
    pdf.setFillColor(ar, ag, ab);
    pdf.rect(ml, y, cw, rowH, 'F');
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(ml, y, cw, rowH);
    textWhite();
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL DURATION', ml + dateW + 2, y + 3.2);
    pdf.text(fmtDuration(totalMinutes), ml + cw - 2, y + 3.2, { align: 'right' });
    y += rowH;
  }
  y += 4;

  // ── 5. CLIENT COMMENTS ───────────────────────────────────────────────────────
  if (y > ph - 70) { pdf.addPage(); y = 14; }
  sectionHeader('5. CLIENT COMMENTS');

  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  textDark();
  pdf.text('CLIENT COMMENTS:', ml, y + 4);
  y += 6;
  pdf.setDrawColor(180, 180, 180);
  pdf.rect(ml, y, cw, 12);
  if (e.report_client_comments) {
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    textDark();
    const commentLines = pdf.splitTextToSize(e.report_client_comments, cw - 4);
    pdf.text(commentLines, ml + 2, y + 4);
  }
  y += 14;

  // ── Signature boxes (3 cols) ───────────────────────────────────────────────
  const sigH = 28;
  const sigW = cw / 3;
  const sigLabels = ['WORKER RESPONSIBLE FOR REPORT:', 'CLIENT NUMBER:', 'CLIENT SIGNATURE:'];
  for (let i = 0; i < sigLabels.length; i++) {
    const label = sigLabels[i];
    const sx = ml + i * sigW;
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(sx, y, sigW, sigH);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    textDark();
    const labelLines = pdf.splitTextToSize(label, sigW - 4);
    pdf.text(labelLines, sx + 2, y + 3.5);
    const labelH = labelLines.length * 3.5;
    if (i === 0 && reportAuthor) {
      pdf.setFont('helvetica', 'normal');
      textGray();
      pdf.setFontSize(8);
      pdf.text(reportAuthor, sx + 2, y + labelH + 4);
    }
    if (i === 1) {
      pdf.setFont('helvetica', 'normal');
      textGray();
      pdf.setFontSize(8);
      pdf.text(e.contact_name || '—', sx + 2, y + labelH + 4);
    }
    if (i === 2 && e.report_client_signature) {
      try {
        let sigData = e.report_client_signature;
        if (typeof sigData === 'string' && !sigData.startsWith('data:')) {
          sigData = await fetchAsDataUrl(sigData);
        }
        addPdfImage(pdf, sigData, sx + 2, y + labelH, sigW - 4, sigH - labelH - 4);
      } catch { /* skip */ }
    }
  }
  y += sigH + 2;

  // ── Stamp ────────────────────────────────────────────────────────────────────
  if (t.show_stamp && t.stamp_url) {
    try {
      const sBase64 = await fetchAsDataUrl(t.stamp_url);
      const dims = naturalDims(sBase64);
      const sS = 24;
      let sW = sS;
      if (dims) sW = sS * dims.ratio;
      pdf.addImage(sBase64, dataUrlImageType(sBase64), mr - sW, y, sW, sS);
      y += sS + 2;
    } catch { /* skip */ }
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = ph - 8;
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(ml, footerY - 3, cw, 0.5, 'F');
  textGray();
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  const fp = [t.company_name, t.company_email, t.company_phone].filter(Boolean);
  if (fp.length) pdf.text(fp.join('  ·  '), pw / 2, footerY, { align: 'center' });

  return pdf;
}