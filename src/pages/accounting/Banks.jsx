import { useState, useEffect, useMemo, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Plus, Building2, CheckCircle2, Circle,
  Edit2, Trash2, ChevronLeft, ExternalLink, ChevronDown,
  Settings2, UploadCloud, RefreshCw, Sparkles, Loader2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { runRulesOnTransactions } from "@/lib/bankRulesEngine";
import BankAccountFormModal from "@/components/banking/BankAccountFormModal";
import BankTransactionFormModal from "@/components/banking/BankTransactionFormModal";

import ReconcileTab from "@/components/banking/ReconcileTab";
import CashCodingTab from "@/components/banking/CashCodingTab";
import StatementImportWizard from "@/components/banking/StatementImportWizard";
import BankAccountGrid from "@/components/banking/BankAccountGrid";
import BankTransactionToolbar from "@/components/banking/BankTransactionToolbar";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { useTablePagination } from "@/hooks/useTablePagination";
import { toast } from "sonner";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Banks() {
  const { can } = usePermissionsMatrix();
  const location = useLocation();
  const navigate = useNavigate();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [chartAccounts, setChartAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [pendingTxId, setPendingTxId] = useState(null);
  const [search, setSearch] = usePersistedSearch("banks");
  const [filterStatus, setFilterStatus] = useState("All");

  const [showBankForm, setShowBankForm] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [activeTab, setActiveTab] = useState("account_transactions");
  const [showManageMenu, setShowManageMenu] = useState(false);
  const manageMenuRef = useRef(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [showRunRulesDialog, setShowRunRulesDialog] = useState(false);
  const [runningRules, setRunningRules] = useState(false);

  const bankPagination = useTablePagination(bankAccounts, 200);

  const getTxDescription = (tx) => {
    const prefix = tx.type === "Transfer" ? "Transfer"
      : tx.type === "Receive Money" ? "Receipt"
      : "Payment";
    const label = tx.contact_name || tx.description || tx.reference;
    if (!label) return prefix;
    // Avoid double-prefixing if the label already starts with a known prefix
    const knownPrefixes = ["Payment: ", "Receipt: ", "Transfer: "];
    if (knownPrefixes.some(p => label.startsWith(p))) return label;
    return `${prefix}: ${label}`;
  };

  const toggleTxSelection = (txId) => {
    setSelectedTxIds(prev => prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]);
  };

  const toggleSelectAll = (txs) => {
    const allSelected = txs.every(t => selectedTxIds.includes(t.id));
    if (allSelected) {
      setSelectedTxIds(prev => prev.filter(id => !txs.some(t => t.id === id)));
    } else {
      setSelectedTxIds(prev => [...new Set([...prev, ...txs.map(t => t.id)])]);
    }
  };

  useEffect(() => {
    const handler = (e) => { if (manageMenuRef.current && !manageMenuRef.current.contains(e.target)) setShowManageMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadBanks = async () => {
    setLoading(true);
    const banks = await base44.entities.BankAccount.list("-created_date", 5000);
    setBankAccounts(banks);
    setLoading(false);
  };

  const loadChartAccounts = async () => {
    const coaPage = await base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 });
    setChartAccounts(coaPage.items || []);
  };

  // Create BankAccount records for COA entries with type "Bank" (or enable_payments)
  // that don't yet have a linked BankAccount — typically from a Xero COA import.
  const syncFromCOA = async () => {
    setSyncing(true);
    try {
      const linkedCOAIds = new Set(bankAccounts.map(b => b.chart_account_id).filter(Boolean));
      const orphaned = chartAccounts.filter(a =>
        !linkedCOAIds.has(a.id) &&
        a.type === "Bank" &&
        a.status === "Active"
      );
      if (orphaned.length === 0) {
        toast.info("All bank-type accounts are already synced");
        setSyncing(false);
        return;
      }
      let created = 0;
      for (const coa of orphaned) {
        const isCreditCard = coa.type === "Current Liability" || coa.type === "Credit Card";
        let bankName = coa.name;
        if (coa.description && coa.description.includes("—")) {
          bankName = coa.description.split("—")[0].trim() || coa.name;
        }
        try {
          await base44.entities.BankAccount.create({
            name: coa.name,
            bank_name: bankName,
            account_type: isCreditCard ? "Credit Card" : "Bank",
            currency: coa.currency || "AED",
            chart_account_id: coa.id,
            chart_account_code: coa.code,
            chart_account_name: coa.name,
            opening_balance: coa.opening_balance || 0,
            opening_balance_date: coa.opening_balance_date || null,
            status: "Active",
            show_on_dashboard: coa.show_on_dashboard ?? true,
          });
          created++;
        } catch (err) { console.error("Failed to sync", coa.name, err); }
      }
      toast.success(`${created} bank account${created === 1 ? "" : "s"} synced from Chart of Accounts`);
      loadBanks();
    } catch { toast.error("Failed to sync bank accounts"); }
    setSyncing(false);
  };

  const loadTransactions = async (accountId) => {
    setTxLoading(true);
    const txsPage = await base44.entities.BankTransaction.filter({ bank_account_id: accountId }, { sort: "-date", limit: 5000 });
    setTransactions(txsPage.items || []);
    setTxLoading(false);
  };

  useEffect(() => {
    loadBanks();
    loadChartAccounts();
    // Check for txId param (from payment link)
    const params = new URLSearchParams(location.search);
    const txId = params.get("txId");
    if (txId) setPendingTxId(txId);
  }, []);

  // Once bankAccounts loaded and pendingTxId set, find the transaction
  useEffect(() => {
    if (!pendingTxId || bankAccounts.length === 0) return;
    const resolve = async () => {
      const tx = await base44.entities.BankTransaction.get(pendingTxId).catch(() => null);
      if (tx) {
        const acct = bankAccounts.find(b => b.id === tx.bank_account_id);
        if (acct) {
          setSelectedAccount(acct);
          setActiveTab("account_transactions");
          navigate(`/accounting/banks/transactions/${tx.id}`);
        }
      }
      setPendingTxId(null);
    };
    resolve();
  }, [pendingTxId, bankAccounts]);
  useEffect(() => {
    if (selectedAccount) loadTransactions(selectedAccount.id);
    else setTransactions([]);
  }, [selectedAccount]);

  // Running balance: computed per row (sorted oldest→newest)
  const sortedTx = useMemo(() => [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date)), [transactions]);

  // Display opening balance: for bank accounts linked to a Chart of Accounts
  // record, prefer the COA opening_balance (the source of truth from the Trial
  // Balance import) over the stored BankAccount.opening_balance. This keeps the
  // bank display in sync with the GL without overwriting the stored value.
  const displayOpening = useMemo(() => {
    if (!selectedAccount) return 0;
    const linkedCoa = selectedAccount.chart_account_id
      ? chartAccounts.find(c => c.id === selectedAccount.chart_account_id)
      : null;
    return linkedCoa ? (linkedCoa.opening_balance || 0) : (selectedAccount.opening_balance || 0);
  }, [selectedAccount, chartAccounts]);

  const txWithBalance = useMemo(() => {
    let bal = displayOpening;
    return sortedTx.map(tx => {
      if (tx.type === "Receive Money") bal += tx.amount;
      else if (tx.type === "Spend Money" || tx.type === "Transfer") bal -= tx.amount;
      return { ...tx, _balance: bal };
    }).reverse(); // newest first for display
  }, [sortedTx, displayOpening]);

  const statementBalance = txWithBalance.length > 0 ? txWithBalance[0]._balance : displayOpening;

  const filteredTx = useMemo(() => {
    return txWithBalance.filter(tx => {
      const s = search.toLowerCase();
      const matchSearch = !search || tx.description?.toLowerCase().includes(s) || tx.reference?.toLowerCase().includes(s) || tx.contact_name?.toLowerCase().includes(s);
      const matchStatus = filterStatus === "All" || tx.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [txWithBalance, search, filterStatus]);

  const txPagination = useTablePagination(filteredTx, 200);

  const reconciledCount = transactions.filter(t => t.status === "Reconciled").length;
  const unreconciledCount = transactions.filter(t => t.status === "Unreconciled").length;

  const handleDeleteBank = async (bank) => {
    if (!confirm(`Delete "${bank.name}"? All transactions will also be deleted.`)) return;
    await base44.entities.BankTransaction.deleteMany({ bank_account_id: bank.id });
    await base44.entities.BankAccount.delete(bank.id);
    if (selectedAccount?.id === bank.id) setSelectedAccount(null);
    toast.success("Bank account deleted");
    loadBanks();
  };

  const handleToggleReconcile = async (tx) => {
    const next = tx.status === "Reconciled" ? "Unreconciled" : "Reconciled";
    await base44.entities.BankTransaction.update(tx.id, { status: next });
    loadTransactions(selectedAccount.id);
  };

  const handleDeleteTx = async (tx) => {
    if (!confirm("Delete this transaction?")) return;
    await base44.entities.BankTransaction.delete(tx.id);
    toast.success("Transaction deleted");
    loadTransactions(selectedAccount.id);
  };

  const handleRunRules = async () => {
    setRunningRules(true);
    try {
      const unreconciled = transactions.filter(t => t.status === "Unreconciled");
      const { matched, updated, failed } = await runRulesOnTransactions(unreconciled);
      if (updated > 0) {
        toast.success(`${updated} of ${unreconciled.length} transactions categorized by bank rules`);
      } else {
        toast.info("No matching rules found for unreconciled transactions");
      }
      setShowRunRulesDialog(false);
      loadTransactions(selectedAccount.id);
    } catch {
      toast.error("Failed to run rules");
    }
    setRunningRules(false);
  };

  // ── ACCOUNT LIST VIEW ──────────────────────────────────────────────────────
  if (!selectedAccount) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{bankAccounts.filter(b => b.status === "Active").length} active accounts</p>
          </div>
          <div className="flex items-center gap-2">
            {can("bank_accounts", "can_create") && (
              <Button size="sm" variant="outline" onClick={syncFromCOA} disabled={syncing || chartAccounts.length === 0}>
                <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing..." : "Sync from COA"}
              </Button>
            )}
            {can("bank_accounts", "can_create") && (
              <Button size="sm" onClick={() => { setEditingBank(null); setShowBankForm(true); }}>
                <Plus className="w-4 h-4 mr-1.5" /> Add Bank Account
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>
        ) : bankAccounts.length === 0 ? (
          <div className="py-20 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-3">No bank accounts yet.</p>
            {can("bank_accounts", "can_create") && (
              <Button size="sm" onClick={() => { setEditingBank(null); setShowBankForm(true); }}>Add first bank account</Button>
            )}
          </div>
        ) : (
          <>
            <BankAccountGrid
              bankAccounts={bankPagination.pageItems}
              can={can}
              onSelect={setSelectedAccount}
              onEdit={(bank) => { setEditingBank(bank); setShowBankForm(true); }}
              onDelete={handleDeleteBank}
            />
            <PaginationFooter pagination={bankPagination} pageSizeOptions={[50, 100, 200, 500]} />
          </>
        )}

        {showBankForm && (
          <BankAccountFormModal open={showBankForm} account={editingBank} chartAccounts={chartAccounts}
            onSave={() => { setShowBankForm(false); setEditingBank(null); loadBanks(); }}
            onClose={() => { setShowBankForm(false); setEditingBank(null); }} />
        )}
      </div>
    );
  }

  // ── TRANSACTION VIEW (Xero-style) ─────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSelectedAccount(null)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Bank Accounts
          </Button>
          {/* Manage Account dropdown */}
          <div className="relative" ref={manageMenuRef}>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowManageMenu(v => !v)}>
              <Settings2 className="w-3.5 h-3.5" /> Manage Account <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {showManageMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl w-64 p-2">
                <div className="grid grid-cols-2 gap-0">
                  <div className="p-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">New</p>
                    {[
                      { label: "Spend Money", type: "Spend Money" },
                      { label: "Receive Money", type: "Receive Money" },
                      { label: "Transfer Money", type: "Transfer" },
                    ].map(({ label, type }) => (
                      <button key={label} className="block w-full text-left text-xs text-primary hover:underline py-0.5"
                        onClick={() => { setShowManageMenu(false); setEditingTx({ type }); setShowTxForm(true); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reconcile</p>
                    <button className="block w-full text-left text-xs text-primary hover:underline py-0.5"
                      onClick={() => { setShowManageMenu(false); setActiveTab("reconcile"); }}>
                      Reconcile Account
                    </button>
                  </div>
                </div>
                <div className="border-t border-border mt-1 pt-1">
                  <button className="block w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-muted/50"
                    onClick={() => { setShowManageMenu(false); setEditingBank(selectedAccount); setShowBankForm(true); }}>
                    Edit Account Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Account identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: selectedAccount.color || "#6366f1" }}>
              {selectedAccount.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{selectedAccount.name}
                {selectedAccount.account_number && <span className="text-xs font-normal text-muted-foreground ml-2">···{selectedAccount.account_number}</span>}
              </h1>
              {selectedAccount.bank_name && <p className="text-xs text-muted-foreground">{selectedAccount.bank_name}</p>}
            </div>
          </div>

          {/* Sub-stats — vertically centered with bank name */}
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Total Received</p>
              <p className="text-xs font-semibold text-success">
                +{num(transactions.filter(t => t.type === "Receive Money").reduce((s, t) => s + t.amount, 0))} {selectedAccount.currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Spent</p>
              <p className="text-xs font-semibold text-destructive">
                −{num(transactions.filter(t => t.type === "Spend Money").reduce((s, t) => s + t.amount, 0))} {selectedAccount.currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reconciled / Total</p>
              <p className="text-xs font-semibold text-foreground">{reconciledCount} / {transactions.length}</p>
            </div>
          </div>

          {/* Statement balance */}
          <div className="text-right">
            <p className="text-3xl font-bold text-foreground">{num(statementBalance)}</p>
            <p className="text-xs text-muted-foreground">Statement Balance · {selectedAccount.currency}</p>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              {unreconciledCount === 0
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-success" /><span className="text-xs text-success font-medium">Reconciled</span></>
                : <><Circle className="w-3.5 h-3.5 text-warning" /><span className="text-xs text-warning font-medium">{unreconciledCount} unreconciled</span></>
              }
            </div>
          </div>
        </div>
      </div>

      {/* Xero-style tabs */}
      <div className="px-6 border-b border-border bg-card relative z-20">
        <div className="flex items-center">
          {[
            { key: "reconcile", label: "Reconcile" },
            { key: "cash_coding", label: "Cash Coding" },
            { key: "bank_statements", label: "Bank Statements" },
            { key: "account_transactions", label: "Account Transactions" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Reconcile tab */}
      {activeTab === "reconcile" && (
        <ReconcileTab
          key={transactions.map(t => t.id + t.status).join(",")}
          bankAccount={selectedAccount}
          unreconciled={txWithBalance.filter(t => t.status === "Unreconciled")}
          chartAccounts={chartAccounts}
          onRefresh={() => loadTransactions(selectedAccount.id)}
        />
      )}

      {/* Cash Coding tab */}
      {activeTab === "cash_coding" && (
        <CashCodingTab
          transactions={txWithBalance.filter(t => t.status === "Unreconciled")}
          chartAccounts={chartAccounts}
          onRefresh={() => loadTransactions(selectedAccount.id)}
        />
      )}

      {/* Bank Statements tab — Xero-style full table */}
      {activeTab === "bank_statements" && (
        <>
          <BankTransactionToolbar
            search={search}
            setSearch={setSearch}
            selectedCount={selectedTxIds.length}
            statusFilter={filterStatus}
            setStatusFilter={setFilterStatus}
          />
          <div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={txPagination.pageItems.length > 0 && txPagination.pageItems.every(t => selectedTxIds.includes(t.id))}
                      onChange={() => toggleSelectAll(txPagination.pageItems)}
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-primary uppercase tracking-wide">Payee</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Particulars</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Reference</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28 hidden lg:table-cell">Analysis Code</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Spent</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Received</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Balance</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden xl:table-cell">Source</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr><td colSpan={13} className="py-16 text-center text-muted-foreground text-xs">Loading transactions…</td></tr>
                ) : filteredTx.length === 0 ? (
                  <tr><td colSpan={13} className="py-16 text-center text-muted-foreground text-xs">
                    {transactions.length === 0 ? "No transactions yet." : "No transactions match the current filter."}
                  </td></tr>
                ) : txPagination.pageItems.map(tx => (
                  <tr key={tx.id} className="border-b border-border hover:bg-muted/40 transition-colors" onClick={() => navigate(`/accounting/banks/transactions/${tx.id}`)}>
                    <td className="px-4 py-1.5 w-10" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={selectedTxIds.includes(tx.id)}
                        onChange={() => toggleTxSelection(tx.id)}
                      />
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap w-24 text-xs">{tx.date}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs w-24">{tx.type}</td>
                    <td className="px-4 py-1.5 text-xs">
                      <button
                        className="text-primary hover:underline text-left text-xs font-medium leading-snug"
                        onClick={(e) => { e.stopPropagation(); navigate(`/accounting/banks/transactions/${tx.id}`); }}
                      >
                        {tx.contact_name || "—"}
                      </button>
                    </td>
                    <td className="px-4 py-1.5 text-xs">
                      <button
                        className="text-primary hover:underline text-left text-xs font-medium leading-snug"
                        onClick={(e) => { e.stopPropagation(); navigate(`/accounting/banks/transactions/${tx.id}`); }}
                      >
                        {getTxDescription(tx)}
                      </button>
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs w-24">{tx.reference || "—"}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs w-28">{tx.source_number || "—"}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs hidden lg:table-cell w-28">{tx.account_code || "—"}</td>
                    <td className="px-4 py-1.5 text-right w-28 tabular-nums text-xs">
                      {tx.type === "Spend Money" ? <span className="text-foreground font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right w-28 tabular-nums text-xs">
                      {tx.type === "Receive Money" ? <span className="text-success font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right w-28 tabular-nums text-xs">
                      <span className={`font-semibold ${tx._balance < 0 ? "text-destructive" : "text-foreground"}`}>
                        {tx._balance < 0 ? `(${num(Math.abs(tx._balance))})` : num(tx._balance)}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground hidden xl:table-cell w-32">{tx.source_type || "Manual"}</td>
                    <td className="px-4 py-1.5 text-center w-24">
                      <span className={`text-xs font-medium ${tx.status === "Reconciled" ? "text-success" : "text-orange-500"}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter pagination={txPagination} pageSizeOptions={[50, 100, 200, 500]} />
        </>
      )}

      {/* Account Transactions tab */}
      {activeTab === "account_transactions" && (
        <>
          <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
            {can("bank_accounts", "can_create") && (
              <Button size="sm" onClick={() => { setEditingTx(null); setShowTxForm(true); }}>
                <Plus className="w-4 h-4 mr-1.5" /> New Transaction
              </Button>
            )}
            <Button size="sm" variant="outline" className="border-foreground/30 hover:border-foreground/50 hover:bg-muted" onClick={() => setShowImportWizard(true)}>
              <UploadCloud className="w-4 h-4 mr-1.5" /> Import Statement
            </Button>
            {can("bank_accounts", "can_edit") && unreconciledCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowRunRulesDialog(true)} className="gap-1.5">
                <Sparkles className="w-4 h-4" /> Run Rules
              </Button>
            )}
          </div>
          <BankTransactionToolbar
            search={search}
            setSearch={setSearch}
            selectedCount={selectedTxIds.length}
            statusFilter={filterStatus}
            setStatusFilter={setFilterStatus}
          />

          <div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={txPagination.pageItems.length > 0 && txPagination.pageItems.every(t => selectedTxIds.includes(t.id))}
                      onChange={() => toggleSelectAll(txPagination.pageItems)}
                    />
                  </th>
                  <th className="px-4 py-2 w-20" />
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-primary uppercase tracking-wide">Description</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell w-32">Reference</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell w-32">Payment Ref</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Spent</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Received</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Balance</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell w-36">Bank Transaction Source</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr><td colSpan={11} className="py-16 text-center text-muted-foreground text-xs">Loading transactions…</td></tr>
                ) : filteredTx.length === 0 ? (
                  <tr><td colSpan={11} className="py-16 text-center text-muted-foreground text-xs">
                    {transactions.length === 0 ? "No transactions yet. Add your first one." : "No transactions match the current filter."}
                  </td></tr>
                ) : txPagination.pageItems.map(tx => (
                  <tr key={tx.id} className="border-b border-border hover:bg-muted/40 transition-colors group" onClick={() => navigate(`/accounting/banks/transactions/${tx.id}`)}>
                    <td className="px-4 py-1.5 w-10" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={selectedTxIds.includes(tx.id)}
                        onChange={() => toggleTxSelection(tx.id)}
                      />
                    </td>
                    <td className="px-4 py-1.5 w-20" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {can("bank_accounts", "can_edit") && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTx(tx); setShowTxForm(true); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {can("bank_accounts", "can_delete") && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDeleteTx(tx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap w-28">{tx.date}</td>
                    <td className="px-4 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <button
                          className="text-primary hover:underline text-left text-xs font-medium leading-snug"
                          onClick={(e) => { e.stopPropagation(); navigate(`/accounting/banks/transactions/${tx.id}`); }}
                        >
                          {getTxDescription(tx)}
                        </button>
                        <div className="flex items-center gap-2 flex-wrap">
                          {tx.contact_name && <span className="text-xs text-muted-foreground">{tx.contact_name}</span>}
                          {tx.source_number && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-primary/80 hover:text-primary cursor-pointer">
                              <ExternalLink className="w-3 h-3" />{tx.source_number}
                            </span>
                          )}
                          {tx.account_name && <span className="text-xs text-muted-foreground/60">{tx.account_name}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs hidden md:table-cell w-32">{tx.reference || "—"}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs hidden md:table-cell w-32">{tx.source_number || "—"}</td>
                    <td className="px-4 py-1.5 text-right w-32 tabular-nums">
                      {tx.type === "Spend Money" ? <span className="text-foreground font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right w-32 tabular-nums">
                      {tx.type === "Receive Money" ? <span className="text-foreground font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right w-32 tabular-nums">
                      <span className={`font-semibold ${tx._balance < 0 ? "text-destructive" : "text-foreground"}`}>
                        {tx._balance < 0 ? `(${num(Math.abs(tx._balance))})` : num(tx._balance)}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground hidden lg:table-cell w-36">{tx.source_type || "Manual"}</td>
                    <td className="px-4 py-1.5 text-center w-28">
                      <span className={`text-xs font-medium ${tx.status === "Reconciled" ? "text-success" : "text-orange-500"}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter pagination={txPagination} pageSizeOptions={[50, 100, 200, 500]} />
        </>
      )}

      {showTxForm && (
        <BankTransactionFormModal open={showTxForm} transaction={editingTx}
          bankAccountId={selectedAccount.id} bankAccountName={selectedAccount.name}
          bankAccounts={bankAccounts} chartAccounts={chartAccounts}
          onSave={() => { setShowTxForm(false); setEditingTx(null); loadTransactions(selectedAccount.id); }}
          onClose={() => { setShowTxForm(false); setEditingTx(null); }} />
      )}

      {showBankForm && (
        <BankAccountFormModal open={showBankForm} account={selectedAccount} chartAccounts={chartAccounts}
          onSave={() => { setShowBankForm(false); loadBanks(); }}
          onClose={() => setShowBankForm(false)} />
      )}

      {showRunRulesDialog && (
        <Dialog open={showRunRulesDialog} onOpenChange={setShowRunRulesDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Run Bank Rules</DialogTitle>
              <DialogDescription>
                This will apply active bank rules to {unreconciledCount} unreconciled transaction{unreconciledCount !== 1 ? "s" : ""} on {selectedAccount.name}. The first matching rule for each transaction will be applied (target account, contact, tax rate). Reconciled transactions are never touched.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowRunRulesDialog(false)}>Cancel</Button>
              <Button onClick={handleRunRules} disabled={runningRules}>
                {runningRules ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : "Run Rules"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showImportWizard && (
        <StatementImportWizard
          open={showImportWizard}
          bankAccount={selectedAccount}
          onClose={() => setShowImportWizard(false)}
          onImported={() => loadTransactions(selectedAccount.id)}
        />
      )}

    </div>
  );
}