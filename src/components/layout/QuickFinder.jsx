import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { batchedAll, withCache } from "@/lib/apiHelpers";
import {
  Search, Users, FolderKanban, Wrench, ClipboardList, Package,
  UserCircle, FileText, Receipt, ShoppingCart, ArrowRight
} from "lucide-react";

const ENTITY_SEARCHES = [
  {
    entity: "Contact", labelKey: "full_name", subKey: "company",
    fields: ["full_name", "company", "email", "phone", "reference", "city", "country", "tax_id", "website", "notes"],
    route: id => `/contacts/${id}`, icon: Users, color: "text-blue-500",
  },
  {
    entity: "Project", labelKey: "name", subKey: "reference",
    fields: ["name", "reference", "contact_name", "contact_person", "contact_phone", "contact_email", "location", "location_name", "description", "tags", "notes"],
    route: id => `/projects/${id}`, icon: FolderKanban, color: "text-violet-500",
  },
  {
    entity: "WorkOrder", labelKey: "title", subKey: "reference",
    fields: ["title", "reference", "contact_name", "project_name", "asset_name", "location", "description", "notes"],
    route: id => `/work-orders/${id}`, icon: Wrench, color: "text-amber-500",
  },
  {
    entity: "Asset", labelKey: "name", subKey: "serial_number",
    fields: ["name", "serial_number", "reference", "manufacturer", "model", "location", "contact_name", "project_name", "notes"],
    route: id => `/assets/${id}`, icon: Package, color: "text-emerald-500",
  },
  {
    entity: "Employee", labelKey: "full_name", subKey: "email",
    fields: ["full_name", "email", "phone", "role", "team_name", "department", "notes"],
    route: id => `/employees/${id}`, icon: UserCircle, color: "text-pink-500",
  },
  {
    entity: "Task", labelKey: "title", subKey: "reference",
    fields: ["title", "reference", "contact_name", "project_name", "asset_name", "work_order_name", "location_address", "description", "notes"],
    route: () => `/tasks`, icon: ClipboardList, color: "text-indigo-500",
  },
  {
    entity: "Invoice", labelKey: "number", subKey: "contact_name",
    fields: ["number", "reference", "contact_name", "project_name", "notes"],
    route: () => `/sales/invoices`, icon: FileText, color: "text-cyan-500",
  },
  {
    entity: "Quote", labelKey: "number", subKey: "contact_name",
    fields: ["number", "reference", "contact_name", "project_name", "notes"],
    route: () => `/sales/quotes`, icon: FileText, color: "text-teal-500",
  },
  {
    entity: "Bill", labelKey: "number", subKey: "contact_name",
    fields: ["number", "reference", "contact_name", "project_name", "notes"],
    route: () => `/purchasing/bills`, icon: Receipt, color: "text-rose-500",
  },
  {
    entity: "PurchaseOrder", labelKey: "number", subKey: "contact_name",
    fields: ["number", "reference", "contact_name", "project_name", "notes"],
    route: () => `/purchasing/purchase-orders`, icon: ShoppingCart, color: "text-orange-500",
  },
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

function ResultRow({ icon: Icon, color, label, sub, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors ${active ? "bg-primary/10" : "hover:bg-muted"}`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${color || "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </div>
    </button>
  );
}

export default function QuickFinder() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      // Batch entity searches in groups of 2 to avoid rate-limit bursts
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const fns = ENTITY_SEARCHES.map((cfg) => async () => {
        try {
          const items = await withCache(
            `qf_${cfg.entity}`,
            30000,
            () => base44.entities[cfg.entity].filter({}, "-updated_date", 50)
          );
          const matched = items.filter(item => {
            const haystack = (cfg.fields || [cfg.labelKey, cfg.subKey])
              .map(k => String(item[k] ?? "")).join(" ").toLowerCase();
            return terms.every(t => haystack.includes(t));
          }).slice(0, 4);
          return matched.map(item => ({
            type: cfg.entity,
            label: item[cfg.labelKey] || "Untitled",
            sub: item[cfg.subKey] || "",
            icon: cfg.icon,
            color: cfg.color,
            onClick: () => { navigate(cfg.route(item.id)); setOpen(false); },
          }));
        } catch { return []; }
      });
      const all = (await batchedAll(fns, 2)).flat();
      setResults(all);
      setActiveIndex(0);
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

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && allItems[activeIndex]) { allItems[activeIndex].onClick(); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-xl overflow-hidden">
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
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2 flex-shrink-0">ESC</kbd>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {loading && <p className="text-center text-xs text-muted-foreground py-4">Searching…</p>}
          {!loading && allItems.length === 0 && query.trim() && (
            <p className="text-center text-xs text-muted-foreground py-4">No results found for "{query}"</p>
          )}
          {!loading && allItems.length === 0 && !query.trim() && (
            <p className="text-center text-xs text-muted-foreground py-4">Start typing to search across the app</p>
          )}
          {allItems.map((item, i) => (
            <ResultRow
              key={i}
              icon={item.icon}
              color={item.color}
              label={item.label}
              sub={item.sub ? `${item.type} · ${item.sub}` : item.type}
              onClick={item.onClick}
              active={i === activeIndex}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}