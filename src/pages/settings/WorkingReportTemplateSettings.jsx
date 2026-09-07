import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Save, Upload, X, FileText,
  Palette, Building2, AlignLeft, ToggleLeft,
  ChevronDown, ChevronRight, Eye, Hash
} from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import WorkingReportPreview from "@/components/timesheets/WorkingReportPreview";
import WorkingReportRenumSection from "@/components/settings/WorkingReportRenumSection";
import { DEFAULT_LAYOUT, resolveLayout } from "@/lib/workingReportLayout";

const EMPTY = {
  name: "Default Working Report",
  accent_color: "#cc0000",
  logo_url: "",
  logo_position: "right",
  show_logo: true,
  stamp_url: "",
  show_stamp: false,
  company_name: "",
  company_name_font_size: 22,
  company_address: "",
  company_phone: "",
  company_email: "",
  company_website: "",
  tax_id: "",
  show_tax_number: true,
  report_title: "SERVICE & MAINTENANCE REPORT",
  footer_notes: "",
  is_default: true,
  max_reports_per_task: 99,
  ref_prefix: "WR",
  ref_include_year: true,
  ref_number_padding: 4,
  ref_next_number: 1,
  layout: DEFAULT_LAYOUT,
};

const SECTIONS = [
  { key: "branding", label: "Brand & Styling", icon: Palette },
  { key: "company", label: "Company Details", icon: Building2 },
  { key: "content", label: "Content & Display", icon: ToggleLeft },
  { key: "numbering", label: "Reference Numbering", icon: Hash },
  { key: "footer", label: "Footer & Notes", icon: AlignLeft },
];

function SectionPanel({ section, open, onToggle, children }) {
  const Icon = section.icon;
  return (
    <div className="border border-border rounded-xl overflow-hidden mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          <Icon className="w-4 h-4 text-primary" />
          {section.label}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="grid grid-cols-5 gap-3 items-start">
      <Label className="col-span-2 text-xs text-muted-foreground pt-2">{label}</Label>
      <div className="col-span-3">{children}</div>
    </div>
  );
}

function SwitchRow({ label, sublabel, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function WorkingReportTemplateSettings() {
  const [form, setForm] = useState(EMPTY);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [openSections, setOpenSections] = useState({ branding: true, company: true, content: false, numbering: false, footer: false });
  const logoRef = useRef();
  const stampRef = useRef();
  const { toast } = useToast();

  useEffect(() => {
    base44.entities.WorkingReportTemplate.list("-created_date", 50).then(list => {
      if (list.length > 0) {
        setRecordId(list[0].id);
        // Seed a full layout into existing templates that predate the layout field,
        // without touching any other stored data.
        const loaded = { ...EMPTY, ...list[0] };
        loaded.layout = resolveLayout(list[0]);
        setForm(loaded);
      }
    });
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const toggleSection = (key) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("logo_url", file_url);
    setUploading(false);
  };

  const handleStampUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingStamp(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("stamp_url", file_url);
    setUploadingStamp(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (recordId) {
      await base44.entities.WorkingReportTemplate.update(recordId, form);
    } else {
      const rec = await base44.entities.WorkingReportTemplate.create(form);
      setRecordId(rec.id);
    }
    setSaving(false);
    toast({ title: "Saved", description: "Working report template updated." });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/settings/operations" className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Working Report Template</h1>
              <p className="text-sm text-muted-foreground">Configure the PDF template for Service & Maintenance Reports</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3-col layout: editor + preview */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Editor */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-1">
          <div className="bg-card border border-border rounded-2xl p-5">

            {/* Template name */}
            <div className="mb-5 pb-4 border-b border-border">
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                className="text-base font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                placeholder="Template name"
              />
            </div>

            {SECTIONS.map(section => (
              <SectionPanel key={section.key} section={section} open={openSections[section.key]} onToggle={() => toggleSection(section.key)}>

                {section.key === "branding" && (
                  <>
                    <FieldRow label="Report Title">
                      <Input value={form.report_title || ""} onChange={e => set("report_title", e.target.value)} placeholder="SERVICE & MAINTENANCE REPORT" />
                    </FieldRow>
                    <FieldRow label="Brand Color">
                      <div className="flex items-center gap-2">
                        <input type="color" value={form.accent_color || "#cc0000"} onChange={e => set("accent_color", e.target.value)} className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
                        <Input value={form.accent_color || "#cc0000"} onChange={e => set("accent_color", e.target.value)} className="flex-1 font-mono text-sm" maxLength={7} />
                      </div>
                    </FieldRow>
                    <FieldRow label="Logo">
                      <div className="space-y-2">
                        {form.logo_url ? (
                          <div className="relative inline-block">
                            <img src={form.logo_url} alt="logo" className="h-14 object-contain border border-border rounded-lg p-1" />
                            <button type="button" onClick={() => set("logo_url", "")} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => logoRef.current?.click()} disabled={uploading}>
                            <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Upload Logo"}
                          </Button>
                        )}
                        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </div>
                    </FieldRow>
                    <FieldRow label="Stamp / Seal">
                      <div className="space-y-2">
                        {form.stamp_url ? (
                          <div className="relative inline-block">
                            <img src={form.stamp_url} alt="stamp" className="h-14 object-contain border border-border rounded-lg p-1 bg-white" />
                            <button type="button" onClick={() => set("stamp_url", "")} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => stampRef.current?.click()} disabled={uploadingStamp}>
                            <Upload className="w-3.5 h-3.5" /> {uploadingStamp ? "Uploading..." : "Upload Stamp"}
                          </Button>
                        )}
                        <input ref={stampRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
                        {form.stamp_url && (
                          <SwitchRow label="Show stamp on reports" checked={form.show_stamp === true} onChange={v => set("show_stamp", v)} />
                        )}
                      </div>
                    </FieldRow>
                  </>
                )}

                {section.key === "company" && (
                  <>
                    <FieldRow label="Company Name"><Input value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} placeholder="Your Company LLC" /></FieldRow>
                    <FieldRow label="Name Font Size">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={8}
                          max={48}
                          value={form.company_name_font_size ?? 22}
                          onChange={e => {
                            const raw = e.target.value;
                            if (raw === "") { set("company_name_font_size", ""); return; }
                            const n = parseInt(raw);
                            if (!isNaN(n)) set("company_name_font_size", n);
                          }}
                          onBlur={() => {
                            const v = form.company_name_font_size;
                            if (v === "" || v == null || v < 8) set("company_name_font_size", 22);
                          }}
                          className="w-24"
                        />
                        <span className="text-xs text-muted-foreground">pt — applies to preview &amp; PDF</span>
                      </div>
                    </FieldRow>
                    <FieldRow label="Address">
                      <textarea value={form.company_address || ""} onChange={e => set("company_address", e.target.value)} placeholder={"123 Business St\nDubai, UAE"} className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" />
                    </FieldRow>
                    <FieldRow label="Phone"><Input value={form.company_phone || ""} onChange={e => set("company_phone", e.target.value)} placeholder="+971 4 000 0000" /></FieldRow>
                    <FieldRow label="Email"><Input value={form.company_email || ""} onChange={e => set("company_email", e.target.value)} placeholder="info@company.com" /></FieldRow>
                    <FieldRow label="Website"><Input value={form.company_website || ""} onChange={e => set("company_website", e.target.value)} placeholder="www.company.com" /></FieldRow>
                    <FieldRow label="Tax ID / TRN"><Input value={form.tax_id || ""} onChange={e => set("tax_id", e.target.value)} placeholder="100123456700003" /></FieldRow>
                  </>
                )}

                {section.key === "content" && (
                  <div className="space-y-3">
                    <SwitchRow label="Show Logo" checked={form.show_logo !== false} onChange={v => set("show_logo", v)} />
                    <SwitchRow label="Show Tax Number (TRN)" checked={form.show_tax_number !== false} onChange={v => set("show_tax_number", v)} />
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-3">
                        <strong className="text-foreground">Subtasks</strong> are listed automatically in the report under the General Information section. They are pulled from the task's subtask list and show their completion status (✓ checked / unchecked) at the time of clock-out.
                      </p>
                      <FieldRow label="Max Reports per Task">
                        <div className="space-y-1">
                          <Input
                            type="number"
                            min={0}
                            max={999}
                            value={form.max_reports_per_task ?? 99}
                            onChange={e => set("max_reports_per_task", parseInt(e.target.value) || 0)}
                            className="w-24"
                          />
                          <p className="text-xs text-muted-foreground">
                            0 = no reports allowed · 1 = one report max · 99 = unlimited
                          </p>
                        </div>
                      </FieldRow>
                    </div>
                  </div>
                )}

                {section.key === "numbering" && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <p className="text-sm font-medium text-foreground">Task-based numbering</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Working report references are built from their parent task's number, plus a sequence number for each report on that task.
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Example: if the task is <span className="font-mono font-semibold text-foreground">TSK-2026-0004</span>, its reports become <span className="font-mono font-semibold text-foreground">{form.ref_prefix || "WR"}-{form.ref_include_year !== false ? "2026-" : ""}0004.1</span>, <span className="font-mono font-semibold text-foreground">{form.ref_prefix || "WR"}-{form.ref_include_year !== false ? "2026-" : ""}0004.2</span>, and so on.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        Preview: <span className="font-mono font-semibold text-foreground">{form.ref_prefix || "WR"}-{form.ref_include_year !== false ? "2026-" : ""}0001.1</span>
                      </p>
                    </div>
                    <WorkingReportRenumSection form={form} />
                  </div>
                )}

                {section.key === "footer" && (
                  <FieldRow label="Footer Notes">
                    <textarea value={form.footer_notes || ""} onChange={e => set("footer_notes", e.target.value)} placeholder="Optional footer text or terms..." className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" />
                  </FieldRow>
                )}
              </SectionPanel>
            ))}

            {/* Save */}
            <div className="flex justify-end pt-4 mt-2 border-t border-border">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="w-96 shrink-0">
          <div className="sticky top-0">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border shadow-sm" style={{ transform: "scale(0.72)", transformOrigin: "top left", width: "139%", marginBottom: "-28%" }}>
              <WorkingReportPreview template={form} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}