import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Building2 } from "lucide-react";
import HistoryNotesPanel from "@/components/shared/HistoryNotesPanel";

const EMPTY = {
  reference: "", full_name: "", email: "", phone: "", company: "", type: "",
  status: "", group_id: "", address: "", city: "", country: "",
  tax_id: "", website: "", maps_link: "", notes: "", contact_person: "",
  fiscal_legal_name: "", fiscal_address: "", fiscal_city: "", fiscal_country: "",
  fiscal_zip: "", fiscal_currency: "", fiscal_payment_terms: "",
  fiscal_bank_name: "", fiscal_iban: "", fiscal_swift: "",
};

async function generateContactReference() {
  try {
    const { generateReference } = await import("@/lib/referenceNumbering");
    // Cap to 200 recent records — generateReference also reads persisted next_number from settings,
    // which is always >= max found, so capping the scan is safe.
    const recent = await base44.entities.Contact.list("-created_date", 200);
    return await generateReference("__contact_numbering__", "CMP", recent);
  } catch { return ""; }
}

const DEFAULT_CATEGORIES = ["Contact", "Customer", "Provider", "Both"];
const DEFAULT_STATUSES = ["Active", "Inactive", "Archived"];

const TABS = [
  { id: "general", label: "General", icon: User },
  { id: "fiscal", label: "Fiscal Data", icon: Building2 },
];

export default function ContactFormModal({ open, onClose, onSave, contact, groups }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [tab, setTab] = useState("general");

  useEffect(() => {
    if (open) {
      setTab("general");
      Promise.all([
        base44.entities.ContactCategory.list("name", 100),
        base44.entities.ContactStatus.list("name", 100),
      ]).then(([cats, stats]) => { setCategories(cats); setStatuses(stats); });
      if (!contact) {
        generateContactReference().then(ref => setForm(f => ({ ...f, reference: ref })));
      }
    }
  }, [open]);

  useEffect(() => {
    setForm(contact ? { ...EMPTY, ...contact } : EMPTY);
  }, [contact, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const categoryOptions = categories.length > 0 ? categories.map(c => c.name) : DEFAULT_CATEGORIES;
  const statusOptions = statuses.length > 0 ? statuses.map(s => s.name) : DEFAULT_STATUSES;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Company" : "New Company"}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map(t => (
            <button key={t.id} type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto py-4">

            {/* ── GENERAL TAB ─────────────────────────────────── */}
            {tab === "general" && (
              <div className="grid grid-cols-2 gap-3 px-1">
                <div className="space-y-1">
                  <Label>Reference</Label>
                  <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">{form.reference || "—"}</div>
                </div>
                <div className="space-y-1">
                  <Label>Company Name *</Label>
                  <Input value={form.full_name} onChange={e => set("full_name", e.target.value)} required placeholder="Company name" />
                </div>
                <div className="space-y-1">
                  <Label>Primary Email</Label>
                  <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com" />
                </div>
                <div className="space-y-1">
                  <Label>Primary Phone</Label>
                  <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1 555 000 000" />
                </div>
                <div className="space-y-1">
                  <Label>Primary Contact Person</Label>
                  <Input value={form.contact_person} onChange={e => set("contact_person", e.target.value)} placeholder="Name of primary contact person" />
                </div>
                <div className="space-y-1">
                   <Label>Company Nickname</Label>
                  <Input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Short name or nickname..." />
                </div>
                <div className="space-y-1">
                  <Label>Tax ID / VAT</Label>
                  <Input value={form.tax_id} onChange={e => set("tax_id", e.target.value)} placeholder="Tax number" />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={form.type || ""} onValueChange={v => set("type", v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status || ""} onValueChange={v => set("status", v)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Group</Label>
                  <Select value={form.group_id || "__none__"} onValueChange={v => set("group_id", v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No group</SelectItem>
                      {(groups || []).map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <Input value={form.country} onChange={e => set("country", e.target.value)} placeholder="Country" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Office Address</Label>
                  <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street address" />
                </div>
                <div className="col-span-2 space-y-1">
                   <Label>Website</Label>
                  <Input value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Office Google Maps Link</Label>
                  <Input value={form.maps_link} onChange={e => set("maps_link", e.target.value)} placeholder="https://maps.google.com/..." />
                  {form.maps_link && (() => {
                    const url = form.maps_link;
                    const coordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/) || url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                    let embedSrc;
                    if (coordMatch) {
                      embedSrc = `https://maps.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}&z=15&output=embed`;
                    } else {
                      const placeMatch = url.match(/place\/([^/]+)/);
                      const query = placeMatch ? decodeURIComponent(placeMatch[1].replace(/\+/g, " ")) : url;
                      embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
                    }
                    return (
                      <div className="mt-2 rounded-xl overflow-hidden border border-border">
                        <iframe
                          src={embedSrc}
                          width="100%" height="180"
                          style={{ border: 0, display: "block" }}
                          allowFullScreen loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          title="Location Preview"
                        />
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} placeholder="Internal notes..." />
                </div>

                {contact?.id && (
                  <div className="col-span-2">
                    <HistoryNotesPanel entityName="ContactNote" idField="contact_id" recordId={contact.id} />
                  </div>
                )}
              </div>
            )}

            {/* ── FISCAL DATA TAB ──────────────────────────────── */}
            {tab === "fiscal" && (
              <div className="space-y-4 px-1">
                {/* Company details */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Company / Legal Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Legal / Fiscal Name</Label>
                      <Input value={form.fiscal_legal_name} onChange={e => set("fiscal_legal_name", e.target.value)} placeholder="Registered company name" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Fiscal Address</Label>
                      <Input value={form.fiscal_address} onChange={e => set("fiscal_address", e.target.value)} placeholder="Registered address" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">City</Label>
                      <Input value={form.fiscal_city} onChange={e => set("fiscal_city", e.target.value)} placeholder="City" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ZIP / Postal Code</Label>
                      <Input value={form.fiscal_zip} onChange={e => set("fiscal_zip", e.target.value)} placeholder="12345" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Country</Label>
                      <Input value={form.fiscal_country} onChange={e => set("fiscal_country", e.target.value)} placeholder="Country" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Currency</Label>
                      <Input value={form.fiscal_currency} onChange={e => set("fiscal_currency", e.target.value)} placeholder="USD, EUR, AED..." />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Payment Terms</Label>
                      <Input value={form.fiscal_payment_terms} onChange={e => set("fiscal_payment_terms", e.target.value)} placeholder="e.g. Net 30, Net 60, Immediate..." />
                    </div>
                  </div>
                </div>

                {/* Banking */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Banking Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Bank Name</Label>
                      <Input value={form.fiscal_bank_name} onChange={e => set("fiscal_bank_name", e.target.value)} placeholder="Bank name" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">IBAN / Account Number</Label>
                      <Input value={form.fiscal_iban} onChange={e => set("fiscal_iban", e.target.value)} placeholder="IBAN or account number" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">SWIFT / BIC</Label>
                      <Input value={form.fiscal_swift} onChange={e => set("fiscal_swift", e.target.value)} placeholder="SWIFT code" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : contact ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}