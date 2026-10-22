import React, { useState, useEffect, useMemo } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { formatDateValue } from "@/lib/dateOnly";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Package,
  CheckSquare, Trash2, ExternalLink, TrendingDown,
  Settings2, ChevronDown, ChevronUp, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import AssetDepreciationModal from "@/components/accounting/AssetDepreciationModal";
import AssetDepreciationSchedule from "@/components/accounting/AssetDepreciationSchedule";
import RunDepreciationModal from "@/components/accounting/RunDepreciationModal";
import RollbackDepreciationModal from "@/components/accounting/RollbackDepreciationModal";
import DataTablePagination from "@/components/shared/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useSortable } from "@/hooks/useSortable";
import { SortableSpan } from "@/components/shared/SortIcon";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}
function fmtCurrency(v) {
  if (!v && v !== 0) return "—";
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

const CATEGORY_COLORS = {
  Crane: "bg-indigo-100 text-indigo-700",
  Vehicle: "bg-orange-100 text-orange-700",
  Equipment: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  Hoist: "bg-sky-100 text-sky-700",
  Platform: "bg-teal-100 text-teal-700",
  Tool: "bg-purple-100 text-purple-700",
  Other: "bg-muted text-muted-foreground",
};

const STATUS_TAB = {
  draft:         { label: "Draft" },
  registered:    { label: "Registered" },
  sold_disposed: { label: "Sold/Disposed" },
};

export default function FixedAssets() {
  const { can } = usePermissionsMatrix();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("draft");
  const [search, setSearch] = usePersistedSearch("fixed_assets");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [assetGroups, setAssetGroups] = useState([]);
  const [assetCategories, setAssetCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "category", label: "Type", required: false },
    { key: "purchase_date", label: "Purchase Date", required: false },
    { key: "purchase_price", label: "Cost", required: false },
    { key: "book_value", label: "Book Value", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("fixed_assets_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, category: true, purchase_date: true, purchase_price: true, book_value: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("fixed_assets_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  // Depreciation modals
  const [deprModal, setDeprModal] = useState(null); // asset object
  const [showRunDepr, setShowRunDepr] = useState(false);
  const [showRollback, setShowRollback] = useState(false);

  // Expanded schedule rows
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    setLoading(true);
    const [all, groups, cats] = await Promise.all([
      base44.entities.Asset.list("-purchase_date", 5000),
      base44.entities.AssetGroup.list("name", 200).catch(() => []),
      base44.entities.AssetCategory.list("name", 200).catch(() => []),
    ]);
    // Accounting register only holds assets with a cost; operational assets without cost live in Assets.
    setAssets(all.filter(a => (a.purchase_price || 0) > 0));
    setAssetGroups(groups);
    setAssetCategories(cats);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getAcctStatus = (a) => a.accounting_status || "draft";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      if (getAcctStatus(a) !== tab) return false;
      if (filterCategory !== "all" && a.category !== filterCategory) return false;
      if (filterGroup !== "all" && a.group_id !== filterGroup) return false;
      if (!q) return true;
      return (
        a.name?.toLowerCase().includes(q) ||
        a.reference?.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.notes?.toLowerCase().includes(q)
      );
    });
  }, [assets, tab, search, filterCategory, filterGroup]);

  const { sortKey, sortDir, handleSort } = useSortable();

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const getVal = (a) => sortKey === "book_value"
      ? (a.purchase_price || 0) - (a.accumulated_depreciation || 0)
      : a[sortKey];
    return [...filtered].sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = (av ?? "").toString().toLowerCase();
      const bs = (bv ?? "").toString().toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [filtered, sortKey, sortDir]);

  const pagination = useTablePagination(sorted, 10);
  const { pageItems: paginated, page, setPage } = pagination;
  const onSort = (key) => { handleSort(key); setPage(1); };

  const counts = useMemo(() => {
    const c = { draft: 0, registered: 0, sold_disposed: 0 };
    assets.forEach(a => { const s = getAcctStatus(a); if (c[s] !== undefined) c[s]++; });
    return c;
  }, [assets]);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => {
    const ids = paginated.map(a => a.id);
    const allSelected = ids.every(id => selected.includes(id));
    setSelected(prev => allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };
  const allPageSelected = paginated.length > 0 && paginated.every(a => selected.includes(a.id));

  const handleRegister = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    await Promise.all(selected.map(id => base44.entities.Asset.update(id, { accounting_status: "registered" })));
    toast.success(`${selected.length} asset(s) registered`);
    setSelected([]);
    await load();
    setSaving(false);
  };

  const handleMarkDraft = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    await Promise.all(selected.map(id => base44.entities.Asset.update(id, { accounting_status: "draft" })));
    toast.success(`${selected.length} asset(s) moved to Draft`);
    setSelected([]);
    await load();
    setSaving(false);
  };

  const handleDispose = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Mark ${selected.length} asset(s) as Sold/Disposed?`)) return;
    setSaving(true);
    await Promise.all(selected.map(id => base44.entities.Asset.update(id, { accounting_status: "sold_disposed" })));
    toast.success(`${selected.length} asset(s) marked as Sold/Disposed`);
    setSelected([]);
    await load();
    setSaving(false);
  };



  // Summary stats for registered tab
  const registeredAssets = assets.filter(a => getAcctStatus(a) === "registered");
  const totalCost = registeredAssets.reduce((s, a) => s + (a.purchase_price || 0), 0);
  const totalAccumulated = registeredAssets.reduce((s, a) => s + (a.accumulated_depreciation || 0), 0);
  const totalBookValue = totalCost - totalAccumulated;
  const lastDepreciation = registeredAssets.map(a => a.last_depreciation_date).filter(Boolean).sort().reverse()[0];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-100">
            <TrendingDown className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Fixed Assets</h1>
            {lastDepreciation && (
              <p className="text-xs text-muted-foreground mt-0.5">Last depreciation: {fmtDate(lastDepreciation)}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {can("fixed_assets", "can_edit") && (
            <Button
              variant="outline" size="sm"
              onClick={() => setShowRollback(true)}
              className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
            >
              <RotateCcw className="w-4 h-4" />
              Rollback depreciation
            </Button>
          )}
          {can("fixed_assets", "can_edit") && (
            <Button
              variant="outline" size="sm"
              onClick={() => setShowRunDepr(true)}
              className="gap-1.5"
            >
              <TrendingDown className="w-4 h-4" />
              Run depreciation
            </Button>
          )}
          <Link to="/assets">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Package className="w-4 h-4" /> Operations Assets
            </Button>
          </Link>
        </div>
      </div>

      {/* Registered summary cards */}
      {tab === "registered" && registeredAssets.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Cost", value: fmtCurrency(totalCost), color: "text-foreground" },
            { label: "Accumulated Depreciation", value: fmtCurrency(totalAccumulated), color: "text-amber-600" },
            { label: "Net Book Value", value: fmtCurrency(totalBookValue), color: "text-primary" },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl border border-border bg-card">
              <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border">
        {Object.entries(STATUS_TAB).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(1); setSelected([]); setExpanded({}); }}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              tab === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, serial, reference, contact, project..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {assetCategories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterGroup} onValueChange={v => { setFilterGroup(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {assetGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          {tab === "draft" && (
            <Button size="sm" onClick={handleRegister} disabled={saving} className="gap-1.5">
              <CheckSquare className="w-4 h-4" /> Register
            </Button>
          )}
          {tab === "registered" && (
            <>
              {can("fixed_assets", "can_edit") && (
                <Button size="sm" variant="outline" onClick={handleMarkDraft} disabled={saving}>Move to Draft</Button>
              )}
              {can("fixed_assets", "can_delete") && (
                <Button size="sm" variant="outline" onClick={handleDispose} disabled={saving}
                  className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5">
                  <Trash2 className="w-4 h-4" /> Dispose
                </Button>
              )}
            </>
          )}
          {tab === "sold_disposed" && can("fixed_assets", "can_edit") && (
            <Button size="sm" variant="outline" onClick={handleMarkDraft} disabled={saving}>Restore to Draft</Button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="department-table rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-xs">Loading assets…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">No {STATUS_TAB[tab].label.toLowerCase()} assets found.</p>
            {tab === "draft" && (
              <p className="text-xs text-muted-foreground mt-1">
                Assets from Operations appear here.{" "}
                <Link to="/assets" className="text-primary hover:underline">Go to Assets →</Link>
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="department-table-heading flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} />
              <SortableSpan colKey="name" label="Asset name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="flex-1" />
              {visibleCols.reference && <SortableSpan colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28 hidden sm:inline-flex" />}
              {visibleCols.category && <SortableSpan colKey="category" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-24 hidden md:inline-flex" />}
              {visibleCols.purchase_date && <SortableSpan colKey="purchase_date" label="Purchase date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28 hidden lg:inline-flex" />}
              {visibleCols.purchase_price && <SortableSpan colKey="purchase_price" label="Cost" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28 hidden lg:inline-flex justify-end" />}
              {tab === "registered" && visibleCols.book_value && <SortableSpan colKey="book_value" label="Book value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28 hidden xl:inline-flex justify-end" />}
              <span className="w-20 text-right">Actions</span>
            </div>

            {paginated.map(a => {
              const isExpanded = !!expanded[a.id];
              const bookValue = (a.purchase_price || 0) - (a.accumulated_depreciation || 0);
              const hasDeprSetup = a.useful_life_years || a.depreciation_rate;

              return (
                <React.Fragment key={a.id}>
                  <div className={`department-table-row flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted/20 transition-colors group ${isExpanded ? "bg-muted/10" : ""}`}>
                    <Checkbox checked={selected.includes(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-foreground truncate">{a.name}</p>
                        {tab === "registered" && !hasDeprSetup && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">No depreciation setup</span>
                        )}
                      </div>
                      {a.serial_number && <p className="text-xs text-muted-foreground font-mono">{a.serial_number}</p>}
                    </div>
                    {visibleCols.reference && (
                      <span className="w-28 hidden sm:block">
                        {a.reference ? <span className="text-xs font-mono text-primary">{a.reference}</span> : <span className="text-xs text-muted-foreground/40">—</span>}
                      </span>
                    )}
                    {visibleCols.category && (
                      <span className="w-24 hidden md:block">
                        <Badge className={`text-xs px-2 py-0 ${CATEGORY_COLORS[a.category] || CATEGORY_COLORS.Other}`}>
                          {a.category || "Equipment"}
                        </Badge>
                      </span>
                    )}
                    {visibleCols.purchase_date && (
                      <span className="w-28 hidden lg:block text-xs text-muted-foreground">{fmtDate(a.purchase_date)}</span>
                    )}
                    {visibleCols.purchase_price && (
                      <span className="w-28 hidden lg:block text-right text-xs font-mono text-foreground">
                        {a.purchase_price ? fmtCurrency(a.purchase_price) : "—"}
                      </span>
                    )}
                    {tab === "registered" && visibleCols.book_value && (
                      <span className="w-28 hidden xl:block text-right text-xs font-mono font-semibold text-primary">
                        {a.purchase_price ? fmtCurrency(bookValue) : "—"}
                      </span>
                    )}
                    <div className="w-20 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Depreciation settings button */}
                      <button
                        onClick={() => setDeprModal(a)}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                        title="Depreciation settings"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      {/* Schedule toggle */}
                      {hasDeprSetup && (
                        <button
                          onClick={() => setExpanded(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                          title="View depreciation schedule"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <Link to={`/assets/${a.id}`}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                        title="View in Operations">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Depreciation schedule panel */}
                  {isExpanded && (
                    <div className="px-6 py-4 bg-muted/5 border-b border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Depreciation Schedule</p>
                      <AssetDepreciationSchedule asset={a} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Pagination */}
            <DataTablePagination pagination={pagination} />
          </>
        )}
      </div>

      {/* Rollback Depreciation Modal */}
      {showRollback && (
        <RollbackDepreciationModal
          open={showRollback}
          onClose={() => setShowRollback(false)}
          onComplete={() => { setShowRollback(false); load(); }}
        />
      )}

      {/* Run Depreciation Modal */}
      {showRunDepr && (
        <RunDepreciationModal
          open={showRunDepr}
          assets={assets}
          onClose={() => setShowRunDepr(false)}
          onComplete={() => { setShowRunDepr(false); load(); }}
        />
      )}

      {/* Depreciation Setup Modal */}
      {deprModal && (
        <AssetDepreciationModal
          open={!!deprModal}
          asset={deprModal}
          onClose={() => setDeprModal(null)}
          onSave={() => { setDeprModal(null); load(); toast.success("Depreciation settings saved"); }}
        />
      )}
    </div>
  );
}