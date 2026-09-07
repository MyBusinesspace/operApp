import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Award, Calendar, Info, Sparkles, CheckCircle2, XCircle, History, Pencil, Check, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HistoricalPaymentModal from "./HistoricalPaymentModal";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits: 2 }).format(n) + " AED";
}

export default function EmployeeGratuityTab({ employee, employeeId }) {
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [historicalPayments, setHistoricalPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistorical, setShowHistorical] = useState(false);
  const [editingTotal, setEditingTotal] = useState(false);
  const [editTotal, setEditTotal] = useState("");
  const [savingTotal, setSavingTotal] = useState(false);

  const load = async () => {
    setLoading(true);
    const [profiles, settingsList, allEntries, histPayments] = await Promise.all([
      base44.entities.EmployeePayrollProfile.filter({ employee_id: employeeId }, "-created_date", 1),
      base44.entities.PayrollSettings.list(),
      base44.entities.PayrollEntry.filter({ employee_id: employeeId }, "-created_date", 50),
      base44.entities.HistoricalPayment.filter({ employee_id: employeeId, payment_type: "gratuity" }, "-year", 50),
    ]);
    setProfile(profiles.length > 0 ? profiles[0] : null);
    setSettings(Array.isArray(settingsList) && settingsList.length > 0 ? settingsList[0] : {});
    setEntries(Array.isArray(allEntries) ? allEntries : []);
    setHistoricalPayments(Array.isArray(histPayments) ? histPayments : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;

  const gratuityEnabled = settings?.gratuity_enabled !== false;
  const gratuityYearsThreshold = settings?.gratuity_years_threshold ?? 1;
  const gratuityDaysPerYear = settings?.gratuity_days_per_year ?? 21;

  // Years of service (fractional for accumulation, floored-1-decimal for display)
  let yearsOfServiceRaw = 0;
  if (employee?.hire_date) {
    const now = new Date();
    const hire = new Date(employee.hire_date);
    yearsOfServiceRaw = (now - hire) / (365.25 * 24 * 3600 * 1000);
  }
  const yearsOfService = Math.floor(yearsOfServiceRaw * 10) / 10;
  const eligible = gratuityEnabled && yearsOfServiceRaw >= gratuityYearsThreshold;

  const basicSalary = profile?.basic_salary || 0;
  const gratuityDailyRate = basicSalary / 30;
  const annualGratuity = Math.round(gratuityDailyRate * gratuityDaysPerYear * 100) / 100;
  // Accumulated gratuity from hire date, proportional to completed service
  const accumulatedGratuity = Math.round(annualGratuity * yearsOfServiceRaw * 100) / 100;

  const lastGratuityYear = profile?.last_gratuity_year ?? null;

  // Gratuity payment history — PayrollEntry line items + historical payments
  const gratuityHistory = [];
  for (const e of entries) {
    for (const li of (e.line_items || [])) {
      if (li.component_code === "GRT" || /gratuity/i.test(li.component_name || "")) {
        gratuityHistory.push({
          id: e.id + "_" + (li.component_code || li.component_name),
          source: "payroll",
          pay_period_name: e.pay_period_name,
          amount: li.amount,
          notes: li.notes,
          status: e.status,
          year: null,
        });
      }
    }
  }
  for (const h of historicalPayments) {
    gratuityHistory.push({
      id: "hist_" + h.id,
      source: "historical",
      pay_period_name: `Historical · ${h.year}`,
      amount: h.amount,
      notes: h.notes,
      status: "paid",
      year: h.year,
    });
  }
  gratuityHistory.sort((a, b) => (b.year || 0) - (a.year || 0));

  const paidTotal = gratuityHistory.reduce((s, h) => s + (h.amount || 0), 0);
  const computedTotal = Math.round((accumulatedGratuity - paidTotal) * 100) / 100;
  const totalOverride = profile?.gratuity_total_override;
  const totalGratuity = totalOverride != null ? totalOverride : computedTotal;

  const startEditTotal = () => {
    setEditTotal(totalOverride != null ? String(totalOverride) : String(computedTotal));
    setEditingTotal(true);
  };

  const saveTotal = async () => {
    setSavingTotal(true);
    try {
      const val = editTotal === "" || editTotal == null ? null : Number(editTotal);
      if (profile) {
        await base44.entities.EmployeePayrollProfile.update(profile.id, {
          gratuity_total_override: val,
        });
      }
      setEditingTotal(false);
      load();
    } catch (e) {
      alert("Failed to save: " + e.message);
    }
    setSavingTotal(false);
  };

  return (
    <div className="space-y-4">
      {!profile ? (
        <div className="bg-muted/30 rounded-xl p-5 text-center">
          <Award className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No payroll profile set up for this employee. Configure a salary profile to track gratuity eligibility.
          </p>
        </div>
      ) : (
        <>
          {/* Eligibility + Summary — compact */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Eligibility */}
            <div className="bg-muted/30 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                <Award className="w-3.5 h-3.5 inline mr-1.5" />
                Eligibility
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Years of Service</p>
                  <p className="text-base font-bold text-foreground leading-tight">{yearsOfService || 0} yrs</p>
                  <p className="text-[10px] text-muted-foreground/70">Hired {fmtDate(employee?.hire_date)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Threshold</p>
                  <p className="text-base font-bold text-foreground leading-tight">{gratuityYearsThreshold} yr(s)</p>
                  <p className="text-[10px] text-muted-foreground/70">Min. service required</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Status</p>
                  {gratuityEnabled ? (
                    eligible ? (
                      <Badge className="bg-emerald-100 text-emerald-700 gap-1 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" /> Eligible
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 gap-1 text-[10px]">
                        <XCircle className="w-3 h-3" /> Not yet
                      </Badge>
                    )
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600 text-[10px]">Disabled</Badge>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {gratuityEnabled
                      ? eligible ? "Pays in vacation month" : `${(gratuityYearsThreshold - yearsOfServiceRaw).toFixed(1)} yr(s) to go`
                      : "Gratuity off in settings"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Last Paid Year</p>
                  <p className="text-base font-bold text-foreground leading-tight">{lastGratuityYear || "—"}</p>
                  <p className="text-[10px] text-muted-foreground/70">Once per calendar year</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
                  Gratuity Summary
                </h3>
                {editingTotal ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingTotal(false)} disabled={savingTotal}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="default" size="sm" className="h-6 w-6 p-0" onClick={saveTotal} disabled={savingTotal}>
                      {savingTotal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={startEditTotal}>
                    <Pencil className="w-3 h-3" /> Edit Total
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Accumulated</p>
                  <p className="text-lg font-bold text-foreground leading-tight">{fmtMoney(accumulatedGratuity)}</p>
                  <p className="text-[10px] text-muted-foreground/70">Since hire, from basic salary</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Paid to date</p>
                  <p className="text-lg font-bold text-orange-600 leading-tight">{fmtMoney(paidTotal)}</p>
                  <p className="text-[10px] text-muted-foreground/70">{gratuityHistory.length} payment(s)</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Total Gratuity {totalOverride != null && !editingTotal && <span className="text-amber-600">(manual)</span>}
                  </p>
                  {editingTotal ? (
                    <Input
                      type="number"
                      value={editTotal}
                      onChange={e => setEditTotal(e.target.value)}
                      className="h-8 text-sm font-bold px-1.5 py-1"
                      placeholder={String(computedTotal)}
                      autoFocus
                    />
                  ) : (
                    <>
                      <p className={`text-lg font-bold leading-tight ${totalGratuity < 0 ? "text-red-600" : "text-primary"}`}>
                        {fmtMoney(totalGratuity)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">Outstanding balance</p>
                    </>
                  )}
                </div>
              </div>

              {/* Demoted annual estimate */}
              <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Est. annual: <span className="font-semibold text-foreground/80">{fmtMoney(annualGratuity)}</span>
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span>Basic {fmtMoney(basicSalary)} ÷ 30 = {fmtMoney(gratuityDailyRate)}/day × {gratuityDaysPerYear} days</span>
              </div>

              <div className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground/80 bg-muted/40 rounded-md p-2">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <p>
                  Accumulated = annual estimate × years of service. Total = accumulated − payments in history.
                  Triggered automatically when an approved <span className="font-medium">vacation</span> falls in a pay period (≥ {gratuityYearsThreshold}-yr threshold), once per calendar year.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Payment history — always shown, even without a profile */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 inline mr-1.5" />
            Gratuity Payment History
          </h3>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setShowHistorical(true)}>
            <History className="w-3.5 h-3.5" /> Record Historical
          </Button>
        </div>
        {gratuityHistory.length === 0 ? (
          <div className="py-10 text-center">
            <Award className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No gratuity paid yet for this employee.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Period / Year</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Notes</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {gratuityHistory.map(h => (
                  <tr key={h.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-medium">
                      {h.pay_period_name}
                      {h.source === "historical" && (
                        <Badge variant="outline" className="ml-2 text-[9px] text-amber-600 border-amber-300">historical</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">{fmtMoney(h.amount)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{h.notes || "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="secondary" className="text-[10px] capitalize">{h.status}</Badge>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="py-2.5 px-3">Total Paid</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700">{fmtMoney(paidTotal)}</td>
                  <td className="py-2.5 px-3" colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <HistoricalPaymentModal
        open={showHistorical}
        employeeId={employeeId}
        employeeName={employee?.full_name}
        paymentType="gratuity"
        onClose={() => setShowHistorical(false)}
        onSaved={load}
      />
    </div>
  );
}