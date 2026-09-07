import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Save, Eye,
  FileText, FileCheck, Palette, Building2, AlignLeft,
  ToggleLeft, Star, StarOff, Upload, X, ArrowLeft
} from "lucide-react";
import { Link } from "react-router-dom";
import DocumentTemplatePreview from "@/components/sales/DocumentTemplatePreview";

const EMPTY_TEMPLATE = {
  name: "New Template",
  document_types: ["quote", "invoice"],
  page_size: "A4",
  font: "Inter",
  accent_color: "#6366f1",
  logo_url: "",
  logo_size: 60,
  logo_position: "right",
  stamp_url: "",
  show_stamp: false,
  company_name: "",
  company_name_font_size: 19,
  body_font_size: 8.5,
  auto_text_scale: true,
  company_address: "",
  company_phone: "",
  company_email: "",
  company_website: "",
  tax_id: "",
  show_logo: true,
  show_tax_number: true,
  show_tax_column: true,
  show_unit_price: true,
  show_discount: false,
  tax_display: "exclusive",
  quote_title: "Quotation",
  quote_title_sent: "Quotation",
  invoice_title_draft: "Proforma Invoice",
  invoice_title: "Tax Invoice",
  invoice_title_overdue: "Tax Invoice",
  footer_notes: "",
  quote_terms: "",
  is_default: false,
};

const SECTIONS = [
  { key: "branding", label: "Brand & Styling", icon: Palette },
  { key: "company", label: "Your Business Details", icon: Building2 },
  { key: "content", label: "Content & Display", icon: ToggleLeft },
  { key: "terms", label: "Terms & Titles", icon: AlignLeft },
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

function SwitchRow({ label, checked, onChange, sublabel }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function DocumentTemplates({ hideBackButton = false }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null); // template being edited
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [openSections, setOpenSections] = useState({ branding: true, company: true, content: false, terms: false });
  const [previewDoc, setPreviewDoc] = useState("quote");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const fileRef = useRef();
  const stampRef = useRef();

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    const all = await base44.entities.DocumentTemplate.list("-created_date", 100);
    const list = all.filter(t => !t.name?.startsWith("__"));
    setTemplates(list);
    if (list.length > 0 && !selected) {
      setSelected(list[0]);
      setForm({ ...EMPTY_TEMPLATE, ...list[0] });
    }
  };

  const handleNew = () => {
    setSelected(null);
    setForm({ ...EMPTY_TEMPLATE });
  };

  const handleSelect = (t) => {
    setSelected(t);
    setForm({ ...EMPTY_TEMPLATE, ...t });
  };

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const toggleSection = (key) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const handleSave = async () => {
    setSaving(true);
    if (selected?.id) {
      await base44.entities.DocumentTemplate.update(selected.id, form);
    } else {
      await base44.entities.DocumentTemplate.create(form);
    }
    await loadTemplates();
    setSaving(false);
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await base44.entities.DocumentTemplate.delete(t.id);
    setSelected(null);
    setForm(EMPTY_TEMPLATE);
    await loadTemplates();
  };

  const handleSetDefault = async (t) => {
    // Clear all defaults then set this one
    for (const tmpl of templates) {
      if (tmpl.is_default && tmpl.id !== t.id) {
        await base44.entities.DocumentTemplate.update(tmpl.id, { is_default: false });
      }
    }
    await base44.entities.DocumentTemplate.update(t.id, { is_default: true });
    await loadTemplates();
  };

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

  const toggleDocType = (type) => {
    const cur = form.document_types || [];
    set("document_types", cur.includes(type) ? cur.filter(t => t !== type) : [...cur, type]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {!hideBackButton && (
            <Link to="/settings" className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Document Templates</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Design PDF templates for Quotes and Invoices</p>
          </div>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="w-4 h-4" /> New Template
        </Button>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: template list */}
        <div className="w-56 shrink-0 space-y-2">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                selected?.id === t.id
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">{t.name}</span>
                {t.is_default && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
              </div>
              <div className="flex gap-1 mt-1 flex-wrap">
                {(t.document_types || []).map(d => (
                  <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{d}</span>
                ))}
              </div>
            </button>
          ))}
          {templates.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
              No templates yet
            </div>
          )}
        </div>

        {/* Center: editor */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-1">
          <div className="bg-card border border-border rounded-2xl p-5">
            {/* Template name + doc types */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
              <div className="flex-1">
                <Input
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  className="text-base font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                  placeholder="Template name"
                />
              </div>
              <div className="flex gap-2">
                {["quote", "invoice"].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleDocType(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                      (form.document_types || []).includes(type)
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {type === "quote" ? <><FileText className="w-3 h-3 inline mr-1" />Quote</> : <><FileCheck className="w-3 h-3 inline mr-1" />Invoice</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Sections */}
            {SECTIONS.map(section => (
              <SectionPanel key={section.key} section={section} open={openSections[section.key]} onToggle={() => toggleSection(section.key)}>
                {section.key === "branding" && (
                  <>
                    <FieldRow label="Brand Color">
                      <div className="flex items-center gap-2">
                        <input type="color" value={form.accent_color || "#6366f1"} onChange={e => set("accent_color", e.target.value)} className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
                        <Input value={form.accent_color || "#6366f1"} onChange={e => set("accent_color", e.target.value)} className="flex-1 font-mono text-sm" maxLength={7} />
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
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
                            <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Upload Logo"}
                          </Button>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </div>
                    </FieldRow>
                    <FieldRow label="Logo Size">
                      <div className="flex items-center gap-3">
                        <input type="range" min={30} max={160} value={form.logo_size ?? 60} onChange={e => set("logo_size", Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" />
                        <Input type="number" min={30} max={160} value={form.logo_size ?? 60} onChange={e => set("logo_size", Number(e.target.value))} className="w-20" />
                        <span className="text-xs text-muted-foreground">px</span>
                      </div>
                    </FieldRow>
                    <FieldRow label="Logo Position">
                      <div className="flex gap-2">
                        {["left", "center", "right"].map(pos => (
                          <button key={pos} type="button" onClick={() => set("logo_position", pos)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${form.logo_position === pos ? "bg-primary/10 border-primary text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>{pos}</button>
                        ))}
                      </div>
                    </FieldRow>
                    <FieldRow label="Font">
                      <select value={form.font || "Inter"} onChange={e => set("font", e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                        {["Inter", "Georgia", "Arial", "Times New Roman", "Helvetica"].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </FieldRow>
                    <SwitchRow label="Automatic text size scale" sublabel="Auto-fit body text so the document fills the page" checked={form.auto_text_scale !== false} onChange={v => set("auto_text_scale", v)} />
                    <FieldRow label="Body Text Size">
                      <div className={`flex items-center gap-3 ${form.auto_text_scale !== false ? "opacity-50 pointer-events-none" : ""}`}>
                        <input type="range" min={8} max={13} step={0.5} value={form.body_font_size ?? 8.5} onChange={e => set("body_font_size", Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" />
                        <Input type="number" min={8} max={13} step={0.5} value={form.body_font_size ?? 8.5} onChange={e => set("body_font_size", Number(e.target.value))} className="w-20" />
                        <span className="text-xs text-muted-foreground">pt</span>
                      </div>
                    </FieldRow>
                    <FieldRow label="Page Size">
                      <div className="flex gap-2">
                        {["A4", "US Letter"].map(ps => (
                          <button key={ps} type="button" onClick={() => set("page_size", ps)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.page_size === ps ? "bg-primary/10 border-primary text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>{ps}</button>
                        ))}
                      </div>
                    </FieldRow>
                    <FieldRow label="Stamp / Seal">
                      <div className="space-y-2">
                        {form.stamp_url ? (
                          <div className="relative inline-block">
                            <img src={form.stamp_url} alt="stamp" className="h-16 object-contain border border-border rounded-lg p-1 bg-white" />
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
                          <div className="flex items-center gap-2 pt-1">
                            <Switch checked={form.show_stamp === true} onCheckedChange={v => set("show_stamp", v)} id="show-stamp" />
                            <label htmlFor="show-stamp" className="text-xs text-muted-foreground cursor-pointer">Show stamp on documents</label>
                          </div>
                        )}
                      </div>
                    </FieldRow>
                  </>
                )}

                {section.key === "company" && (
                  <>
                    <FieldRow label="Company Name">
                      <textarea value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} placeholder="ACME Corp LLC" className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" />
                    </FieldRow>
                    <FieldRow label="Company Name Size">
                      <div className="flex items-center gap-3">
                        <input type="range" min={12} max={40} value={form.company_name_font_size ?? 19} onChange={e => set("company_name_font_size", Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" />
                        <Input type="number" min={12} max={40} value={form.company_name_font_size ?? 19} onChange={e => set("company_name_font_size", Number(e.target.value))} className="w-20" />
                        <span className="text-xs text-muted-foreground">px</span>
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
                    <SwitchRow label="Show Tax Column" checked={form.show_tax_column !== false} onChange={v => set("show_tax_column", v)} />
                    <SwitchRow label="Show Unit Price & Quantity" checked={form.show_unit_price !== false} onChange={v => set("show_unit_price", v)} />
                    <SwitchRow label="Show Discount" checked={form.show_discount === true} onChange={v => set("show_discount", v)} />
                    <FieldRow label="Tax Display">
                      <div className="flex gap-2">
                        {["exclusive", "inclusive"].map(td => (
                          <button key={td} type="button" onClick={() => set("tax_display", td)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${form.tax_display === td ? "bg-primary/10 border-primary text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>{td}</button>
                        ))}
                      </div>
                    </FieldRow>
                  </div>
                )}

                {section.key === "terms" && (
                  <>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border mb-1">Quote Titles</div>
                    <FieldRow label="Draft Quote title"><Input value={form.quote_title || ""} onChange={e => set("quote_title", e.target.value)} placeholder="Quotation" /></FieldRow>
                    <FieldRow label="Quote title (Sent / Accepted)"><Input value={form.quote_title_sent || ""} onChange={e => set("quote_title_sent", e.target.value)} placeholder="Quotation" /></FieldRow>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border mt-3 mb-1">Invoice Titles</div>
                    <FieldRow label="Draft Invoice title"><Input value={form.invoice_title_draft || ""} onChange={e => set("invoice_title_draft", e.target.value)} placeholder="Proforma Invoice" /></FieldRow>
                    <FieldRow label="Approved Invoice title"><Input value={form.invoice_title || ""} onChange={e => set("invoice_title", e.target.value)} placeholder="Tax Invoice" /></FieldRow>
                    <FieldRow label="Overdue Invoice title"><Input value={form.invoice_title_overdue || ""} onChange={e => set("invoice_title_overdue", e.target.value)} placeholder="Tax Invoice" /></FieldRow>
                    <FieldRow label="Invoice Footer / Terms">
                      <textarea value={form.footer_notes || ""} onChange={e => set("footer_notes", e.target.value)} placeholder={"PAYMENT TERMS:\n1. Payment due 7 days from invoice date..."} className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" />
                    </FieldRow>
                    <FieldRow label="Quote Terms">
                      <textarea value={form.quote_terms || ""} onChange={e => set("quote_terms", e.target.value)} placeholder={"PAYMENT AND DELIVERY TERMS:\n1. Payment due 7 days from quote acceptance..."} className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" />
                    </FieldRow>
                  </>
                )}
              </SectionPanel>
            ))}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
              <div className="flex gap-2">
                {selected?.id && !selected.is_default && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => handleSetDefault(selected)}>
                    <Star className="w-3.5 h-3.5" /> Set as Default
                  </Button>
                )}
                {selected?.id && selected.is_default && (
                  <Badge variant="secondary" className="gap-1 text-amber-600 border-amber-200 bg-amber-50">
                    <Star className="w-3 h-3 fill-amber-400" /> Default Template
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {selected?.id && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/5" onClick={() => handleDelete(selected)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Template"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="w-96 shrink-0">
          <div className="sticky top-0">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
              <div className="ml-auto flex gap-1">
                {["quote", "invoice"].map(d => (
                  <button key={d} onClick={() => setPreviewDoc(d)} className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${previewDoc === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{d}</button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-border shadow-sm flex justify-center">
              <DocumentTemplatePreview template={form} docType={previewDoc} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}