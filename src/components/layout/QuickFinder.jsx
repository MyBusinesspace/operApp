import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { isDateOnly, parseDateOnly } from "@/lib/dateOnly";
import { batchedAll, withRetry } from "@/lib/apiHelpers";
import {
  Search, Users, FolderKanban, Wrench, ClipboardList, Package,
  UserCircle, FileText, Receipt, ShoppingCart, ArrowRight,
  ChevronDown, SlidersHorizontal, X
} from "lucide-react";

const ENTITY_SEARCHES = [
  { entity: "Contact", labelKey: "full_name", subKey: "company",
    fields: ["full_name","company","email","phone","reference"],
    route: id => `/contacts/${id}`, icon: Users, color: "text-blue-500" },
  { entity: "Project", labelKey: "name", subKey: "reference",
    fields: ["name","reference","contact_name"],
    route: id => `/projects/${id}`, icon: FolderKanban, color: "text-violet-500" },
  { entity: "WorkOrder", labelKey: "title", subKey: "reference",
    fields: ["title","reference","contact_name"],
    route: id => `/work-orders/${id}`, icon: Wrench, color: "text-amber-500" },
  { entity: "Asset", labelKey: "name", subKey: "serial_number",
    fields: ["name","serial_number","reference","contact_name"],
    route: id => `/assets/${id}`, icon: Package, color: "text-emerald-500" },
  { entity: "Employee", labelKey: "full_name", subKey: "email",
    fields: ["full_name","email","phone"],
    route: id => `/employees/${id}`, icon: UserCircle, color: "text-pink-500" },
  { entity: "Task", labelKey: "title", subKey: "reference",
    fields: ["title","reference","contact_name"],
    route: id => `/tasks/${id}`, icon: ClipboardList, color: "text-indigo-500" },
  { entity: "Invoice", labelKey: "contact_name", subKey: "number",
    fields: ["number","reference","contact_name"],
    route: id => `/sales/invoices/${id}/edit`, icon: FileText, color: "text-cyan-500",
    amountKey: "total", dateKey: "issue_date", numberKey: "number" },
  { entity: "Quote", labelKey: "contact_name", subKey: "number",
    fields: ["number","reference","contact_name"],
    route: id => `/sales/quotes/${id}/edit`, icon: FileText, color: "text-teal-500",
    amountKey: "total", dateKey: "issue_date", numberKey: "number" },
  { entity: "Bill", labelKey: "contact_name", subKey: "number",
    fields: ["number","reference","contact_name"],
    route: id => `/purchasing/bills/${id}/edit`, icon: Receipt, color: "text-rose-500",
    amountKey: "total", dateKey: "issue_date", numberKey: "number" },
  { entity: "PurchaseOrder", labelKey: "contact_name", subKey: "number",
    fields: ["number","reference","contact_name"],
    route: id => `/purchasing/purchase-orders/${id}/edit`, icon: ShoppingCart, color: "text-orange-500",
    amountKey: "total", dateKey: "issue_date", numberKey: "number" },
];

const PAGE_RESULTS = [
  { label: "Dashboard", route: "/", icon: ArrowRight },
  { label: "Tasks", route: "/tasks", icon: ClipboardList },
  { label: "Contacts", route: "/contacts", icon: Users },
  { label: "Projects", route: "/projects", icon: FolderKanban },
  { label: "Work Orders", route: "/work-orders", icon: Wrench },
  { label: "Assets", route: "/assets", icon: Package },
  { label: "Employees", route: "/employees", icon: UserCircle },
  { label: "Timesheets", route: "/timesheets", icon: ClipboardList },
  { label: "Invoices", route: "/sales/invoices", icon: FileText },
  { label: "Quotes", route: "/sales/quotes", icon: FileText },
  { label: "Bills", route: "/purchasing/bills", icon: Receipt },
  { label: "Purchase Orders", route: "/purchasing/purchase-orders", icon: ShoppingCart },
  { label: "Accounting", route: "/accounting", icon: FileText },
  { label: "Payroll", route: "/payroll", icon: UserCircle },
  { label: "Reports", route: "/reports", icon: FileText },
  { label: "Settings", route: "/settings", icon: ArrowRight },
  { label: "Planner", route: "/planner", icon: ClipboardList },
];

const SAMPLE_SIZE = 3;
const FETCH_LIMIT = 10;

function fmtAmount(val) {
  if (val == null) return "";
  return Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateShort(val) {
  if (!val) return "";
  // Date-only values are read from their stored day; real timestamps keep the local rendering
  const d = isDateOnly(val) ? parseDateOnly(val) : new Date(val);
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ResultRow({ icon: Icon, color, label, sub, amount, date, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${color || "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        {sub && (
          <p className="text-xs text-muted-foreground truncate">
            {sub}{date ? ` · ${fmtDateShort(date)}` : ""}
          </p>
        )}
      </div>
      {amount != null && (
        <span className="text-sm font-medium tabular-nums text-foreground flex-shrink-0">{fmtAmount(amount)}</span>
      )}
      <ChevronDown className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
    </button>
  );
}

export default function QuickFinder() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState(new Set());
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const STORAGE_KEY = "quickfinder_query";

  useEffect(() => {
    if (open) {
      const saved = sessionStorage.getItem(STORAGE_KEY) || "";
      setQuery(saved);
      setActiveIndex(0);
      setExpandedSections(new Set());
      setTimeout(() => {
        inputRef.current?.focus();
        if (inputRef.current && saved) {
          const len = saved.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim()) sessionStorage.setItem(STORAGE_KEY, query);
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [query]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const searchQ = q.trim();
      const fns = ENTITY_SEARCHES.map((cfg) => async () => {
        try {
          const orClauses = (cfg.fields || [cfg.labelKey, cfg.subKey]).map(f => ({
            [f]: { $regex: searchQ, $options: "i" },
          }));
          const res = await withRetry(() =>
            base44.entities[cfg.entity].filter(
              { $or: orClauses },
              { sort: "-updated_date", limit: FETCH_LIMIT }
            )
          );
          const items = Array.isArray(res) ? res : (res?.items || []);
          return items.map(item => ({
            type: cfg.entity,
            label: item[cfg.labelKey] || "Untitled",
            sub: cfg.numberKey ? item[cfg.numberKey] : item[cfg.subKey] || "",
            amount: cfg.amountKey ? item[cfg.amountKey] : null,
            date: cfg.dateKey ? item[cfg.dateKey] : null,
            icon: cfg.icon,
            color: cfg.color,
            onClick: () => { navigate(cfg.route(item.id)); setOpen(false); },
          }));
        } catch { return []; }
      });
      const all = (await batchedAll(fns, 1, 200)).flat();
      setResults(all);
      setActiveIndex(0);
      setExpandedSections(new Set());
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const pageMatches = query.trim()
    ? PAGE_RESULTS.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGE_RESULTS.slice(0, 6);

  const allItems = [
    ...results,
    ...pageMatches.map(p => ({
      type: "Page",
      label: p.label,
      sub: "Navigate",
      icon: p.icon,
      color: "text-muted-foreground",
      onClick: () => { navigate(p.route); setOpen(false); },
    })),
  ];

  const TYPE_LABELS = {
    Contact: "Contacts", Project: "Projects", WorkOrder: "Work Orders",
    Asset: "Assets", Employee: "Employees", Task: "Tasks",
    Invoice: "Invoices", Quote: "Quotes", Bill: "Bills",
    PurchaseOrder: "Purchase Orders", Page: "Pages",
  };

  const grouped = [];
  const seen = new Set();
  for (const item of allItems) {
    if (!seen.has(item.type)) {
      seen.add(item.type);
      grouped.push({ type: item.type, label: TYPE_LABELS[item.type] || item.type, items: [] });
    }
    grouped[grouped.length - 1].items.push(item);
  }

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && allItems[activeIndex]) { allItems[activeIndex].onClick(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-2xl mx-auto overflow-hidden">
        <DialogTitle className="sr-only">Quick Finder</DialogTitle>
        <div className="flex items-center border-b border-border px-3">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, projects, tasks, invoices, pages…"
            className="border-0 shadow-none focus-visible:ring-0 px-3 h-12 text-sm"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground flex-shrink-0 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <SlidersHorizontal className="w-4 h-4 text-primary flex-shrink-0 ml-1" />
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {loading && <p className="text-center text-xs text-muted-foreground py-4">Searching…</p>}
          {!loading && allItems.length === 0 && query.trim() && (
            <p className="text-center text-xs text-muted-foreground py-4">No results found for "{query}"</p>
          )}
          {!loading && allItems.length === 0 && !query.trim() && (
            <p className="text-center text-xs text-muted-foreground py-4">Start typing to search across the app</p>
          )}
          {grouped.map(group => {
            const isExpanded = expandedSections.has(group.type);
            const visibleItems = isExpanded ? group.items : group.items.slice(0, SAMPLE_SIZE);
            const hasMore = group.items.length > SAMPLE_SIZE;
            return (
              <div key={group.type}>
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {group.label} ({group.items.length})
                </div>
                {visibleItems.map((item) => {
                  const i = allItems.indexOf(item);
                  return (
                    <ResultRow
                      key={i}
                      icon={item.icon}
                      color={item.color}
                      label={item.label}
                      sub={item.sub || ""}
                      amount={item.amount}
                      date={item.date}
                      onClick={item.onClick}
                      active={i === activeIndex}
                    />
                  );
                })}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => {
                      const next = new Set(prev);
                      if (isExpanded) next.delete(group.type);
                      else next.add(group.type);
                      return next;
                    })}
                    className="w-full text-left px-3 py-2 text-xs text-primary hover:bg-primary/5 transition-colors"
                  >
                    {isExpanded ? "Show fewer" : `Show all ${group.items.length} ${group.label.toLowerCase()}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}