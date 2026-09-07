import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Clock, Plus, Trash2, Info } from "lucide-react";

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70 italic">{hint}</p>}
    </div>
  );
}

const DEFAULT = {
  shift_end_time: "17:00",
  overtime_use_clock_time: false,
  overtime_threshold_daily_h: 8,
  working_hours_per_day: 8,
  working_days_per_month: 22,
  overtime_multiplier: 1.5,
  overtime_multiplier_sunday: 2.0,
  overtime_multiplier_holiday: 2.0,
  overtime_fixed_rate: "",
  overtime_fixed_rate_sunday: "",
  overtime_fixed_rate_holiday: "",
  public_holidays: [],
};

export default function OvertimeSettingsSection() {
  const [settings, setSettings] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newHoliday, setNewHoliday] = useState("");

  useEffect(() => {
    base44.entities.PayrollSettings.list("-created_date", 10).then(list => {
      const s = list[0];
      if (s) {
        setRecordId(s.id);
        setSettings({
          ...DEFAULT,
          shift_end_time: s.shift_end_time ?? DEFAULT.shift_end_time,
          overtime_use_clock_time: s.overtime_use_clock_time ?? DEFAULT.overtime_use_clock_time,
          overtime_threshold_daily_h: s.overtime_threshold_daily_h ?? DEFAULT.overtime_threshold_daily_h,
          working_hours_per_day: s.working_hours_per_day ?? DEFAULT.working_hours_per_day,
          working_days_per_month: s.working_days_per_month ?? DEFAULT.working_days_per_month,
          overtime_multiplier: s.overtime_multiplier ?? DEFAULT.overtime_multiplier,
          overtime_multiplier_sunday: s.overtime_multiplier_sunday ?? DEFAULT.overtime_multiplier_sunday,
          overtime_multiplier_holiday: s.overtime_multiplier_holiday ?? DEFAULT.overtime_multiplier_holiday,
          overtime_fixed_rate: s.overtime_fixed_rate ?? "",
          overtime_fixed_rate_sunday: s.overtime_fixed_rate_sunday ?? "",
          overtime_fixed_rate_holiday: s.overtime_fixed_rate_holiday ?? "",
          public_holidays: s.public_holidays ?? [],
        });
      } else {
        setSettings({ ...DEFAULT });
      }
    });
  }, []);

  const set = (field, value) => setSettings(prev => ({ ...prev, [field]: value }));

  const addHoliday = () => {
    if (!newHoliday) return;
    const list = settings.public_holidays || [];
    if (list.includes(newHoliday)) return;
    set("public_holidays", [...list, newHoliday].sort());
    setNewHoliday("");
  };

  const removeHoliday = (date) => {
    set("public_holidays", (settings.public_holidays || []).filter(d => d !== date));
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...settings,
      overtime_use_clock_time: false,
      overtime_fixed_rate: settings.overtime_fixed_rate !== "" ? parseFloat(settings.overtime_fixed_rate) : null,
      overtime_fixed_rate_sunday: settings.overtime_fixed_rate_sunday !== "" ? parseFloat(settings.overtime_fixed_rate_sunday) : null,
      overtime_fixed_rate_holiday: settings.overtime_fixed_rate_holiday !== "" ? parseFloat(settings.overtime_fixed_rate_holiday) : null,
    };
    if (recordId) {
      await base44.entities.PayrollSettings.update(recordId, payload);
    } else {
      const created = await base44.entities.PayrollSettings.create(payload);
      setRecordId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Preview based on 10,000 AED basic salary
  const previewBasic = 10000;
  const days = settings?.working_days_per_month || 22;
  const hrs = settings?.working_hours_per_day || 8;
  const previewHourly = previewBasic / days / hrs;

  const resolveRate = (fixedVal, multiplier) => {
    const fixed = parseFloat(fixedVal);
    if (!isNaN(fixed) && fixed > 0) return { rate: fixed, isFixed: true };
    return { rate: previewHourly * (multiplier || 1.5), isFixed: false };
  };

  const regular = resolveRate(settings?.overtime_fixed_rate, settings?.overtime_multiplier);
  const sunday = resolveRate(settings?.overtime_fixed_rate_sunday, settings?.overtime_multiplier_sunday);
  const holiday = resolveRate(settings?.overtime_fixed_rate_holiday, settings?.overtime_multiplier_holiday);

  if (!settings) return <div className="text-sm text-muted-foreground py-6 text-center">Loading...</div>;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-foreground">Overtime Rules</h3>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-7 text-xs">
          <Save className="w-3 h-3" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>

      <div className="p-4 space-y-6">

        {/* Shift End / Threshold */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Overtime Trigger</p>

          <div className="mb-3 p-3 bg-muted/30 rounded-lg border border-border">
            <p className="text-sm font-medium text-foreground">Based on total hours worked</p>
            <p className="text-xs text-muted-foreground mt-0.5">OT starts after a set number of hours per day (threshold).</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Overtime Threshold (hrs/day)" hint="When hours worked exceed this number, the extra time counts as OT. e.g. 9 → the 10th hour onward is overtime.">
              <Input type="number" min={1} max={24} step={0.5}
                value={settings.overtime_threshold_daily_h}
                onChange={e => set("overtime_threshold_daily_h", parseFloat(e.target.value) || 8)} />
            </Field>
            <Field label="Contract Hours / Day" hint="Standard daily hours in the contract. Used ONLY to convert monthly salary into an hourly rate for OT pay. Does NOT trigger overtime.">
              <Input type="number" min={1} max={24} step={0.5}
                value={settings.working_hours_per_day}
                onChange={e => set("working_hours_per_day", parseFloat(e.target.value) || 8)} />
            </Field>
            <Field label="Working Days / Month" hint="Standard working days per month. Used with Contract Hours/Day to derive the hourly rate from salary.">
              <Input type="number" min={1} max={31}
                value={settings.working_days_per_month}
                onChange={e => set("working_days_per_month", parseFloat(e.target.value) || 22)} />
            </Field>
          </div>

          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50/50 border border-amber-200 rounded-lg">
            <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Difference:</span> <span className="font-medium">Overtime Threshold</span> decides <em>when</em> overtime begins (the trigger).
              <span className="font-medium"> Contract Hours/Day</span> + <span className="font-medium">Working Days/Month</span> decide <em>how much</em> each OT hour is paid (the rate).
              They are independent — e.g. a 9h threshold with 8h contract hours means OT starts after 9h, but the OT hourly rate is still salary ÷ 22 ÷ 8.
            </p>
          </div>
        </div>

        {/* OT Rates: Multiplier + Optional Fixed Override */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Overtime Rates</p>
          <p className="text-xs text-muted-foreground mb-3">
            Set a <span className="font-medium text-foreground">multiplier</span> (applied to hourly rate from basic salary) and/or a <span className="font-medium text-foreground">fixed AED rate</span> per OT hour. Fixed rate takes priority when set.
          </p>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Day Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Multiplier (×)</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Fixed Rate (AED/hr) <span className="font-normal opacity-60">— optional override</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                      Regular weekday OT
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" min={1} max={5} step={0.1} className="h-8 w-24"
                      value={settings.overtime_multiplier}
                      onChange={e => set("overtime_multiplier", parseFloat(e.target.value) || 1.5)} />
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" min={0} step={0.5} className="h-8 w-32" placeholder="e.g. 56.82"
                      value={settings.overtime_fixed_rate}
                      onChange={e => set("overtime_fixed_rate", e.target.value)} />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-0.5">
                      Sunday / Weekend
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" min={1} max={5} step={0.1} className="h-8 w-24"
                      value={settings.overtime_multiplier_sunday}
                      onChange={e => set("overtime_multiplier_sunday", parseFloat(e.target.value) || 2.0)} />
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" min={0} step={0.5} className="h-8 w-32" placeholder="e.g. 75.76"
                      value={settings.overtime_fixed_rate_sunday}
                      onChange={e => set("overtime_fixed_rate_sunday", e.target.value)} />
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5">
                      Public Holiday
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" min={1} max={5} step={0.1} className="h-8 w-24"
                      value={settings.overtime_multiplier_holiday}
                      onChange={e => set("overtime_multiplier_holiday", parseFloat(e.target.value) || 2.0)} />
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" min={0} step={0.5} className="h-8 w-32" placeholder="e.g. 75.76"
                      value={settings.overtime_fixed_rate_holiday}
                      onChange={e => set("overtime_fixed_rate_holiday", e.target.value)} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Live rate preview */}
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-foreground">
              Effective rate preview — employee with <span className="text-primary">AED 10,000 basic salary</span>
              <span className="ml-1 text-muted-foreground">· OT starts after <span className="font-mono text-foreground">{settings.overtime_threshold_daily_h}h</span></span>
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Base Hourly</p>
              <p className="font-mono font-bold text-foreground">AED {previewHourly.toFixed(2)}</p>
              <p className="text-muted-foreground/70">10,000 ÷ {days} ÷ {hrs}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Regular OT / hr</p>
              <p className="font-mono font-bold text-amber-600">AED {regular.rate.toFixed(2)}</p>
              <p className="text-muted-foreground/70">{regular.isFixed ? "Fixed rate" : `×${settings.overtime_multiplier}`}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Sunday OT / hr</p>
              <p className="font-mono font-bold text-orange-600">AED {sunday.rate.toFixed(2)}</p>
              <p className="text-muted-foreground/70">{sunday.isFixed ? "Fixed rate" : `×${settings.overtime_multiplier_sunday}`}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Holiday OT / hr</p>
              <p className="font-mono font-bold text-red-600">AED {holiday.rate.toFixed(2)}</p>
              <p className="text-muted-foreground/70">{holiday.isFixed ? "Fixed rate" : `×${settings.overtime_multiplier_holiday}`}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 italic">
            Formula: Basic Salary ÷ {days} days ÷ {hrs} hrs × multiplier (or fixed rate if set)
          </p>
        </div>

        {/* Public Holidays */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Public Holidays</p>
          <div className="flex gap-2 mb-3">
            <Input type="date" value={newHoliday} onChange={e => setNewHoliday(e.target.value)}
              className="h-8 text-sm flex-1 max-w-xs" />
            <Button size="sm" variant="outline" onClick={addHoliday} className="gap-1.5 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Holiday
            </Button>
          </div>
          {(settings.public_holidays || []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No public holidays defined — time entries on these dates use the regular OT rate.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(settings.public_holidays || []).map(date => (
                <div key={date} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-xs font-medium">
                  {date}
                  <button onClick={() => removeHoliday(date)} className="hover:text-red-900 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}