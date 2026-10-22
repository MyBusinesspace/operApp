import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

function money(n) {
  return `AED ${(Number(n) || 0).toLocaleString("en-AE", {
    maximumFractionDigits: 0,
  })}`;
}

function Metric({ icon: Icon, iconColor, label, value }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

export default function DemoSalesOverview() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const invoices = data.invoices || [];
  const quotes = data.quotes || [];
  const products = data.products || [];
  const customers = (data.contacts || []).filter(
    (c) => c.type === "Customer" || c.type === "Both"
  );

  const awaiting = invoices.filter((i) => i.status === "Awaiting Payment");
  const owed = awaiting.reduce(
    (s, i) => s + (i.total - (i.amount_paid || 0)),
    0
  );
  const paid = invoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoTopNavBar companyName={data.companyName} />
      <main className="pt-[var(--nav-height)]">
        <div className="demo-readonly">
          <div className="sticky top-[var(--nav-height)] z-10 bg-background/80 backdrop-blur-xl border-b border-border">
            <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium">
                <Link to="/demo/app" className="hover:text-foreground">
                  Overview
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-foreground">Sales</span>
              </div>
              <Link
                to="/demo/app/invoices"
                className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary hover:bg-primary/90 font-semibold px-3.5 py-1.5 rounded-lg"
              >
                Invoices <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
            <DemoGuideCard pageId="sales-overview" />

            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <TrendingUp className="w-7 h-7 text-emerald-400" />
                Sales overview
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Quotes, invoices, products and customers — the same sales flow
                your team runs in OperApp.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
              <Metric
                icon={FileText}
                iconColor="text-emerald-400"
                label="Awaiting payment"
                value={money(owed)}
              />
              <Metric
                icon={FileText}
                iconColor="text-sky-400"
                label="Paid (sample)"
                value={money(paid)}
              />
              <Metric
                icon={FileText}
                iconColor="text-violet-400"
                label="Quotes"
                value={quotes.length}
              />
              <Metric
                icon={Package}
                iconColor="text-amber-400"
                label="Products"
                value={products.length}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  to: "/demo/app/quotes",
                  label: "Quotes",
                  desc: `${quotes.length} proposals`,
                  icon: FileText,
                },
                {
                  to: "/demo/app/invoices",
                  label: "Invoices",
                  desc: `${awaiting.length} awaiting payment`,
                  icon: FileText,
                },
                {
                  to: "/demo/app/products",
                  label: "Products & Services",
                  desc: `${products.length} catalog items`,
                  icon: Package,
                },
                {
                  to: "/demo/app/sales-customers",
                  label: "Customers",
                  desc: `${customers.length} customers`,
                  icon: Users,
                },
              ].map(({ to, label, desc, icon: I }) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded-xl border border-border bg-card/50 p-5 hover:border-primary/40 hover:bg-accent/40 transition-colors group"
                >
                  <I className="w-5 h-5 text-primary mb-3" />
                  <div className="font-semibold group-hover:text-primary transition-colors">
                    {label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{desc}</div>
                </Link>
              ))}
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent invoices</h2>
                <Link
                  to="/demo/app/invoices"
                  className="text-xs text-primary font-medium"
                >
                  See all
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-5 py-2 text-left font-semibold">Number</th>
                    <th className="px-5 py-2 text-left font-semibold">Customer</th>
                    <th className="px-5 py-2 text-left font-semibold">Status</th>
                    <th className="px-5 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50">
                      <td className="px-5 py-3 font-medium">{inv.number}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {inv.contact_name}
                      </td>
                      <td className="px-5 py-3">{inv.status}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {money(inv.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
