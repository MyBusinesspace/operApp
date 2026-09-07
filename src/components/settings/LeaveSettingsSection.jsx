import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, CalendarDays, Loader2 } from "lucide-react";

export default function LeaveSettingsSection() {
  const [settings, setSettings] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.PayrollSettings.list("-created_date", 1).then(list => {
      const s = Array.isArray(list) && list[0] ? list[0] : null;
      if (s) {
        setSettings({ default_annual_leave_days: s.default_annual_leave_days ?? 30 });
        setRecordId(s.id);
      } else {
        setSettings({ default_annual_leave_days: 30 });
      }
    });
  }, []);

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    if (recordId) {
      await base44.entities.PayrollSettings.update(recordId, settings);
    } else {
      const created = await base44.entities.PayrollSettings.create(settings);
      setRecordId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 max-w-md">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <CalendarDays className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-foreground">Leave Defaults</h3>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Default Annual Leave Entitlement (days)</Label>
          <Input
            type="number"
            min={0}
            value={settings.default_annual_leave_days}
            onChange={e => set("default_annual_leave_days", parseInt(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground/70 italic">
            Applied to new employee payroll profiles. Each employee's entitlement can be overridden individually.
          </p>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 h-8 text-xs">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>
    </div>
  );
}