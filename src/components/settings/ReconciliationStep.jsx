import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { GitCompare, Loader2, AlertCircle, Check, ArrowLeft, ChevronRight, ArrowRight, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { linkJournalsToDocs } from "@/lib/journalDocLinker";

const fmt = (n) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReconciliationStep({ onBack, onReset }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [glBalances, setGlBalances] = useState({}); // account_code → { name, balance }
  const [coaAccounts, setCoaAccounts] = useState([]); // ChartOfAccount records with opening_balance
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [linkPass, setLinkPass] = useState({ status: "running", progress: 0, result: null, error: "" });

  useEffect(() => {
    (async () => {
      setLoading(true); setError("");
      try {
        // 1. Load all JournalEntry lines and compute balance per account
        const jeByCode = {};
        let cursor = null;
        while (true) {
          const page = await base44.entities.JournalEntry.filter(
            { status: "Posted" },
            { sort: "-created_date", limit: 500, cursor, fields: ["lines", "number"] }
          );
          const items = page.items || page;
          for (const je of items) {
            if (!Array.isArray(je.lines)) continue;
            for (const line of je.lines) {
              const code = String(line.account_code || "").trim();
              if (!code) continue;
              const debit = Number(line.debit) || 0;
              const credit = Number(line.credit) || 0;
              if (!jeByCode[code]) jeByCode[code] = { name: line.account_name || "", balance: 0 };
              jeByCode[code].balance += debit - credit;
              if (line.account_name && !jeByCode[code].name) jeByCode[code].name = line.account_name;
            }
          }
          cursor = page.next_cursor;
          if (!page.has_more) break;
        }
        setGlBalances(jeByCode);

        // 2. Load Chart of Accounts with opening_balance (from Trial Balance import)
        const coaResp = await base44.entities.ChartOfAccount.list("-code", 10000);
        const coaArr = (coaResp.items || coaResp).filter(a => a.opening_balance !== undefined && a.opening_balance !== 0 || true);
        setCoaAccounts(coaArr);

        // 3. Load outstanding Invoices (Awaiting Payment) for AR
        const invResp = await base44.entities.Invoice.filter(
          { status: { $in: ["Awaiting Payment", "Paid"] } },
          { limit: 10000, fields: ["number", "total", "amount_paid", "status", "contact_name"] }
        );
        setInvoices(invResp.items || invResp);

        // 4. Load outstanding Bills (Awaiting Payment) for AP
        const billResp = await base44.entities.Bill.filter(
          { status: { $in: ["Awaiting Payment", "Paid"] } },
          { limit: 10000, fields: ["number", "total", "amount_paid", "status", "contact_name"] }
        );
        setBills(billResp.items || billResp);
      } catch (err) {
        setError(err.message || "Failed to load reconciliation data");
      }
      setLoading(false);
    })();
  }, []);

  // Automatic journal-to-document linking pass (runs on opening step 11)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLinkPass({ status: "running", progress: 0, result: null, error: "" });
      try {
        const res = await linkJournalsToDocs({
          onProgress: (p) => { if (mounted) setLinkPass((s) => ({ ...s, progress: p })); },
        });
        if (mounted) setLinkPass({ status: "done", progress: 100, result: res, error: "" });
        // Rebuild stored account balances after journal linking (non-fatal)
        try { await base44.functions.invoke("rebuildAccountBalances", {}); } catch {}
      } catch (e) {
        if (mounted) setLinkPass({ status: "error", progress: 0, result: null, error: e.message || "Linking failed" });
      }
    })();
    return () => { mounted = false; };
  }, []);

  // GL vs Trial Balance comparison.
  // GL balance is movement-only (journal entries). The "expected" balance is
  // GL movement + COA opening_balance (the true account balance). The TB
  // opening_balance IS the opening. So the correct comparison is:
  //   diff = (glMovement + opening_balance) − opening_balance = glMovement
  // i.e. after the OpeningBalance journal is generated, glMovement includes
  // the opening and diff should be ~0. Before generation, diff = glMovement
  // (the movement since conversion), which is expected and not an error.
  // We show the true balance (opening + movement) vs the TB opening so the
  // user can see whether the GL + opening reconciles to the TB.
  const tbVsGl = useMemo(() => {
    const rows = [];
    for (const acc of coaAccounts) {
      const code = String(acc.code || "").trim();
      if (!code) continue;
      const glMovement = glBalances[code]?.balance || 0;
      const tbBalance = Number(acc.opening_balance) || 0;
      const trueBalance = tbBalance + glMovement;
      const diff = trueBalance - tbBalance; // = glMovement
      // Only flag accounts where the GL movement is non-zero (i.e. there IS
      // activity beyond the opening balance) — a zero diff means the GL
      // matches the TB exactly.
      if (Math.abs(glMovement) > 0.01) {
        rows.push({ code, name: acc.name, type: acc.type, glBalance: glMovement, tbBalance, trueBalance, diff });
      }
    }
    // Also show GL accounts not in COA
    for (const [code, info] of Object.entries(glBalances)) {
      if (!coaAccounts.find(a => String(a.code || "").trim() === code)) {
        rows.push({ code, name: info.name, type: "—", glBalance: info.balance, tbBalance: 0, trueBalance: info.balance, diff: info.balance });
      }
    }
    return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [glBalances, coaAccounts]);

  // AR / AP reconciliation
  const arApRecon = useMemo(() => {
    // Total outstanding invoices = sum of (total - amount_paid) for Awaiting Payment
    const arOutstanding = invoices
      .filter(i => i.status === "Awaiting Payment")
      .reduce((s, i) => s + (Number(i.total) || 0) - (Number(i.amount_paid) || 0), 0);
    // Total outstanding bills = sum of (total - amount_paid) for Awaiting Payment
    const apOutstanding = bills
      .filter(b => b.status === "Awaiting Payment")
      .reduce((s, b) => s + (Number(b.total) || 0) - (Number(b.amount_paid) || 0), 0);

    // Find AR accounts in GL (accounts with "receivable" in name)
    const arAccounts = Object.entries(glBalances).filter(([code, info]) => {
      const name = String(info.name || "").toLowerCase();
      return name.includes("receivable") || name.includes("deudor");
    });
    const glArBalance = arAccounts.reduce((s, [_, info]) => s + info.balance, 0);

    // Find AP accounts in GL (accounts with "payable" in name)
    const apAccounts = Object.entries(glBalances).filter(([code, info]) => {
      const name = String(info.name || "").toLowerCase();
      return name.includes("payable") || name.includes("acreedor");
    });
    const glApBalance = apAccounts.reduce((s, [_, info]) => s + info.balance, 0);

    return {
      arOutstanding, glArBalance, arDiff: arOutstanding - glArBalance,
      apOutstanding, glApBalance, apDiff: apOutstanding - glApBalance,
      arAccounts: arAccounts.map(([code, info]) => ({ code, name: info.name, balance: info.balance })),
      apAccounts: apAccounts.map(([code, info]) => ({ code, name: info.name, balance: info.balance })),
    };
  }, [invoices, bills, glBalances]);

  const tbDiffs = tbVsGl.filter(r => r.tbBalance !== 0 || r.glBalance !== 0);
  const hasArDiff = Math.abs(arApRecon.arDiff) > 0.01;
  const hasApDiff = Math.abs(arApRecon.apDiff) > 0.01;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Loading reconciliation data...</p>
        <p className="text-xs text-muted-foreground mt-1">Reading journal entries, trial balance, invoices and bills</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto text-center">
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
        <Button onClick={onBack} variant="outline" className="mt-4 gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <GitCompare className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Reconciliation</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Compare the General Ledger with the Trial Balance and outstanding Invoices/Bills. Only differences are shown — no data is modified.
        </p>
      </motion.div>

      {/* Journal-to-Document linking pass */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <LinkIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Journal-to-Document Linking</h3>
          {linkPass.status === "done" && linkPass.result && (
            <span className="text-xs text-emerald-600 font-medium ml-auto">Complete</span>
          )}
          {linkPass.status === "error" && (
            <span className="text-xs text-destructive font-medium ml-auto">Failed</span>
          )}
        </div>
        {linkPass.status === "running" && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Linking journals to invoices, bills and credit notes...</span>
              <span className="font-medium text-foreground tabular-nums">{linkPass.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${linkPass.progress}%` }} />
            </div>
          </div>
        )}
        {linkPass.status === "error" && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" /> {linkPass.error}
          </div>
        )}
        {linkPass.status === "done" && linkPass.result && (
          <div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums text-emerald-600">{linkPass.result.linked}</p>
                <p className="text-[10px] text-muted-foreground">Linked</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums text-blue-600">{linkPass.result.alreadyLinked}</p>
                <p className="text-[10px] text-muted-foreground">Already linked</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums text-amber-600">{linkPass.result.ambiguous}</p>
                <p className="text-[10px] text-muted-foreground">Ambiguous</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums text-muted-foreground">{linkPass.result.unmatched}</p>
                <p className="text-[10px] text-muted-foreground">Unmatched</p>
              </div>
            </div>
            {linkPass.result.ambiguousDetails.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ambiguous Matches ({linkPass.result.ambiguousDetails.length})</p>
                <div className="rounded-lg border border-border overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 sticky top-0">
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Journal</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Candidate Documents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {linkPass.result.ambiguousDetails.slice(0, 100).map((d, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-foreground">{d.number}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{d.date}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono">{fmt(d.amount)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{d.candidate_numbers.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {linkPass.result.ambiguousDetails.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center mt-1">+ {linkPass.result.ambiguousDetails.length - 100} more</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className={`p-4 rounded-lg border ${tbDiffs.length === 0 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {tbDiffs.length === 0 ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-orange-500" />}
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">GL vs Trial Balance</span>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${tbDiffs.length === 0 ? "text-emerald-600" : "text-orange-600"}`}>{tbDiffs.length}</p>
          <p className="text-xs text-muted-foreground">{tbDiffs.length === 0 ? "All accounts match" : "accounts with differences"}</p>
        </div>
        <div className={`p-4 rounded-lg border ${!hasArDiff && !hasApDiff ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {!hasArDiff && !hasApDiff ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-orange-500" />}
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AR / AP vs GL</span>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${!hasArDiff && !hasApDiff ? "text-emerald-600" : "text-orange-600"}`}>
            {hasArDiff || hasApDiff ? "Differences" : "Match"}
          </p>
          <p className="text-xs text-muted-foreground">{hasArDiff || hasApDiff ? "outstanding totals don't match GL" : "outstanding totals match GL"}</p>
        </div>
      </div>

      {/* GL vs Trial Balance differences */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-foreground mb-2">General Ledger vs Trial Balance</h3>
        {tbDiffs.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            <Check className="w-4 h-4" /> All account balances match between the General Ledger and the Trial Balance.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Code</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Account Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">GL Balance</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">TB Balance</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Difference</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {tbDiffs.slice(0, 50).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs font-mono text-foreground">{r.code}</td>
                      <td className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate">{r.name || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.type || "—"}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-foreground">{fmt(r.glBalance)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-foreground">{fmt(r.tbBalance)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums font-medium text-orange-600">{fmt(r.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tbDiffs.length > 50 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {tbDiffs.length - 50} more accounts</div>}
          </div>
        )}
      </div>

      {/* AR reconciliation */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-foreground mb-2">Accounts Receivable — Outstanding Invoices vs GL</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">Outstanding Invoices (Awaiting Payment)</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmt(arApRecon.arOutstanding)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">GL Receivable Accounts Balance</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmt(arApRecon.glArBalance)}</p>
              {arApRecon.arAccounts.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{arApRecon.arAccounts.map(a => a.code).join(", ")}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Difference</p>
              <p className={`text-lg font-bold tabular-nums ${hasArDiff ? "text-orange-600" : "text-emerald-600"}`}>{fmt(arApRecon.arDiff)}</p>
            </div>
          </div>
          {!hasArDiff && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Outstanding invoices match the GL Accounts Receivable balance.
            </div>
          )}
          {hasArDiff && arApRecon.arAccounts.length === 0 && (
            <div className="px-4 py-2 bg-orange-50 text-orange-700 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> No receivable accounts found in the GL. Check that your Chart of Accounts has accounts with "receivable" in the name.
            </div>
          )}
        </div>
      </div>

      {/* AP reconciliation */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-foreground mb-2">Accounts Payable — Outstanding Bills vs GL</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">Outstanding Bills (Awaiting Payment)</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmt(arApRecon.apOutstanding)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">GL Payable Accounts Balance</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{fmt(arApRecon.glApBalance)}</p>
              {arApRecon.apAccounts.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{arApRecon.apAccounts.map(a => a.code).join(", ")}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Difference</p>
              <p className={`text-lg font-bold tabular-nums ${hasApDiff ? "text-orange-600" : "text-emerald-600"}`}>{fmt(arApRecon.apDiff)}</p>
            </div>
          </div>
          {!hasApDiff && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Outstanding bills match the GL Accounts Payable balance.
            </div>
          )}
          {hasApDiff && arApRecon.apAccounts.length === 0 && (
            <div className="px-4 py-2 bg-orange-50 text-orange-700 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> No payable accounts found in the GL. Check that your Chart of Accounts has accounts with "payable" in the name.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2.5 mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <p>
          <span className="font-semibold">Read-only step.</span> This reconciliation does not modify any data. It compares the imported General Ledger balances with the Trial Balance opening balances, and the outstanding Invoice/Bill totals with the GL receivable/payable accounts. Investigate any differences before finalizing your migration.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={onReset} className="gap-1.5">Finish Migration <ChevronRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}