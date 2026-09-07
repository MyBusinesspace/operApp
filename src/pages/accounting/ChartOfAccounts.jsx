import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronRight, ChevronDown, Archive, Edit2, Trash2, Settings, Lock, Download, Loader2 } from "lucide-react";
import AccountFormModal from "@/components/accounting/AccountFormModal";
import AccountingSettingsModal from "@/components/accounting/AccountingSettingsModal";
import { toast } from "sonner";
import { XERO_DEFAULT_COA } from "@/lib/xeroDefaultCOA";

const TYPE_COLORS = {
  "Asset": "bg-blue-100 text-blue-700",
  "Liability": "bg-orange-100 text-orange-700",
  "Equity": "bg-purple-100 text-purple-700",
  "Revenue": "bg-green-100 text-green-700",
  "Expense": "bg-red-100 text-red-700",
  "Other Income": "bg-teal-100 text-teal-700",
  "Other Expense": "bg-rose-100 text-rose-700",
  "Cost of Sales": "bg-yellow-100 text-yellow-700",
};

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense", "Other Income", "Other Expense", "Cost of Sales"];

const NORMAL_BALANCE = {
  "Asset": "Debit",
  "Expense": "Debit",
  "Cost of Sales": "Debit",
  "Other Expense": "Debit",
  "Liability": "Credit",
  "Equity": "Credit",
  "Revenue": "Credit",
  "Other Income": "Credit",
};

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active");
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [showDefaultConfirm, setShowDefaultConfirm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [accs, taxes] = await Promise.all([
      base44.entities.ChartOfAccount.list("-code", 500),
      base44.entities.TaxRate.list("name", 100).catch(() => []),
    ]);
    setAccounts(accs);
    setTaxRates(taxes);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return accounts.filter(a => {
      const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.code && a.code.includes(search));
      const matchType = filterType === "All" || a.type === filterType;
      const matchStatus = filterStatus === "All" || a.status === filterStatus;
      return matchSearch && matchType && matchStatus;
    });
  }, [accounts, search, filterType, filterStatus]);

  // Group by type, then build tree
  const tree = useMemo(() => {
    const grouped = {};
    ACCOUNT_TYPES.forEach(t => { grouped[t] = []; });
    const otherAccounts = [];
    filtered.forEach(a => {
      if (!a.parent_id) {
        if (grouped[a.type]) {
          grouped[a.type].push(a);
        } else {
          otherAccounts.push(a);
        }
      }
    });
    return { grouped, otherAccounts };
  }, [filtered]);

  const getChildren = (parentId) => filtered.filter(a => a.parent_id === parentId);

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleEdit = (acc) => { setEditing(acc); setShowForm(true); };
  const handleNew = (parentAccount = null) => {
    setEditing(parentAccount ? { parent_id: parentAccount.id, parent_code: parentAccount.code, parent_name: parentAccount.name, type: parentAccount.type } : null);
    setShowForm(true);
  };

  const handleDelete = async (acc) => {
    if (acc.is_system) { toast.error("System accounts cannot be deleted."); return; }
    if (!confirm(`Delete account "${acc.code} — ${acc.name}"?`)) return;
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

  const handleLoadXeroDefault = async () => {
    setShowDefaultConfirm(false);
    setLoadingDefault(true);
    try {
      // Deduplicate by code — skip codes that already exist
      const existingCodes = new Set(accounts.map(a => a.code).filter(Boolean));
      const toCreate = XERO_DEFAULT_COA.filter(a => !existingCodes.has(a.code));
      if (toCreate.length === 0) {
        toast.info("All default accounts already exist.");
        setLoadingDefault(false);
        return;
      }
      // Bulk create in batches of 50
      for (let i = 0; i < toCreate.length; i += 50) {
        await base44.entities.ChartOfAccount.bulkCreate(toCreate.slice(i, i + 50));
      }
      toast.success(`${toCreate.length} Xero default accounts loaded successfully.`);
      load();
    } catch (err) {
      toast.error("Failed to load default accounts: " + err.message);
    }
    setLoadingDefault(false);
  };

  const renderAccount = (acc, depth = 0) => {
    const children = getChildren(acc.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded[acc.id];

    return (
      <div key={acc.id}>
        <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-border hover:bg-muted/30 group transition-colors ${depth > 0 ? "bg-muted/10" : ""}`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}>
          {/* Expand toggle */}
          <button className="w-5 h-5 flex items-center justify-center text-muted-foreground" onClick={() => hasChildren && toggleExpand(acc.id)}>
            {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
          </button>

          {/* Lock icon for system accounts */}
          <span className="w-4 shrink-0">
            {acc.is_system && <Lock className="w-3.5 h-3.5 text-muted-foreground/60" title="System account — protected" />}
          </span>

          {/* Code */}
          <span className="w-20 text-sm font-mono text-muted-foreground shrink-0">{acc.code || "—"}</span>

          {/* Name */}
          <span className={`flex-1 text-sm font-medium ${acc.status === "Archived" ? "line-through text-muted-foreground" : ""}`}>{acc.name}</span>

          {/* Type badge */}
          <Badge className={`text-xs px-2 py-0 ${TYPE_COLORS[acc.type] || "bg-muted text-muted-foreground"}`}>{acc.type}</Badge>

          {/* Subtype */}
          {acc.subtype && <span className="text-xs text-muted-foreground hidden lg:block w-36 truncate">{acc.subtype}</span>}

          {/* Tax rate */}
          <span className="text-xs text-muted-foreground hidden md:block w-28 truncate">{acc.tax_rate_name || "Tax Exempt (0%)"}</span>

          {/* YTD */}
          <span className={`text-xs font-mono hidden lg:block w-28 text-right ${acc.ytd_balance < 0 ? "text-destructive" : acc.ytd_balance > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {acc.ytd_balance !== undefined && acc.ytd_balance !== null && acc.ytd_balance !== 0
              ? acc.ytd_balance.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "0.00"}
          </span>

          {/* Status */}
          <Badge variant="outline" className={`text-xs hidden sm:flex ${acc.status === "Active" ? "text-green-600 border-green-200" : "text-muted-foreground"}`}>
            {acc.status}
          </Badge>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleNew(acc)} title="Add sub-account">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(acc)} title={acc.is_system ? "Edit (limited — system account)" : "Edit"}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            {!acc.is_system && (
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
          <p className="text-sm text-muted-foreground mt-0.5">{accounts.filter(a => a.status === "Active").length} active accounts</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-1.5" /> Settings
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setShowDefaultConfirm(true)}
            disabled={loadingDefault}
            className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            {loadingDefault ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Load Xero Default COA
          </Button>
          <Button size="sm" onClick={() => handleNew()}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Account
          </Button>
        </div>

        {/* Confirm dialog */}
        {showDefaultConfirm && (
          <div className="w-full mt-2 p-3 rounded-lg bg-violet-50 border border-violet-200 flex items-center gap-3 flex-wrap">
            <p className="text-xs text-violet-800 flex-1">
              This will load the standard Xero Chart of Accounts (UAE/International). Existing accounts with the same code will be skipped. You can add or customize accounts afterwards.
            </p>
            <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={handleLoadXeroDefault}>
              Yes, load defaults
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowDefaultConfirm(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by code or name…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["All", ...ACCOUNT_TYPES].map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50"}`}>
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
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span className="w-5" />
          <span className="w-20">Code</span>
          <span className="flex-1">Name</span>
          <span className="w-24">Type</span>
          <span className="hidden lg:block w-36">Subtype</span>
          <span className="hidden md:block w-28">Tax Rate</span>
          <span className="hidden lg:block w-28 text-right">YTD</span>
          <span className="hidden sm:block w-16">Status</span>
          <span className="w-24" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading accounts…</div>
        ) : (
          <>
            {ACCOUNT_TYPES.map(type => {
              const topLevel = tree.grouped[type];
              if (!topLevel || topLevel.length === 0) return null;
              return (
                <div key={type}>
                  <div className="px-4 py-2 bg-muted/20 border-b border-border">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>{type}</span>
                  </div>
                  {topLevel.map(acc => renderAccount(acc, 0))}
                </div>
              );
            })}
            {tree.otherAccounts.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-muted/20 border-b border-border">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Other</span>
                </div>
                {tree.otherAccounts.map(acc => renderAccount(acc, 0))}
              </div>
            )}
          </>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-sm">No accounts found.</p>
            <Button size="sm" className="mt-3" onClick={() => handleNew()}>Add first account</Button>
          </div>
        )}
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