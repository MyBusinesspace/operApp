import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText, ShoppingCart, Plus, Search, Download, ChevronRight, HelpCircle, EyeOff
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import { format, addDays, parseISO, isBefore, startOfDay } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

// ── Status Card ──────────────────────────────────────────────────────
function StatusCard({ title, count, amount, accentClass = "text-foreground", onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col p-4 rounded-lg hover:bg-muted/30 transition-colors text-left w-full"
    >
      <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{title}</span>
      <span className="text-lg font-bold text-foreground mt-0.5">({count})</span>
      <span className={`text-sm font-semibold mt-0.5 ${accentClass}`}>
        {amount === 0 && count === 0 ? "None" : fmt(amount)}
      </span>
    </button>
  );
}

// ── Help Panel ───────────────────────────────────────────────────────
function HelpPanel({ onHide }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start justify-between">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 mt-0.5">
          <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Manage your bills and purchases</p>
          <p className="text-xs text-muted-foreground mt-1">
            Enter a bill you have received and make payments.{" "}
            <span className="text-primary font-medium">Learn more...</span>
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Link to="/purchasing/purchase-orders" className="text-xs text-primary hover:underline font-medium">purchase orders</Link>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-primary hover:underline cursor-pointer font-medium">copy contents to bills and sales invoices</span>
          </div>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="text-xs gap-1 shrink-0" onClick={onHide}>
        <EyeOff className="w-3.5 h-3.5" /> Hide Help
      </Button>
    </div>
  );
}

// ── Upcoming Bills Chart ─────────────────────────────────────────────
function UpcomingBillsChart({ bills }) {
  const chartData = useMemo(() => {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 0; i < 12; i++) {
      const d = addDays(today, i);
      const dateKey = format(d, "yyyy-MM-dd");
      days.push({
        label: format(d, "d"),
        date: dateKey,
        fullLabel: format(d, "d MMM"),
        monthLabel: format(d, "MMM"),
        due: 0,
        paid: 0,
      });
    }

    for (const bill of bills) {
      if (bill.status === "Cancelled") continue;
      const outstanding = bill.total - (bill.amount_paid || 0);
      if (bill.due_date) {
        const dueDate = parseISO(bill.due_date);
        const match = days.find(d => d.date === format(dueDate, "yyyy-MM-dd"));
        if (match) {
          if (bill.status === "Paid") match.paid += bill.total;
          else match.due += outstanding;
        }
      }
    }
    return days;
  }, [bills]);

  return (
    <Card>
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-sm font-semibold">Upcoming bills</h3>
      </div>
      <CardContent>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} />
              <Tooltip formatter={(v, name) => [fmt(v), name === "due" ? "Due" : "Paid"]} labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""} />
              <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Bar dataKey="due" name="Due" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={20} stackId="a" />
              <Bar dataKey="paid" name="Paid" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={20} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Suppliers Table ──────────────────────────────────────────────────
function TopSuppliersTable({ bills }) {
  const supplierData = useMemo(() => {
    const map = {};
    for (const bill of bills) {
      if (bill.status === "Paid" || bill.status === "Cancelled") continue;
      const key = bill.contact_id || "__none__";
      if (!map[key]) {
        map[key] = { contact_name: bill.contact_name || "Unknown", contact_id: bill.contact_id, due: 0, overdue: 0 };
      }
      const outstanding = bill.total - (bill.amount_paid || 0);
      map[key].due += outstanding;
      if (bill.due_date && isBefore(parseISO(bill.due_date), startOfDay(new Date()))) {
        map[key].overdue += outstanding;
      }
    }
    return Object.values(map).sort((a, b) => b.due - a.due).slice(0, 8);
  }, [bills]);

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").slice(0, 3).map(w => w[0]).join("").toUpperCase();
  };

  const avatarColors = [
    "bg-orange-500", "bg-rose-500", "bg-yellow-500", "bg-teal-500",
    "bg-fuchsia-500", "bg-sky-500", "bg-lime-500", "bg-violet-500"
  ];

  return (
    <Card className="h-full">
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-sm font-semibold">Suppliers you owe the most</h3>
      </div>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Supplier</th>
              <th className="px-3 py-2 text-right font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {supplierData.map((s, i) => (
              <tr key={s.contact_id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                      {getInitials(s.contact_name)}
                    </div>
                    <span className="text-xs font-medium truncate max-w-[140px]">{s.contact_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(s.due)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-destructive">{fmt(s.overdue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default function PurchasingOverview() {
  const [bills, setBills] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(true);
  const [billsTab, setBillsTab] = useState("overview");
  const [poTab, setPoTab] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [bData, poData] = await batchedAll([
        () => withRetry(() => base44.entities.Bill.list("-issue_date", 500)),
        () => withRetry(() => base44.entities.PurchaseOrder.list("-issue_date", 500)),
      ], 2);
      setBills(Array.isArray(bData) ? bData : []);
      setPurchaseOrders(Array.isArray(poData) ? poData : []);
      setLoading(false);
    };
    load();
  }, []);

  const billGroups = useMemo(() => {
    const groups = {
      Draft: { count: 0, total: 0 },
      "Awaiting Approval": { count: 0, total: 0 },
      "Awaiting Payment": { count: 0, total: 0 },
      Overdue: { count: 0, total: 0 },
    };
    const today = startOfDay(new Date());
    for (const bill of bills) {
      if (bill.status === "Draft") {
        groups.Draft.count++; groups.Draft.total += bill.total || 0;
      } else if (bill.status === "Awaiting Approval") {
        groups["Awaiting Approval"].count++; groups["Awaiting Approval"].total += bill.total || 0;
      } else if (bill.status === "Awaiting Payment") {
        if (bill.due_date && isBefore(parseISO(bill.due_date), today)) {
          groups.Overdue.count++; groups.Overdue.total += (bill.total - (bill.amount_paid || 0));
        } else {
          groups["Awaiting Payment"].count++; groups["Awaiting Payment"].total += (bill.total - (bill.amount_paid || 0));
        }
      }
    }
    return groups;
  }, [bills]);

  const poGroups = useMemo(() => {
    const groups = {
      Draft: { count: 0, total: 0 },
      "Awaiting Approval": { count: 0, total: 0 },
      Approved: { count: 0, total: 0 },
    };
    for (const po of purchaseOrders) {
      const s = po.status;
      if (s === "Draft") { groups.Draft.count++; groups.Draft.total += po.total || 0; }
      else if (s === "Awaiting Approval") { groups["Awaiting Approval"].count++; groups["Awaiting Approval"].total += po.total || 0; }
      else if (s === "Approved" || s === "Billed") { groups.Approved.count++; groups.Approved.total += po.total || 0; }
    }
    return groups;
  }, [purchaseOrders]);

  const navigateToBills = (status) => {
    window.location.href = `/purchasing/bills?status=${encodeURIComponent(status)}`;
  };

  const navigateToPOs = (status) => {
    window.location.href = `/purchasing/purchase-orders?status=${encodeURIComponent(status)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const paidBills = bills.filter(b => b.status === "Paid");
  const repeatingBills = bills.filter(b => b.status === "Repeating");
  const billedPOs = purchaseOrders.filter(p => p.status === "Billed");

  return (
    <div className="min-h-screen bg-[#f2f4f5] dark:bg-background">
      {/* Page Header */}
      <div className="bg-white dark:bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Purchases overview</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Search className="w-3.5 h-3.5" /> Search
          </Button>
          <Link to="/purchasing/bills"><Button size="sm" className="text-xs">Create</Button></Link>
        </div>
      </div>

      <div className="p-5 space-y-5 max-w-[1400px] mx-auto">

        {/* Help Panel */}
        {showHelp && <HelpPanel onHide={() => setShowHelp(false)} />}

        {/* ── BILLS ──────────────────────────────────────────────────── */}
        <Card>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-base font-bold text-foreground">Bills</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setBillsTab("overview")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${billsTab === "overview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >Overview</button>
                <button
                  onClick={() => setBillsTab("paid")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${billsTab === "paid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >Paid ({paidBills.length})</button>
                <button
                  onClick={() => setBillsTab("repeating")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${billsTab === "repeating" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >Repeating ({repeatingBills.length})</button>
                <Link to="/purchasing/bills" className="text-xs text-primary hover:underline font-medium ml-2">See all</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border" />

          <CardContent className={billsTab === "overview" ? "pt-4 space-y-4" : "pt-4"}>
            {billsTab === "overview" && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  <StatusCard title="Draft" count={billGroups.Draft.count} amount={billGroups.Draft.total} onClick={() => navigateToBills("Draft")} />
                  <StatusCard title="Awaiting Approval" count={billGroups["Awaiting Approval"].count} amount={billGroups["Awaiting Approval"].total} onClick={() => navigateToBills("Awaiting Approval")} />
                  <StatusCard title="Awaiting Payment" count={billGroups["Awaiting Payment"].count} amount={billGroups["Awaiting Payment"].total} onClick={() => navigateToBills("Awaiting Payment")} />
                  <StatusCard title="Overdue" count={billGroups.Overdue.count} amount={billGroups.Overdue.total} accentClass="text-destructive" onClick={() => navigateToBills("Awaiting Payment")} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <UpcomingBillsChart bills={bills} />
                  <TopSuppliersTable bills={bills} />
                </div>
              </>
            )}

            {billsTab === "paid" && (
              paidBills.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No paid bills yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Number</th>
                      <th className="px-3 py-2 text-left font-medium">Supplier</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Due Date</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidBills.slice(0, 10).map(bill => (
                      <tr key={bill.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-primary">{bill.number}</td>
                        <td className="px-3 py-2">{bill.contact_name}</td>
                        <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{bill.due_date ? format(parseISO(bill.due_date), "dd MMM yyyy") : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(bill.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {billsTab === "repeating" && (
              repeatingBills.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No repeating bills yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Number</th>
                      <th className="px-3 py-2 text-left font-medium">Supplier</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repeatingBills.map(bill => (
                      <tr key={bill.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-primary">{bill.number}</td>
                        <td className="px-3 py-2">{bill.contact_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(bill.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </CardContent>
        </Card>

        {/* ── PURCHASE ORDERS ────────────────────────────────────────── */}
        <Card>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-base font-bold text-foreground">Purchase orders</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPoTab("overview")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${poTab === "overview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >Overview</button>
                <button
                  onClick={() => setPoTab("billed")}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${poTab === "billed" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >Billed ({billedPOs.length})</button>
                <Link to="/purchasing/purchase-orders" className="text-xs text-primary hover:underline font-medium ml-2">See all</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border" />

          <CardContent className="pt-4">
            {poTab === "overview" && (
              <div className="grid grid-cols-3 gap-3">
                <StatusCard title="Draft" count={poGroups.Draft.count} amount={poGroups.Draft.total} onClick={() => navigateToPOs("Draft")} />
                <StatusCard title="Awaiting Approval" count={poGroups["Awaiting Approval"].count} amount={poGroups["Awaiting Approval"].total} onClick={() => navigateToPOs("Awaiting Approval")} />
                <StatusCard title="Approved" count={poGroups.Approved.count} amount={poGroups.Approved.total} onClick={() => navigateToPOs("Approved")} />
              </div>
            )}

            {poTab === "billed" && (
              billedPOs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No billed purchase orders yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Number</th>
                      <th className="px-3 py-2 text-left font-medium">Supplier</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Date</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billedPOs.map(po => (
                      <tr key={po.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-primary">{po.number}</td>
                        <td className="px-3 py-2">{po.contact_name}</td>
                        <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{po.issue_date ? format(parseISO(po.issue_date), "dd MMM yyyy") : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(po.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </CardContent>
        </Card>

        {/* ── Quick Links ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/purchasing/bills">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">All Bills</p>
                  <p className="text-xs text-muted-foreground">{bills.length} bills · {fmt(bills.reduce((s, b) => s + (b.total || 0), 0))} total</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/purchasing/purchase-orders">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">All Purchase Orders</p>
                  <p className="text-xs text-muted-foreground">{purchaseOrders.length} POs · {fmt(purchaseOrders.reduce((s, p) => s + (p.total || 0), 0))} total</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </div>

      </div>
    </div>
  );
}