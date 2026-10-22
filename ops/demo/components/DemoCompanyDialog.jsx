import { useEffect, useState } from "react";
import { Building2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY = {
  reference: "",
  full_name: "",
  email: "",
  phone: "",
  company: "",
  type: "",
  status: "",
  group_id: "",
  address: "",
  city: "",
  country: "",
  tax_id: "",
  website: "",
  maps_link: "",
  notes: "",
  contact_person: "",
  fiscal_legal_name: "",
  fiscal_address: "",
  fiscal_city: "",
  fiscal_country: "",
  fiscal_zip: "",
  fiscal_currency: "",
  fiscal_payment_terms: "",
  fiscal_bank_name: "",
  fiscal_iban: "",
  fiscal_swift: "",
};

const CATEGORIES = ["Contact", "Customer", "Provider", "Both"];
const STATUSES = ["Active", "Inactive", "Archived"];

const TABS = [
  { id: "general", label: "General", icon: User },
  { id: "fiscal", label: "Fiscal Data", icon: Building2 },
];

export default function DemoCompanyDialog({
  open,
  onClose,
  contact,
  groups = [],
  defaults = null,
}) {
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState("general");

  useEffect(() => {
    if (open) {
      setTab("general");
      setForm(
        contact
          ? { ...EMPTY, ...contact }
          : { ...EMPTY, ...(defaults || {}) }
      );
    }
  }, [contact, open, defaults]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Company" : "New Company"}</DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-border shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto py-4">
            {tab === "general" && (
              <div className="grid grid-cols-2 gap-3 px-1">
                <div className="space-y-1">
                  <Label>Reference</Label>
                  <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">
                    {form.reference || "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Company Name *</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => set("full_name", e.target.value)}
                    required
                    placeholder="Company name"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Primary Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Primary Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+1 555 000 000"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Primary Contact Person</Label>
                  <Input
                    value={form.contact_person}
                    onChange={(e) => set("contact_person", e.target.value)}
                    placeholder="Name of primary contact person"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Company Nickname</Label>
                  <Input
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                    placeholder="Short name or nickname..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tax ID / VAT</Label>
                  <Input
                    value={form.tax_id}
                    onChange={(e) => set("tax_id", e.target.value)}
                    placeholder="Tax number"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={form.type || undefined}
                    onValueChange={(v) => set("type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status || undefined}
                    onValueChange={(v) => set("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Group</Label>
                  <Select
                    value={form.group_id || "__none__"}
                    onValueChange={(v) =>
                      set("group_id", v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No group</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <Input
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    placeholder="Country"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Office Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Street address"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Website</Label>
                  <Input
                    value={form.website}
                    onChange={(e) => set("website", e.target.value)}
                    placeholder="https://"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Office Google Maps Link</Label>
                  <Input
                    value={form.maps_link}
                    onChange={(e) => set("maps_link", e.target.value)}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={3}
                    placeholder="Internal notes..."
                  />
                </div>
              </div>
            )}

            {tab === "fiscal" && (
              <div className="space-y-4 px-1">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Company / Legal Details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Legal / Fiscal Name</Label>
                      <Input
                        value={form.fiscal_legal_name}
                        onChange={(e) =>
                          set("fiscal_legal_name", e.target.value)
                        }
                        placeholder="Registered company name"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Fiscal Address</Label>
                      <Input
                        value={form.fiscal_address}
                        onChange={(e) => set("fiscal_address", e.target.value)}
                        placeholder="Registered address"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">City</Label>
                      <Input
                        value={form.fiscal_city}
                        onChange={(e) => set("fiscal_city", e.target.value)}
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ZIP / Postal Code</Label>
                      <Input
                        value={form.fiscal_zip}
                        onChange={(e) => set("fiscal_zip", e.target.value)}
                        placeholder="12345"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Country</Label>
                      <Input
                        value={form.fiscal_country}
                        onChange={(e) => set("fiscal_country", e.target.value)}
                        placeholder="Country"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Currency</Label>
                      <Input
                        value={form.fiscal_currency}
                        onChange={(e) => set("fiscal_currency", e.target.value)}
                        placeholder="USD, EUR, AED..."
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Payment Terms</Label>
                      <Input
                        value={form.fiscal_payment_terms}
                        onChange={(e) =>
                          set("fiscal_payment_terms", e.target.value)
                        }
                        placeholder="e.g. Net 30, Net 60, Immediate..."
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Banking Details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Bank Name</Label>
                      <Input
                        value={form.fiscal_bank_name}
                        onChange={(e) =>
                          set("fiscal_bank_name", e.target.value)
                        }
                        placeholder="Bank name"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">IBAN / Account Number</Label>
                      <Input
                        value={form.fiscal_iban}
                        onChange={(e) => set("fiscal_iban", e.target.value)}
                        placeholder="IBAN or account number"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">SWIFT / BIC</Label>
                      <Input
                        value={form.fiscal_swift}
                        onChange={(e) => set("fiscal_swift", e.target.value)}
                        placeholder="SWIFT code"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{contact ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
