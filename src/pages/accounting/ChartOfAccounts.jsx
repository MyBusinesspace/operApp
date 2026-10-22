import { useState, useEffect, useMemo, Fragment } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { todayLocalISO } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronRight, ChevronDown, Archive, Edit2, Trash2, Settings, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import AccountFormModal from "@/components/accounting/AccountFormModal";
import AccountingSettingsModal from "@/components/accounting/AccountingSettingsModal";
import { toast } from "sonner";
import { formatBalance } from "@/lib/accountBalance";

const DEBIT_NORMAL = new Set(["Assets", "Expenses"]);
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/accountTypes";
import { useSortable } from "@/hooks/useSortable";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";
import { SortableSpan } from "@/components/shared/SortIcon";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

// TYPE_COLORS, ACCOUNT_TYPES, NORMAL_BALANCE come from @/lib/accountTypes

export default function ChartOfAccounts() {
  const { can } = usePermissionsMatrix();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("chart_of_accounts");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active");
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [ytdBalances, setYtdBalances] = useState({}); // current-year-to-date movement (P&L accounts)
  const [serverBalances, setServerBalances] = useState({}); // keyed by lowercase account_code
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [hasOpeningJournal, setHasOpeningJournal] = useState(false);


  const load = async () => {
    setLoading(true);
    const [accs, taxes] = await Promise.all([
      base44.entities.ChartOfAccount.list("-code", 5000),
      base44.entities.TaxRate.list("name", 100).catch(() => []),
    ]);
    setAccounts(accs);
    setTaxRates(taxes);
    setLoading(false);
    // Fetch balances server-side (handles 59k+ entries via pagination)
    // Client-side cache: reuse balances within 5 minutes to avoid re-fetching on navigation
    const CACHE_KEY = "coa_balances_cache";
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL) {
        setServerBalances(cached.balances || {});
        setYtdBalances(cached.ytd || {});
        return;
      }
    } catch {}
    setLoadingBalances(true);
    try {
      const yr = new Date().getFullYear();
      const todayStr = todayLocalISO();
      const [res, resYtd, openingCheck] = await Promise.all([
        base44.functions.invoke("getAccountBalances", {}),
        base44.functions.invoke("getAccountBalances", { periods: [{ from: `${yr}-01-01`, to: todayStr }] }).catch(() => null),
        base44.entities.JournalEntry.filter(
          { source_type: "OpeningBalance", status: "Posted" },
          { limit: 1, fields: ["id"] }
        ).catch(() => ({ items: [] })),
      ]);
      const balances = res.data?.balances || {};
      setServerBalances(balances);
      const ytd = resYtd?.data?.periodBalances?.[0]?.balances || {};
      setYtdBalances(ytd);
      const openingItems = openingCheck.items || openingCheck;
      setHasOpeningJournal(openingItems.length > 0);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ balances, ytd, timestamp: Date.now() })); } catch {}
    } catch (err) {
      console.error("Failed to load account balances:", err);
      setServerBalances({});
    }
    setLoadingBalances(false);
  };

  useEffect(() => { load(); }, []);

  // Build display balances: lookup by account_code, adjust for normal balance side
  const balances = useMemo(() => {
    const result = {};
    accounts.forEach((a) => {
      const code = String(a.code || "").trim().toLowerCase();
      const key = code || a.id;
      // Like Xero: balance-sheet accounts show the running balance; P&L accounts show current-year-to-date.
      const isPL = a.category === "Revenue" || a.category === "Expenses";
      const t = key ? (isPL ? (ytdBalances[key] || null) : serverBalances[key]) : null;
      if (!t) { result[a.id] = { balance: 0 }; return; }
      const isDebitNormal = DEBIT_NORMAL.has(a.category);
      const movement = isDebitNormal ? t.debit - t.credit : t.credit - t.debit;
      // If an OpeningBalance journal exists in the GL, opening_balance is
      // already included in the server movement — adding it again would
      // double-count. Fall back to chart opening only when no opening journal.
      const opening = (isPL || hasOpeningJournal) ? 0 : (a.opening_balance || 0);
      result[a.id] = { balance: opening + movement };
    });
    return result;
  }, [accounts, serverBalances, ytdBalances, hasOpeningJournal]);

  const filtered = useMemo(() => {
    return accounts
      .map((a) => ({ ...a, ytd_balance: balances[a.id]?.balance || 0 }))
      .filter(a => {
        const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.code && a.code.includes(search));
        const matchCategory = filterCategory === "All" || a.category === filterCategory;
        const matchStatus = filterStatus === "All" || a.status === filterStatus;
        return matchSearch && matchCategory && matchStatus;
      });
  }, [accounts, balances, search, filterCategory, filterStatus]);

  const { sortKey, sortDir, handleSort } = useSortable();

  const COLUMN_DEFS = [
    { key: "code", label: "Code", required: false },
    { key: "name", label: "Name", required: true },
    { key: "type", label: "Type", required: false },
    { key: "category", label: "Category", required: false },
    { key: "tax_rate_name", label: "Tax Rate", required: false },
    { key: "ytd_balance", label: "YTD Balance", required: false },
    { key: "status", label: "Status", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("coa_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { code: true, name: true, type: true, category: true, tax_rate_name: true, ytd_balance: true, status: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("coa_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const sortAccounts = (arr) => {
    if (!sortKey) return arr;
    return [...arr].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = (av ?? "").toString().toLowerCase();
      const bs = (bv ?? "").toString().toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  };

  // Top-level accounts grouped by type (in ACCOUNT_TYPES order), sorted within each group.
  const flatTopLevel = useMemo(() => {
    const groups = {};
    CATEGORIES.forEach(t => { groups[t] = []; });
    const others = [];
    filtered.forEach(a => {
      if (!a.parent_id) {
        if (groups[a.category]) groups[a.category].push(a);
        else others.push(a);
      }
    });
    const result = [];
    CATEGORIES.forEach(t => { sortAccounts(groups[t]).forEach(a => result.push(a)); });
    sortAccounts(others).forEach(a => result.push(a));
    return result;
     
  }, [filtered, sortKey, sortDir]);

  const pagination = useTablePagination(flatTopLevel, 25);
  const { pageItems, setPage } = pagination;
  const onSort = (key) => { handleSort(key); setPage(1); };

  const getChildren = (parentId) => sortAccounts(filtered.filter(a => a.parent_id === parentId));

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleEdit = (acc) => { setEditing(acc); setShowForm(true); };
  const handleNew = (parentAccount = null) => {
    setEditing(parentAccount ? { parent_id: parentAccount.id, parent_code: parentAccount.code, parent_name: parentAccount.name, type: parentAccount.type, category: parentAccount.category } : null);
    setShowForm(true);
  };

  // Xero rule: an account can be deleted only when it has no transactions; otherwise it can be archived.
  const hasMovements = async (acc) => {
    const j = await base44.entities.JournalEntry.filter({ "lines.account_id": acc.id }, { limit: 1, fields: ["id"] });
    if ((j?.items || j || []).length > 0) return true;
    const b = await base44.entities.BankTransaction.filter({ account_id: acc.id }, { limit: 1, fields: ["id"] });
    return (b?.items || b || []).length > 0;
  };

  const handleDelete = async (acc) => {
    if (acc.is_system) { toast.error("System accounts cannot be deleted."); return; }
    let used = true;
    try { used = await hasMovements(acc); } catch (e) { used = true; }
    if (used) {
      if (confirm(`"${acc.code} — ${acc.name}" has transactions, so it cannot be deleted. Archive it instead?`)) await handleArchive(acc);
      return;
    }
    if (!confirm(`Delete account "${acc.code} — ${acc.name}"? It has no transactions.`)) return;
    await base44.entities.ChartOfAccount.delete(acc.id);
    toast.success("Account deleted");
    load();
  };

  const handleArchive = async (acc) => {
    if (acc.is_system) { toast.error("System accounts cannot be archived."); return; }
    await base44.entities.ChartOfAccount.update(acc.id, { status: acc.status === "Active" ? "Archived" : "Active" });
    toast.success(acc.status === "Active" ? "Account archived" : "Account restored");
    load();
  };

  const handleSave = () => { setShowForm(false); setEditing(null); load(); };

  const renderAccount = (acc, depth = 0) => {
    const children = getChildren(acc.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded[acc.id];

    return (
      <div key={acc.id}>
        <div className={`department-table-row flex items-center gap-2 px-4 py-2.5 border-b border-border hover:bg-muted/30 group transition-colors ${depth > 0 ? "bg-muted/10" : ""}`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}>
          {/* Expand toggle */}
          <button className="w-5 h-5 flex items-center justify-center text-muted-foreground" onClick={() => hasChildren && toggleExpand(acc.id)}>
            {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
          </button>

          {/* Lock icon for system accounts */}
          <span className="w-4 shrink-0">
            {acc.is_system && <Lock className="w-3.5 h-3.5 text-muted-foreground/60" title="System account — protected" />}
          </span>

          {/* Code — plain text (not clickable) */}
          {visibleCols.code && (
            <span className="w-20 text-xs font-mono text-muted-foreground shrink-0">
              {acc.code || "—"}
            </span>
          )}

          {/* Name — opens edit modal */}
          <button
            onClick={() => handleEdit(acc)}
            className={`flex-1 text-left text-xs font-medium hover:text-primary hover:underline transition-colors truncate ${acc.status === "Archived" ? "line-through text-muted-foreground" : "text-foreground"}`}
            title="Edit account"
          >
            {acc.name}
          </button>

          {/* Type badge */}
          {visibleCols.type && <Badge className={`text-xs px-2 py-0 ${CATEGORY_COLORS[acc.category] || "bg-muted text-muted-foreground"}`}>{acc.type}</Badge>}

          {/* Category */}
          {visibleCols.category && acc.category && <span className="text-xs text-muted-foreground hidden lg:block w-28 truncate">{acc.category}</span>}

          {/* Tax rate */}
          {visibleCols.tax_rate_name && <span className="text-xs text-muted-foreground hidden md:block w-28 truncate">{acc.tax_rate_name || "Tax Exempt (0%)"}</span>}

          {/* YTD — clickable to open account detail */}
          {visibleCols.ytd_balance && (
          <Link to={`/accounting/chart-of-accounts/${acc.id}`} className={`text-xs font-mono tabular-nums hidden md:block w-28 text-right hover:underline transition-colors ${(balances[acc.id]?.balance || 0) < 0 ? "text-destructive" : (balances[acc.id]?.balance || 0) > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {formatBalance(balances[acc.id]?.balance || 0)}
          </Link>
          )}

          {/* Status */}
          {visibleCols.status && (
          <Badge variant="outline" className={`text-xs hidden sm:flex ${acc.status === "Active" ? "text-green-600 border-green-200" : "text-muted-foreground"}`}>
            {acc.status}
          </Badge>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {can("chart_of_accounts", "can_create") && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleNew(acc)} title="Add sub-account">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
            {can("chart_of_accounts", "can_edit") && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(acc)} title={acc.is_system ? "Edit (limited — system account)" : "Edit"}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {!acc.is_system && can("chart_of_accounts", "can_edit") && (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleArchive(acc)} title={acc.status === "Active" ? "Archive" : "Restore"}>
                  <Archive className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleDelete(acc)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
        {isExpanded && children.map(c => renderAccount(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{accounts.filter(a => a.status === "Active").length} active accounts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-1.5" /> Settings
          </Button>
          {can("chart_of_accounts", "can_create") && (
            <Button size="sm" onClick={() => handleNew()}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Account
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by code or name…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["All", ...CATEGORIES].map(t => (
            <button key={t} onClick={() => setFilterCategory(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCategory === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["Active", "Archived", "All"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:border-foreground/50"}`}>
              {s}
            </button>
          ))}
        </div>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Table */}
      <div className="department-table rounded-xl border border-border bg-card overflow-hidden">
        {/* Header row */}
        <div className="department-table-heading flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span className="w-5" />
          {visibleCols.code && <SortableSpan colKey="code" label="Code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-20" />}
          <SortableSpan colKey="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="flex-1" />
          {visibleCols.type && <SortableSpan colKey="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28" />}
          {visibleCols.category && <SortableSpan colKey="category" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="hidden lg:inline-flex w-28" />}
          {visibleCols.tax_rate_name && <SortableSpan colKey="tax_rate_name" label="Tax Rate" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="hidden md:inline-flex w-28" />}
          {visibleCols.ytd_balance && <SortableSpan colKey="ytd_balance" label={loadingBalances ? "YTD Balance ⟳" : "YTD Balance"} sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="hidden md:inline-flex w-28 justify-end" />}
          {visibleCols.status && <SortableSpan colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="hidden sm:inline-flex w-16" />}
          <span className="w-24" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-xs">Loading accounts…</div>
        ) : (
          <>
            {pageItems.map((acc, idx) => {
              const prevCat = idx > 0 ? pageItems[idx - 1].category : null;
              const showCatHeader = acc.category !== prevCat;
              return (
                <Fragment key={acc.id}>
                  {showCatHeader && (
                    <div className="px-4 py-2 bg-muted/20 border-b border-border">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[acc.category] || "bg-gray-100 text-gray-600"}`}>{acc.category}</span>
                    </div>
                  )}
                  {renderAccount(acc, 0)}
                </Fragment>
              );
            })}
          </>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-xs">No accounts found.</p>
            {can("chart_of_accounts", "can_create") && (
              <Button size="sm" className="mt-3" onClick={() => handleNew()}>Add first account</Button>
            )}
          </div>
        )}

        <DataTablePagination pagination={pagination} />
      </div>

      {showForm && (
        <AccountFormModal
          open={showForm}
          account={editing}
          accounts={accounts}
          taxRates={taxRates}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {showSettings && (
        <AccountingSettingsModal
          open={showSettings}
          accounts={accounts}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}