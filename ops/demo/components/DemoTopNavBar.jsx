import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  Cog,
  FileText,
  Moon,
  Plus,
  Search,
  ShoppingCart,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "@/lib/ThemeProvider";

const LOGO =
  "https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png";

const NAV = [
  { label: "Business", icon: Building2 },
  { label: "Operations", icon: Cog },
  { label: "HR", icon: Clock },
  { label: "Sales", icon: FileText },
  { label: "Purchases", icon: ShoppingCart },
  { label: "Accounting", icon: BookOpen },
  { label: "Reporting", icon: BarChart3 },
];

function noop(e) {
  e.preventDefault();
}

/** Visual mirror of TopNavBar — menus centered; actions are display-only. */
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
          {/* Left: logo + date */}
          <div className="demo-topnav-left flex items-center gap-3 min-w-0">
            <img
              src={LOGO}
              alt="operapp"
              className="h-12 w-auto object-contain shrink-0"
            />
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

          {/* Center: module menus */}
          <nav className="demo-topnav-center hidden lg:flex items-center justify-center gap-0.5">
            {NAV.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={noop}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground cursor-default"
                title="Demo — view only"
              >
                <item.icon className="w-4 h-4" strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Right: utilities */}
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
