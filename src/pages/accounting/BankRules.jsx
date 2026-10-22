import { useState, useEffect, useMemo } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, ScrollText, Pencil, X,
  GripVertical, ChevronDown, Play, ArrowLeftRight,
  ArrowDownLeft, ArrowUpRight, CheckSquare, Square
} from "lucide-react";
import BankRuleFormModal from "@/components/banking/BankRuleFormModal";
import { toast } from "sonner";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

const RULE_TYPE_META = {
  spend:   { label: "Spend money rules",   icon: ArrowUpRight,   color: "text-red-600",   bg: "bg-red-50" },
  receive: { label: "Receive money rules", icon: ArrowDownLeft,  color: "text-green-600", bg: "bg-green-50" },
  transfer:{ label: "Transfer money rules",icon: ArrowLeftRight, color: "text-blue-600",  bg: "bg-blue-50" },
};

const FIELD_LABELS = { description: "Description", payee: "Payee", reference: "Reference", amount: "Amount" };
const OPERATOR_LABELS = {
  equals: "equals", contains: "contains", starts_with: "starts with",
  ends_with: "ends with", is_blank: "is blank", greater_than: ">", less_than: "<",
};

function describeConditions(rule) {
  const conds = rule.conditions || [];
  if (conds.length === 0) return "No conditions — matches everything";
  const join = rule.match_type === "any" ? " OR " : " AND ";
  return conds.map(c => {
    const field = FIELD_LABELS[c.field] || c.field;
    const op = OPERATOR_LABELS[c.operator] || c.operator;
    if (c.operator === "is_blank") return `${field} ${op}`;
    return `${field} ${op} "${c.value || ""}"`;
  }).join(join);
}

export default function BankRules() {
  const { can } = usePermissionsMatrix();
  const [rules, setRules] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [chartAccounts, setChartAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("bank_rules");
  const [activeTab, setActiveTab] = useState("spend");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showHero, setShowHero] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [showVideo, setShowVideo] = useState(false);

  const VIDEO_URL = "https://media.base44.com/videos/public/6a201f5ce89c0f167dbe847d/0ea877184_Bank_Rules_Tutorial.mp4";

  const load = async () => {
    setLoading(true);
    try {
      const [r, b, cPage, ct] = await Promise.all([
        base44.entities.BankRule.list("-created_date", 5000).catch(() => []),
        base44.entities.BankAccount.list("-created_date", 5000).catch(() => []),
        base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 }).catch(() => ({ items: [] })),
        base44.entities.Contact.list("-created_date", 5000).catch(() => []),
      ]);
      setRules(r);
      setBankAccounts(b);
      setChartAccounts(cPage.items || []);
      setContacts(ct);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rules
      .filter(r => r.rule_type === activeTab)
      .filter(r => !s || r.name?.toLowerCase().includes(s) || describeConditions(r).toLowerCase().includes(s))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [rules, activeTab, search]);

  const tabCounts = useMemo(() => ({
    spend: rules.filter(r => r.rule_type === "spend").length,
    receive: rules.filter(r => r.rule_type === "receive").length,
    transfer: rules.filter(r => r.rule_type === "transfer").length,
  }), [rules]);

  const handleDelete = async (rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await base44.entities.BankRule.delete(rule.id);
    toast.success("Rule deleted");
    load();
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)));
  };

  const handleReorder = async (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const reordered = [...filtered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Reassign sort_order and persist
    const updates = reordered.map((r, i) => ({ id: r.id, sort_order: i }));
    setRules(prev => {
      const next = [...prev];
      reordered.forEach((r, i) => {
        const idx = next.findIndex(x => x.id === r.id);
        if (idx >= 0) next[idx] = { ...next[idx], sort_order: i };
      });
      return next;
    });
    try {
      await base44.entities.BankRule.bulkUpdate(updates);
    } catch { /* ignore — local state already updated */ }
  };

  const handleDragStart = (idx) => setDragIndex(idx);
  const handleDragOver = (e, idx) => { e.preventDefault(); };
  const handleDrop = (idx) => {
    if (dragIndex !== null) handleReorder(dragIndex, idx);
    setDragIndex(null);
  };

  const handleSave = async (form) => {
    if (editing) await base44.entities.BankRule.update(editing.id, form);
    else await base44.entities.BankRule.create({ ...form, sort_order: rules.filter(r => r.rule_type === form.rule_type).length });
    setShowForm(false);
    setEditing(null);
    load();
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (rule) => { setEditing(rule); setShowForm(true); };

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="px-6 pt-4 pb-0 border-b border-border bg-card">
        <Link to="/accounting/banks" className="text-xs text-muted-foreground hover:text-primary transition-colors">Bank accounts</Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Bank rules</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ChevronDown className="w-3.5 h-3.5" /> Reconcile
            </Button>
            {can("bank_rules", "can_create") && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" /> Create rule
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center mt-3">
          <button className="px-5 py-3 text-xs font-semibold border-b-2 border-primary text-primary">
            Bank rules
          </button>
          {Object.entries(RULE_TYPE_META).map(([key, meta]) => (
            <button key={key} onClick={() => { setActiveTab(key); setSelectedIds(new Set()); }}
              className={`px-5 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}>
              {meta.label} ({tabCounts[key]})
            </button>
          ))}
        </div>
      </div>

      {/* Educational hero (dismissible) */}
      {showHero && (
        <div className="mx-6 mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl p-5 flex items-start gap-5">
          <div className="hidden sm:flex w-28 h-28 rounded-xl bg-white dark:bg-card border border-blue-100 dark:border-blue-900/40 items-center justify-center shrink-0">
            <div className="relative">
              <ScrollText className="w-12 h-12 text-blue-300" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-white fill-white" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Learn how to automatically categorise your regular transactions with bank rules
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Bank rules save you manually creating a new transaction each time you get a recurring or similar type of bank statement line
            </p>
            <a className="text-xs text-primary hover:underline cursor-pointer">Learn more about creating and managing bank rules</a>
            <div className="mt-3">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowVideo(true)}>
                <Play className="w-3.5 h-3.5" /> Watch video
              </Button>
            </div>
          </div>
          <button onClick={() => setShowHero(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
            Close
          </button>
        </div>
      )}

      {/* Search */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search bank rules by name or condition" className="pl-9 pr-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-card">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground text-xs">Loading bank rules…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <ScrollText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-1">No {RULE_TYPE_META[activeTab].label.toLowerCase()} yet.</p>
            <p className="text-xs text-muted-foreground/70 mb-4">Create a rule to automatically categorise recurring transactions.</p>
            {can("bank_rules", "can_create") && (
              <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> Create rule</Button>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                <th className="w-8 px-3 py-2.5 text-left" onClick={toggleSelectAll}>
                  {filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground" />}
                </th>
                <th className="w-8 px-2 py-2.5" />
                <th className="w-8 px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((rule, idx) => {
                const meta = RULE_TYPE_META[rule.rule_type] || RULE_TYPE_META.spend;
                const Icon = meta.icon;
                return (
                  <tr key={rule.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    className={`border-b border-border hover:bg-muted/20 transition-colors group ${dragIndex === idx ? "opacity-40" : ""}`}>
                    <td className="px-3 py-3" onClick={() => handleToggleSelect(rule.id)}>
                      {selectedIds.has(rule.id)
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4 text-muted-foreground" />}
                    </td>
                    <td className="px-2 py-3 cursor-grab text-muted-foreground/40 hover:text-muted-foreground">
                      <GripVertical className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-3 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                          <Icon className={`w-4 h-4 ${meta.color}`} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground leading-tight">{rule.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{describeConditions(rule)}</p>
                          {rule.target_account_name && (
                            <p className="text-xs text-muted-foreground/60 mt-0.5">
                              → <span className="font-mono">{rule.target_account_code || ""}</span> {rule.target_account_name}
                              {rule.contact_name ? ` · ${rule.contact_name}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {can("bank_rules", "can_edit") && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(rule)}>
                          <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} rule${selectedIds.size > 1 ? "s" : ""} selected.`
              : "No rules selected. Drag and drop to set their order so they run in the right sequence."}
          </div>
        )}
      </div>

      {showForm && (
        <BankRuleFormModal
          open={showForm}
          rule={editing}
          defaultRuleType={activeTab}
          bankAccounts={bankAccounts}
          chartAccounts={chartAccounts}
          contacts={contacts}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Video modal */}
      {showVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowVideo(false)}>
          <div className="relative w-full max-w-3xl bg-black rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowVideo(false)} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
            <video src={VIDEO_URL} controls autoPlay className="w-full aspect-video">
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}
    </div>
  );
}