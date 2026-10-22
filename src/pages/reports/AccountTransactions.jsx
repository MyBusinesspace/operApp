import { useState, useEffect, useMemo, Fragment } from "react";
import BackButton from "@/components/reports/BackButton";
import { usePersistedState, useScrollRestore } from "@/lib/usePersistedState";
import { base44 } from "@/api/base44Client";
import { compareDateOnly, parseDateOnly } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth } from "date-fns";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";

const fmt = (n) =>
  n === 0 ? "—" :
  Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Page through every journal in range (the old single call silently stopped at 5,000).
async function fetchAllJournals(query) {
  const items = [];
  let skip = 0;
  for (;;) {
    const pg = await base44.entities.JournalEntry.filter(query, "number", 500, skip);
    const its = pg?.items || (Array.isArray(pg) ? pg : []);
    items.push(...its);
    if (its.length < 500) break;
    skip += its.length;
  }
  return { items };
}

export default function AccountTransactions() {
  const [searchParams] = useSearchParams();
  const today = new Date();

  const [from, setFrom] = usePersistedState("at:from", searchParams.get("from") || format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = usePersistedState("at:to", searchParams.get("to") || format(endOfMonth(today), "yyyy-MM-dd"));
  const [selectedAccountId, setSelectedAccountId] = usePersistedState("at:selectedAccountId", searchParams.get("accountId") || "");

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  useScrollRestore("at", !loading);
  const [expandedJournal, setExpandedJournal] = usePersistedState("at:expandedJournal", null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Plain string bound on a date-only field — no timezone conversion involved
      const toDate = `${to}T23:59:59.999`;
      const [jePage, accsPage, orgs] = await Promise.all([
        fetchAllJournals({ status: "Posted", date: { $gte: from, $lte: toDate } }).catch(() => ({ items: [] })),
        base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 }).catch(() => ({ items: [] })),
        base44.entities.Organization.list("-created_date", 10).catch(() => []),
      ]);
      setEntries(jePage?.items || []);
      setAccounts(accsPage?.items || []);
      setOrg(orgs[0] || null);
      setLoading(false);
    };
    load();
  }, [from, to]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // All journal lines for the selected account within date range
  const rows = useMemo(() => {
    if (!selectedAccountId) return [];
    const result = [];
    entries.forEach(entry => {
      (entry.lines || []).forEach(line => {
        if (line.account_id !== selectedAccountId) return;
        result.push({
          date: entry.date,
          source: entry.source_type || "Manual",
          source_type: entry.source_type,
          source_id: entry.source_id,
          source_number: entry.source_number || entry.number,
          entry_type: entry.entry_type,
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
    result.sort((a, b) => compareDateOnly(a.date, b.date));

    // Compute running balance
    let balance = 0;
    return result.map(r => {
      balance += r.debit - r.credit;
      return { ...r, running_balance: balance };
    });
  }, [entries, selectedAccountId, from, to]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  const SOURCE_ROUTES = {
    Invoice: (id) => `/sales/invoices/${id}/edit`,
    Bill: (id) => `/purchasing/bills/${id}/edit`,
    CreditNote: (id) => `/sales/credit-notes/${id}/edit`,
  };

  const entryById = useMemo(() => {
    const m = {};
    entries.forEach(e => { m[e.id] = e; });
    return m;
  }, [entries]);

  const firstRowByJournal = useMemo(() => {
    const m = {};
    rows.forEach((r, i) => { if (!(r.journal_id in m)) m[r.journal_id] = i; });
    return m;
  }, [rows]);

  return (
    <div className="p-6 space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton />
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
            className="h-8 text-xs border border-input rounded-md px-2 bg-background min-w-56"
          >
            <option value="">— Select account —</option>
            {[...accounts]
              .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
              .map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
          </select>
        </div>
        <DateRangeDropdown from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>
      ) : !selectedAccountId ? (
        <div className="py-20 text-center text-muted-foreground text-xs">Select an account to view transactions</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          {/* Report title */}
          <div className="px-5 py-4 border-b border-border bg-background">
            <p className="text-lg font-bold text-foreground">{selectedAccount?.name} Transactions</p>
            {org && <p className="text-xs text-muted-foreground">{org.name}</p>}
            <p className="text-xs text-muted-foreground">
              For the period {format(parseDateOnly(from), "d MMM yyyy")} to {format(parseDateOnly(to), "d MMM yyyy")}
            </p>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24 sticky left-0 bg-card z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Date</th>
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
                  <td colSpan={7} className="py-16 text-center text-muted-foreground text-xs">
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

                  {rows.map((row, idx) => {
                    const routeFn = row.source_id && SOURCE_ROUTES[row.source_type];
                    const route = routeFn ? routeFn(row.source_id) : null;
                    const isExpanded = expandedJournal === row.journal_id;
                    const showExpansion = isExpanded && idx === firstRowByJournal[row.journal_id];
                    const fullEntry = showExpansion ? entryById[row.journal_id] : null;
                    return (
                      <Fragment key={idx}>
                        <tr
                          className="border-b border-border hover:bg-muted/20 transition-colors group cursor-pointer"
                          onClick={() => setExpandedJournal(isExpanded ? null : row.journal_id)}
                        >
                          <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                            <div className="flex items-center gap-1">
                              {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                              {row.date}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {route ? (
                              <div className="flex flex-col">
                                <Link to={route} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                                  {row.source_number || row.source}
                                </Link>
                                {row.contact && <span className="text-xs text-muted-foreground">{row.contact}</span>}
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{row.source}</span>
                                {row.source_number && row.source_number !== row.source && (
                                  <span className="text-xs text-muted-foreground">{row.source_number}</span>
                                )}
                                <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground w-fit">{row.reference && String(row.reference).startsWith("XERO-") ? "Xero journal" : "Manual journal"}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-xs text-foreground leading-snug">{row.description || row.narration}</p>
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
                        {showExpansion && fullEntry && (
                          <tr className="bg-muted/10">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="rounded-lg border border-border bg-card p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-foreground">{fullEntry.number} — {fullEntry.narration}</span>
                                  <span className="text-xs text-muted-foreground">{fullEntry.date}</span>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1 font-medium">Account</th>
                                      <th className="text-left py-1 font-medium">Description</th>
                                      <th className="text-right py-1 font-medium">Debit</th>
                                      <th className="text-right py-1 font-medium">Credit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(fullEntry.lines || []).map((l, i) => (
                                      <tr key={i} className="border-t border-border/50">
                                        <td className="py-1 text-foreground whitespace-nowrap">{l.account_code ? `${l.account_code} — ` : ""}{l.account_name || ""}</td>
                                        <td className="py-1 text-muted-foreground">{l.description || "—"}</td>
                                        <td className="py-1 text-right tabular-nums font-mono">{l.debit > 0 ? fmt(l.debit) : "—"}</td>
                                        <td className="py-1 text-right tabular-nums font-mono">{l.credit > 0 ? fmt(l.credit) : "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}

                  {/* Totals row */}
                  <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-border font-semibold">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Total {selectedAccount?.name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs font-bold text-foreground">{fmt(totalDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs font-bold text-success">{fmt(totalCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs font-bold">
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