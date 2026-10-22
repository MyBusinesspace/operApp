import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { compareDateOnly, formatDateOnly } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Edit2, Archive, Info } from "lucide-react";
import { toast } from "sonner";
import { formatBalance } from "@/lib/accountBalance";
import AccountFormModal from "@/components/accounting/AccountFormModal";
import JournalEntryFormModal from "@/components/accounting/JournalEntryFormModal";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";

const fmt = (n) =>
  n === 0 ? "0.00" :
  Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AccountDetail() {
  const { accountId } = useParams();
  const { can } = usePermissionsMatrix();
  const [account, setAccount] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [ytdBalance, setYtdBalance] = useState(null);
  const [bankTxnByJournal, setBankTxnByJournal] = useState({}); // journal_id → bank_transaction_id

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const acc = await base44.entities.ChartOfAccount.get(accountId);
      setAccount(acc);
      // Targeted query: only fetch journal entries that contain a line for THIS account.
      // Uses MongoDB dot-notation on the lines array — far faster than loading all 59k+ entries.
      const allEntries = [];
      let cursor = undefined;
      let hasMore = true;
      while (hasMore) {
        const page = await base44.entities.JournalEntry.filter(
          { status: "Posted", "lines.account_id": accountId },
          { sort: "date", limit: 1000, cursor, fields: ["date", "narration", "source_type", "source_id", "source_number", "number", "reference", "contact_name", "lines", "currency"] }
        );
        allEntries.push(...(page.items || []));
        hasMore = page.has_more;
        cursor = page.next_cursor;
      }
      setEntries(allEntries);
      // Resolve bank transactions linked to these journal entries (for click-through)
      if (allEntries.length > 0) {
        try {
          const entryIds = allEntries.map(e => e.id);
          const txnPage = await base44.entities.BankTransaction.filter(
            { journal_entry_id: { $in: entryIds } },
            { limit: 1000, fields: ["id", "journal_entry_id"] }
          );
          const txnItems = txnPage.items || txnPage;
          const map = {};
          txnItems.forEach(t => { if (t.journal_entry_id) map[t.journal_entry_id] = t.id; });
          setBankTxnByJournal(map);
        } catch { setBankTxnByJournal({}); }
      } else {
        setBankTxnByJournal({});
      }
      // Compute YTD from the loaded transactions (avoids the slow getAccountBalances call)
      const isDebitNormal = ["Assets", "Expenses"].includes(acc.category);
      // If an OpeningBalance journal is among the loaded entries, the opening
      // balance is already in the movement — don't add it again. Otherwise fall
      // back to the chart opening_balance.
      const hasOpeningJournal = allEntries.some(e => e.source_type === "OpeningBalance");
      const netMovement = allEntries.reduce((sum, e) => {
        const lineMovement = (e.lines || [])
          .filter(l => l.account_id === accountId)
          .reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
        return sum + lineMovement;
      }, 0);
      const movement = isDebitNormal ? netMovement : -netMovement;
      const opening = hasOpeningJournal ? 0 : (acc.opening_balance || 0);
      setYtdBalance(opening + movement);
    } catch (err) {
      toast.error("Failed to load account");
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  // Extract all lines for this account, sorted by date
  const rows = useMemo(() => {
    if (!account) return [];
    const result = [];
    entries.forEach(entry => {
      (entry.lines || []).forEach(line => {
        if (line.account_id !== accountId) return;
        result.push({
          date: entry.date,
          source: entry.source_type || "Manual",
          source_id: entry.source_id || null,
          source_number: entry.source_number || null,
          journal_number: entry.number || null,
          narration: entry.narration,
          description: line.description,
          contact: entry.contact_name,
          reference: entry.reference,
          debit: line.debit || 0,
          credit: line.credit || 0,
          journal_id: entry.id,
          bank_transaction_id: bankTxnByJournal[entry.id] || null,
        });
      });
    });
    result.sort((a, b) => compareDateOnly(a.date, b.date));
    return result;
  }, [entries, account, accountId]);

  const navigate = useNavigate();

  // Xero-style: link each transaction to its source document
  const getTxLink = (row) => {
    if (row.bank_transaction_id) return `/accounting/banks/transactions/${row.bank_transaction_id}`;
    if (!row.source_id) return null;
    switch (row.source) {
      case "Invoice": return `/sales/invoices/${row.source_id}/edit`;
      case "Bill": return `/purchasing/bills/${row.source_id}/edit`;
      case "PurchaseOrder": return `/purchasing/purchase-orders/${row.source_id}/edit`;
      case "CreditNote": return `/sales/credit-notes/${row.source_id}/edit`;
      case "PettyCash": return `/petty-cash`;
      case "Payroll": return `/payroll`;
      default: return null; // Manual journal — no detail page
    }
  };

  const pagination = useTablePagination(rows, 25);
  const { pageItems } = pagination;

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  const handleArchive = async () => {
    if (!account) return;
    if (account.is_system) { toast.error("System accounts cannot be archived."); return; }
    await base44.entities.ChartOfAccount.update(account.id, { status: account.status === "Active" ? "Archived" : "Active" });
    toast.success(account.status === "Active" ? "Account archived" : "Account restored");
    load();
  };

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>;
  }

  if (!account) {
    return <div className="py-20 text-center text-muted-foreground text-xs">Account not found.</div>;
  }

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/accounting/chart-of-accounts" className="hover:text-foreground transition-colors">
          Chart of Accounts
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium truncate">{account.name}</span>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account: {account.name}</h1>
        {account.description && (
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">{account.description}</p>
        )}
      </div>

      {/* Account meta-info box */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">What's this?</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/20 border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Code</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">On Dashboard</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Payments Enabled</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">YTD</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2.5 font-mono text-foreground">{account.code || "—"}</td>
                <td className="px-4 py-2.5 text-foreground">{account.type}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{account.tax_rate_name || "Tax Exempt (0%)"}</td>
                <td className="px-4 py-2.5">
                  <span className={account.show_on_dashboard ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                    {account.show_on_dashboard ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell">
                  <span className={account.enable_payments ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                    {account.enable_payments ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-mono font-semibold">
                  <span className={(ytdBalance ?? 0) < 0 ? "text-destructive" : "text-foreground"}>
                    {formatBalance(ytdBalance ?? 0)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Action bar */}
        <div className="px-4 py-2.5 bg-muted/30 border-t border-border flex items-center gap-2">
          {can("chart_of_accounts", "can_edit") && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
              <Edit2 className="w-3.5 h-3.5" /> Edit Account
            </Button>
          )}
          {can("chart_of_accounts", "can_edit") && !account.is_system && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleArchive}>
              <Archive className="w-3.5 h-3.5" /> {account.status === "Active" ? "Archive" : "Restore"}
            </Button>
          )}
          <div className="flex-1" />
          <Badge variant="outline" className={`text-xs ${account.status === "Active" ? "text-green-600 border-green-200" : "text-muted-foreground"}`}>
            {account.status}
          </Badge>
        </div>
      </div>

      {/* Transactions table */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">Transactions</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transaction</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Credit</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-muted-foreground text-xs">
                    No transactions found for this account.
                  </td>
                </tr>
              ) : (
                pageItems.map((row, idx) => {
                  const link = getTxLink(row);
                  const CellLink = ({ children, className }) => link
                    ? <Link to={link} className={`${className} text-primary hover:underline`} onClick={e => e.stopPropagation()}>{children}</Link>
                    : <span className={className}>{children}</span>;
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-border transition-colors ${link ? "hover:bg-primary/5 cursor-pointer" : "hover:bg-muted/20"}`}
                      onClick={link ? () => navigate(link) : undefined}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                        {row.date ? formatDateOnly(row.date) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <CellLink className="text-xs leading-snug">{row.description || row.narration}</CellLink>
                        {row.contact && <p className="text-xs text-muted-foreground">{row.contact}</p>}
                        <div className="flex items-center gap-2 flex-wrap">
                          {row.source_number && (
                            <CellLink className="text-xs">{row.source_number}</CellLink>
                          )}
                          {row.journal_number && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setViewingEntry(entries.find(en => en.id === row.journal_id) || null); }}
                              className="text-xs text-primary hover:underline font-mono"
                            >
                              {row.journal_number}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                        {row.debit > 0 ? <span className="text-foreground font-medium">{fmt(row.debit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                        {row.credit > 0 ? <span className="text-success font-medium">{fmt(row.credit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
              {/* Totals row */}
              {rows.length > 0 && (
                <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-foreground">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs font-bold text-foreground">{fmt(totalDebit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs font-bold text-success">{fmt(totalCredit)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <DataTablePagination pagination={pagination} />
        </div>
      </div>

      {showForm && (
        <AccountFormModal
          open={showForm}
          account={account}
          accounts={[account]}
          taxRates={[]}
          onSave={() => { setShowForm(false); load(); }}
          onClose={() => setShowForm(false)}
        />
      )}

      {viewingEntry && (
        <JournalEntryFormModal
          open={!!viewingEntry}
          entry={viewingEntry}
          onClose={() => setViewingEntry(null)}
          onSave={() => setViewingEntry(null)}
        />
      )}
    </div>
  );
}