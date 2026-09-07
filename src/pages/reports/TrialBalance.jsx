import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { format, startOfYear } from "date-fns";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TrialBalance() {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfYear(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [je, accs] = await Promise.all([
        base44.entities.JournalEntry.filter({ status: "Posted" }),
        base44.entities.ChartOfAccount.filter({ status: "Active" }),
      ]);
      setEntries(je);
      setAccounts(accs);
      setLoading(false);
    };
    load();
  }, []);

  const rows = useMemo(() => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59);

    const inRange = entries.filter(e => {
      const d = new Date(e.date);
      return d >= fromDate && d <= toDate;
    });

    const totals = {};
    inRange.forEach(entry => {
      (entry.lines || []).forEach(line => {
        if (!line.account_id) return;
        if (!totals[line.account_id]) totals[line.account_id] = { debit: 0, credit: 0 };
        totals[line.account_id].debit += line.debit || 0;
        totals[line.account_id].credit += line.credit || 0;
      });
    });

    return accounts
      .map(a => ({ ...a, debit: totals[a.id]?.debit || 0, credit: totals[a.id]?.credit || 0 }))
      .filter(r => r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  }, [entries, accounts, from, to]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/reports"><Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Trial Balance</h1>
          <p className="text-xs text-muted-foreground">All account debits and credits for the period</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
        </div>
        {!loading && (
          <span className={`ml-auto text-xs font-medium px-2 py-1 rounded-full ${balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {balanced ? "✓ Balanced" : "⚠ Unbalanced"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">No posted entries in this period</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{row.code}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{row.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.type}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-blue-600">{row.debit > 0 ? num(row.debit) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-mono tabular-nums text-emerald-600">{row.credit > 0 ? num(row.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t-2 border-border">
                <td colSpan={3} className="px-4 py-3 text-sm font-bold text-foreground">TOTALS</td>
                <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-blue-600">{num(totalDebit)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-emerald-600">{num(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}