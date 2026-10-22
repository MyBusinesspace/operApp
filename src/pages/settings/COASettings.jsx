import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Loader2, Check, BookOpen, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { COA_TEMPLATES, downloadTemplateCsv } from "@/lib/coaTemplates";

export default function COASettings() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const accs = await base44.entities.ChartOfAccount.list("-code", 5000);
      setAccounts(accs);
    } catch (err) {
      toast.error("Failed to load accounts");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleLoadTemplate = async (template) => {
    if (!confirm(`Load the ${template.label} chart of accounts?\n\nExisting accounts with the same code will be skipped. You can customize accounts afterwards.`)) return;
    setLoadingTemplate(template.key);
    try {
      const existingCodes = new Set(accounts.map(a => a.code).filter(Boolean));
      const toCreate = template.coa.filter(a => !existingCodes.has(a.code));
      if (toCreate.length === 0) {
        toast.info("All accounts from this template already exist.");
        setLoadingTemplate(null);
        return;
      }
      for (let i = 0; i < toCreate.length; i += 50) {
        await base44.entities.ChartOfAccount.bulkCreate(toCreate.slice(i, i + 50));
      }
      toast.success(`${toCreate.length} accounts loaded from ${template.label} template.`);
      load();
    } catch (err) {
      toast.error("Failed to load template: " + err.message);
    }
    setLoadingTemplate(null);
  };

  const existingCodes = new Set(accounts.map(a => a.code).filter(Boolean));

  return (
    <div className="space-y-6">
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Chart of Accounts Templates</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Load a country-specific default chart of accounts</p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <Globe className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <p>
          <span className="font-semibold">Multi-country support.</span> Select a country template below to load its standard chart of accounts.
          Accounts that already exist (matched by code) will be skipped. You can customize or add accounts anytime from the Chart of Accounts page.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-xs">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {COA_TEMPLATES.map((tpl, i) => {
            const existingCount = tpl.coa.filter(a => existingCodes.has(a.code)).length;
            const newCount = tpl.coa.length - existingCount;
            const fullyLoaded = newCount === 0;
            return (
              <motion.div key={tpl.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className={`h-full ${fullyLoaded ? "border-emerald-200" : "border-border"}`}>
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-3xl">{tpl.flag}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold text-foreground">{tpl.label}{tpl.key === "international" && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Default</span>}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tpl.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs mb-4">
                      <span className="text-muted-foreground">{tpl.coa.length} accounts</span>
                      {fullyLoaded ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <Check className="w-3 h-3" /> Loaded
                        </span>
                      ) : existingCount > 0 ? (
                        <span className="text-amber-600 font-medium">{newCount} new · {existingCount} exist</span>
                      ) : (
                        <span className="text-blue-600 font-medium">{newCount} to load</span>
                      )}
                    </div>
                    <div className="mt-auto space-y-2">
                      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => downloadTemplateCsv(tpl)}>
                        <Download className="w-4 h-4" /> Download CSV
                      </Button>
                      <Button
                        size="sm"
                        variant={fullyLoaded ? "outline" : "default"}
                        className="w-full gap-1.5"
                        disabled={loadingTemplate !== null}
                        onClick={() => handleLoadTemplate(tpl)}
                      >
                        {loadingTemplate === tpl.key ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                        ) : fullyLoaded ? (
                          <>Already loaded</>
                        ) : (
                          <><Download className="w-4 h-4" /> Load Template</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3">
        <Link to="/accounting/chart-of-accounts">
          <Button variant="outline" size="sm" className="gap-1.5">
            <BookOpen className="w-4 h-4" /> Go to Chart of Accounts
          </Button>
        </Link>
      </div>
    </div>
  );
}