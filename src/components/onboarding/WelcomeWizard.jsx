import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { COA_TEMPLATES, downloadTemplateCsv } from "@/lib/coaTemplates";
import { invalidatePeriodLockCache } from "@/lib/periodLock";
import { getSingleton, saveSingleton } from "@/lib/singletonSettings";
import {
  Loader2, Download, Check, ArrowRight, ArrowLeft,
  Building2, Globe, BookOpen, Rocket, X,
} from "lucide-react";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"];
const COUNTRIES = [
  "United Arab Emirates", "Saudi Arabia", "Spain", "United Kingdom",
  "United States", "Qatar", "Kuwait", "Bahrain", "Oman", "Other",
];

const STEPS = ["Welcome", "Chart of Accounts", "Confirm"];

export default function WelcomeWizard({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [country, setCountry] = useState("United Arab Emirates");
  const [selectedTemplate, setSelectedTemplate] = useState("international");
  const [existingAccounts, setExistingAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    (async () => {
      setChecking(true);
      try {
        const [orgs, settings, accs] = await Promise.all([
          base44.entities.Organization.list("-created_date", 10).catch(() => []),
          base44.entities.AccountingSettings.list("-created_date", 10).catch(() => []),
          base44.entities.ChartOfAccount.list("-code", 5000).catch(() => []),
        ]);
        if (orgs[0]?.name) setCompanyName(orgs[0].name);
        if (orgs[0]?.country) setCountry(orgs[0].country);
        if (settings[0]?.default_currency) setCurrency(settings[0].default_currency);
        setExistingAccounts(accs);
      } catch { /* ignore */ }
      setChecking(false);
    })();
  }, [open]);

  const existingCodes = new Set(existingAccounts.map(a => a.code).filter(Boolean));

  const saveOnboardingFlag = async (extra = {}) => {
    // getSingleton throws when the read fails — the wizard must never create a
    // duplicate settings row just because a read came back empty by accident.
    const existing = await getSingleton(base44.entities.AccountingSettings, "AccountingSettings");
    const patch = { onboarding_completed: true, default_currency: currency, ...extra };
    if (existing) {
      await base44.entities.AccountingSettings.update(existing.id, patch);
    } else {
      await base44.entities.AccountingSettings.create({
        financial_year_start_month: 1,
        tax_basis: "Accrual",
        auto_post_invoices: true,
        auto_post_bills: true,
        ...patch,
      });
    }
    invalidatePeriodLockCache();
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Save organization (reads twice-safe: updates the canonical record,
      //    or creates only when the read succeeded with no record)
      await saveSingleton(base44.entities.Organization, { name: companyName, country, currency }, "Organization");

      // 2. Load COA template (non-destructive — skip existing codes)
      const tpl = COA_TEMPLATES.find(t => t.key === selectedTemplate);
      if (tpl) {
        const toCreate = tpl.coa.filter(a => !existingCodes.has(a.code));
        for (let i = 0; i < toCreate.length; i += 50) {
          await base44.entities.ChartOfAccount.bulkCreate(toCreate.slice(i, i + 50));
        }
      }

      // 3. Set onboarding_completed
      await saveOnboardingFlag();
      toast.success("Setup complete! Your workspace is ready.");
      onClose();
    } catch (e) {
      toast.error("Failed to complete setup: " + (e.message || "Unknown error"));
    }
    setLoading(false);
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await saveOnboardingFlag();
      toast.info("Setup skipped. You can reopen it anytime from Settings.");
      onClose();
    } catch (e) {
      toast.error("Could not save your settings: " + (e?.message || "the settings could not be loaded"));
    }
    setLoading(false);
  };

  const canNext = step === 0 ? companyName.trim().length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        hideClose
        className="max-w-none w-screen h-screen p-0 sm:rounded-none gap-0 overflow-y-auto"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Welcome to OPERAPP360</h2>
              <p className="text-xs text-muted-foreground">Let's set up your workspace in a few quick steps</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSkip} disabled={loading}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-card border-b border-border">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i === step ? "bg-primary text-primary-foreground" :
                i < step ? "bg-emerald-50 text-emerald-600" :
                "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <Check className="w-3 h-3" /> : <span className="w-4 text-center">{i + 1}</span>}
                {label}
              </div>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          {checking ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : step === 0 ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Tell us about your company</h3>
                <p className="text-xs text-muted-foreground">These details will be used across your workspace.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Company name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Base currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Country</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 1 ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Choose a chart of accounts</h3>
                <p className="text-xs text-muted-foreground">Select a template to load. Accounts that already exist will be skipped — nothing is overwritten.</p>
              </div>
              <div className="space-y-3">
                {COA_TEMPLATES.map((tpl) => {
                  const existingCount = tpl.coa.filter(a => existingCodes.has(a.code)).length;
                  const newCount = tpl.coa.length - existingCount;
                  const isSelected = selectedTemplate === tpl.key;
                  return (
                    <div key={tpl.key}
                      className={`rounded-xl border p-4 cursor-pointer transition-all ${
                        isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"
                      }`}
                      onClick={() => setSelectedTemplate(tpl.key)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 ${
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground m-auto" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{tpl.flag}</span>
                            <h4 className="text-sm font-bold text-foreground">{tpl.label}</h4>
                            {tpl.key === "international" && (
                              <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Default</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{tpl.desc}</p>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-muted-foreground">{tpl.coa.length} accounts</span>
                            {existingCount > 0 && (
                              <span className="text-amber-600 font-medium">{newCount} new · {existingCount} already exist</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm" variant="outline" className="gap-1.5 shrink-0"
                          onClick={(e) => { e.stopPropagation(); downloadTemplateCsv(tpl); }}
                        >
                          <Download className="w-3.5 h-3.5" /> CSV
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Confirm and finish</h3>
                <p className="text-xs text-muted-foreground">Review your settings before we set up your workspace.</p>
              </div>
              <div className="rounded-xl border border-border p-5 space-y-3">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border">
                  <Building2 className="w-4 h-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="text-sm font-semibold text-foreground">{companyName || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 pb-3 border-b border-border">
                  <Globe className="w-4 h-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Currency & Country</p>
                    <p className="text-sm font-semibold text-foreground">{currency} · {country}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Chart of Accounts</p>
                    <p className="text-sm font-semibold text-foreground">
                      {COA_TEMPLATES.find(t => t.key === selectedTemplate)?.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {COA_TEMPLATES.find(t => t.key === selectedTemplate)?.coa.length} accounts will be loaded
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between px-6 py-4 border-t border-border bg-card">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={loading}>
            Skip for now
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} disabled={loading}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canNext || loading}>
                Next <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Finish Setup
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}