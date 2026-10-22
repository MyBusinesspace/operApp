import { useState, useMemo, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { todayLocalISO } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Plus, Trash2, Link2, CheckCheck, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { applyRulesToTransaction, loadBankRules } from "@/lib/bankRulesEngine";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emptyLine = () => ({ id: crypto.randomUUID(), date: todayLocalISO(), description: "", amount: "", type: "Spend Money" });

// Seed statement lines from system transactions
const seedLinesFromTxs = (txs) => txs.map(tx => ({
  id: crypto.randomUUID(),
  _txId: tx.id, // remember the originating tx for auto-match
  date: tx.date,
  description: tx.description,
  amount: String(tx.amount),
  type: tx.type,
}));

// Auto-match: for each statement line that was seeded from a tx, pre-match it to that same tx
const buildAutoMatches = (lines) => {
  const m = {};
  lines.forEach(l => { if (l._txId) m[l.id] = l._txId; });
  return m;
};

/**
 * ReconcileTab — Xero-style reconciliation
 * Auto-matches statement lines to system transactions by exact amount+type.
 * Each auto-matched line shows Accept ✓ / Find Another buttons.
 */
export default function ReconcileTab({ bankAccount, unreconciled, chartAccounts, onRefresh }) {
  // Single init so both statementLines and autoMatches share the same UUIDs
  const initRef = useRef(null);
  if (!initRef.current) {
    if (unreconciled.length > 0) {
      const lines = seedLinesFromTxs(unreconciled);
      initRef.current = { lines, matches: buildAutoMatches(lines) };
    } else {
      initRef.current = { lines: [emptyLine()], matches: {} };
    }
  }
  const [statementLines, setStatementLines] = useState(initRef.current.lines);
  const [autoMatches, setAutoMatches] = useState(initRef.current.matches);

  // Accepted matches (user clicked Accept): statementId -> txId
  const [acceptedMatches, setAcceptedMatches] = useState({});

  // Lines where user clicked "Find Another" — opens manual match picker
  const [findingAlternative, setFindingAlternative] = useState(null); // statementLine id
  const [matchingIdx, setMatchingIdx] = useState(null); // for manual match flow

  const [saving, setSaving] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [bankRules, setBankRules] = useState([]);

  useEffect(() => { loadBankRules().then(setBankRules).catch(() => {}); }, []);

  const handleApplyRule = async (tx) => {
    const result = applyRulesToTransaction(bankRules, tx);
    if (!result) return;
    try {
      await base44.entities.BankTransaction.update(tx.id, result.updates);
      toast.success(`Rule applied: ${result.rule.target_account_name || "account assigned"}`);
      onRefresh();
    } catch {
      toast.error("Failed to apply rule");
    }
  };

  const filteredUnreconciled = useMemo(() => {
    if (!txSearch.trim()) return unreconciled;
    const s = txSearch.toLowerCase();
    return unreconciled.filter(tx =>
      tx.description?.toLowerCase().includes(s) ||
      tx.contact_name?.toLowerCase().includes(s) ||
      tx.reference?.toLowerCase().includes(s) ||
      tx.source_number?.toLowerCase().includes(s)
    );
  }, [unreconciled, txSearch]);

  const addLine = () => setStatementLines(p => [...p, emptyLine()]);
  const removeLine = (id) => {
    setStatementLines(p => p.filter(l => l.id !== id));
    setAutoMatches(p => { const n = { ...p }; delete n[id]; return n; });
    setAcceptedMatches(p => { const n = { ...p }; delete n[id]; return n; });
  };
  const updateLine = (id, field, value) => setStatementLines(p => p.map(l => l.id === id ? { ...l, [field]: value } : l));

  // All claimed tx IDs (accepted + auto-pending)
  const acceptedTxIds = new Set(Object.values(acceptedMatches));
  // TxIds claimed by auto-matches that haven't been accepted or rejected yet
  const pendingAutoTxIds = new Set(
    Object.entries(autoMatches)
      .filter(([sId, txId]) => !acceptedMatches[sId] && findingAlternative !== sId)
      .map(([, txId]) => txId)
  );
  const claimedTxIds = new Set([...acceptedTxIds, ...pendingAutoTxIds]);
  const availableTxs = unreconciled.filter(tx => !claimedTxIds.has(tx.id));

  // Accept auto-match
  const handleAccept = (lineId) => {
    const txId = autoMatches[lineId];
    if (!txId) return;
    setAcceptedMatches(p => ({ ...p, [lineId]: txId }));
    setFindingAlternative(null);
  };

  // Reject auto-match → open manual picker for this line
  const handleFindAnother = (lineId, idx) => {
    setFindingAlternative(lineId);
    setMatchingIdx(idx);
    setAutoMatches(p => { const n = { ...p }; delete n[lineId]; return n; });
  };

  // Unmatch an accepted match
  const unmatch = (statementId) => {
    setAcceptedMatches(p => { const n = { ...p }; delete n[statementId]; return n; });
  };

  // Manual match: user clicked a system tx in the right pane
  const handleMatchTx = (tx) => {
    if (matchingIdx === null) return;
    const line = statementLines[matchingIdx];
    setAcceptedMatches(p => ({ ...p, [line.id]: tx.id }));
    setFindingAlternative(null);
    setMatchingIdx(null);
  };

  const totalAccepted = Object.keys(acceptedMatches).length;
  const totalPendingAuto = statementLines.filter(l => autoMatches[l.id] && !acceptedMatches[l.id]).length;

  const handleConfirmAll = async () => {
    if (totalAccepted === 0) {
      toast.error("Accept at least one match before confirming.");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        Object.values(acceptedMatches).map(txId =>
          base44.entities.BankTransaction.update(txId, { status: "Reconciled" })
        )
      );
      toast.success(`${totalAccepted} transaction${totalAccepted !== 1 ? "s" : ""} reconciled`);
      setStatementLines([emptyLine()]);
      setAutoMatches({});
      setAcceptedMatches({});
      setMatchingIdx(null);
      setFindingAlternative(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Summary bar */}
      <div className="px-6 py-3 border-b border-border bg-muted flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${unreconciled.length === 0 ? "bg-success" : "bg-orange-400"}`} />
          <span className="text-sm text-muted-foreground">{unreconciled.length} unreconciled system transaction{unreconciled.length !== 1 ? "s" : ""}</span>
        </div>
        {totalPendingAuto > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span className="text-sm text-success font-medium">{totalPendingAuto} auto-matched — review below</span>
          </div>
        )}
        {totalAccepted > 0 && (
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-primary font-medium">{totalAccepted} accepted</span>
          </div>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={handleConfirmAll} disabled={saving || totalAccepted === 0} className="gap-1.5">
          <CheckCheck className="w-4 h-4" />
          {saving ? "Reconciling…" : `Confirm Reconciliation${totalAccepted > 0 ? ` (${totalAccepted})` : ""}`}
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row">
        {/* LEFT — Statement Lines */}
        <div className="w-full md:w-1/2 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-muted/60 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Bank Statement Lines</p>
              <p className="text-xs text-muted-foreground">Auto-matched lines shown in green — Accept or Find Another</p>
            </div>
            <Button size="sm" variant="outline" onClick={addLine} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Line
            </Button>
          </div>

          <div className="p-4 space-y-3">
            {statementLines.map((line, idx) => {
              const acceptedTxId = acceptedMatches[line.id];
              const autoTxId = autoMatches[line.id];
              const acceptedTx = acceptedTxId ? unreconciled.find(t => t.id === acceptedTxId) : null;
              const autoTx = autoTxId ? unreconciled.find(t => t.id === autoTxId) : null;
              const isFindingAlt = findingAlternative === line.id;
              const isManualMatchActive = matchingIdx === idx && !autoTxId && !acceptedTxId;

              // State: accepted, auto-pending, finding-alternative, manual-matching, plain
              const cardStyle = acceptedTxId
                ? "border-success/50 bg-success/5"
                : autoTxId
                ? "border-green-400/60 bg-green-50/60 ring-1 ring-green-300/40"
                : isFindingAlt || isManualMatchActive
                ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                : "border-border bg-card";

              return (
                <div key={line.id} className={`rounded-xl border p-3 transition-all ${cardStyle}`}>

                  {/* ACCEPTED state */}
                  {acceptedTxId && acceptedTx && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs text-success font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Accepted: {acceptedTx.description} · {num(acceptedTx.amount)}
                      </div>
                      <button onClick={() => unmatch(line.id)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Undo
                      </button>
                    </div>
                  )}

                  {/* AUTO-MATCH pending — Accept / Find Another */}
                  {autoTxId && autoTx && !acceptedTxId && (
                    <div className="mb-3 rounded-lg border border-green-300 dark:border-green-700 bg-white/70 dark:bg-slate-800/70 p-2.5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-green-800">Auto-match found</p>
                            <p className="text-xs text-green-700 truncate">{autoTx.description}</p>
                            <p className="text-xs text-green-600">{autoTx.date} · {autoTx.type === "Receive Money" ? "+" : "−"}{num(autoTx.amount)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white flex-1"
                          onClick={() => handleAccept(line.id)}>
                          <CheckCircle2 className="w-3 h-3" /> Accept
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-orange-300 text-orange-600 hover:bg-orange-50 flex-1"
                          onClick={() => handleFindAnother(line.id, idx)}>
                          <RefreshCw className="w-3 h-3" /> Find Another
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Fields */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                      <Input type="date" value={line.date} onChange={e => updateLine(line.id, "date", e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                      <Select value={line.type} onValueChange={v => updateLine(line.id, "type", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Spend Money">Spend</SelectItem>
                          <SelectItem value="Receive Money">Receive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mb-2">
                    <Input placeholder="Description" value={line.description} onChange={e => updateLine(line.id, "description", e.target.value)} className="h-8 text-xs" />
                  </div>

                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="Amount" value={line.amount} onChange={e => updateLine(line.id, "amount", e.target.value)} className="h-8 text-xs flex-1" />

                    {/* Manual match button — only when no auto-match and not accepted */}
                    {!autoTxId && !acceptedTxId && (
                      <Button size="sm" variant={isManualMatchActive ? "default" : "outline"} className="h-8 text-xs gap-1 shrink-0"
                        onClick={() => setMatchingIdx(isManualMatchActive ? null : idx)}>
                        <Link2 className="w-3 h-3" />
                        {isManualMatchActive ? "Cancel" : "Match"}
                      </Button>
                    )}

                    {statementLines.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeLine(line.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — System Transactions */}
        <div className="w-full md:w-1/2 flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-muted/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <p className="text-sm font-semibold text-foreground">System Transactions</p>
                <p className="text-xs text-muted-foreground">
                  {matchingIdx !== null
                    ? "Click a transaction to match it with the selected statement line"
                    : "Select a statement line and click Match to pair it manually"}
                </p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search transactions…"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
          </div>

          <div className="p-4 space-y-2">
            {filteredUnreconciled.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">All transactions reconciled!</p>
                <p className="text-xs text-muted-foreground mt-1">No unreconciled system transactions found.</p>
              </div>
            ) : (
              // Always show all unreconciled; dim auto-matched ones unless in "find another" mode
              filteredUnreconciled.map(tx => {
                const isAccepted = acceptedTxIds.has(tx.id);
                const isAutoPending = pendingAutoTxIds.has(tx.id);
                const isClickable = matchingIdx !== null && !isAccepted && !isAutoPending;
                const line = matchingIdx !== null ? statementLines[matchingIdx] : null;
                const amountMatch = line && Number(line.amount) > 0 && Math.abs(Number(line.amount) - tx.amount) < 0.01;
                const isAutoUsed = isAutoPending && matchingIdx === null;
                const ruleSuggestion = (!isAccepted && !isAutoPending && bankRules.length > 0) ? applyRulesToTransaction(bankRules, tx) : null;

                return (
                  <div key={tx.id}
                    onClick={() => isClickable && handleMatchTx(tx)}
                    className={`rounded-xl border p-3 transition-all ${
                      isAccepted
                        ? "border-success/40 bg-success/5 opacity-50"
                        : isAutoUsed
                        ? "border-green-300/60 bg-green-50/50 opacity-70"
                        : isClickable
                          ? amountMatch
                            ? "border-success/50 bg-success/5 cursor-pointer hover:border-success hover:shadow-sm ring-1 ring-success/20"
                            : "border-primary/30 bg-primary/5 cursor-pointer hover:border-primary hover:shadow-sm"
                          : "border-border bg-card"
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{tx.date}</span>
                          {tx.contact_name && <span className="text-xs text-muted-foreground">· {tx.contact_name}</span>}
                          {tx.source_number && <span className="text-xs text-primary/70">{tx.source_number}</span>}
                          {isAutoUsed && <span className="text-xs text-green-600 font-medium">· auto-matched</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold ${tx.type === "Receive Money" ? "text-success" : "text-foreground"}`}>
                          {tx.type === "Receive Money" ? "+" : "−"}{num(tx.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">{tx.type === "Spend Money" ? "Spent" : tx.type === "Receive Money" ? "Received" : "Transfer"}</p>
                      </div>
                    </div>
                    {amountMatch && isClickable && (
                      <div className="mt-2 text-xs text-success font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Amount matches — click to confirm
                      </div>
                    )}
                    {ruleSuggestion && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs border-t border-border/50 pt-2">
                        <Zap className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-muted-foreground">Rule:</span>
                        <span className="text-primary font-medium truncate">{ruleSuggestion.rule.target_account_name || "—"}</span>
                        {ruleSuggestion.rule.contact_name && <span className="text-muted-foreground truncate hidden sm:inline">· {ruleSuggestion.rule.contact_name}</span>}
                        <button onClick={(e) => { e.stopPropagation(); handleApplyRule(tx); }} className="ml-auto text-primary hover:underline font-medium shrink-0">
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}