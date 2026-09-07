import React, { useState } from "react";
import { Check, X, Clock, Plane, Paperclip, Pencil, Upload, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeAccruedEntitlement } from "@/lib/leaveEntitlement";
import { base44 } from "@/api/base44Client";

// Vacation Year Tracker — compact, one line per year since hire date.
// Each row: tick (vacation taken?) · days or money · document · edit
// Data is stored in profile.yearly_leave_overrides[year] = { taken, document_url, document_name, notes, ... }

function fmtAED(val) {
  if (val == null || isNaN(val)) return "—";
  return `${val.toLocaleString("en-AE", { maximumFractionDigits: 0 })} AED`;
}

export default function VacationYearTracker({
  employee,
  profile,
  requests,
  leaveBonusHistory,
  currentYear,
  onUpdated,
}) {
  const [editingYear, setEditingYear] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const [uploadingYear, setUploadingYear] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!employee || !profile) return null;

  const hireDate = employee.hire_date ? new Date(employee.hire_date) : null;
  const fullEntitlement = profile?.annual_leave_days ?? 30;
  const basicSalary = profile?.basic_salary || 0;
  const yearlyOverrides = profile?.yearly_leave_overrides || {};

  const startYear = hireDate ? hireDate.getFullYear() : currentYear;
  const years = [];
  for (let y = startYear; y <= currentYear; y++) years.push(y);

  // Save helper — merges into yearly_leave_overrides
  const saveOverride = async (year, patch) => {
    setSaving(true);
    const yearKey = String(year);
    const existing = profile.yearly_leave_overrides || {};
    const current = existing[yearKey] || {};
    const updated = {
      ...existing,
      [yearKey]: { ...current, ...patch },
    };
    await base44.entities.EmployeePayrollProfile.update(profile.id, {
      yearly_leave_overrides: updated,
    });
    setSaving(false);
    if (onUpdated) onUpdated();
  };

  const handleTick = async (year, taken) => {
    await saveOverride(year, { taken });
  };

  const handleUpload = async (year, file) => {
    if (!file) return;
    setUploadingYear(year);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await saveOverride(year, { document_url: file_url, document_name: file.name });
    } catch (e) {
      console.error(e);
    }
    setUploadingYear(null);
  };

  const handleRemoveDoc = async (year) => {
    await saveOverride(year, { document_url: null, document_name: null });
  };

  const startEdit = (year) => {
    const ov = yearlyOverrides[String(year)] || {};
    setEditNotes(ov.notes || "");
    setEditingYear(year);
  };

  const saveEdit = async (year) => {
    await saveOverride(year, { notes: editNotes });
    setEditingYear(null);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Plane className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Vacation Year Tracker
        </h3>
        <span className="text-[10px] text-muted-foreground ml-1">
          {hireDate ? `since ${hireDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}
        </span>
        {saving && (
          <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> saving
          </span>
        )}
      </div>

      {/* Compact rows */}
      <div className="divide-y divide-border/40">
        {years.map(year => {
          const yearKey = String(year);
          const override = yearlyOverrides[yearKey] || {};

          // Days used
          const usedDays = requests
            .filter(r => r.status === "approved" && r.leave_type === "vacation" &&
              r.start_date && new Date(r.start_date).getFullYear() === year)
            .reduce((s, r) => s + (r.total_days || 0), 0);

          // Entitlement
          let entitlement;
          let isProrated = false;
          if (override.entitlement != null) {
            entitlement = override.entitlement;
          } else if (year < currentYear) {
            entitlement = fullEntitlement;
          } else if (year > currentYear) {
            entitlement = 0;
          } else {
            const { rawEntitlement, isProrated: pr } = computeAccruedEntitlement({
              hireDate: employee.hire_date,
              annualLeaveDays: fullEntitlement,
              currentYear,
            });
            isProrated = pr;
            entitlement = Math.floor(rawEntitlement);
          }

          const used = override.used != null ? override.used : usedDays;
          const isCurrent = year === currentYear;
          const isPast = year < currentYear;

          // Tick state: override.taken, or auto from used days
          let taken = override.taken;
          if (taken == null) {
            taken = used >= entitlement && entitlement > 0;
          }

          // What to show: days if taken, money if not
          const showMoney = !taken && isPast;
          const showDays = taken || isCurrent;

          return (
            <div key={year} className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20 transition-colors text-sm group">
              {/* Year */}
              <span className="font-semibold text-foreground tabular-nums w-10 shrink-0">
                {year}
              </span>
              {isCurrent && <span className="text-[8px] text-blue-600 font-medium uppercase shrink-0">now</span>}

              {/* Tick — vacation taken? */}
              <button
                onClick={() => handleTick(year, !taken)}
                disabled={saving}
                title={taken ? "Vacation taken — click to mark not taken" : "Mark vacation as taken"}
                className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  taken
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : isPast
                    ? "border-red-400 hover:border-red-500 text-red-500"
                    : "border-muted-foreground/30 hover:border-primary text-transparent"
                }`}
              >
                {taken ? <Check className="w-3 h-3" /> : isPast ? <X className="w-3 h-3" /> : ""}
              </button>

              {/* Days or Money */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {showMoney ? (
                  <span className="text-red-600 font-bold tabular-nums text-sm">
                    {fmtAED(basicSalary)} <span className="text-[10px] text-muted-foreground font-normal ml-1">compensation due</span>
                  </span>
                ) : showDays ? (
                  <span className="text-foreground tabular-nums">
                    <span className="font-semibold">{used}</span>
                    <span className="text-muted-foreground text-xs"> / {entitlement}d</span>
                    {isProrated && <span className="text-[9px] text-amber-600 ml-1">prorated</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
                {override.notes && editingYear !== year && (
                  <span className="text-[10px] text-muted-foreground italic truncate hidden md:inline">"{override.notes}"</span>
                )}
              </div>

              {/* Document */}
              <div className="shrink-0 flex items-center gap-1">
                {override.document_url ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={override.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline max-w-[120px] truncate"
                      title={override.document_name || "Document"}
                    >
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate hidden lg:inline">{override.document_name || "doc"}</span>
                    </a>
                    <button
                      onClick={() => handleRemoveDoc(year)}
                      disabled={saving}
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                      title="Remove document"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={`cursor-pointer inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors ${uploadingYear === year ? "pointer-events-none" : ""}`}
                    title="Attach vacation document"
                  >
                    {uploadingYear === year ? (
                      <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Paperclip className="w-3 h-3" />
                    )}
                    <input
                      type="file"
                      className="hidden"
                      onChange={e => handleUpload(year, e.target.files?.[0])}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    />
                  </label>
                )}
              </div>

              {/* Edit / notes */}
              {editingYear === year ? (
                <div className="shrink-0 flex items-center gap-1">
                  <Input
                    type="text"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Notes..."
                    className="h-6 w-32 text-xs py-0 px-1.5"
                    autoFocus
                  />
                  <Button
                    variant="default"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => saveEdit(year)}
                    disabled={saving}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setEditingYear(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(year)}
                  disabled={saving}
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                  title="Edit notes"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-1.5 bg-muted/20 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-emerald-600" /> taken → days shown</span>
        <span className="flex items-center gap-1"><X className="w-2.5 h-2.5 text-red-600" /> not taken → compensation due</span>
        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 text-amber-600" /> current year</span>
      </div>
    </div>
  );
}