import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Search, Bell, ChevronDown, User, LogOut, Settings,
  LayoutDashboard, Building2, Users, FolderKanban, Wrench,
  ClipboardList, Clock, CalendarDays, CreditCard, FileText,
  BarChart3, Package, Briefcase, UserCheck, Receipt,
  ShoppingCart, Wallet, PieChart, Menu, X, Cog, CalendarRange, Timer, MapPin,
  Plus, Contact, Layers, CheckSquare, BookOpen, Landmark, ScrollText,
  Loader2, UserCircle, Zap, Sun, Moon, Upload
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/ThemeProvider";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { pathToModule } from "@/lib/permissionMap";
import { motion, AnimatePresence } from "framer-motion";
import { getTimezoneShortLabel, DEFAULT_TIMEZONE } from "@/lib/timezones";

const CREATE_ITEMS = [
  { label: "Company", path: "/contacts", icon: Users, shortcut: "C" },
  { label: "Project", path: "/projects", icon: FolderKanban, shortcut: "P" },
  { label: "Asset", path: "/assets", icon: Package, shortcut: "A" },
  { label: "Work Order", path: "/work-orders", icon: ClipboardList, shortcut: "W" },
  { label: "Task", path: "/tasks", icon: CheckSquare, shortcut: "T" },
  { label: "Quick Draft Task", path: "/tasks", icon: Zap, quickDraft: true, shortcut: "Q" },
  { label: "Employee", path: "/employees", icon: UserCheck, shortcut: "E" },
  { label: "Invoice", path: "/sales/invoices", icon: Receipt, shortcut: "I" },
  { label: "Quote", path: "/sales/quotes", icon: FileText, shortcut: "D" },
  { label: "Purchase Bill", path: "/purchases", icon: ShoppingCart, shortcut: "B" },
];

const navItems = [
  {
    label: "Business",
    icon: Building2,
    overviewPath: "/business-overview",
    overviewLabel: "Business overview",
    settingsPath: "/settings/business",
    settingsLabel: "Business settings",
    children: [
      { label: "Companies", path: "/contacts", icon: Users, desc: "Customers, suppliers & companies" },
      { label: "Projects", path: "/projects", icon: FolderKanban, desc: "Track & manage projects" },
      { label: "Assets", path: "/assets", icon: Package, desc: "Asset tracking & maintenance" },
    ],
  },
  {
    label: "Operations",
    icon: Cog,
    overviewPath: "/operations-overview",
    overviewLabel: "Operations overview",
    settingsPath: "/settings/operations",
    settingsLabel: "Operations settings",
    children: [
      { label: "Work Orders", path: "/work-orders", icon: ClipboardList, desc: "Field service management" },
      { label: "Tasks", path: "/tasks", icon: CheckSquare, desc: "Task & subtask management" },
      { label: "Planner", path: "/planner", icon: CalendarRange, desc: "Plan and schedule operations" },
      { label: "Timesheets", path: "/timesheets", icon: CalendarDays, desc: "Time tracking & entries" },
    ],
  },
  {
    label: "HR",
    icon: Clock,
    overviewPath: "/timehr-overview",
    overviewLabel: "HR overview",
    settingsPath: "/settings/hr",
    settingsLabel: "HR settings",
    children: [
      { label: "Employees", path: "/employees", icon: Users, desc: "Staff directory & profiles" },
      { label: "Leave", path: "/leave", icon: UserCheck, desc: "Leave requests & approvals" },
      { label: "Payroll", path: "/payroll", icon: CreditCard, desc: "Payroll runs & pay stubs" },
    ],
  },
  {
    label: "Sales",
    icon: FileText,
    overviewPath: "/sales-overview",
    overviewLabel: "Sales overview",
    settingsPath: "/settings/sales",
    settingsLabel: "Sales settings",
    children: [
      { label: "Quotes", path: "/sales/quotes", icon: FileText, desc: "Quotes & proposals" },
      { label: "Invoices", path: "/sales/invoices", icon: FileText, desc: "Create & manage invoices" },
      { label: "Products & Services", path: "/sales/products", icon: Package, desc: "Product catalog & services" },
      { label: "Customers", path: "/sales/customers", icon: Users, desc: "Customer management" },
    ],
  },
  {
    label: "Purchases",
    icon: ShoppingCart,
    overviewPath: "/purchasing-overview",
    overviewLabel: "Purchasing overview",
    settingsPath: "/settings/purchasing",
    settingsLabel: "Purchasing settings",
    children: [
      { label: "Purchase Orders", path: "/purchasing/purchase-orders", icon: ClipboardList, desc: "Purchase orders & approvals" },
      { label: "Bills", path: "/purchasing/bills", icon: Receipt, desc: "Supplier bills & payments" },
      { label: "Petty Cash", path: "/petty-cash", icon: Wallet, desc: "Cash entries & tracking" },
      { label: "Suppliers", path: "/purchasing/suppliers", icon: Users, desc: "Supplier management" },
    ],
  },
  {
    label: "Accounting",
    icon: BookOpen,
    overviewPath: "/accounting",
    overviewLabel: "Accounting overview",
    settingsPath: "/settings/fixed-assets",
    settingsLabel: "Accounting Settings",
    isAccounting: true,
    bankingItems: [
      { label: "Bank Accounts", path: "/accounting/banks", icon: Landmark, desc: "Bank accounts & transactions" },
      { label: "Bank Rules", path: "/accounting/bank-rules", icon: ScrollText, desc: "Automatic categorisation rules" },
    ],
    children: [
      { label: "Fixed Assets", path: "/accounting/fixed-assets", icon: Package, desc: "Fixed asset register & depreciation" },
      { label: "Chart of Accounts", path: "/accounting/chart-of-accounts", icon: BookOpen, desc: "Account structure & codes" },
      { label: "Manual Journals", path: "/accounting/journal-entries", icon: FileText, desc: "Manual journal entries" },
    ],
  },
  {
    label: "Tax",
    icon: Receipt,
    children: [
      { label: "Sales Tax Report", path: "/reports/sales-tax", icon: BarChart3, desc: "Sales tax summary & audit" },
    ],
    settingsPath: "/settings/sales",
    settingsLabel: "Tax settings",
  },
  {
    label: "Analytics",
    icon: BarChart3,
    children: [
      { label: "Reports", path: "/reports", icon: FileText, desc: "Financial statements & reconciliation reports" },
      { label: "Data", path: "/settings/import-center", icon: Upload, desc: "Import data from Xero, QuickBooks & CSV" },
    ],
  },
];

function NavDropdown({ item, isActive, onClose, can = () => true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timeoutRef = useRef(null);

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  if (!item.children) {
    return (
      <Link
        to={item.path}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive
            ? "text-primary bg-primary/8"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive
            ? "text-primary bg-primary/8"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-64 dropdown-glass rounded-xl p-1.5 z-50"
          >
            {item.overviewPath && can(pathToModule(item.overviewPath), "can_view") && (
              <>
                <Link
                  to={item.overviewPath}
                  onClick={() => { setOpen(false); onClose?.(); }}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-primary/8 transition-colors group"
                >
                  <span className="text-sm font-semibold text-primary">{item.overviewLabel}</span>
                  <LayoutDashboard className="w-4 h-4 text-primary/60" />
                </Link>
                <div className="my-1 border-t border-border" />
              </>
            )}

            {/* Accounting: sectioned menu */}
            {item.isAccounting ? (
              <>
                <p className="px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Banking</p>
                {item.bankingItems.map((child) => (
                  <Link key={child.path} to={child.path}
                    onClick={() => { setOpen(false); onClose?.(); }}
                    className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors group">
                    <child.icon className="w-4 h-4 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium text-foreground">{child.label}</span>
                  </Link>
                ))}
                <div className="my-1.5 border-t border-border" />
                <p className="px-3 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accounting Tools</p>
                {item.children.map((child) => (
                  <Link key={child.path} to={child.path}
                    onClick={() => { setOpen(false); onClose?.(); }}
                    className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors group">
                    <child.icon className="w-4 h-4 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium text-foreground">{child.label}</span>
                  </Link>
                ))}
                <div className="my-1.5 border-t border-border" />
                {can(pathToModule(item.settingsPath), "can_view") && (
                <Link to={item.settingsPath}
                  onClick={() => { setOpen(false); onClose?.(); }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors group">
                  <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{item.settingsLabel}</span>
                  <Settings className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                </Link>
                )}
              </>
            ) : (
              <>
                {item.children.map((child) => (
                  <Link
                    key={child.path}
                    to={child.path}
                    onClick={() => { setOpen(false); onClose?.(); }}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/80 transition-colors group"
                  >
                    <child.icon className="w-4.5 h-4.5 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <div>
                      <div className="text-sm font-medium text-foreground">{child.label}</div>
                      <div className="text-xs text-muted-foreground">{child.desc}</div>
                    </div>
                  </Link>
                ))}
                {item.settingsPath && can(pathToModule(item.settingsPath), "can_view") && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <Link
                      to={item.settingsPath}
                      onClick={() => { setOpen(false); onClose?.(); }}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/80 transition-colors group"
                    >
                      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                        {item.settingsLabel}
                      </span>
                      <Settings className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    </Link>
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TopNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { employee } = useCurrentEmployee();
  const { can } = usePermissionsMatrix();
  // Hide nav/create items the user can't view (matrix-driven).
  const visibleNavItems = navItems
    .map(item => ({
      ...item,
      children: (item.children || []).filter(c => can(pathToModule(c.path), "can_view")),
      bankingItems: (item.bankingItems || []).filter(b => can(pathToModule(b.path), "can_view")),
    }))
    .filter(item => (item.children.length + (item.bankingItems?.length || 0)) > 0);
  const visibleCreateItems = CREATE_ITEMS.filter(c => can(pathToModule(c.path), "can_view"));
  const { theme, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [orgTimezone, setOrgTimezone] = useState(DEFAULT_TIMEZONE);
  const profileRef = useRef(null);
  const createRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const searchRef = useRef(null);

  // Shift + [letter] → create shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const key = e.key.toUpperCase();
      const item = CREATE_ITEMS.find((it) => it.shortcut === key);
      if (item) {
        e.preventDefault();
        if (item.quickDraft) {
          window.dispatchEvent(new CustomEvent("operapp:quick-draft-task"));
          if (location.pathname !== item.path) navigate(item.path);
        } else {
          navigate(`${item.path}?create=true`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, location.pathname]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load the organization's operational timezone
  useEffect(() => {
    base44.entities.Organization.list("-created_date", 1)
      .then((list) => {
        if (list?.[0]?.timezone) setOrgTimezone(list[0].timezone);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search handler with debounce and partial matching
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    clearTimeout(searchTimeoutRef.current);
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const q = query.toLowerCase().trim();
      const allResults = [];

      // Parallel fetch all searchable entities
      try {
        const [contacts, projects, workOrders, tasks, employees] = await Promise.all([
          base44.entities.Contact.list("full_name", 200).catch(() => []),
          base44.entities.Project.list("name", 200).catch(() => []),
          base44.entities.WorkOrder.list("-created_date", 200).catch(() => []),
          base44.entities.Task.list("-created_date", 200).catch(() => []),
          base44.entities.Employee.list("full_name", 200).catch(() => []),
        ]);

        // Partial word matching — each word in query must match somewhere in the result
        const queryWords = q.split(/\s+/).filter(w => w.length > 0);

        const matches = (text) => {
          if (!text) return false;
          const t = text.toLowerCase();
          return queryWords.every(word => t.includes(word));
        };

        for (const c of (contacts || [])) {
          if (matches(c.full_name) || matches(c.company) || matches(c.email)) {
            allResults.push({ type: "contact", label: c.full_name, sub: c.company || c.email || "", path: `/contacts/${c.id}`, icon: Users, color: "text-blue-500 bg-blue-50" });
          }
        }
        for (const p of (projects || [])) {
          if (matches(p.name) || matches(p.description)) {
            allResults.push({ type: "project", label: p.name, sub: p.status || "", path: `/projects/${p.id}`, icon: FolderKanban, color: "text-violet-500 bg-violet-50" });
          }
        }
        for (const w of (workOrders || [])) {
          if (matches(w.title) || matches(w.reference) || matches(w.contact_name)) {
            allResults.push({ type: "workOrder", label: w.title || w.reference, sub: w.contact_name || w.status || "", path: `/work-orders/${w.id}`, icon: ClipboardList, color: "text-primary bg-primary/10" });
          }
        }
        for (const t of (tasks || [])) {
          if (matches(t.title) || matches(t.reference)) {
            allResults.push({ type: "task", label: t.title, sub: t.reference || "", path: `/tasks?open=${t.id}`, icon: CheckSquare, color: "text-emerald-500 bg-emerald-50" });
          }
        }
        for (const e of (employees || [])) {
          if (matches(e.full_name) || matches(e.email) || matches(e.department)) {
            allResults.push({ type: "employee", label: e.full_name, sub: e.department || e.role || "", path: `/employees/${e.id}`, icon: UserCheck, color: "text-amber-500 bg-amber-50" });
          }
        }
      } catch (err) {
        // silently ignore
      }

      setSearchResults(allResults.slice(0, 20));
      setSearching(false);
    }, 250);
  }, []);

  const isActive = (item) => {
    if (item.path) return location.pathname === item.path;
    return item.children?.some((c) => location.pathname.startsWith(c.path));
  };

  const tz = orgTimezone;
  const wd = now.toLocaleString("en-GB", { weekday: "long", timeZone: tz });
  const dd = now.toLocaleString("en-GB", { day: "2-digit", timeZone: tz });
  const mo = now.toLocaleString("en-GB", { month: "long", timeZone: tz });
  const yr = now.toLocaleString("en-GB", { year: "numeric", timeZone: tz });
  const hh = now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: tz });
  const mi = now.toLocaleString("en-GB", { minute: "2-digit", timeZone: tz });
  const dateTimeLabel = `${wd} ${dd} ${mo} ${yr} ${hh}:${mi}`;
  const tzLabel = getTimezoneShortLabel(tz);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 nav-glass">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-[var(--nav-height)]">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img
              src="https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png"
              alt="operapp"
              className="h-12 w-auto object-contain"
            />
          </Link>

          {/* Live date & time + timezone */}
          <div className="hidden xl:flex flex-col shrink-0 ml-4 pl-3 border-l border-border text-xs font-medium text-muted-foreground tabular-nums whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{dateTimeLabel}</span>
            </div>
            <span className="ml-5 mt-0.5 text-[10px] text-muted-foreground/60">{tzLabel} · {hh}:{mi}</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5 ml-4">
            {visibleNavItems.map((item) => (
              <NavDropdown key={item.label} item={item} isActive={isActive(item)} can={can} />
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Quick Create */}
            <div ref={createRef} className="relative">
              <button
                onClick={() => setCreateOpen(!createOpen)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Create new"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
              <AnimatePresence>
                {createOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-1 w-52 dropdown-glass rounded-xl p-1.5 z-50"
                  >
                    <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Create New</p>
                    {visibleCreateItems.map((item) => (
                      <Link
                        key={item.label}
                        to={item.quickDraft ? `${item.path}?quickdraft=true` : `${item.path}?create=true`}
                        onClick={() => setCreateOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors group"
                      >
                        <item.icon className={`w-4 h-4 ${item.quickDraft ? "text-primary" : "text-muted-foreground"} group-hover:text-primary transition-colors`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">Shift + {item.shortcut}</div>
                        </div>
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Search className="w-4.5 h-4.5" />
            </button>

            {/* Notifications */}
            <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>

            {/* Profile */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-accent transition-colors"
              >
                {employee?.avatar_url ? (
                  <img src={employee.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-1 w-64 dropdown-glass rounded-xl p-3 z-50"
                  >
                    {/* User info */}
                    <div className="flex items-center gap-3 mb-3">
                      {employee?.avatar_url ? (
                        <img src={employee.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-border" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{user?.full_name || "User"}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
                      </div>
                    </div>

                    {/* Employee info */}
                    {employee && (
                      <div className="mb-3 p-2.5 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-medium text-foreground">{employee.full_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {employee.role && <span>{employee.role}</span>}
                          {employee.department && <span>· {employee.department}</span>}
                        </div>
                      </div>
                    )}

                    {/* My Profile link */}
                    {employee && (
                      <Link
                        to={`/employees/${employee.id}`}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm mb-1"
                      >
                        <UserCircle className="w-4 h-4 text-muted-foreground" />
                        <span>My Profile</span>
                      </Link>
                    )}

                    <Link
                      to="/settings/organization"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
                    >
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span>Organization Profile</span>
                    </Link>

                    <div className="my-1 border-t border-border" />

                    <Link
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
                    >
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      <span>Settings</span>
                    </Link>
                    <button
                      onClick={() => base44.auth.logout()}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-destructive/10 transition-colors text-sm text-destructive mt-0.5"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile menu */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border overflow-hidden"
          >
            <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-3" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search contacts, projects, work orders, tasks, employees..."
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Results */}
              {searchQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-[320px] overflow-y-auto bg-card rounded-xl border border-border shadow-lg">
                  {searchResults.length === 0 && !searching ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No results found for "{searchQuery}"
                    </div>
                  ) : (
                    <>
                      {["contact", "project", "workOrder", "task", "employee"].map(type => {
                        const items = searchResults.filter(r => r.type === type);
                        if (items.length === 0) return null;
                        const typeLabels = {
                          contact: "Companies & Contacts",
                          project: "Projects",
                          workOrder: "Work Orders",
                          task: "Tasks",
                          employee: "Employees",
                        };
                        return (
                          <div key={type}>
                            <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {typeLabels[type]} ({items.length})
                            </p>
                            {items.map((item, i) => (
                              <Link
                                key={`${item.type}-${i}`}
                                to={item.path}
                                onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/60 transition-colors"
                              >
                                <div className={`p-1.5 rounded-md ${item.color}`}>
                                  <item.icon className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                                  {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
                                </div>
                                <span className="text-xs text-muted-foreground capitalize">{item.type === "workOrder" ? "WO" : item.type}</span>
                              </Link>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-border overflow-hidden bg-card"
          >
            <div className="px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
              {visibleNavItems.map((item) => (
                <div key={item.label}>
                  {item.path ? (
                    <Link
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
                    >
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                      {item.label}
                    </Link>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <item.icon className="w-3.5 h-3.5" />
                        {item.label}
                      </div>
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          to={child.path}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2.5 px-3 pl-10 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
                        >
                          <child.icon className="w-4 h-4 text-muted-foreground" />
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}