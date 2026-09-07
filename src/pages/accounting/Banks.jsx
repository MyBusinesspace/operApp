import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Building2, CheckCircle2, Circle,
  Edit2, Trash2, ChevronLeft, ExternalLink, ChevronDown,
  FileText, DollarSign, ArrowLeftRight, ListChecks, Settings2, UploadCloud
} from "lucide-react";
import BankAccountFormModal from "@/components/banking/BankAccountFormModal";
import BankTransactionFormModal from "@/components/banking/BankTransactionFormModal";
import BankTransactionDetailPanel from "@/components/banking/BankTransactionDetailPanel";
import ReconcileTab from "@/components/banking/ReconcileTab";
import CashCodingTab from "@/components/banking/CashCodingTab";
import StatementImportWizard from "@/components/banking/StatementImportWizard";
import { toast } from "sonner";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Banks() {
  const location = useLocation();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [chartAccounts, setChartAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [pendingTxId, setPendingTxId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const [showBankForm, setShowBankForm] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [detailTx, setDetailTx] = useState(null);
  const [activeTab, setActiveTab] = useState("account_transactions");
  const [showManageMenu, setShowManageMenu] = useState(false);
  const manageMenuRef = useRef(null);
  const [showImportWizard, setShowImportWizard] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (manageMenuRef.current && !manageMenuRef.current.contains(e.target)) setShowManageMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadBanks = async () => {
    setLoading(true);
    const banks = await base44.entities.BankAccount.list("-created_date", 200);
    setBankAccounts(banks);
    setLoading(false);
  };

  const loadChartAccounts = async () => {
    const coa = await base44.entities.ChartOfAccount.filter({ status: "Active" });
    setChartAccounts(coa);
  };

  const loadTransactions = async (accountId) => {
    setTxLoading(true);
    const txs = await base44.entities.BankTransaction.filter({ bank_account_id: accountId }, "-date");
    setTransactions(txs);
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
      const tx = await base44.entities.BankTransaction.filter({ id: pendingTxId }).catch(() => []);
      if (tx && tx[0]) {
        const acct = bankAccounts.find(b => b.id === tx[0].bank_account_id);
        if (acct) {
          setSelectedAccount(acct);
          setActiveTab("account_transactions");
          setDetailTx(tx[0]);
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

  const txWithBalance = useMemo(() => {
    let bal = selectedAccount?.opening_balance || 0;
    return sortedTx.map(tx => {
      if (tx.type === "Receive Money") bal += tx.amount;
      else if (tx.type === "Spend Money") bal -= tx.amount;
      return { ...tx, _balance: bal };
    }).reverse(); // newest first for display
  }, [sortedTx, selectedAccount]);

  const statementBalance = txWithBalance.length > 0 ? txWithBalance[0]._balance : (selectedAccount?.opening_balance || 0);

  const filteredTx = useMemo(() => {
    return txWithBalance.filter(tx => {
      const s = search.toLowerCase();
      const matchSearch = !search || tx.description?.toLowerCase().includes(s) || tx.reference?.toLowerCase().includes(s) || tx.contact_name?.toLowerCase().includes(s);
      const matchStatus = filterStatus === "All" || tx.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [txWithBalance, search, filterStatus]);

  const reconciledCount = transactions.filter(t => t.status === "Reconciled").length;
  const unreconciledCount = transactions.filter(t => t.status === "Unreconciled").length;

  const handleDeleteBank = async (bank) => {
    if (!confirm(`Delete "${bank.name}"? All transactions will also be deleted.`)) return;
    const txs = await base44.entities.BankTransaction.filter({ bank_account_id: bank.id });
    await Promise.all(txs.map(t => base44.entities.BankTransaction.delete(t.id)));
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

  // ── ACCOUNT LIST VIEW ──────────────────────────────────────────────────────
  if (!selectedAccount) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{bankAccounts.filter(b => b.status === "Active").length} active accounts</p>
          </div>
          <Button size="sm" onClick={() => { setEditingBank(null); setShowBankForm(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Bank Account
          </Button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
        ) : bankAccounts.length === 0 ? (
          <div className="py-20 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-3">No bank accounts yet.</p>
            <Button size="sm" onClick={() => { setEditingBank(null); setShowBankForm(true); }}>Add first bank account</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map(bank => (
              <div key={bank.id}
                className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all cursor-pointer group relative"
                onClick={() => setSelectedAccount(bank)}>
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: bank.color || "#6366f1" }} />
                <div className="flex items-start justify-between mt-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: bank.color || "#6366f1" }}>
                      {bank.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{bank.name}</p>
                      {bank.bank_name && <p className="text-xs text-muted-foreground">{bank.bank_name}{bank.account_number ? ` ···${bank.account_number}` : ""}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingBank(bank); setShowBankForm(true); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleDeleteBank(bank)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{bank.account_type} · {bank.currency}</p>
                  <p className="text-xs text-muted-foreground mt-3">Opening balance</p>
                  <p className="text-xl font-bold text-foreground">{num(bank.opening_balance)} {bank.currency}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Badge variant="outline" className={`text-xs ${bank.status === "Active" ? "text-green-600 border-green-200" : "text-muted-foreground"}`}>
                    {bank.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
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
    <div className="flex flex-col h-full">
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
                      <button key={label} className="block w-full text-left text-sm text-primary hover:underline py-0.5"
                        onClick={() => { setShowManageMenu(false); setEditingTx({ type }); setShowTxForm(true); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reconcile</p>
                    <button className="block w-full text-left text-sm text-primary hover:underline py-0.5"
                      onClick={() => { setShowManageMenu(false); setActiveTab("reconcile"); }}>
                      Reconcile Account
                    </button>
                  </div>
                </div>
                <div className="border-t border-border mt-1 pt-1">
                  <button className="block w-full text-left text-sm text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-muted/50"
                    onClick={() => { setShowManageMenu(false); setEditingBank(selectedAccount); setShowBankForm(true); }}>
                    Edit Account Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Account identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: selectedAccount.color || "#6366f1" }}>
              {selectedAccount.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{selectedAccount.name}
                {selectedAccount.account_number && <span className="text-sm font-normal text-muted-foreground ml-2">···{selectedAccount.account_number}</span>}
              </h1>
              {selectedAccount.bank_name && <p className="text-sm text-muted-foreground">{selectedAccount.bank_name}</p>}
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

        {/* Sub-stats */}
        <div className="flex gap-6 mt-4 pt-3 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Total Received</p>
            <p className="text-sm font-semibold text-success">
              +{num(transactions.filter(t => t.type === "Receive Money").reduce((s, t) => s + t.amount, 0))} {selectedAccount.currency}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className="text-sm font-semibold text-destructive">
              −{num(transactions.filter(t => t.type === "Spend Money").reduce((s, t) => s + t.amount, 0))} {selectedAccount.currency}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reconciled / Total</p>
            <p className="text-sm font-semibold text-foreground">{reconciledCount} / {transactions.length}</p>
          </div>
        </div>
      </div>

      {/* Xero-style tabs */}
      <div className="px-6 border-b border-border bg-card">
        <div className="flex items-center">
          {[
            { key: "reconcile", label: "Reconcile" },
            { key: "cash_coding", label: "Cash Coding" },
            { key: "bank_statements", label: "Bank Statements" },
            { key: "account_transactions", label: "Account Transactions" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
        <div className="flex-1 overflow-hidden">
          <ReconcileTab
            key={transactions.map(t => t.id + t.status).join(",")}
            bankAccount={selectedAccount}
            unreconciled={txWithBalance.filter(t => t.status === "Unreconciled")}
            chartAccounts={chartAccounts}
            onRefresh={() => loadTransactions(selectedAccount.id)}
          />
        </div>
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
          <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search transactions…" className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {["All", "Unreconciled", "Reconciled"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
                  {s}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filteredTx.length} transactions</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/60 border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Type</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Payee</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Particulars</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden md:table-cell">Reference</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Spent</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Received</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Balance</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr><td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">Loading transactions…</td></tr>
                ) : filteredTx.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
                    {transactions.length === 0 ? "No transactions yet." : "No transactions match the current filter."}
                  </td></tr>
                ) : filteredTx.map(tx => (
                  <tr key={tx.id} className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setDetailTx(tx)}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap w-28 text-xs">{tx.date}</td>
                    <td className="px-4 py-3 w-24">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${tx.type === "Receive Money" ? "bg-green-100 text-green-700" : tx.type === "Spend Money" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {tx.type === "Receive Money" ? "Credit" : tx.type === "Spend Money" ? "Debit" : "Transfer"}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-32 text-xs text-foreground font-medium truncate max-w-[8rem]">{tx.contact_name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-foreground text-xs leading-snug">{tx.description}</span>
                        {tx.source_number && (
                          <span className="text-xs text-primary/80">{tx.source_number}</span>
                        )}
                        {tx.account_name && <span className="text-xs text-muted-foreground/60">{tx.account_name}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell w-32">{tx.reference || "—"}</td>
                    <td className="px-4 py-3 text-right w-28 tabular-nums text-xs">
                      {tx.type === "Spend Money" ? <span className="text-foreground font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right w-28 tabular-nums text-xs">
                      {tx.type === "Receive Money" ? <span className="text-success font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right w-28 tabular-nums text-xs">
                      <span className={`font-semibold ${tx._balance < 0 ? "text-destructive" : "text-foreground"}`}>
                        {tx._balance < 0 ? `(${num(Math.abs(tx._balance))})` : num(tx._balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center w-28">
                      <span className={`text-xs font-medium ${tx.status === "Reconciled" ? "text-success" : "text-orange-500"}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Account Transactions tab */}
      {activeTab === "account_transactions" && (
        <>
          <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={() => { setEditingTx(null); setShowTxForm(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> New Transaction
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImportWizard(true)}>
              <UploadCloud className="w-4 h-4 mr-1.5" /> Import Statement
            </Button>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search transactions…" className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {["All", "Unreconciled", "Reconciled"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/60 border-b border-border">
                  <th className="px-4 py-2.5 w-8" />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell w-36">Reference</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Spent</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Received</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Balance</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Status</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr><td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">Loading transactions…</td></tr>
                ) : filteredTx.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
                    {transactions.length === 0 ? "No transactions yet. Add your first one." : "No transactions match the current filter."}
                  </td></tr>
                ) : filteredTx.map(tx => (
                  <tr key={tx.id} className="border-b border-border hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => setDetailTx(tx)}>
                    <td className="px-4 py-3 w-8" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleToggleReconcile(tx)} title={tx.status === "Reconciled" ? "Mark unreconciled" : "Mark reconciled"}
                        className="text-muted-foreground hover:text-success transition-colors">
                        {tx.status === "Reconciled"
                          ? <CheckCircle2 className="w-4 h-4 text-success" />
                          : <Circle className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap w-28">{tx.date}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground leading-snug">{tx.description}</span>
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
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell w-36">{tx.reference || "—"}</td>
                    <td className="px-4 py-3 text-right w-32 tabular-nums">
                      {tx.type === "Spend Money" ? <span className="text-foreground font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right w-32 tabular-nums">
                      {tx.type === "Receive Money" ? <span className="text-foreground font-medium">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right w-32 tabular-nums">
                      <span className={`font-semibold ${tx._balance < 0 ? "text-destructive" : "text-foreground"}`}>
                        {tx._balance < 0 ? `(${num(Math.abs(tx._balance))})` : num(tx._balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center w-28">
                      <span className={`text-xs font-medium ${tx.status === "Reconciled" ? "text-success" : "text-orange-500"}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-20" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTx(tx); setShowTxForm(true); }}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDeleteTx(tx)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {showImportWizard && (
        <StatementImportWizard
          open={showImportWizard}
          bankAccount={selectedAccount}
          onClose={() => setShowImportWizard(false)}
          onImported={() => loadTransactions(selectedAccount.id)}
        />
      )}

      {detailTx && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDetailTx(null)} />
          <BankTransactionDetailPanel
            tx={detailTx}
            currency={selectedAccount.currency}
            onClose={() => setDetailTx(null)}
            onReconcileToggle={async (tx) => {
              await handleToggleReconcile(tx);
              const updated = transactions.find(t => t.id === tx.id);
              if (updated) setDetailTx({ ...updated, status: tx.status === "Reconciled" ? "Unreconciled" : "Reconciled" });
            }}
            onEdit={(tx) => { setDetailTx(null); setEditingTx(tx); setShowTxForm(true); }}
            onDelete={handleDeleteTx}
          />
        </>
      )}
    </div>
  );
}