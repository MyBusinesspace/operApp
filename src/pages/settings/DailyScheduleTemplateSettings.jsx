import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CalendarClock, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const DEFAULTS = {
  company_name: "",
  accent_color: "#cc0000",
  logo_url: "",
  show_logo: true,
  footer_notes: "",
  schedule_orientation: "portrait",
  schedule_paper_size: "a4",
  schedule_font_size: "medium",
  schedule_show_stats: true,
  schedule_show_assigned: true,
  schedule_show_location: true,
  schedule_show_equipment: true,
  schedule_show_switch_task: true,
};

function SegmentControl({ options, value, onChange }) {
  return (
    <div className="flex gap-1 mt-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${value === o.value ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function DailyScheduleTemplateSettings() {
  const [form, setForm] = useState(DEFAULTS);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    base44.entities.WorkingReportTemplate.filter({ is_default: true }).then(list => {
      const rec = list[0] || null;
      if (rec) {
        setRecordId(rec.id);
        setForm({
          company_name: rec.company_name || "",
          accent_color: rec.accent_color || "#cc0000",
          logo_url: rec.logo_url || "",
          show_logo: rec.show_logo !== false,
          footer_notes: rec.footer_notes || "",
          schedule_orientation: rec.schedule_orientation || "portrait",
          schedule_paper_size: rec.schedule_paper_size || "a4",
          schedule_font_size: rec.schedule_font_size || "medium",
          schedule_show_stats: rec.schedule_show_stats !== false,
          schedule_show_assigned: rec.schedule_show_assigned !== false,
          schedule_show_location: rec.schedule_show_location !== false,
          schedule_show_equipment: rec.schedule_show_equipment !== false,
          schedule_show_switch_task: rec.schedule_show_switch_task !== false,
        });
      }
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const data = {
      company_name: form.company_name,
      accent_color: form.accent_color,
      logo_url: form.logo_url,
      show_logo: form.show_logo,
      footer_notes: form.footer_notes,
      schedule_orientation: form.schedule_orientation,
      schedule_paper_size: form.schedule_paper_size,
      schedule_font_size: form.schedule_font_size,
      schedule_show_stats: form.schedule_show_stats,
      schedule_show_assigned: form.schedule_show_assigned,
      schedule_show_location: form.schedule_show_location,
      schedule_show_equipment: form.schedule_show_equipment,
      schedule_show_switch_task: form.schedule_show_switch_task,
    };
    if (recordId) await base44.entities.WorkingReportTemplate.update(recordId, data);
    else {
      const c = await base44.entities.WorkingReportTemplate.create({ ...data, name: "Default", is_default: true });
      setRecordId(c.id);
    }
    setSaving(false);
    setPreviewKey(k => k + 1);
    toast.success("Daily schedule settings saved.");
  };

  const previewUrl = `/day-schedule-print?date=${format(new Date(), "yyyy-MM-dd")}`;
  const embedUrl = `${previewUrl}&embed=1`;

  return (
    <div className="space-y-6">
      <Link to="/settings/operations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Time Tracker Settings
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Daily Schedule Report</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure the working day schedule document</p>
          </div>
        </div>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Preview Today
          </Button>
        </a>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* Left: Settings */}
        <div className="space-y-5">

          {/* Branding & Layout side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Branding */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 md:col-span-2">
              <h2 className="text-sm font-semibold text-foreground">Branding</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Company Name</Label>
                  <Input value={form.company_name} onChange={e => set("company_name", e.target.value)} placeholder="e.g. Acme LLC" />
                </div>
                <div className="space-y-1.5">
                  <Label>Accent Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.accent_color} onChange={e => set("accent_color", e.target.value)}
                      className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
                    <Input value={form.accent_color} onChange={e => set("accent_color", e.target.value)} placeholder="#cc0000" className="flex-1" />
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Logo URL</Label>
                  <div className="flex items-center gap-2">
                    <Input value={form.logo_url} onChange={e => set("logo_url", e.target.value)} placeholder="https://..." className="flex-1" />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Switch checked={!!form.show_logo} onCheckedChange={v => set("show_logo", v)} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Show logo</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Upload via Organization Settings and paste the URL here</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Footer Notes</Label>
                  <Textarea value={form.footer_notes} onChange={e => set("footer_notes", e.target.value)}
                    placeholder="Optional footer text..." rows={2} />
                </div>
              </div>
            </div>

            {/* PDF Layout */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">PDF Layout</h2>
              <p className="text-xs text-muted-foreground -mt-2">Defaults for the Print dialog.</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Orientation</Label>
                <SegmentControl
                  value={form.schedule_orientation}
                  onChange={v => set("schedule_orientation", v)}
                  options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Paper Size</Label>
                <SegmentControl
                  value={form.schedule_paper_size}
                  onChange={v => set("schedule_paper_size", v)}
                  options={[{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Font Size</Label>
                <SegmentControl
                  value={form.schedule_font_size}
                  onChange={v => set("schedule_font_size", v)}
                  options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }]}
                />
              </div>
            </div>

            {/* Column / section visibility */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-1 divide-y divide-border">
              <h2 className="text-sm font-semibold text-foreground mb-2">Visible Sections</h2>
              <ToggleRow label="Stats Counters" description="Field workers, on leave counts" checked={form.schedule_show_stats} onChange={v => set("schedule_show_stats", v)} />
              <ToggleRow label="Workers Column" description="Assigned employees per task" checked={form.schedule_show_assigned} onChange={v => set("schedule_show_assigned", v)} />
              <ToggleRow label="Location Column" description="Task site address" checked={form.schedule_show_location} onChange={v => set("schedule_show_location", v)} />
              <ToggleRow label="Equipment Column" description="Asset / equipment name" checked={form.schedule_show_equipment} onChange={v => set("schedule_show_equipment", v)} />
              <ToggleRow label="Switch Task Rows" description="Separator rows between tasks" checked={form.schedule_show_switch_task} onChange={v => set("schedule_show_switch_task", v)} />
            </div>

          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="gap-1.5">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="bg-card border border-border rounded-xl overflow-hidden sticky top-4">
          <iframe
            key={previewKey}
            src={`${embedUrl}&t=${previewKey}`}
            title="Daily Schedule Preview"
            style={{ width: "100%", height: 680, border: "none", display: "block", background: "white" }}
          />
        </div>

      </div>
    </div>
  );
}