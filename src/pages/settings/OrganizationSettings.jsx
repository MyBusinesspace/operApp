import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { ArrowLeft, Building2, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrgFilesTab from "@/components/organization/OrgFilesTab";
import { TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENCIES = ["AED","USD","EUR","GBP","SAR","QAR","KWD","BHD","OMR"];

const EMPTY = {
  name: "Redcrane LLC", legal_name: "Redcrane Equipment Rental LLC", logo_url: "", industry: "Construction & Equipment Rental",
  website: "https://redcrane.ae", email: "info@redcrane.ae", phone: "+971 4 000 0000",
  address: "Office 1204, Aspect Tower, Business Bay", city: "Dubai", country: "UAE", zip: "",
  tax_id: "100387160300003", currency: "AED", fiscal_year_start: "January", timezone: DEFAULT_TIMEZONE,
  bank_name: "Emirates NBD", bank_account: "AE00 0000 0000 0000 0000", bank_swift: "EBILAEAD", notes: ""
};

export default function OrganizationSettings() {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    loadOrg();
  }, []);

  const loadOrg = async () => {
    const list = await base44.entities.Organization.list("-created_date", 10);
    if (list.length > 0) {
      setOrg(list[0]);
      setForm({ ...EMPTY, ...list[0] });
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    let result;
    if (org) {
      result = await base44.entities.Organization.update(org.id, form);
    } else {
      result = await base44.entities.Organization.create(form);
    }
    setOrg(result);
    setForm({ ...EMPTY, ...result });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, logo_url: file_url }));
    setLogoUploading(false);
  };



  return (
    <div className="space-y-6 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Organization</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Your company profile, branding and documents</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
          </Button>
        </div>
      </motion.div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal & Banking</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        {/* PROFILE TAB */}
        <TabsContent value="profile" className="space-y-6">
          {/* Logo */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Branding</h3>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                  : <Building2 className="w-8 h-8 text-muted-foreground/40" />
                }
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">Company Logo</p>
                <p className="text-xs text-muted-foreground">PNG or SVG recommended. Used in documents and the app.</p>
                <label>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <Button size="sm" variant="outline" className="gap-1.5 cursor-pointer" asChild>
                    <span><Upload className="w-3.5 h-3.5" />{logoUploading ? "Uploading..." : "Upload Logo"}</span>
                  </Button>
                </label>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input value={form.name} onChange={set("name")} placeholder="e.g. Redcrane LLC" />
              </div>
              <div className="space-y-1.5">
                <Label>Legal Name</Label>
                <Input value={form.legal_name} onChange={set("legal_name")} placeholder="Registered legal name" />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Input value={form.industry} onChange={set("industry")} placeholder="e.g. Construction, Logistics" />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={form.website} onChange={set("website")} placeholder="https://yourcompany.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={set("email")} placeholder="info@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={set("phone")} placeholder="+971 4 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Operational Timezone</Label>
                <select
                  value={form.timezone || DEFAULT_TIMEZONE}
                  onChange={set("timezone")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.id} value={tz.id}>{tz.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">The timezone in which your organization's work is performed. Used for the live clock and date displays.</p>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Street Address</Label>
                <Textarea value={form.address} onChange={set("address")} placeholder="Street, Building, Floor..." rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={set("city")} placeholder="Dubai" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} onChange={set("country")} placeholder="UAE" />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP / Postal Code</Label>
                <Input value={form.zip} onChange={set("zip")} placeholder="00000" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Internal Notes</h3>
            <Textarea value={form.notes} onChange={set("notes")} placeholder="Any internal notes about this organization..." rows={3} />
          </div>
        </TabsContent>

        {/* FISCAL TAB */}
        <TabsContent value="fiscal" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Tax & Currency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tax ID / TRN / VAT</Label>
                <Input value={form.tax_id} onChange={set("tax_id")} placeholder="e.g. 100387160300003" />
              </div>
              <div className="space-y-1.5">
                <Label>Default Currency</Label>
                <select
                  value={form.currency}
                  onChange={set("currency")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Fiscal Year Start</Label>
                <select
                  value={form.fiscal_year_start}
                  onChange={set("fiscal_year_start")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Banking Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={form.bank_name} onChange={set("bank_name")} placeholder="e.g. Emirates NBD" />
              </div>
              <div className="space-y-1.5">
                <Label>Account Number / IBAN</Label>
                <Input value={form.bank_account} onChange={set("bank_account")} placeholder="AE00 0000 0000 0000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>SWIFT / BIC</Label>
                <Input value={form.bank_swift} onChange={set("bank_swift")} placeholder="e.g. EBILAEAD" />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* FILES TAB */}
        <TabsContent value="files" className="space-y-4">
          {org
            ? <OrgFilesTab orgId={org.id} />
            : <div className="py-12 text-center text-sm text-muted-foreground">Save your organization profile first to enable file uploads.</div>
          }
        </TabsContent>
      </Tabs>
    </div>
  );
}