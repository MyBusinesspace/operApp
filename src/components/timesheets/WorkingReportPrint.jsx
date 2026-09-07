/**
 * Generates a "Service & Maintenance Report" PDF from a TimeEntry + Task data.
 * Uses jsPDF (already installed).
 */
import { jsPDF } from "jspdf";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

function hexToRgb(hex) {
  const h = (hex || "#cc0000").replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function fmtDT(iso) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm");
}
function fmtDate(iso) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy");
}
function fmtTime(iso) {
  if (!iso) return "—";
  return format(new Date(iso), "HH:mm");
}
function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Shared builder — draws one report into an existing jsPDF instance (no save)
export async function buildWorkingReportPages({ template, entry, task, pdf }) {
  await _buildReport({ template, entry, task, pdf });
}

// Convenience: create a new PDF, build, and save
export async function printWorkingReport({ template, entry, task }) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await _buildReport({ template, entry, task, pdf });

  const dateStr = entry?.clock_in_time
    ? new Date(entry.clock_in_time).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
    : fmtDate(task?.planning_date).replace(/\//g, "-");
  const parts = [
    "Report",
    dateStr,
    entry?.task_title || task?.title,
    entry?.project_name || task?.project_name,
    entry?.contact_name || task?.contact_name,
  ].filter(Boolean).map(p => String(p).replace(/\s+/g, "-"));
  pdf.save(`${parts.join("_")}.pdf`);
}

// Generate PDF as a blob (for sharing via WhatsApp etc.)
// When forClientFill is true, client comments and signature are left blank
// so the client can fill them in on their copy.
export async function generateReportBlob({ template, entry, task, forClientFill = false }) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const entryForPdf = forClientFill
    ? { ...entry, report_client_comments: "", report_client_signature: null }
    : entry;
  await _buildReport({ template, entry: entryForPdf, task, pdf });
  return pdf.output("blob");
}

async function _buildReport({ template, entry, task, pdf }) {
  const t = template || {};
  const accent = t.accent_color || "#cc0000";
  const [ar, ag, ab] = hexToRgb(accent);
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ml = 12;
  const mr = pw - 12;
  const cw = mr - ml;

  let y = 12;

  // Fetch WO contact persons + asset details
  let woCps = [];
  const _woId = entry?.work_order_id || task?.work_order_id;
  if (_woId) {
    try { woCps = await base44.entities.ContactPerson.filter({ work_order_id: _woId }, "full_name", 50); } catch {}
  }
  let asset = null;
  const _assetId = task?.asset_id || entry?.asset_id;
  if (_assetId) {
    try { asset = await base44.entities.Asset.get(_assetId); } catch {}
  }
  // Fallback to the asset linked to the work order so the Equipment row is populated
  if (!asset && _woId) {
    try {
      const wo = await base44.entities.WorkOrder.get(_woId);
      if (wo?.asset_id) {
        asset = await base44.entities.Asset.get(wo.asset_id);
        // Surface the resolved name on the task/entry so the NAME column fills too
        if (asset && !task?.asset_name && task) task.asset_name = asset.name;
      }
    } catch {}
  }
  const woContactLabel = woCps.length > 0 ? woCps.map(cp => cp.phone ? `${cp.full_name} (${cp.phone})` : cp.full_name).join(" · ") : "—";

  // Active custom field definitions (first two by sort order) so the Equipment
  // row shows the real field names instead of generic "FIELD 1" / "FIELD 2".
  let assetFields = [];
  try {
    const af = await base44.entities.AssetField.list("sort_order", 50);
    assetFields = (af || []).filter(f => f.is_active !== false).slice(0, 2);
  } catch {}

  // ── Workers participation: all time entries for this task on the report day ──
  let participants = [];
  const _reportTaskId = entry?.task_id || task?.id;
  const _reportDay = entry?.clock_in_time ? new Date(entry.clock_in_time).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }) : "";
  if (_reportTaskId) {
    try {
      const taskEntries = await base44.entities.TimeEntry.filter({ task_id: _reportTaskId }, "clock_in_time", 200);
      participants = (taskEntries || [])
        .filter(te => !_reportDay || (te.clock_in_time ? new Date(te.clock_in_time).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }) : "") === _reportDay)
        .map(te => ({
          employee_id: te.employee_id,
          employee_name: te.employee_name,
          clock_in_time: te.clock_in_time,
          clock_out_time: te.clock_out_time,
        }));
    } catch { participants = []; }
  }

  const fillAccent = () => pdf.setFillColor(ar, ag, ab);
  const textWhite = () => pdf.setTextColor(255, 255, 255);
  const textDark = () => pdf.setTextColor(30, 30, 30);
  const textGray = () => pdf.setTextColor(100, 100, 100);
  const textAccent = () => pdf.setTextColor(ar, ag, ab);

  // ── HEADER ─────────────────────────────────────────────────────────────────
  // Load logo first so we know how tall the header area needs to be
  // Fetch as blob → base64 to avoid jsPDF CORS issues with remote URLs
  let logoData = null;
  let logoW = 0, logoH = 0;
  if (t.show_logo !== false && t.logo_url) {
    try {
      const resp = await fetch(t.logo_url);
      const blob = await resp.blob();
      const base64 = await new Promise((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(blob);
      });
      // Get natural dimensions via Image
      const imgEl = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i); i.onerror = rej; i.src = base64;
      });
      const maxW = 38, maxH = 16;
      const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
      logoW = maxW; logoH = logoW / ratio;
      if (logoH > maxH) { logoH = maxH; logoW = logoH * ratio; }
      logoData = base64;
    } catch { /* skip */ }
  }

  // Compact header: logo left of company name (doubled), sub-line below.
  const headerTopY = 10;

  // Logo on the left
  let logoCursorX = ml;
  if (logoData) {
    const imgType = logoData.startsWith("data:image/png") ? "PNG" : "JPEG";
    pdf.addImage(logoData, imgType, ml, headerTopY, logoW, logoH);
    logoCursorX = ml + logoW + 3;
  }

  // Company name (bold, accent, doubled) — baseline centered on the logo
  textAccent();
  pdf.setFontSize(t.company_name_font_size || 22);
  pdf.setFont("helvetica", "bold");
  const cName = t.company_name || "Company Name";
  const cNameBaseline = headerTopY + logoH / 2 + 4;
  pdf.text(cName, logoCursorX, cNameBaseline);

  // Company sub-line
  textGray();
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  const subParts = [];
  if (t.company_phone) subParts.push(`Tel: ${t.company_phone}`);
  if (t.company_email) subParts.push(t.company_email);
  if (t.show_tax_number !== false && t.tax_id) subParts.push(`TRN: ${t.tax_id}`);
  if (subParts.length) pdf.text(subParts.join("  "), logoCursorX, cNameBaseline + 4);

  // Divider line just below the header block
  const headerBottom = headerTopY + Math.max(logoH, 14) + 2;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(ml, headerBottom, mr, headerBottom);
  y = headerBottom + 4;

  // Report meta (right aligned)
  textGray();
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  let reportRef = entry?.report_reference || entry?.reference || "";
  if (!reportRef && task?.reference) {
    const tNumMatch = String(task.reference).match(/(\d+)$/);
    const tNum = tNumMatch ? tNumMatch[1] : "";
    const _prefix = t.ref_prefix || "WR";
    const _includeYear = t.ref_include_year !== false;
    const _year = new Date().getFullYear();
    reportRef = tNum ? (_includeYear ? `${_prefix}-${_year}-${tNum}.1` : `${_prefix}-${tNum}.1`) : task.reference;
  }
  if (!reportRef) reportRef = "—";
  pdf.text(`Report N: ${reportRef}`, mr, y, { align: "right" });
  y += 8;

  // Report title (left) + status badge (right) on the same line
  const isCompleted = task?.status === "Completed";
  const reportTitle = t.report_title || "SERVICE & MAINTENANCE REPORT";
  textDark();
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "bold");
  pdf.text(reportTitle, ml, y);

  const sBadgeW = 45;
  const sBadgeH = 7;
  const sBadgeX = mr - sBadgeW;
  const sBadgeY = y - 5;
  pdf.setFillColor(isCompleted ? 34 : 204, isCompleted ? 139 : 0, isCompleted ? 87 : 0);
  pdf.roundedRect(sBadgeX, sBadgeY, sBadgeW, sBadgeH, 1.5, 1.5, "F");
  textWhite();
  pdf.setFontSize(9.5);
  pdf.setFont("helvetica", "bold");
  pdf.text(isCompleted ? "COMPLETED" : "NOT COMPLETED", sBadgeX + sBadgeW / 2, sBadgeY + 5, { align: "center" });
  y += 11;

  // ── SECTION HEADER helper ───────────────────────────────────────────────────
  const sectionHeader = (label) => {
    fillAccent();
    pdf.rect(ml, y, cw, 6, "F");
    textWhite();
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "bold");
    pdf.text(label, ml + 2, y + 4.3);
    y += 8;
  };

  // ── GENERAL INFO TABLE helper ───────────────────────────────────────────────
  // Label column widths: labelW for label, valW for value (both halves identical)
  const colLabelW = 38; // wide enough for "CLOCK LEADER TIME"
  const halfW = cw / 2;
  const colValX = ml + colLabelW;
  const col2X = ml + halfW;
  const col2LabelX = col2X;
  const col2ValX = col2X + colLabelW;

  const infoRow = (col1Label, col1Val, col2Label, col2Val) => {
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(ml, y, halfW, 6.5);
    pdf.rect(ml + halfW, y, halfW, 6.5);
    // col1 label
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    textDark();
    pdf.text(String(col1Label || ""), ml + 2, y + 4);
    // col1 value
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    textDark();
    pdf.text(fitText(String(col1Val || "—"), halfW - colLabelW - 2), colValX, y + 4);
    if (col2Label !== undefined) {
      // col2 label
      pdf.setFontSize(6.5);
      pdf.setFont("helvetica", "bold");
      textDark();
      pdf.text(String(col2Label || ""), col2LabelX + 2, y + 4);
      // col2 value
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      textDark();
      pdf.text(fitText(String(col2Val || "—"), halfW - colLabelW - 2), col2ValX, y + 4);
    }
    y += 6.5;
  };

  const infoRowFull = (label, value) => {
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(ml, y, cw, 6.5);
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    textDark();
    pdf.text(String(label || ""), ml + 2, y + 4);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    const val = String(value || "—");
    pdf.text(val, ml + cw - pdf.getTextWidth(val) - 3, y + 4);
    y += 6.5;
  };

  const fitText = (text, maxWidth) => {
    pdf.setFontSize(8);
    const str = String(text || "");
    if (pdf.getTextWidth(str) <= maxWidth) return str;
    let t = str;
    while (t.length > 0 && pdf.getTextWidth(t + "…") > maxWidth) t = t.slice(0, -1);
    return (t || "—") + "…";
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
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(85, 85, 85);
      pdf.text(String(label || ""), cx + 2, y + 4);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      textDark();
      pdf.text(fitText(val, colW - 4) || "—", cx + 2, y + 8);
    }
    y += rowH;
  };

  // 5-column row: EQUIPMENT | NAME | CATEGORY | STATUS | FIELD1 | FIELD2
  const infoRowEquipment = (assetObj, taskObj) => {
    const rowH = 10;
    // columns: label(fixed) | name | category | status | cf1 | cf2
    const labelColW = 22;
    const remainW = cw - labelColW;
    const colW = remainW / 5;

    // label cell
    pdf.setDrawColor(180, 180, 180);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(ml, y, labelColW, rowH, "FD");
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(85, 85, 85);
    pdf.text("EQUIPMENT", ml + 2, y + 4);

    // custom field defs (first two active by sort order) -> real names + keyed values
    const cfDefs = (assetFields || []).filter(f => f.is_active !== false).slice(0, 2);
    const cfLabel = (i, fallback) => String((cfDefs[i] && cfDefs[i].name) || fallback);
    const cfVal = (i) => {
      const id = cfDefs[i] && cfDefs[i].id;
      if (!id || !assetObj?.custom_fields) return "";
      const v = assetObj.custom_fields[id];
      return v == null ? "" : String(v);
    };

    const cols = [
      { label: "NAME",     val: taskObj?.asset_name || assetObj?.name },
      { label: "CATEGORY", val: assetObj?.category },
      { label: "STATUS",   val: assetObj?.status },
      { label: cfLabel(0, "FIELD 1"), val: cfVal(0) },
      { label: cfLabel(1, "FIELD 2"), val: cfVal(1) },
    ];

    for (let i = 0; i < 5; i++) {
      const cx = ml + labelColW + i * colW;
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(cx, y, colW, rowH);
      pdf.setFontSize(6.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(85, 85, 85);
      pdf.text(String(cols[i].label), cx + 2, y + 4);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      textDark();
      pdf.text(fitText(cols[i].val, colW - 4) || "—", cx + 2, y + 8);
    }
    y += rowH;
  };

  // ── 1. GENERAL INFORMATION (two compact columns) ───────────────────────────
  sectionHeader("1. GENERAL INFORMATION");

  const giRowH = 5.5;
  const giHalfW = cw / 2;
  const giLabelW = 24;
  const giLeftX = ml;
  const giRightX = ml + giHalfW;

  const giCfDefs = (assetFields || []).filter(f => f.is_active !== false).slice(0, 2);
  const giCfVal = (i) => {
    const id = giCfDefs[i] && giCfDefs[i].id;
    if (!id || !asset?.custom_fields) return "";
    const v = asset.custom_fields[id];
    return v == null ? "" : String(v);
  };

  const giLeftRows = [
    { label: "COMPANY", val: entry?.contact_name || task?.contact_name },
    { label: "LOCATION", val: task?.location_address },
    { label: "PROJECT", val: entry?.project_name || task?.project_name },
    { label: "WORK ORDER", val: entry?.work_order_name || task?.work_order_name },
    { label: "CONTACT", val: woContactLabel },
  ];
  const giRightRows = [
    { label: "EQUIPMENT NAME", val: task?.asset_name || asset?.name },
    { label: "CATEGORY", val: asset?.category },
    { label: "STATUS", val: asset?.status },
    { label: (giCfDefs[0] && giCfDefs[0].name) || "SERIAL NUMBER", val: giCfVal(0) },
    { label: (giCfDefs[1] && giCfDefs[1].name) || "LOAD / MAX LOAD", val: giCfVal(1) },
  ];

  for (let i = 0; i < 5; i++) {
    pdf.setDrawColor(180, 180, 180);
    // Left cell
    pdf.rect(giLeftX, y, giHalfW, giRowH);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(giLeftX, y, giLabelW, giRowH, "F");
    pdf.setFontSize(6);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(85, 85, 85);
    pdf.text(String(giLeftRows[i].label), giLeftX + 2, y + 3.5);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    textDark();
    pdf.text(fitText(String(giLeftRows[i].val || "—"), giHalfW - giLabelW - 3), giLeftX + giLabelW + 1, y + 3.5);
    // Right cell
    pdf.rect(giRightX, y, giHalfW, giRowH);
    pdf.setFillColor(250, 250, 250);
    pdf.rect(giRightX, y, giLabelW, giRowH, "F");
    pdf.setFontSize(6);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(85, 85, 85);
    pdf.text(String(giRightRows[i].label), giRightX + 2, y + 3.5);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    textDark();
    pdf.text(fitText(String(giRightRows[i].val || "—"), giHalfW - giLabelW - 3), giRightX + giLabelW + 1, y + 3.5);
    y += giRowH;
  }
  y += 2;

  // ── 2. TASK INSTRUCTION ────────────────────────────────────────────────────
  if (y > ph - 50) { pdf.addPage(); y = 14; }
  sectionHeader("2. TASK DETAILS");

  const drawLabeledBlock = (label, text) => {
    if (!text) return;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    const lines = pdf.splitTextToSize(String(text), cw - 4);
    const rowH = Math.max(8, lines.length * 4 + 8);
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(85, 85, 85);
    pdf.text(label, ml + 2, y + 4);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", label === "TITLE" ? "bold" : "normal");
    textDark();
    pdf.text(lines, ml + 2, y + 8);
    y += rowH;
  };

  drawLabeledBlock("TITLE", entry?.task_title || task?.title);
  drawLabeledBlock("DESCRIPTION", task?.description);
  drawLabeledBlock("NOTES", task?.notes);

  // Subtasks header
  const taskSubtasks = task?.subtasks || [];
  if (taskSubtasks.length > 0) {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, "F");
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("SUBTASKS", ml + 2, y + 4);
    y += 6;

    // Subtask rows — checkbox on LEFT
    const subRowH = 7;
    const cbColW = 8;
    for (let si = 0; si < taskSubtasks.length; si++) {
      const sub = taskSubtasks[si];
      const isDone = sub.done === true;
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(ml, y, cw, subRowH);
      // Checkbox (left side)
      const cbSize = 3.5;
      const cbX = ml + (cbColW - cbSize) / 2;
      const cbY = y + (subRowH - cbSize) / 2;
      if (isDone) {
        // Rounded green checkbox with a crisp checkmark drawn via lines (not a glyph)
        pdf.setFillColor(34, 139, 87);
        pdf.roundedRect(cbX, cbY, cbSize, cbSize, 0.6, 0.6, "F");
        pdf.setLineWidth(0.5);
        pdf.setDrawColor(255, 255, 255);
        const cx = cbX + cbSize / 2, cy = cbY + cbSize / 2;
        const s = cbSize * 0.28;
        // Checkmark: down-left → bottom-center → up-right
        pdf.line(cx - s * 0.8, cy, cx - s * 0.2, cy + s * 0.7);
        pdf.line(cx - s * 0.2, cy + s * 0.7, cx + s, cy - s * 0.7);
      } else {
        pdf.setDrawColor(160, 160, 160);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(cbX, cbY, cbSize, cbSize, 0.6, 0.6);
      }
      // Subtask text (right of checkbox)
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      textDark();
      const subText = pdf.splitTextToSize(String(sub.title || sub.name || ""), cw - cbColW - 4);
      pdf.text(subText[0] || "", ml + cbColW + 2, y + 4.5);
      y += subRowH;
    }
  }

  y += 2;

  // ── 3. SITE REPORT ─────────────────────────────────────────────────────────
  if (y > ph - 50) { pdf.addPage(); y = 14; }
  sectionHeader("3. SITE REPORT");

  // Helper to draw a labeled text box for worker comments
  const drawReportBlock = (label, text, minH = 28) => {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, "F");
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text(label, ml + 2, y + 4);
    y += 6;

    const fontSize = 10;
    const lineH = 4.8;
    let lines = [];
    if (text) {
      pdf.setFontSize(fontSize);
      lines = pdf.splitTextToSize(text, cw - 4);
    }
    const blockH = Math.max(minH, lines.length * lineH + 6);

    if (y + blockH > ph - 20) { pdf.addPage(); y = 14; }

    pdf.setDrawColor(180, 180, 180);
    pdf.rect(ml, y, cw, blockH);
    if (lines.length > 0) {
      pdf.setFontSize(fontSize);
      pdf.setFont("helvetica", "normal");
      textDark();
      pdf.text(lines, ml + 2, y + 4);
    }
    y += blockH + 4;
  };

  // 3a. Describe your work — ruled lines under each text row, only if text present
  if (entry?.report_work_description) {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, "F");
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("DESCRIBE YOUR WORK", ml + 2, y + 4);
    y += 6;

    const fontSize = 10;
    const lineH = 5.5;
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", "normal");
    textDark();
    const rawLines = String(entry.report_work_description).split("\n").filter(l => l.trim());
    const rows = [];
    for (const rl of rawLines) {
      const wrapped = pdf.splitTextToSize(rl, cw - 8);
      for (const w of wrapped) rows.push(w);
    }
    if (y + rows.length * lineH + 4 > ph - 20) { pdf.addPage(); y = 14; }
    let ry = y + 4;
    for (const r of rows) {
      pdf.text("•", ml + 2, ry);
      pdf.text(r, ml + 5, ry);
      ry += lineH;
    }
    y = ry + 2;
  }

  // 3b. Balance work — bulleted lines (only if present)
  if (entry?.report_balance_work) {
    pdf.setFillColor(50, 50, 50);
    pdf.rect(ml, y, cw, 6, "F");
    textWhite();
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("BALANCE WORK", ml + 2, y + 4);
    y += 6;

    const fontSize = 10;
    const lineH = 5.5;
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", "normal");
    textDark();
    const rawLines = String(entry.report_balance_work).split("\n").filter(l => l.trim());
    const rows = [];
    for (const rl of rawLines) {
      const wrapped = pdf.splitTextToSize(rl, cw - 8);
      for (const w of wrapped) rows.push(w);
    }
    if (y + rows.length * lineH + 4 > ph - 20) { pdf.addPage(); y = 14; }
    let ry = y + 4;
    for (const r of rows) {
      pdf.text("•", ml + 2, ry);
      pdf.text(r, ml + 5, ry);
      ry += lineH;
    }
    y = ry + 2;
  }

  // ── 4. TIME TRACKER DATA (workers participation, one line per worker) ──────
  if (y > ph - 55) { pdf.addPage(); y = 14; }
  sectionHeader("4. TIME TRACKER DATA");

  const reportAuthor = entry?.report_leader_name || entry?.employee_name || "";

  const workerRows = [];
  if (participants.length > 0) {
    for (const p of participants) {
      const name = p.employee_name || "—";
      const isAuthor = reportAuthor && name === reportAuthor;
      workerRows.push({
        date: fmtDate(p.clock_in_time || entry?.clock_in_time || task?.planning_date),
        name: isAuthor ? `${name} *` : name,
        timeIn: fmtTime(p.clock_in_time),
        timeOut: fmtTime(p.clock_out_time),
        duration: p.duration_minutes ? fmtDuration(p.duration_minutes) : "—",
      });
    }
  } else {
    const workers = [
      ...(task?.assigned_employee_names || []),
      entry?.employee_name ? entry.employee_name : null,
    ].filter((v, i, a) => v && a.indexOf(v) === i);
    for (const w of workers) {
      const isAuthor = reportAuthor && w === reportAuthor;
      const isEntry = w === entry?.employee_name;
      workerRows.push({
        date: fmtDate(entry?.clock_in_time || task?.planning_date),
        name: isAuthor ? `${w} *` : w,
        timeIn: isEntry ? fmtTime(entry.clock_in_time) : "—",
        timeOut: isEntry ? fmtTime(entry.clock_out_time) : "—",
        duration: isEntry && entry?.duration_minutes ? fmtDuration(entry.duration_minutes) : "—",
      });
    }
  }

  if (workerRows.length > 0) {
    const dateW = cw * 0.18;
    const nameW = cw * 0.32;
    const timeW = cw * 0.16;
    const rowH = 6;
    for (const wr of workerRows) {
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(ml, y, cw, rowH);
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      textDark();
      pdf.text(fitText(wr.date, dateW - 4), ml + 2, y + 4);
      pdf.text(fitText(wr.name, nameW - 4), ml + dateW + 2, y + 4);
      textGray();
      pdf.text(String(wr.timeIn), ml + dateW + nameW + 2, y + 4);
      pdf.text(String(wr.timeOut), ml + dateW + nameW + timeW + 2, y + 4);
      pdf.text(String(wr.duration), ml + dateW + nameW + timeW * 2 + 2, y + 4);
      y += rowH;
    }
  }

  y += 4;

  // ── 5. CLIENT APPROVAL ─────────────────────────────────────────────────────
  if (y > ph - 70) { pdf.addPage(); y = 14; }
  sectionHeader("5. CLIENT COMMENTS");

  // CLIENT COMMENTS label + box
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "bold");
  textDark();
  pdf.text("CLIENT COMMENTS:", ml, y + 4);
  y += 6;
  pdf.setDrawColor(180, 180, 180);
  pdf.rect(ml, y, cw, 12);
  if (entry?.report_client_comments) {
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    textDark();
    const commentLines = pdf.splitTextToSize(entry.report_client_comments, cw - 4);
    pdf.text(commentLines, ml + 2, y + 4);
  }
  y += 14;

  // ── Signature boxes (3 cols) ───────────────────────────────────────────────
  const sigH = 28;
  const sigW = cw / 3;
  const sigLabels = ["WORKER RESPONSIBLE FOR REPORT:", "CLIENT NUMBER:", "CLIENT SIGNATURE:"];
  for (let i = 0; i < sigLabels.length; i++) {
    const label = sigLabels[i];
    const sx = ml + i * sigW;
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(sx, y, sigW, sigH);
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    textDark();
    const labelLines = pdf.splitTextToSize(label, sigW - 4);
    pdf.text(labelLines, sx + 2, y + 3.5);
    const labelH = labelLines.length * 3.5;
    if (i === 0 && reportAuthor) {
      pdf.setFont("helvetica", "normal");
      textGray();
      pdf.setFontSize(8);
      pdf.text(reportAuthor, sx + 2, y + labelH + 4);
    }
    if (i === 1) {
      pdf.setFont("helvetica", "normal");
      textGray();
      pdf.setFontSize(8);
      pdf.text(entry?.contact_name || "—", sx + 2, y + labelH + 4);
    }
    if (i === 2 && entry?.report_client_signature) {
      try {
        pdf.addImage(entry.report_client_signature, "PNG", sx + 2, y + labelH, sigW - 4, sigH - labelH - 4);
      } catch { /* skip */ }
    }
  }
  y += sigH + 2;

  // Stamp
  if (t.show_stamp && t.stamp_url) {
    try {
      const sResp = await fetch(t.stamp_url);
      const sBlob = await sResp.blob();
      const sBase64 = await new Promise((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(sBlob);
      });
      const si = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = sBase64;
      });
      const sS = 24;
      const ratio = si.naturalWidth / si.naturalHeight;
      const sW = sS * ratio;
      const sType = sBase64.startsWith("data:image/png") ? "PNG" : "JPEG";
      pdf.addImage(sBase64, sType, mr - sW, y, sW, sS);
      y += sS + 2;
    } catch { /* skip */ }
  }

  // Footer
  const footerY = ph - 8;
  pdf.setFillColor(ar, ag, ab);
  pdf.rect(ml, footerY - 3, cw, 0.5, "F");
  textGray();
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  const fp = [t.company_name, t.company_email, t.company_phone].filter(Boolean);
  if (fp.length) pdf.text(fp.join("  ·  "), pw / 2, footerY, { align: "center" });
}