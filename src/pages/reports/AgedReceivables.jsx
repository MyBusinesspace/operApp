import React, { useState, useEffect, useMemo } from "react";
import BackButton from "@/components/reports/BackButton";
import { usePersistedState, useScrollRestore } from "@/lib/usePersistedState";
import { base44 } from "@/api/base44Client";
import { parseDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";
import RecordPaymentDialog from "@/components/reports/RecordPaymentDialog";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BUCKETS = ["Current", "1-30 days", "31-60 days", "61-90 days", "90+ days"];

function getBucket(daysOverdue) {
  if (daysOverdue <= 0) return 0;
  if (daysOverdue <= 30) return 1;
  if (daysOverdue <= 60) return 2;
  if (daysOverdue <= 90) return 3;
  return 4;
}

export default function AgedReceivables() {
  const [asOf, setAsOf] = usePersistedState("ar:asOf", format(new Date(), "yyyy-MM-dd"));
  const [invoices, setInvoices] = useState([]);
  const [priors, setPriors] = useState([]);
  const [loading, setLoading] = useState(true);
  useScrollRestore("ar", !loading);
  const [expanded, setExpanded] = usePersistedState("ar:expanded", null);
  const [paymentDoc, setPaymentDoc] = useState(null);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Invoice.filter({ status: { $in: ["Awaiting Payment", "Paid"] } }, "-issue_date", 9000);
    setInvoices(data);
    try { setPriors(await base44.entities.PriorPeriodSettlement.filter({ kind: "invoice" }, "payment_date", 9000)); } catch { setPriors([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const ref = parseDateOnly(asOf);
    const byContact = {};
    invoices.forEach(inv => {
      if (inv.issue_date && inv.issue_date > asOf) return; // as-at: ignore documents dated after the report date
      // As-at logic: for past dates use the payment dates (a document now Paid may have been open on that date)
      const todayStr = todayLocalISO();
      const pays = inv.payments || [];
      let paidAt = inv.amount_paid || 0;
      if (asOf < todayStr) {
        if (inv.status === "Paid" && !pays.some(p => (p.date || "") > asOf)) return;
        paidAt = pays.filter(p => (p.date || "") <= asOf).reduce((s, p) => s + (p.amount || 0), 0);
      } else if (inv.status !== "Awaiting Payment") {
        return;
      }
      const outstanding = ((inv.total || 0) - paidAt) / (inv.exchange_rate || 1);
      if (outstanding <= 0) return;
      const dueDate = inv.due_date ? parseDateOnly(inv.due_date) : ref;
      const daysOverdue = differenceInDays(ref, dueDate);
      const bucket = getBucket(daysOverdue);
      const key = inv.contact_id || "unknown";
      if (!byContact[key]) byContact[key] = { contact_id: key, name: inv.contact_name || "Unknown", buckets: [0, 0, 0, 0, 0], total: 0, items: [] };
      byContact[key].buckets[bucket] += outstanding;
      byContact[key].total += outstanding;
      byContact[key].items.push({ id: inv.id, number: inv.number, due_date: inv.due_date, outstanding, bucket, total: inv.total || 0, paid: paidAt, payments: inv.payments || [] });
    });
    // Settlements of documents issued before the migration cut-off: still open at the report date when paid after it.
    priors.forEach(pr => {
      if (!pr.payment_date || pr.payment_date <= asOf) return;
      const outstanding = pr.amount || 0;
      if (outstanding <= 0) return;
      const key = "pre-migration:" + (pr.contact_name || "Unknown");
      if (!byContact[key]) byContact[key] = { contact_id: key, name: (pr.contact_name || "Unknown") + " (pre-migration opening balance)", buckets: [0, 0, 0, 0, 0], total: 0, items: [] };
      byContact[key].buckets[4] += outstanding;
      byContact[key].total += outstanding;
      byContact[key].items.push({ id: pr.id, number: pr.reference || "Pre-migration document", due_date: null, outstanding, bucket: 4, total: outstanding, paid: 0, payments: [{ date: pr.payment_date, amount: pr.amount }] });
    });
    return Object.values(byContact).sort((a, b) => b.total - a.total);
  }, [invoices, priors, asOf]);

  const totals = BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0));
  const grandTotal = totals.reduce((s, t) => s + t, 0);

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Aged Receivables Summary</h1>
          <p className="text-xs text-muted-foreground">Outstanding customer invoices by age</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">As of</label>
        <DateRangeDropdown from={asOf} to={asOf} onChange={(_f, t) => setAsOf(t)} />
        <span className="ml-auto text-xs font-semibold text-foreground">Total Outstanding: <span className="text-destructive">{num(grandTotal)}</span></span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky left-0 bg-card z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Customer</th>
                {BUCKETS.map(b => <th key={b} className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{b}</th>)}
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-xs">No outstanding receivables</td></tr>
              ) : rows.map((row, i) => (
                <React.Fragment key={i}>
                <tr className="border-b border-border hover:bg-muted/20 cursor-pointer group" onClick={() => setExpanded(expanded === i ? null : i)}>
                  <td className="px-4 py-1.5 text-xs font-medium text-foreground flex items-center gap-1.5 sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded === i ? "rotate-90" : ""}`} />
                    {row.contact_id && row.contact_id !== "unknown"
                      ? <Link to={`/contacts/${row.contact_id}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{row.name}</Link>
                      : row.name}
                  </td>
                  {row.buckets.map((b, j) => (
                    <td key={j} className={`px-3 py-1.5 text-right text-xs font-mono tabular-nums ${b > 0 ? (j === 0 ? "text-foreground" : j === 1 ? "text-orange-500" : "text-destructive") : "text-muted-foreground/30"}`}>
                      {b > 0 ? num(b) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-1.5 text-right text-xs font-bold font-mono tabular-nums text-destructive">{num(row.total)}</td>
                </tr>
                {expanded === i && (
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="rounded-lg border border-border bg-card overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border">
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase">Invoice #</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase">Due Date</th>
                              <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase">Total</th>
                              <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase">Paid</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase">Payments (date, amount, reference)</th>
                              <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase">Outstanding</th>
                              <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase">Bucket</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.items.map((it, k) => (
                              <tr key={k} className="border-b border-border last:border-0 hover:bg-muted/30">
                                <td className="px-3 py-1.5">
                                  <Link to={`/sales/invoices/${it.id}/edit`} className="text-primary hover:underline font-mono">{it.number || "—"}</Link>
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">{it.due_date ? format(parseDateOnly(it.due_date), "d MMM yyyy") : "—"}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{num(it.total)}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{it.paid ? num(it.paid) : "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  {(it.payments || []).length === 0 ? "—" : it.payments.map((p, pi) => (
                                    <div key={pi} className="whitespace-nowrap">{p.date ? format(parseDateOnly(p.date), "d MMM yyyy") : "—"} · {num(p.amount)}{p.reference ? " · " + p.reference : ""}{p.bank_account_name ? " (" + p.bank_account_name + ")" : ""}</div>
                                  ))}
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                  <div className="flex items-center justify-end gap-2">
                                    <Link to={`/sales/invoices/${it.id}/edit`} className="text-primary hover:underline">{num(it.outstanding)}</Link>
                                    <Button size="sm" variant="outline" className="h-6 text-xs px-2 py-0"
                                      onClick={e => { e.stopPropagation(); setPaymentDoc(invoices.find(inv => inv.id === it.id)); }}>
                                      Record payment
                                    </Button>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground">{BUCKETS[it.bucket]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-border">
                <td className="px-4 py-2 text-xs font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">TOTALS</td>
                {totals.map((t, i) => (
                  <td key={i} className="px-3 py-2 text-right text-xs font-bold font-mono tabular-nums text-foreground">{t > 0 ? num(t) : "—"}</td>
                ))}
                <td className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-destructive">{num(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {paymentDoc && (
        <RecordPaymentDialog
          open={!!paymentDoc}
          docType="invoice"
          doc={paymentDoc}
          onClose={() => setPaymentDoc(null)}
          onSaved={() => { setPaymentDoc(null); load(); }}
        />
      )}
    </div>
  );
}