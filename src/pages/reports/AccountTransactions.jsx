import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth } from "date-fns";

const fmt = (n) =>
  n === 0 ? "—" :
  Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AccountTransactions() {
  const [searchParams] = useSearchParams();
  const today = new Date();

  const [from, setFrom] = useState(searchParams.get("from") || format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(searchParams.get("to") || format(endOfMonth(today), "yyyy-MM-dd"));
  const [selectedAccountId, setSelectedAccountId] = useState(searchParams.get("accountId") || "");

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [je, accs, orgs] = await Promise.all([
        base44.entities.JournalEntry.filter({ status: "Posted" }),
        base44.entities.ChartOfAccount.filter({ status: "Active" }),
        base44.entities.Organization.list("-created_date", 10).catch(() => []),
      ]);
      setEntries(je);
      setAccounts(accs);
      setOrg(orgs[0] || null);
      setLoading(false);
    };
    load();
  }, []);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // All journal lines for the selected account within date range
  const rows = useMemo(() => {
    if (!selectedAccountId) return [];
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59);

    const result = [];
    entries.forEach(entry => {
      const entryDate = new Date(entry.date);
      if (entryDate < fromDate || entryDate > toDate) return;
      (entry.lines || []).forEach(line => {
        if (line.account_id !== selectedAccountId) return;
        result.push({
          date: entry.date,
          source: entry.source_type || "Manual",
          source_number: entry.source_number || entry.number,
          narration: entry.narration,
          description: line.description,
          contact: entry.contact_name,
          reference: entry.reference,
          currency: entry.currency || "AED",
          debit: line.debit || 0,
          credit: line.credit || 0,
          journal_id: entry.id,
        });
      });
    });
    result.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Compute running balance
    let balance = 0;
    return result.map(r => {
      balance += r.debit - r.credit;
      return { ...r, running_balance: balance };
    });
  }, [entries, selectedAccountId, from, to]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="p-6 space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/reports">
          <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Account Transactions</h1>
          {org && <p className="text-xs text-muted-foreground">{org.name}</p>}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Account</label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background min-w-56"
          >
            <option value="">— Select account —</option>
            {[...accounts]
              .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
              .map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
          <span className="text-muted-foreground text-xs">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : !selectedAccountId ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Select an account to view transactions</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          {/* Report title */}
          <div className="px-5 py-4 border-b border-border bg-background">
            <p className="text-lg font-bold text-foreground">{selectedAccount?.name} Transactions</p>
            {org && <p className="text-sm text-muted-foreground">{org.name}</p>}
            <p className="text-sm text-muted-foreground">
              For the period {format(new Date(from), "d MMM yyyy")} to {format(new Date(to), "d MMM yyyy")}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Source</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden md:table-cell">Reference</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Credit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground text-sm">
                    No transactions found for this account in the selected period.
                  </td>
                </tr>
              ) : (
                <>
                  {/* Group label */}
                  <tr className="bg-muted/20 border-b border-border">
                    <td colSpan={7} className="px-4 py-2 text-xs font-bold text-foreground">
                      {selectedAccount?.code} – {selectedAccount?.name}
                    </td>
                  </tr>

                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="font-medium text-foreground">{row.source}</span>
                        {row.source_number && (
                          <div className="text-primary/80 text-xs">{row.source_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-foreground leading-snug">{row.description || row.narration}</p>
                        {row.contact && <p className="text-xs text-muted-foreground">{row.contact}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{row.reference || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                        {row.debit > 0 ? <span className="text-foreground font-medium">{fmt(row.debit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                        {row.credit > 0 ? <span className="text-success font-medium">{fmt(row.credit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                        <span className={`font-semibold ${row.running_balance < 0 ? "text-destructive" : "text-foreground"}`}>
                          {row.running_balance < 0
                            ? `(${fmt(Math.abs(row.running_balance))})`
                            : fmt(row.running_balance)}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                    <td colSpan={4} className="px-4 py-2.5 text-sm font-bold text-foreground">
                      Total {selectedAccount?.name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-sm font-bold text-foreground">{fmt(totalDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-sm font-bold text-success">{fmt(totalCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-sm font-bold">
                      <span className={rows[rows.length - 1]?.running_balance < 0 ? "text-destructive" : "text-foreground"}>
                        {rows.length > 0
                          ? rows[rows.length - 1].running_balance < 0
                            ? `(${fmt(Math.abs(rows[rows.length - 1].running_balance))})`
                            : fmt(rows[rows.length - 1].running_balance)
                          : "—"}
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}