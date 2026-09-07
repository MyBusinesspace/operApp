import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";

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
  const [asOf, setAsOf] = useState(format(new Date(), "yyyy-MM-dd"));
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await base44.entities.Invoice.filter({ status: "Awaiting Payment" });
      setInvoices(data);
      setLoading(false);
    };
    load();
  }, []);

  const rows = useMemo(() => {
    const ref = new Date(asOf);
    const byContact = {};
    invoices.forEach(inv => {
      const outstanding = (inv.total || 0) - (inv.amount_paid || 0);
      if (outstanding <= 0) return;
      const dueDate = inv.due_date ? new Date(inv.due_date) : ref;
      const daysOverdue = differenceInDays(ref, dueDate);
      const bucket = getBucket(daysOverdue);
      const key = inv.contact_id || "unknown";
      if (!byContact[key]) byContact[key] = { name: inv.contact_name || "Unknown", buckets: [0, 0, 0, 0, 0], total: 0 };
      byContact[key].buckets[bucket] += outstanding;
      byContact[key].total += outstanding;
    });
    return Object.values(byContact).sort((a, b) => b.total - a.total);
  }, [invoices, asOf]);

  const totals = BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0));
  const grandTotal = totals.reduce((s, t) => s + t, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/reports"><Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Aged Receivables Summary</h1>
          <p className="text-xs text-muted-foreground">Outstanding customer invoices by age</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">As of</label>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
        <span className="ml-auto text-sm font-semibold text-foreground">Total Outstanding: <span className="text-destructive">{num(grandTotal)}</span></span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</th>
                {BUCKETS.map(b => <th key={b} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{b}</th>)}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">No outstanding receivables</td></tr>
              ) : rows.map((row, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{row.name}</td>
                  {row.buckets.map((b, j) => (
                    <td key={j} className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${b > 0 ? (j === 0 ? "text-foreground" : j === 1 ? "text-orange-500" : "text-destructive") : "text-muted-foreground/30"}`}>
                      {b > 0 ? num(b) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right text-sm font-bold font-mono tabular-nums text-destructive">{num(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t-2 border-border">
                <td className="px-4 py-3 text-sm font-bold text-foreground">TOTALS</td>
                {totals.map((t, i) => (
                  <td key={i} className="px-3 py-3 text-right text-sm font-bold font-mono tabular-nums text-foreground">{t > 0 ? num(t) : "—"}</td>
                ))}
                <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-destructive">{num(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}