import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Eye, Pencil, Save, RotateCcw, AlertTriangle, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function fmt(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

// Parse "3h 38m" or "3.5" (hours) or "218" (minutes) into minutes
function parseToMinutes(str) {
  if (!str || !str.trim()) return null;
  str = str.trim().toLowerCase();
  const hmMatch = str.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m?)?$/);
  if (hmMatch) {
    const h = parseInt(hmMatch[1] || "0", 10);
    const m = parseInt(hmMatch[2] || "0", 10);
    if (h || m) return h * 60 + m;
  }
  const num = parseFloat(str);
  if (!isNaN(num)) return Math.round(num * 60);
  return null;
}

export default function OvertimeDrillDownModal({ drillDown, cell, days, showCost, onEdit, onClose, onRectified }) {
  const [rectifyValue, setRectifyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedDays, setExpandedDays] = useState({});

  useEffect(() => {
    if (cell?.mins != null) setRectifyValue(fmt(cell.mins || 0));
  }, [cell?.mins]);

  if (!drillDown) return null;
  const colDateLabel = drillDown.colLabel + (drillDown.colSublabel ? ` (${drillDown.colSublabel})` : "");
  const allEntries = days.flatMap(d => d.entries || []);
  const hasOverride = allEntries.some(e => e.overtime_override_minutes != null);

  // Weighted-average OT rate/hour across all days (by overtime minutes)
  const totalOtMins = days.reduce((s, d) => s + (d.otMins || 0), 0);
  const avgOtRate = totalOtMins > 0
    ? days.reduce((s, d) => s + (d.otMins || 0) * (d.otRate || 0), 0) / totalOtMins
    : (days[0]?.otRate || 0);

  const toggleDay = (dayKey) => setExpandedDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }));

  const handleRectifySave = async () => {
    const mins = parseToMinutes(rectifyValue);
    if (mins == null) return;
    setSaving(true);
    try {
      const updates = allEntries.map((entry, i) =>
        base44.entities.TimeEntry.update(entry.id, {
          overtime_override_minutes: i === 0 ? mins : null,
        })
      );
      await Promise.all(updates);
      onRectified?.();
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    setSaving(true);
    try {
      const updates = allEntries.map(entry =>
        base44.entities.TimeEntry.update(entry.id, { overtime_override_minutes: null })
      );
      await Promise.all(updates);
      onRectified?.();
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const emp = drillDown.employeeName;
    const period = colDateLabel;
    const rows = days.map(day => `
      <tr>
        <td>${format(new Date(day.dayKey + "T12:00:00"), "dd MMM yyyy")}</td>
        <td class="num">${fmt(day.totalMins)}</td>
        <td class="num">${fmt(day.regularMins)}</td>
        <td class="num ot">${fmt(day.otMins)}${day.hasOverride ? " ●" : ""}</td>
        <td class="center">${day.dayType}</td>
        <td class="num">${day.otRate > 0 ? day.otRate.toFixed(1) : "—"}</td>
        <td class="num ot">${day.otCost.toFixed(1)}</td>
        <td class="center">${(day.entries || []).length}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Overtime — ${emp} ${period}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Inter', Arial, sans-serif; color: #1f2937; margin: 0; padding: 16px; font-size: 10px; }
        .header { border-bottom: 2px solid #d97706; padding-bottom: 6px; margin-bottom: 8px; }
        .header h1 { font-size: 14px; margin: 0; color: #d97706; }
        .header .sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
        .summary { display: flex; gap: 16px; margin-bottom: 8px; font-size: 10px; }
        .summary .item { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 4px; padding: 4px 8px; }
        .summary .item b { color: #d97706; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 3px 4px; font-size: 8px; text-transform: uppercase; color: #6b7280; text-align: left; }
        th.num, td.num { text-align: right; font-family: monospace; }
        th.center, td.center { text-align: center; }
        td { padding: 2px 4px; border-bottom: 1px solid #f3f4f6; font-size: 9px; }
        td.ot { color: #d97706; font-weight: 600; }
        tfoot td { border-top: 2px solid #d97706; background: #fffbeb; font-weight: 700; padding: 4px; font-size: 10px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="header">
        <h1>Overtime Report — ${emp}</h1>
        <div class="sub">${period} · ${days.length} day${days.length === 1 ? "" : "s"} · ${allEntries.length} time ${allEntries.length === 1 ? "entry" : "entries"}${hasOverride ? " · Manager-overridden" : ""}</div>
      </div>
      <div class="summary">
        <div class="item">Total OT: <b>${fmt(cell?.mins || 0)}</b></div>
        <div class="item">OT Rate: <b>${avgOtRate > 0 ? `${avgOtRate.toFixed(2)} AED/h` : "—"}</b></div>
        <div class="item">Total Cost: <b>${(cell?.cost || 0).toFixed(2)} AED</b></div>
        <div class="item">Days: <b>${days.length}</b></div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th class="num">Total</th><th class="num">Regular</th><th class="num">OT</th>
          <th class="center">Type</th><th class="num">Rate/h</th><th class="num">Cost</th><th class="center">Entries</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td></td>
          <td class="num">${fmt(days.reduce((s,d) => s + d.totalMins, 0))}</td>
          <td class="num">${fmt(days.reduce((s,d) => s + d.regularMins, 0))}</td>
          <td class="num ot">${fmt(cell?.mins || 0)}</td>
          <td colspan="2"></td>
          <td class="num ot">${(cell?.cost || 0).toFixed(1)}</td>
          <td class="center">${allEntries.length}</td>
        </tr></tfoot>
      </table>
      </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4">
        <DialogHeader className="space-y-0.5">
          <DialogTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-600" />
              {drillDown.employeeName} — {colDateLabel}
            </span>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5 h-7 text-xs">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {days.length} day{days.length === 1 ? "" : "s"} · {allEntries.length} time {allEntries.length === 1 ? "entry" : "entries"} · {showCost ? `Cost: ${cell?.cost?.toFixed(2)} AED` : `OT: ${fmt(cell?.mins)}`}
            <span className="ml-2 text-amber-700 font-medium">OT Rate: {avgOtRate > 0 ? `${avgOtRate.toFixed(2)} AED/h` : "—"}</span>
            {hasOverride && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium"><AlertTriangle className="w-3 h-3" /> Overridden</span>}
          </p>
        </DialogHeader>

        {/* Compact rectify bar */}
        <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-2 flex items-center gap-2 flex-wrap">
          <div className="text-sm">
            <span className="text-muted-foreground text-xs">Total OT: </span>
            <span className="font-mono font-bold text-amber-700">{fmt(cell?.mins || 0)}</span>
            {avgOtRate > 0 && <span className="ml-2 text-xs text-amber-700 font-medium">@ {avgOtRate.toFixed(2)} AED/h</span>}
            {hasOverride && <span className="text-xs text-muted-foreground ml-1">(overridden)</span>}
          </div>
          {hasOverride && (
            <Button size="sm" variant="ghost" onClick={handleClearOverride} disabled={saving} className="gap-1 text-xs h-7 px-2">
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          )}
          <div className="flex items-center gap-1.5 flex-1 min-w-48">
            <Input
              value={rectifyValue}
              onChange={e => setRectifyValue(e.target.value)}
              placeholder="e.g. 2h 30m, 2.5, or 150"
              onKeyDown={e => { if (e.key === "Enter") handleRectifySave(); }}
              className="flex-1 font-mono h-8 text-sm"
            />
            <Button size="sm" onClick={handleRectifySave} disabled={saving || !rectifyValue.trim()} className="gap-1 h-8 text-xs">
              <Save className="w-3.5 h-3.5" /> {saving ? "..." : "Save"}
            </Button>
          </div>
        </div>

        {/* Compact table — per day, expandable to show individual entries */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Date</th>
                <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Total</th>
                <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Reg</th>
                <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">OT</th>
                <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Type</th>
                <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Rate/h</th>
                <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Cost</th>
                <th className="text-center px-1 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Entries</th>
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const isExpanded = expandedDays[day.dayKey];
                const dayEntries = day.entries || [];
                return (
                  <React.Fragment key={day.dayKey}>
                    <tr className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => toggleDay(day.dayKey)}>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {format(new Date(day.dayKey + "T12:00:00"), "dd MMM yyyy")}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px]">{fmt(day.totalMins)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground text-[11px]">{fmt(day.regularMins)}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-700 text-[11px]">
                        {fmt(day.otMins)}
                        {day.hasOverride && <span className="text-amber-600 ml-0.5" title="Override">●</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 ${
                          day.dayType === "holiday" ? "text-red-700 bg-red-50 border border-red-200" :
                          day.dayType === "sunday" ? "text-orange-700 bg-orange-50 border border-orange-200" :
                          "text-amber-700 bg-amber-50 border border-amber-200"
                        }`}>{day.dayType}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px]">{day.otRate > 0 ? day.otRate.toFixed(1) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-700 text-[11px]">{day.otCost.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-center text-[11px]">{dayEntries.length}</td>
                    </tr>
                    {isExpanded && dayEntries.map(entry => (
                      <tr key={entry.id} className="border-b border-border/20 bg-muted/10">
                        <td className="px-2 py-1 pl-8 font-mono whitespace-nowrap text-[10px] text-muted-foreground">
                          {format(new Date(entry.clock_in_time), "HH:mm")} → {entry.clock_out_time ? format(new Date(entry.clock_out_time), "HH:mm") : "—"}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px]">{fmt(entry.duration_minutes)}</td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1 text-[10px] text-muted-foreground" colSpan={2}>{entry.task_title || "—"}</td>
                        <td className="px-2 py-1"></td>
                        <td className="px-1 py-1 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-border hover:bg-amber-50 hover:border-amber-300 text-amber-600 transition-colors"
                            title="Rectify clock-out time"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-amber-50 font-semibold">
                <td className="px-2 py-1.5 text-xs text-amber-800">Total</td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-800 text-xs">{fmt(days.reduce((s,d) => s + d.totalMins, 0))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-muted-foreground text-xs">{fmt(days.reduce((s,d) => s + d.regularMins, 0))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-800 text-xs">{fmt(cell?.mins || 0)}</td>
                <td colSpan={2}></td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-800 text-xs">{(cell?.cost || 0).toFixed(1)}</td>
                <td className="px-2 py-1.5 text-center text-xs">{allEntries.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {days.length === 0 && (
          <p className="text-sm text-muted-foreground text-center p-4">No entries found for this cell.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}