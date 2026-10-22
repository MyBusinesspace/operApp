import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Clock,
  Cog,
  CreditCard,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Moon,
  Package,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Upload,
  User,
  UserCheck,
  Users,
  Wallet,
  Receipt,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "@/lib/ThemeProvider";

const LOGO =
  "https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png";

const NAV = [
  {
    label: "Business",
    icon: Building2,
    overviewLabel: "Business overview",
    overviewTo: "/demo/app/business-overview",
    settingsLabel: "Business settings",
    settingsTo: "/demo/app/settings/business",
    children: [
      {
        label: "Companies",
        icon: Users,
        desc: "Customers, suppliers & companies",
        to: "/demo/app/contacts",
      },
      {
        label: "Projects",
        icon: FolderKanban,
        desc: "Track & manage projects",
        to: "/demo/app/projects",
      },
      {
        label: "Assets",
        icon: Package,
        desc: "Asset tracking & maintenance",
        to: "/demo/app/assets",
      },
    ],
  },
  {
    label: "Operations",
    icon: Cog,
    overviewLabel: "Operations overview",
    overviewTo: "/demo/app/operations-overview",
    settingsLabel: "Operations settings",
    settingsTo: "/demo/app/settings/operations",
    children: [
      {
        label: "Work Orders",
        icon: ClipboardList,
        desc: "Field service management",
        to: "/demo/app/work-orders",
      },
      {
        label: "Tasks",
        icon: CheckSquare,
        desc: "Task & subtask management",
        to: "/demo/app/tasks",
      },
      {
        label: "Planner",
        icon: CalendarRange,
        desc: "Plan and schedule operations",
        to: "/demo/app/planner",
      },
      {
        label: "Timesheets",
        icon: CalendarDays,
        desc: "Time tracking & entries",
        to: "/demo/app/timesheets",
      },
    ],
  },
  {
    label: "HR",
    icon: Clock,
    overviewLabel: "HR overview",
    overviewTo: "/demo/app/hr-overview",
    settingsLabel: "HR settings",
    children: [
      {
        label: "Employees",
        icon: Users,
        desc: "Staff directory & profiles",
        to: "/demo/app/employees",
      },
      {
        label: "Leave",
        icon: UserCheck,
        desc: "Leave requests & approvals",
        to: "/demo/app/leave",
      },
      { label: "Payroll", icon: CreditCard, desc: "Payroll runs & pay stubs" },
    ],
  },
  {
    label: "Sales",
    icon: FileText,
    overviewLabel: "Sales overview",
    overviewTo: "/demo/app/sales-overview",
    settingsLabel: "Sales settings",
    children: [
      {
        label: "Quotes",
        icon: FileText,
        desc: "Quotes & proposals",
        to: "/demo/app/quotes",
      },
      {
        label: "Invoices",
        icon: FileText,
        desc: "Create & manage invoices",
        to: "/demo/app/invoices",
      },
      {
        label: "Products & Services",
        icon: Package,
        desc: "Product catalog & services",
        to: "/demo/app/products",
      },
      {
        label: "Customers",
        icon: Users,
        desc: "Customer management",
        to: "/demo/app/sales-customers",
      },
    ],
  },
  {
    label: "Purchases",
    icon: ShoppingCart,
    overviewLabel: "Purchasing overview",
    overviewTo: "/demo/app/purchasing-overview",
    settingsLabel: "Purchasing settings",
    children: [
      {
        label: "Purchase Orders",
        icon: ClipboardList,
        desc: "Purchase orders & approvals",
        to: "/demo/app/purchase-orders",
      },
      {
        label: "Bills",
        icon: Receipt,
        desc: "Supplier bills & payments",
        to: "/demo/app/bills",
      },
      {
        label: "Petty Cash",
        icon: Wallet,
        desc: "Cash entries & tracking",
        to: "/demo/app/petty-cash",
      },
      {
        label: "Suppliers",
        icon: Users,
        desc: "Supplier management",
        to: "/demo/app/suppliers",
      },
    ],
  },
  {
    label: "Accounting",
    icon: BookOpen,
    overviewLabel: "Accounting overview",
    settingsLabel: "Accounting Settings",
    isAccounting: true,
    bankingItems: [
      { label: "Bank Accounts", icon: Landmark, desc: "Bank accounts & transactions" },
      { label: "Bank Rules", icon: ScrollText, desc: "Automatic categorisation rules" },
    ],
    children: [
      { label: "Fixed Assets", icon: Package, desc: "Fixed asset register & depreciation" },
      { label: "Chart of Accounts", icon: BookOpen, desc: "Account structure & codes" },
      { label: "Manual Journals", icon: FileText, desc: "Manual journal entries" },
    ],
  },
  {
    label: "Reporting",
    icon: BarChart3,
    children: [
      { label: "Reports", icon: FileText, desc: "Financial statements & reconciliation reports" },
      { label: "Data", icon: Upload, desc: "Import data from Xero, QuickBooks & CSV" },
    ],
  },
];

function noop(e) {
  e?.preventDefault?.();
}

function DemoMenuItem({ icon: Icon, label, desc, to, onNavigate }) {
  const className =
    "flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors group";
  const body = (
    <>
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && (
          <div className="text-[11px] text-muted-foreground leading-snug">{desc}</div>
        )}
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={className}
        onClick={() => onNavigate?.()}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className={`${className} cursor-default`} title="Demo — view only">
      {body}
    </div>
  );
}

function DemoNavDropdown({ item }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef(null);

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          open
            ? "text-primary bg-primary/8"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-64 dropdown-glass rounded-xl p-1.5 z-50"
          >
            {item.overviewLabel && (
              <>
                {item.overviewTo ? (
                  <Link
                    to={item.overviewTo}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/60 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <span className="text-sm font-semibold text-primary">
                      {item.overviewLabel}
                    </span>
                    <LayoutDashboard className="w-4 h-4 text-primary/60" />
                  </Link>
                ) : (
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-primary/8 transition-colors cursor-default"
                    title="Demo — view only"
                  >
                    <span className="text-sm font-semibold text-primary">
                      {item.overviewLabel}
                    </span>
                    <LayoutDashboard className="w-4 h-4 text-primary/60" />
                  </div>
                )}
                <div className="my-1 border-t border-border" />
              </>
            )}

            {item.isAccounting ? (
              <>
                <p className="px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Banking
                </p>
                {item.bankingItems.map((child) => (
                  <DemoMenuItem
                    key={child.label}
                    {...child}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
                <div className="my-1.5 border-t border-border" />
                <p className="px-3 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Accounting Tools
                </p>
                {item.children.map((child) => (
                  <DemoMenuItem
                    key={child.label}
                    {...child}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
                <div className="my-1.5 border-t border-border" />
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors cursor-default"
                  title="Demo — view only"
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {item.settingsLabel}
                  </span>
                  <Settings className="w-4 h-4 text-muted-foreground/60" />
                </div>
              </>
            ) : (
              <>
                {item.children.map((child) => (
                  <DemoMenuItem
                    key={child.label}
                    {...child}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
                {item.settingsLabel && (
                  <>
                    <div className="my-1 border-t border-border" />
                    {item.settingsTo ? (
                      <Link
                        to={item.settingsTo}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                          {item.settingsLabel}
                        </span>
                        <Settings className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                      </Link>
                    ) : (
                      <div
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent/80 transition-colors cursor-default"
                        title="Demo — view only"
                      >
                        <span className="text-sm font-medium text-muted-foreground">
                          {item.settingsLabel}
                        </span>
                        <Settings className="w-4 h-4 text-muted-foreground/60" />
                      </div>
                    )}
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

/** Visual mirror of TopNavBar — menus open on hover; no navigation actions. */
export default function DemoTopNavBar({ companyName = "Demo Company" }) {
  const { theme, toggleTheme } = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Asia/Dubai",
  });

  return (
    <header className="fixed top-0 left-0 right-0 z-50 nav-glass demo-topnav">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-6">
        <div className="demo-topnav-grid h-[var(--nav-height)]">
          <div className="demo-topnav-left flex items-center gap-3 min-w-0">
            <Link to="/demo/app" className="shrink-0" title="Overall Quick View">
              <img
                src={LOGO}
                alt="operapp"
                className="h-12 w-auto object-contain"
              />
            </Link>
            <div className="hidden xl:flex flex-col shrink-0 pl-3 border-l border-border text-xs font-medium text-muted-foreground tabular-nums whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{dateLabel}</span>
              </div>
              <span className="ml-5 mt-0.5 text-[10px] text-muted-foreground/60">
                GST · UTC+4
              </span>
            </div>
          </div>

          <nav className="demo-topnav-center hidden lg:flex items-center justify-center gap-0.5">
            {NAV.map((item) => (
              <DemoNavDropdown key={item.label} item={item} />
            ))}
          </nav>

          <div className="demo-topnav-right flex items-center justify-end gap-1 sm:gap-2">
            <button
              type="button"
              onClick={noop}
              className="p-2 rounded-lg text-muted-foreground cursor-default"
              title="Demo — view only"
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>

            <button
              type="button"
              onClick={noop}
              className="p-2 rounded-lg text-muted-foreground cursor-default"
              title="Demo — view only"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>

            <button
              type="button"
              onClick={noop}
              className="relative p-2 rounded-lg text-muted-foreground cursor-default"
              title="Demo — view only"
            >
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>

            <div
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg cursor-default"
              title={`${companyName} · Demo user`}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
            </div>

            <Link
              to="/demo"
              className="hidden md:inline-flex ml-1 text-xs font-semibold text-primary hover:underline px-2"
              onClick={() => {
                try {
                  sessionStorage.removeItem("operapp_demo_industry");
                } catch {
                  /* ignore */
                }
              }}
            >
              Exit demo
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
