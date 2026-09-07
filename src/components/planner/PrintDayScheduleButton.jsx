import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Printer, Loader2, Settings2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { jsPDF } from "jspdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function planDur(timeIn, timeOut) {
  if (!timeIn || !timeOut) return null;
  try {
    const [ih, im] = timeIn.split(":").map(Number);
    const [oh, om] = timeOut.split(":").map(Number);
    const mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? m + "m" : ""}` : `${m}m`;
  } catch { return null; }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 99, g: 102, b: 241 };
}

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

const DEFAULT_OPTS = {
  orientation: "portrait",
  paperSize: "a4",
  showStats: true,
  showLogo: true,
  showAssigned: true,
  showLocation: true,
  showEquipment: true,
  showSwitchTask: true,
  onePagePerTeam: true,
  fontSize: "medium",
};

const FONT_MAP = { small: 6, medium: 7, large: 8 };

const OPERAPP_LOGO_URL = "https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png";

export default function PrintDayScheduleButton({ dateStr, externalOpen, onExternalOpenChange }) {
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [opts, setOpts] = useState(DEFAULT_OPTS);
  const [templateLoaded, setTemplateLoaded] = useState(false);

  // When externally triggered, load defaults and open the settings dialog
  useEffect(() => {
    if (!externalOpen) return;
    onExternalOpenChange?.(false);
    (async () => {
      if (!templateLoaded) {
        try {
          const list = await base44.entities.WorkingReportTemplate.filter({ is_default: true });
          const tpl = list[0] || null;
          if (tpl) {
            setOpts(prev => ({
              ...prev,
              orientation: tpl.schedule_orientation || "portrait",
              paperSize: tpl.schedule_paper_size || "a4",
              fontSize: tpl.schedule_font_size || "medium",
              showStats: tpl.schedule_show_stats !== false,
              showLogo: tpl.show_logo !== false,
              showAssigned: tpl.schedule_show_assigned !== false,
              showLocation: tpl.schedule_show_location !== false,
              showEquipment: tpl.schedule_show_equipment !== false,
              showSwitchTask: tpl.schedule_show_switch_task !== false,
            }));
          }
          setTemplateLoaded(true);
        } catch {}
      }
      setShowSettings(true);
    })();
  }, [externalOpen]);

  // Load saved defaults from template on first open
  const openSettings = async () => {
    if (!templateLoaded) {
      try {
        const list = await base44.entities.WorkingReportTemplate.filter({ is_default: true });
        const tpl = list[0] || null;
        if (tpl) {
          setOpts(prev => ({
            ...prev,
            orientation: tpl.schedule_orientation || "portrait",
            paperSize: tpl.schedule_paper_size || "a4",
            fontSize: tpl.schedule_font_size || "medium",
            showStats: tpl.schedule_show_stats !== false,
            showLogo: tpl.show_logo !== false,
            showAssigned: tpl.schedule_show_assigned !== false,
            showLocation: tpl.schedule_show_location !== false,
            showEquipment: tpl.schedule_show_equipment !== false,
            showSwitchTask: tpl.schedule_show_switch_task !== false,
          }));
        }
        setTemplateLoaded(true);
      } catch {}
    }
    setShowSettings(true);
  };

  const handleDownload = async () => {
    setShowSettings(false);
    setLoading(true);
    try {
      const [tasks, teams, employees, projects, workOrders, assets, template, subtaskList, contactPersons] = await Promise.all([
        base44.entities.Task.filter({ planning_date: dateStr }, "-created_date", 500).then(t => t.filter(x => x.status !== "Completed")),
        base44.entities.Team.list("sort_order", 200),
        base44.entities.Employee.list("full_name", 500),
        base44.entities.Project.list("name", 200).catch(() => []),
        base44.entities.WorkOrder.list("title", 200).catch(() => []),
        base44.entities.Asset.list("name", 500).catch(() => []),
        base44.entities.WorkingReportTemplate.filter({ is_default: true }).then(r => r[0] || null).catch(() => null),
        base44.entities.TaskSubtask.list("-created_date", 1000).catch(() => []),
        base44.entities.ContactPerson.list("full_name", 1000).catch(() => []),
      ]);

      // Build subtask map for the day's tasks (oldest → newest)
      const subtaskMap = {};
      const _taskIds = new Set(tasks.map(t => t.id));
      (subtaskList || []).forEach(s => {
        if (_taskIds.has(s.task_id)) {
          if (!subtaskMap[s.task_id]) subtaskMap[s.task_id] = [];
          subtaskMap[s.task_id].push(s);
        }
      });
      Object.keys(subtaskMap).forEach(k => subtaskMap[k].sort((a, b) => (a.created_date || "").localeCompare(b.created_date || "")));

      const accent = hexToRgb(template?.accent_color || "#cc0000");
      const companyName = template?.company_name || "";
      const logoUrl = template?.logo_url || "";

      // Location lookup from projects & work orders
      const projectMap = new Map(projects.map(p => [p.id, p]));
      const workOrderMap = new Map(workOrders.map(w => [w.id, w]));
      const assetMap = new Map(assets.map(a => [a.id, a]));
      const woContactPersonsMap = {};
      (contactPersons || []).forEach(cp => {
        if (cp.work_order_id) {
          if (!woContactPersonsMap[cp.work_order_id]) woContactPersonsMap[cp.work_order_id] = [];
          woContactPersonsMap[cp.work_order_id].push(cp);
        }
      });
      const getLocationForTask = (task) => {
        if (task.location_address) return task.location_address;
        if (task.work_order_id) {
          const wo = workOrderMap.get(task.work_order_id);
          if (wo?.location) return wo.location;
        }
        if (task.project_id) {
          const proj = projectMap.get(task.project_id);
          if (proj?.location_name) return proj.location_name;
          if (proj?.location) return proj.location;
        }
        return "-";
      };

      // Pre-fetch employee avatars
      const avatarCache = {};
      const avatarUrls = [...new Set(employees.map(e => e.avatar_url).filter(Boolean))];
      await Promise.all(avatarUrls.map(async url => {
        const b64 = await fetchImageAsBase64(url);
        if (b64) avatarCache[url] = b64;
      }));

      // Group tasks by team
      const grouped = [];
      const seen = new Set();
      teams.forEach(team => {
        const teamEmpIds = employees.filter(e => e.team_id === team.id).map(e => e.id);
        const teamEmpSet = new Set(teamEmpIds);
        const teamTasks = tasks.filter(t =>
          (t.assigned_team_ids || []).includes(team.id) ||
          (t.assigned_employees || []).some(eid => teamEmpIds.includes(eid))
        ).sort((a, b) => (a.planning_time_in || "").localeCompare(b.planning_time_in || ""));
        if (teamTasks.length > 0) {
          teamTasks.forEach(t => seen.add(t.id));
          const assignedEmps = teamEmpIds.map(id => employees.find(e => e.id === id)).filter(Boolean)
            .sort((a, b) => (team.leader_id === a.id ? -1 : team.leader_id === b.id ? 1 : 0));
          grouped.push({ team, tasks: teamTasks, assignedEmps, teamEmpSet });
        }
      });
      const unassigned = tasks.filter(t => !seen.has(t.id)).sort((a, b) => (a.planning_time_in || "").localeCompare(b.planning_time_in || ""));
      if (unassigned.length > 0) grouped.push({ team: { id: "unassigned", name: "Unassigned" }, tasks: unassigned, assignedEmps: [], teamEmpSet: null });

      const fieldWorkerIds = new Set();
      tasks.forEach(t => (t.assigned_employees || []).forEach(id => fieldWorkerIds.add(id)));
      const onLeave = employees.filter(e => e.absence_status);
      const totalWorkOrders = new Set(tasks.map(t => t.work_order_id).filter(Boolean)).size;

      let dateLabel = dateStr;
      try { dateLabel = format(parseISO(dateStr), "EEEE d MMMM yyyy"); } catch {}

      // Fetch Pavarotti (OPERAPP) logo (left) and company logo (right) for the header
      let operaLogoBase64 = null;
      let companyLogoBase64 = null;
      if (opts.showLogo) {
        try { operaLogoBase64 = await fetchImageAsBase64(OPERAPP_LOGO_URL); } catch {}
      }
      if (logoUrl) {
        try { companyLogoBase64 = await fetchImageAsBase64(logoUrl); } catch {}
      }

      // Build PDF
      const doc = new jsPDF({ orientation: opts.orientation, unit: "mm", format: opts.paperSize });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const margin = 10;
      let y = margin;
      const fs = FONT_MAP[opts.fontSize] || 7;

      const setAccentFill = () => doc.setFillColor(accent.r, accent.g, accent.b);
      const setAccentText = () => doc.setTextColor(accent.r, accent.g, accent.b);

      // Space reserved at the bottom of every page for the company-data footer
      const footerReserve = 34;

      // Reusable page header: Pavarotti logo (left) + centered company name + company logo (right) + date
      const drawPageHeader = () => {
        const hy = margin;
        const logoSize = 13;
        if (operaLogoBase64 && opts.showLogo) {
          try {
            const fmt = operaLogoBase64.startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(operaLogoBase64, fmt, margin, hy, logoSize, logoSize);
          } catch {}
        }
        if (companyLogoBase64) {
          try {
            const fmt = companyLogoBase64.startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(companyLogoBase64, fmt, W - margin - logoSize, hy, logoSize, logoSize);
          } catch {}
        }
        const centerX = W / 2;
        const nameMaxW = W - margin * 2 - 40;
        if (companyName) {
          doc.setTextColor(30, 30, 30);
          doc.setFontSize(11);
          doc.setFont(undefined, "bold");
          const nameLines = doc.splitTextToSize(companyName, nameMaxW);
          let ny = hy + 4;
          nameLines.slice(0, 2).forEach(l => {
            doc.text(l, centerX, ny, { align: "center" });
            ny += 3.8;
          });
          doc.setFontSize(6.5);
          doc.setFont(undefined, "normal");
          doc.setTextColor(146, 146, 146);
          doc.text("Working Day Schedule", centerX, ny, { align: "center" });
        }
        const dateY = hy + 17;
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(8.5);
        doc.setFont(undefined, "bold");
        doc.text(dateLabel, margin, dateY);
        const headerBottom = dateY + 2.5;
        setAccentFill();
        doc.rect(margin, headerBottom, W - margin * 2, 0.8, "F");
        return headerBottom + 5;
      };

      // Reusable page footer: company contact data (left) + work-orders/page (center) + accent line
      const drawPageFooter = (pageNum, pageCount) => {
        const leftX = margin;
        const entries = [];
        const addr = (template?.company_address || "").trim();
        if (addr) entries.push(/^office/i.test(addr) ? addr : ("Office: " + addr));
        if (template?.company_phone) entries.push("Tel: " + template.company_phone);
        if (template?.company_email) entries.push(template.company_email);
        if (template?.company_website) entries.push(template.company_website);
        if (template?.show_tax_number && template?.tax_id) entries.push("TRN: " + template.tax_id);
        doc.setFontSize(6.5);
        let fy = H - 30;
        if (template?.footer_notes) {
          doc.setFont(undefined, "italic");
          doc.setTextColor(120, 120, 120);
          const noteLines = doc.splitTextToSize(template.footer_notes, W - margin * 2 - 70);
          doc.text(noteLines, leftX, fy);
          fy += noteLines.length * 3.0;
        }
        doc.setFont(undefined, "normal");
        doc.setTextColor(90, 90, 90);
        entries.forEach(l => {
          const wrapped = doc.splitTextToSize(l, W - margin * 2 - 40);
          doc.text(wrapped, leftX, fy);
          fy += wrapped.length * 3.0;
        });
        // Center-bottom: work orders + page number
        doc.setFontSize(6.5);
        doc.setFont(undefined, "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(`${totalWorkOrders} work orders   •   Page ${pageNum} of ${pageCount}`, W / 2, H - 6, { align: "center" });
        setAccentFill();
        doc.rect(margin, H - 4, W - margin * 2, 0.8, "F");
      };

      y = drawPageHeader();

      // Card layout config
      const totalW = W - margin * 2;
      const gridCols = 1;
      const colGap = 0;
      const cardW = totalW;
      const cardP = 3.5;
      const sLineH = 3.8;
      const avatarSize = 6;
      const leftRatio = 0.58;
      const stripH = 5;

      const cardHeight = (task) => {
        const innerW = cardW - 2 * cardP;
        const lW = innerW * leftRatio - 2;
        const rW = innerW - innerW * leftRatio - 2;
        const subs = subtaskMap[task.id] || [];
        const wo = task.work_order_id ? workOrderMap.get(task.work_order_id) : null;
        const proj = task.project_id ? projectMap.get(task.project_id) : null;
        const asset = task.asset_id ? assetMap.get(task.asset_id) : null;
        // Left height
        let lh = cardP + stripH + 3;
        const titleLines = doc.splitTextToSize(task.title || "Untitled task", lW).length;
        lh += titleLines * 3.8 + 2.5;
        lh += 3.4;
        if (task.description) {
          const dl = doc.splitTextToSize(task.description, lW).length;
          lh += dl * sLineH + 2;
        }
        lh += 3.4;
        // SUBTASKS
        if (subs.length > 0) {
          lh += 5;
          subs.forEach(s => {
            const ln = doc.splitTextToSize(s.title, lW - 7).length;
            lh += Math.max(sLineH + 1.6, ln * (sLineH + 1.6));
          });
          lh += 1.5;
        }
        // INSTRUCTIONS / NOTES
        if (task.notes) {
          lh += 5;
          const nl = doc.splitTextToSize(task.notes, lW).length;
          lh += nl * sLineH + 1.5;
        } else if (subs.length === 0) {
          lh += sLineH + 1.5;
        }
        lh += 3.4;
        const allW = (task.assigned_employees || []).map(id => employees.find(e => e.id === id)).filter(Boolean);
        const wCount = Math.max(allW.length, (task.assigned_employee_names || []).length, 1);
        if (opts.showAssigned) lh += 5.5 + wCount * (avatarSize + 2.5) + 2;
        lh += cardP;
        // Right height
        let rh = cardP + stripH + 3;
        const customerName = task.contact_name || proj?.contact_name;
        if (customerName) {
          rh += 3.5;
          rh += sLineH + 1.2;
          if (proj?.contact_person) rh += sLineH + 1.2;
          if (proj?.contact_phone) rh += sLineH + 1.2;
          if (proj?.contact_email) rh += sLineH + 1.2;
          rh += 3.4;
        }
        if (task.project_name) {
          rh += 3.5;
          rh += sLineH + 1.2;
          if (getLocationForTask(task) !== "-" && opts.showLocation) rh += sLineH + 1.2;
          rh += 3.4;
        }
        rh += 3.5;
        rh += sLineH + 1;
        if (wo?.type || wo?.priority) rh += sLineH + 0.5;
        const woCpsH = task.work_order_id ? (woContactPersonsMap[task.work_order_id] || []) : [];
        woCpsH.forEach(cp => {
          if (cp.full_name || cp.role) rh += sLineH + 1.2;
          if (cp.phone) rh += sLineH + 0.5;
        });
        if (opts.showEquipment) {
          rh += 3.4;
          rh += 3.5;
          rh += sLineH + 1;
          if (asset?.serial_number) rh += sLineH + 0.5;
          if (asset?.category || asset?.manufacturer) rh += sLineH + 0.5;
          if (asset?.model || asset?.year) rh += sLineH + 0.5;
        }
        rh += cardP;
        return Math.max(lh, rh, 50);
      };

      const drawCard = (task, cx, cy, ch, teamEmpSet, leaderId, orderInfo) => {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.4);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cx, cy, cardW, ch, 1.8, 1.8, "FD");

        const innerL = cx + cardP;
        const innerR = cx + cardW - cardP;
        const dividerX = innerL + (cardW - 2 * cardP) * leftRatio;
        const leftR = dividerX - 2;
        const rightL = dividerX + 2;
        const lW = leftR - innerL;
        const rW = innerR - rightL;

        const wo = task.work_order_id ? workOrderMap.get(task.work_order_id) : null;
        const proj = task.project_id ? projectMap.get(task.project_id) : null;
        const asset = task.asset_id ? assetMap.get(task.asset_id) : null;

        // ===== TOP STRIP: day order + REF + priority + planned time =====
        doc.setFillColor(accent.r, accent.g, accent.b);
        doc.roundedRect(cx + 1, cy + 1, cardW - 2, stripH, 1.2, 1.2, "F");
        const ord = orderInfo;
        doc.setFontSize(7);
        doc.setFont(undefined, "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(ord ? `${ord.idx}/${ord.total}` : "-", cx + 3, cy + stripH / 2 + 1.6);
        if (task.reference) {
          doc.setFontSize(6);
          doc.setFont(undefined, "normal");
          doc.setTextColor(235, 235, 235);
          doc.text(task.reference, cx + 3 + (ord ? 17 : 6), cy + stripH / 2 + 1.6);
        }
        let sx = innerR;
        const priorityColors = { Low: [107, 114, 128], Medium: [59, 130, 246], High: [249, 115, 22], Urgent: [220, 38, 38] };
        if (task.priority) {
          const prText = task.priority.toUpperCase();
          doc.setFontSize(6);
          doc.setFont(undefined, "bold");
          const prw = doc.getTextWidth(prText) + 5;
          sx -= prw;
          const prCol = priorityColors[task.priority] || [107, 114, 128];
          doc.setFillColor(prCol[0], prCol[1], prCol[2]);
          doc.roundedRect(sx, cy + 1.4, prw, stripH - 2, 1.2, 1.2, "F");
          doc.setTextColor(255, 255, 255);
          doc.text(prText, sx + prw / 2, cy + stripH / 2 + 1.6, { align: "center" });
          sx -= 2;
        }
        const timeLabel = [task.planning_time_in?.slice(0, 5), task.planning_time_out?.slice(0, 5)].filter(Boolean).join(" - ");
        const dur = planDur(task.planning_time_in, task.planning_time_out);
        if (timeLabel) {
          const tpText = timeLabel + (dur ? ` (${dur})` : "");
          doc.setFontSize(6);
          doc.setFont(undefined, "bold");
          const tpw = doc.getTextWidth(tpText) + 5;
          sx -= tpw;
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(sx, cy + 1.4, tpw, stripH - 2, 1.2, 1.2, "F");
          doc.setTextColor(accent.r, accent.g, accent.b);
          doc.text(tpText, sx + tpw / 2, cy + stripH / 2 + 1.6, { align: "center" });
        }

        // Vertical divider (thicker, black) — starts below the top strip
        doc.setFillColor(0, 0, 0);
        doc.rect(dividerX - 0.4, cy + stripH + 3, 0.8, ch - stripH - 5, "F");

        // ===== LEFT COLUMN: title / description / subtasks / assigned =====
        let ty = cy + cardP + stripH + 3;
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.setTextColor(26, 28, 33);
        const titleLines = doc.splitTextToSize(task.title || "Untitled task", lW);
        doc.text(titleLines, innerL, ty);
        ty += titleLines.length * 3.8 + 2.5;

        doc.setLineWidth(0.4);
        doc.setDrawColor(0, 0, 0);
        doc.line(innerL, ty, leftR, ty);
        ty += 3.4;

        if (task.description) {
          doc.setFontSize(7.5);
          doc.setFont(undefined, "normal");
          doc.setTextColor(70, 70, 70);
          const dl = doc.splitTextToSize(task.description, lW);
          dl.forEach(l => { doc.text(l, innerL, ty); ty += sLineH; });
          ty += 1.5;
        }

        doc.setLineWidth(0.4);
        doc.setDrawColor(0, 0, 0);
        doc.line(innerL, ty, leftR, ty);
        ty += 3.4;

        const subs = subtaskMap[task.id] || [];
        // SUBTASKS (only when there are any)
        if (subs.length > 0) {
          doc.setFontSize(6);
          doc.setFont(undefined, "bold");
          doc.setTextColor(117, 117, 117);
          doc.text("SUBTASKS", innerL, ty);
          ty += 5;
          doc.setFontSize(7.5);
          doc.setFont(undefined, "normal");
          subs.forEach(s => {
            const cSize = 3.6;
            if (s.done) {
              doc.setFillColor(212, 237, 218);
              doc.roundedRect(innerL, ty - 2.8, cSize, cSize, 0.7, 0.7, "F");
              doc.setLineWidth(0.4);
              doc.setDrawColor(76, 175, 80);
              doc.line(innerL + 0.6, ty - 1, innerL + 1.6, ty - 0.2);
              doc.line(innerL + 1.6, ty - 0.2, innerL + 3, ty - 2);
              doc.setTextColor(108, 117, 125);
            } else {
              doc.setDrawColor(196, 196, 196);
              doc.roundedRect(innerL, ty - 2.8, cSize, cSize, 0.7, 0.7, "S");
              doc.setTextColor(55, 65, 81);
            }
            const lines = doc.splitTextToSize(s.title, lW - 6);
            doc.text(lines, innerL + 5, ty);
            ty += Math.max(sLineH + 1.6, lines.length * (sLineH + 1.6));
          });
          ty += 1.5;
        }
        // INSTRUCTIONS / NOTES
        if (task.notes) {
          doc.setFontSize(6);
          doc.setFont(undefined, "bold");
          doc.setTextColor(117, 117, 117);
          doc.text("INSTRUCTIONS / NOTES", innerL, ty);
          ty += 5;
          doc.setFontSize(7.5);
          doc.setFont(undefined, "normal");
          doc.setTextColor(55, 65, 81);
          const nl = doc.splitTextToSize(task.notes, lW);
          nl.forEach(l => { doc.text(l, innerL, ty); ty += sLineH; });
          ty += 1.5;
        } else if (subs.length === 0) {
          doc.setFontSize(7.5);
          doc.setFont(undefined, "italic");
          doc.setTextColor(156, 163, 175);
          doc.text("No instructions", innerL, ty);
          ty += sLineH + 1.5;
        }

        if (opts.showAssigned) {
        doc.setLineWidth(0.4);
        doc.setDrawColor(0, 0, 0);
        doc.line(innerL, ty, leftR, ty);
        ty += 3.4;

        // Assigned + time pill
        doc.setFontSize(6);
        doc.setFont(undefined, "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("ASSIGNED", innerL, ty);
        ty += 5.5;

        const allWorkerEmps = (task.assigned_employees || []).map(id => employees.find(e => e.id === id)).filter(Boolean);
        const workerEmps = !teamEmpSet ? allWorkerEmps : allWorkerEmps.filter(e => teamEmpSet.has(e.id));
        doc.setFontSize(7.5);
        doc.setFont(undefined, "normal");
        if (workerEmps.length > 0) {
          workerEmps.forEach(w => {
            const avatarB64 = w.avatar_url ? avatarCache[w.avatar_url] : null;
            const avCenterY = ty - 1.2;
            const avTop = avCenterY - avatarSize / 2;
            let textX = innerL;
            if (avatarB64) {
              try {
                const fmt = avatarB64.startsWith("data:image/png") ? "PNG" : "JPEG";
                doc.addImage(avatarB64, fmt, innerL, avTop, avatarSize, avatarSize);
                textX = innerL + avatarSize + 2.5;
              } catch {}
            } else {
              doc.setFillColor(226, 232, 240);
              doc.circle(innerL + avatarSize / 2, avCenterY, avatarSize / 2, "F");
              doc.setFontSize(5.5);
              doc.setTextColor(100, 116, 139);
              const initials = (w.full_name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
              doc.text(initials, innerL + avatarSize / 2, avCenterY + 1.1, { align: "center" });
              doc.setFontSize(7.5);
              textX = innerL + avatarSize + 2.5;
            }
            const nameText = w.full_name + (leaderId === w.id ? "  ★ Leader" : "");
            doc.setTextColor(40, 40, 40);
            doc.text(doc.splitTextToSize(nameText, leftR - textX)[0], textX, ty);
            ty += avatarSize + 2.5;
          });
        } else if ((task.assigned_employee_names || []).length > 0) {
          (task.assigned_employee_names).forEach(n => {
            doc.setTextColor(40, 40, 40);
            doc.text(n, innerL, ty);
            ty += avatarSize + 2.5;
          });
        } else {
          doc.setTextColor(156, 163, 175);
          doc.text("Unassigned", innerL, ty);
          ty += avatarSize + 2.5;
        }
        }

        // ===== RIGHT COLUMN: customer / project / work order / asset =====
        let ry = cy + cardP + stripH + 3;

        const sectionHeader = (label) => {
          doc.setFontSize(6);
          doc.setFont(undefined, "bold");
          doc.setTextColor(117, 117, 117);
          doc.text(label, rightL, ry);
          ry += 3.5;
        };
        // icon + value line (bubble vertically centered with text)
        const iconLine = (color, value, bold) => {
          if (!value) return;
          doc.setFillColor(color[0], color[1], color[2]);
          doc.circle(rightL + 1.3, ry - 0.9, 1.1, "F");
          doc.setTextColor(70, 70, 70);
          doc.setFontSize(6.5);
          doc.setFont(undefined, bold ? "bold" : "normal");
          doc.text(doc.splitTextToSize(value, rW - 4.5)[0], rightL + 3.8, ry);
          ry += sLineH + 1.2;
        };
        const sectionSep = () => {
          doc.setLineWidth(0.3);
          doc.setDrawColor(0, 0, 0);
          doc.line(rightL, ry, innerR, ry);
          ry += 3.4;
        };

        // CUSTOMER
        const customerName = task.contact_name || proj?.contact_name;
        if (customerName) {
          sectionHeader("CUSTOMER");
          iconLine([111, 66, 193], customerName, true);
          if (proj?.contact_person) iconLine([111, 66, 193], proj.contact_person);
          if (proj?.contact_phone) iconLine([40, 167, 69], proj.contact_phone);
          if (proj?.contact_email) iconLine([0, 86, 179], proj.contact_email);
          sectionSep();
        }

        // PROJECT
        if (task.project_name) {
          sectionHeader("PROJECT");
          iconLine([111, 66, 193], task.project_name, true);
          const locText = getLocationForTask(task);
          if (locText && locText !== "-" && opts.showLocation) iconLine([239, 68, 68], locText);
          sectionSep();
        }

        // WORK ORDER
        sectionHeader("WORK ORDER");
        doc.setFontSize(7.5);
        doc.setFont(undefined, "bold");
        doc.setTextColor(40, 40, 40);
        if (task.work_order_name) {
          doc.text(doc.splitTextToSize(task.work_order_name, rW)[0], rightL, ry);
          ry += sLineH + 1;
        } else {
          doc.setFont(undefined, "italic");
          doc.setFontSize(6.5);
          doc.setTextColor(156, 163, 175);
          doc.text("No work order", rightL, ry);
          ry += sLineH + 1;
        }
        doc.setFontSize(6.5);
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 100, 100);
        if (wo?.type || wo?.priority) {
          doc.text([wo?.type, wo?.priority].filter(Boolean).join("  •  "), rightL, ry);
          ry += sLineH + 0.5;
        }
        // WO contact persons (name + role, then phone)
        const woCps = task.work_order_id ? (woContactPersonsMap[task.work_order_id] || []) : [];
        woCps.forEach(cp => {
          if (cp.full_name) iconLine([249, 115, 22], cp.full_name + (cp.role ? ` — ${cp.role}` : ""), true);
          else if (cp.role) iconLine([249, 115, 22], cp.role);
          if (cp.phone) {
            doc.setTextColor(40, 167, 69);
            doc.setFontSize(6.5);
            doc.setFont(undefined, "normal");
            doc.text(doc.splitTextToSize(cp.phone, rW - 4.5)[0], rightL + 3.8, ry);
            ry += sLineH + 0.5;
          }
        });
        if (opts.showEquipment) {
        sectionSep();

        // ASSET
        sectionHeader("ASSET");
        doc.setFontSize(7.5);
        doc.setFont(undefined, "bold");
        doc.setTextColor(40, 40, 40);
        if (task.asset_name) {
          doc.text(doc.splitTextToSize(task.asset_name, rW)[0], rightL, ry);
          ry += sLineH + 1;
        } else {
          doc.setFont(undefined, "italic");
          doc.setFontSize(6.5);
          doc.setTextColor(156, 163, 175);
          doc.text("No asset linked", rightL, ry);
          ry += sLineH + 1;
        }
        doc.setFontSize(6.5);
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 100, 100);
        if (asset?.serial_number) { doc.text("S/N: " + asset.serial_number, rightL, ry); ry += sLineH + 0.5; }
        if (asset?.category || asset?.manufacturer) { doc.text([asset?.category, asset?.manufacturer].filter(Boolean).join(" • "), rightL, ry); ry += sLineH + 0.5; }
        if (asset?.model || asset?.year) { doc.text([asset?.model, asset?.year && String(asset.year)].filter(Boolean).join(" • "), rightL, ry); ry += sLineH + 0.5; }
        }
      };

      grouped.forEach(({ team, tasks: teamTasks, teamEmpSet }, groupIdx) => {
        if (groupIdx > 0 && opts.onePagePerTeam) { doc.addPage(); y = drawPageHeader(); }
        else if (y > H - footerReserve - 4) { doc.addPage(); y = drawPageHeader(); }

        // Team header bar
        doc.setFillColor(accent.r, accent.g, accent.b);
        doc.roundedRect(margin, y, totalW, 6.5, 1.5, 1.5, "F");
        doc.setFontSize(8.5);
        doc.setFont(undefined, "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(team.name, margin + 3, y + 4.6);
        y += 9;

        // Cards in rows of 3
        for (let i = 0; i < teamTasks.length; i += gridCols) {
          const rowTasks = teamTasks.slice(i, i + gridCols);
          const rowH = Math.max(...rowTasks.map(t => cardHeight(t)));
          if (y + rowH > H - footerReserve) { doc.addPage(); y = drawPageHeader(); }
          rowTasks.forEach((task, ci) => {
            const cx = margin + ci * (cardW + colGap);
            drawCard(task, cx, y, rowH, teamEmpSet, team.leader_id, { idx: i + ci + 1, total: teamTasks.length });
          });
          y += rowH + 7;
        }
        y += 2;
      });

      if (grouped.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(150, 150, 150);
        doc.text(`No tasks scheduled for ${dateLabel}.`, margin, y + 10);
      }

      // Draw the company-data footer on every page
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        drawPageFooter(p, pageCount);
      }

      doc.save(`DaySchedule_${dateStr}.pdf`);
    } finally {
      setLoading(false);
    }
  };

  const update = (key, value) => setOpts(prev => ({ ...prev, [key]: value }));

  return (
    <>
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Print Settings — {dateStr}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Orientation</Label>
                <div className="flex gap-1 mt-1">
                  {["portrait", "landscape"].map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => update("orientation", o)}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors capitalize ${opts.orientation === o ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Paper Size</Label>
                <div className="flex gap-1 mt-1">
                  {["a4", "letter"].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update("paperSize", s)}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors uppercase ${opts.paperSize === s ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Font Size</Label>
              <div className="flex gap-1 mt-1">
                {["small", "medium", "large"].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update("fontSize", s)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors capitalize ${opts.fontSize === s ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 border-t border-border pt-3">
              {[
                { key: "showLogo", label: "Company logo" },
                { key: "showAssigned", label: "Workers column" },
                { key: "showLocation", label: "Location column" },
                { key: "showEquipment", label: "Equipment column" },
                { key: "showSwitchTask", label: "Switch Task rows" },
                { key: "onePagePerTeam", label: "One page per team" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-xs">{label}</Label>
                  <Switch checked={!!opts[key]} onCheckedChange={(v) => update(key, v)} />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={handleDownload} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}