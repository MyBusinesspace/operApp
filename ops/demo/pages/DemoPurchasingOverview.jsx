import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  Receipt,
  ShoppingCart,
  Users,
  Wallet,
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

export default function DemoPurchasingOverview() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const bills = data.bills || [];
  const pos = data.purchaseOrders || [];
  const petty = data.pettyCash || [];
  const suppliers = (data.contacts || []).filter(
    (c) => c.type === "Provider" || c.type === "Both"
  );

  const toPay = bills
    .filter((b) => b.status === "Awaiting Payment")
    .reduce((s, b) => s + (b.total - (b.amount_paid || 0)), 0);

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
                <span className="text-foreground">Purchases</span>
              </div>
              <Link
                to="/demo/app/bills"
                className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary hover:bg-primary/90 font-semibold px-3.5 py-1.5 rounded-lg"
              >
                Bills <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
            <DemoGuideCard pageId="purchasing-overview" />

            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <ShoppingCart className="w-7 h-7 text-sky-400" />
                Purchasing overview
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Purchase orders, supplier bills, petty cash and suppliers —
                connected to your field operations.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
              <Metric
                icon={Receipt}
                iconColor="text-rose-400"
                label="Bills to pay"
                value={money(toPay)}
              />
              <Metric
                icon={ClipboardList}
                iconColor="text-sky-400"
                label="Purchase orders"
                value={pos.length}
              />
              <Metric
                icon={Wallet}
                iconColor="text-amber-400"
                label="Petty cash entries"
                value={petty.length}
              />
              <Metric
                icon={Users}
                iconColor="text-indigo-400"
                label="Suppliers"
                value={suppliers.length}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  to: "/demo/app/purchase-orders",
                  label: "Purchase Orders",
                  desc: `${pos.length} orders`,
                  icon: ClipboardList,
                },
                {
                  to: "/demo/app/bills",
                  label: "Bills",
                  desc: `${bills.length} supplier bills`,
                  icon: Receipt,
                },
                {
                  to: "/demo/app/petty-cash",
                  label: "Petty Cash",
                  desc: `${petty.length} entries`,
                  icon: Wallet,
                },
                {
                  to: "/demo/app/suppliers",
                  label: "Suppliers",
                  desc: `${suppliers.length} suppliers`,
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
                <h2 className="text-sm font-semibold">Open bills</h2>
                <Link to="/demo/app/bills" className="text-xs text-primary font-medium">
                  See all
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-5 py-2 text-left font-semibold">Number</th>
                    <th className="px-5 py-2 text-left font-semibold">Supplier</th>
                    <th className="px-5 py-2 text-left font-semibold">Status</th>
                    <th className="px-5 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.slice(0, 5).map((b) => (
                    <tr key={b.id} className="border-b border-border/50">
                      <td className="px-5 py-3 font-medium">{b.number}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {b.contact_name}
                      </td>
                      <td className="px-5 py-3">{b.status}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {money(b.total)}
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
