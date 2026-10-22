import React, { useState, useRef, useEffect } from "react";
import useNavSearch from "@/hooks/useNavSearch";
import NavSearchResults from "@/components/layout/NavSearchResults";
import NotificationBell from "@/components/layout/NotificationBell";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Search, Bell, ChevronDown, User, LogOut, Settings,
  LayoutDashboard, Building2, Users, FolderKanban,
  ClipboardList, Clock, CalendarDays, CreditCard, FileText,
  BarChart3, Package, UserCheck, Receipt,
  ShoppingCart, Wallet, Menu, X, Cog, CalendarRange,
  Plus, CheckSquare, BookOpen, Landmark, ScrollText,
  Loader2, UserCircle, Zap, Sun, Moon, Upload, Sparkles, FileCheck
} from "lucide-react";
import { useAgentPanel } from "@/lib/AgentPanelContext";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/ThemeProvider";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { pathToModule } from "@/lib/permissionMap";
import { motion, AnimatePresence } from "framer-motion";
import { getTimezoneShortLabel, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { NAV_DEPARTMENTS } from "@/lib/departments";

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
      { label: "Working Reports", path: "/reports/working-reports", icon: FileCheck, desc: "Daily working reports & validation" },
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
      { label: "Invoices", path: "/sales/invoices", icon: FileText, desc: "Invoices & credit notes" },
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
    overviewPath: "/finance-overview",
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
    label: "Reporting",
    icon: BarChart3,
    children: [
      { label: "Reports", path: "/reports", icon: FileText, desc: "Financial statements & reconciliation reports" },
      { label: "Sales Tax Report", path: "/reports/sales-tax", icon: BarChart3, desc: "Sales tax summary & audit" },
      { label: "Data", path: "/settings/import-center", icon: Upload, desc: "Import data from Xero, QuickBooks & CSV" },
    ],
    settingsPath: "/settings/sales",
    settingsLabel: "Tax settings",
  },
];

function NavDropdown({ item, isActive, onClose, can = () => true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timeoutRef = useRef(null);

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    if (!open) setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 250);
  };
  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(prev => !prev);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!item.children) {
    return (
      <Link
        to={item.path}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive
            ? "text-foreground bg-muted"
            : "text-foreground/80 hover:text-foreground hover:bg-accent"
        }`}
      >
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="department-nav relative" data-department={NAV_DEPARTMENTS[item.label]} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        onClick={handleToggle}
        aria-expanded={open}
        data-active={isActive || open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive || open
            ? "text-foreground bg-muted"
            : "text-foreground/80 hover:text-foreground hover:bg-accent"
        }`}
      >
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="department-dropdown absolute top-full left-0 mt-1 w-64 dropdown-glass rounded-xl p-1.5 z-50"
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
  const { groups: searchGroups, searching } = useNavSearch(searchQuery, searchOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [orgTimezone, setOrgTimezone] = useState(DEFAULT_TIMEZONE);
  const profileRef = useRef(null);
  const createRef = useRef(null);
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
      .catch(err => console.error(err));
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

  const isActive = (item) => {
    if (item.path) return location.pathname === item.path;
    return item.children?.some((c) => location.pathname.startsWith(c.path));
  };

  const tz = orgTimezone;
  const dd = now.toLocaleString("en-GB", { day: "2-digit", timeZone: tz });
  const mm = now.toLocaleString("en-GB", { month: "2-digit", timeZone: tz });
  const yy = now.toLocaleString("en-GB", { year: "2-digit", timeZone: tz });
  const dateLabel = `${dd}/${mm}/${yy}`;
  const tzLabel = getTimezoneShortLabel(tz);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-sm text-foreground">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-[var(--nav-height)]">
          {/* Logo */}
          <Link to="/app" className="flex items-center gap-2 shrink-0" title="Overall Quick View">
            <img
              src="https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png"
              alt="operapp"
              className="h-12 w-auto object-contain"
            />
          </Link>

          {/* Live date & time + timezone */}
          <div className="hidden xl:flex flex-col shrink-0 ml-4 pl-3 border-l border-border/20 text-xs font-medium text-foreground/70 tabular-nums whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-foreground/60" />
              <span>{dateLabel}</span>
            </div>
            <span className="ml-5 mt-0.5 text-[10px] text-foreground/50">{tzLabel}</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5 ml-4">
            {visibleNavItems.map((item) => (
              <NavDropdown key={item.label} item={item} isActive={isActive(item)} can={can} />
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* AI Assistant */}
            <AssistantToggleButton />

            {/* Quick Create — Xero-style discrete square button */}
            <div ref={createRef} className="relative">
              <button
                onClick={() => setCreateOpen(!createOpen)}
                className={`w-8 h-8 flex items-center justify-center rounded-md border transition-colors ${
                  createOpen
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-transparent border-border/30 text-foreground/80 hover:text-foreground hover:border-border/60"
                }`}
                title="Create new"
              >
                <Plus className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {createOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg p-1.5 z-50"
                  >
                    <p className="px-3 pt-1.5 pb-2 text-xs text-muted-foreground">Create new</p>
                    {visibleCreateItems.map((item) => (
                      <Link
                        key={item.label}
                        to={item.quickDraft ? `${item.path}?quickdraft=true` : `${item.path}?create=true`}
                        onClick={() => setCreateOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-accent transition-colors group"
                      >
                        <item.icon className={`w-3.5 h-3.5 shrink-0 ${item.quickDraft ? "text-primary" : "text-muted-foreground"} group-hover:text-primary transition-colors`} />
                        <span className="flex-1 min-w-0 text-sm text-foreground/90">{item.label}</span>
                        <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground border border-border/60">
                          ⌘{item.shortcut}
                        </kbd>
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 rounded-lg text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
            >
              <Search className="w-4.5 h-4.5" />
            </button>

            {/* Notifications */}
            <NotificationBell />

            {/* Profile */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-accent transition-colors"
              >
                {employee?.avatar_url ? (
                  <img src={employee.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-border/20" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-foreground" />
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-foreground/70 hidden sm:block" />
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
              className="lg:hidden p-2 rounded-lg text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
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
            className="border-t border-border/20 overflow-hidden bg-card"
          >
            <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-3" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts, quotes, projects, work orders, tasks, employees..."
                  className="w-full pl-10 pr-4 py-2.5 bg-accent rounded-lg text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60 animate-spin" />
                )}
              </div>

              {/* Results: up to three server-filtered matches per category. */}
              {searchQuery.trim().length >= 2 && (
                <NavSearchResults
                  groups={searchGroups}
                  searching={searching}
                  query={searchQuery}
                  onSelect={() => { setSearchOpen(false); setSearchQuery(""); }}
                />
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
            className="lg:hidden border-t border-border/20 overflow-hidden bg-card"
          >
            <div className="px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
              {visibleNavItems.map((item) => (
                <div key={item.label} className="department-mobile-group" data-department={NAV_DEPARTMENTS[item.label]}>
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

function AssistantToggleButton() {
  const { isOpen, toggle } = useAgentPanel();
  return (
    <button
      onClick={toggle}
      className={`w-8 h-8 flex items-center justify-center rounded-md border transition-colors ${
        isOpen
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-transparent border-border/30 text-foreground/80 hover:text-foreground hover:border-border/60"
      }`}
      title="AI Assistant"
    >
      <Sparkles className="w-4 h-4" />
    </button>
  );
}