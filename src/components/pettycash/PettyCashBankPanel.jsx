import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Landmark, Loader2, Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";

const PAGE = 5000;
const fmt = (n) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function signedAmount(t, accountId) {
  const a = Number(t.amount) || 0;
  if (t.type === "Receive Money") return a;
  if (t.type === "Spend Money") return -a;
  if (t.transfer_to_account_id) return t.bank_account_id === accountId ? -a : a;
  return t.bank_account_id === accountId ? -a : a;
}

async function loadTransactions(accountId) {
  const out = [];
  for (const field of ["bank_account_id", "transfer_to_account_id"]) {
    let skip = 0;
    while (true) {
      const rows = await base44.entities.BankTransaction.filter({ [field]: accountId }, "-date", PAGE, skip);
      out.push(...rows);
      if (rows.length < PAGE) break;
      skip += PAGE;
    }
  }
  const seen = new Set();
  return out.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
}

/**
 * Petty cash that exists as bank accounts (e.g. imported from Xero: "Main Petty cash").
 * Single coherent source next to the employee wallets, with explicit errors / empty state.
 */
export default function PettyCashBankPanel() {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [ledger, setLedger] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.BankAccount.list("name", 500);
        const petty = all.filter((b) => /petty/i.test(b.name || ""));
        setAccounts(petty);
        if (petty.length) setSelected(petty[0]);
      } catch (e) {
        setError(e?.message || "Could not load petty cash bank accounts.");
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingTx(true);
    loadTransactions(selected.id)
      .then((rows) => { if (!cancelled) { setTxs(rows); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e?.message || "Could not load movements."); })
      .finally(() => { if (!cancelled) setLoadingTx(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  useEffect(() => {
    setLedger(null);
    if (!selected?.chart_account_id) return;
    let cancelled = false;
    base44.functions.invoke("getAccountBalances", { periods: [{ from: "2000-01-01", to: "2099-12-31" }] })
      .then((res) => {
        const data = res?.data || res;
        const b = data?.periodBalances?.[0]?.balances || {};
        const k = Object.keys(b).find((x) => x === selected.chart_account_id);
        if (!cancelled) setLedger(k ? Number(b[k].balance) || 0 : 0);
      })
      .catch(() => { if (!cancelled) setLedger(undefined); });
    return () => { cancelled = true; };
  }, [selected?.chart_account_id]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return txs
      .map((t) => ({ ...t, signed: signedAmount(t, selected?.id) }))
      .filter((t) => !s || [t.description, t.reference, t.contact_name, t.type, t.date].filter(Boolean).join(" ").toLowerCase().includes(s))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [txs, search, selected?.id]);

  const pagination = useTablePagination(rows);
  const totalIn = txs.reduce((s, t) => { const v = signedAmount(t, selected?.id); return v > 0 ? s + v : s; }, 0);
  const totalOut = txs.reduce((s, t) => { const v = signedAmount(t, selected?.id); return v < 0 ? s - v : s; }, 0);
  const opening = Number(selected?.opening_balance) || 0;
  const movementBalance = opening + totalIn - totalOut;

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading petty cash accounts...</div>;
  }

  return (
    <div className="px-6 pb-6">
      <div className="flex items-center gap-2 mb-3">
        <Landmark className="w-4 h-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-foreground">Petty cash accounts (bank movements)</h2>
      </div>
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> <span>{error}</span>
        </div>
      )}
      {accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No bank account with "petty" in its name was found. Employee wallets above only show entries created in this screen.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => setSelected(a)}
                className={`px-3 py-1.5 rounded-lg border text-xs ${selected?.id === a.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:bg-muted/40"}`}>
                {a.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="rounded-xl bg-muted/40 border border-border px-4 py-3"><p className="text-xs text-muted-foreground mb-1">Ledger balance</p><p className="text-sm font-bold tabular-nums">{ledger === null ? "Loading..." : ledger === undefined ? "Unavailable" : `${selected?.currency || "AED"} ${fmt(ledger)}`}</p></div>
            <div className="rounded-xl bg-muted/40 border border-border px-4 py-3"><p className="text-xs text-muted-foreground mb-1">Imported money in</p><p className="text-sm font-bold text-emerald-600 tabular-nums">{fmt(totalIn)}</p></div>
            <div className="rounded-xl bg-muted/40 border border-border px-4 py-3"><p className="text-xs text-muted-foreground mb-1">Imported money out</p><p className="text-sm font-bold text-red-600 tabular-nums">{fmt(totalOut)}</p></div>
            <div className="rounded-xl bg-muted/40 border border-border px-4 py-3"><p className="text-xs text-muted-foreground mb-1">Opening + imported movements</p><p className="text-sm font-bold tabular-nums">{fmt(movementBalance)}</p></div>
          </div>
          {typeof ledger === "number" && Math.abs(ledger - movementBalance) > 0.005 && (
            <p className="mb-3 text-xs text-amber-700">The ledger balance differs from opening + imported movements by {fmt(ledger - movementBalance)}. The ledger includes every journal posted to this account; the difference is pending reconciliation.</p>
          )}
          <div className="relative max-w-md mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search movements..." className="pl-9 bg-muted/40 border-muted" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTx ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading movements...</td></tr>
                  ) : pagination.pageItems.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{search ? "No movements match your search." : "This account has no movements."}</td></tr>
                  ) : pagination.pageItems.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.reference}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{t.type}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${t.signed < 0 ? "text-red-600" : "text-emerald-600"}`}>{t.signed < 0 ? "-" : "+"}{fmt(Math.abs(t.signed))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination pagination={pagination} />
          </div>
        </>
      )}
    </div>
  );
}
