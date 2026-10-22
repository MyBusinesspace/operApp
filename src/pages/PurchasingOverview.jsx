import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { FileText, ShoppingCart, Search, ChevronDown, Upload } from "lucide-react";
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

// ── Stat Cell (Xero-style: "Label (count)" + big value) ──────────────
function StatCell({ label, count, amount, accent = false, onClick }) {
  const isNone = count === 0 && amount === 0;
  return (
    <button
      onClick={onClick}
      className="flex flex-col px-5 py-4 text-left hover:bg-muted/30 transition-colors w-full"
    >
      <span className={`text-xs ${accent ? "text-destructive" : "text-muted-foreground"}`}>
        {label} {count > 0 && `(${count})`}
      </span>
      <span className={`text-xl font-semibold mt-1 tabular-nums font-mono ${isNone ? "text-muted-foreground" : accent ? "text-destructive" : "text-foreground"}`}>
        {isNone ? "None" : fmt(amount)}
      </span>
    </button>
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
        <h3 className="text-xs font-semibold text-foreground">Upcoming bills</h3>
      </div>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} />
              <Tooltip formatter={(v, name) => [fmt(v), name === "due" ? "Due" : "Paid"]} labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="due" name="Due" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={24} stackId="a" />
              <Bar dataKey="paid" name="Paid" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={24} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────
export default function PurchasingOverview() {
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billsTab, setBillsTab] = useState("overview");
  const [poTab, setPoTab] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [bData, poData] = await batchedAll([
        () => withRetry(() => base44.entities.Bill.list("-issue_date", 5000)),
        () => withRetry(() => base44.entities.PurchaseOrder.list("-issue_date", 5000)),
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
        // Same as Xero: "Awaiting payment" counts every unpaid approved bill; "Overdue" is the part past its due date.
        groups["Awaiting Payment"].count++; groups["Awaiting Payment"].total += (bill.total - (bill.amount_paid || 0));
        if (bill.due_date && isBefore(parseISO(bill.due_date), today)) {
          groups.Overdue.count++; groups.Overdue.total += (bill.total - (bill.amount_paid || 0));
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
      else if (s === "Approved") { groups.Approved.count++; groups.Approved.total += po.total || 0; }
    }
    return groups;
  }, [purchaseOrders]);

  const navigateToBills = (status) => {
    navigate(`/purchasing/bills?status=${encodeURIComponent(status)}`);
  };

  const navigateToPOs = (status) => {
    navigate(`/purchasing/purchase-orders?status=${encodeURIComponent(status)}`);
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
    <div className="max-w-4xl mx-auto p-5 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Purchasing overview</h1>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs h-8">
                <FileText className="w-3.5 h-3.5" /> New <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => navigate("/purchasing/bills/new")}>
                <FileText className="w-4 h-4 mr-2" /> Bill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/purchasing/purchase-orders/new")}>
                <ShoppingCart className="w-4 h-4 mr-2" /> Purchase order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Search className="w-3.5 h-3.5" /> Search
          </Button>
        </div>
      </div>

        {/* ── BILLS ──────────────────────────────────────────────────── */}
        <Card>
          <div className="px-5 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <h2 className="text-sm font-bold text-foreground">Bills</h2>
              <div className="flex items-center gap-4 text-xs">
                <button onClick={() => setBillsTab("paid")} className={billsTab === "paid" ? "text-primary font-medium" : "text-primary/70 hover:text-primary"}>Paid</button>
                <button onClick={() => setBillsTab("repeating")} className={billsTab === "repeating" ? "text-primary font-medium" : "text-primary/70 hover:text-primary"}>Repeating</button>
                <Link to="/purchasing/bills" className="text-primary/70 hover:text-primary">See all</Link>
              </div>
            </div>
          </div>

          {billsTab === "overview" && (
            <>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-t border-border bg-slate-100 dark:bg-slate-800">
                <StatCell label="Draft" count={billGroups.Draft.count} amount={billGroups.Draft.total} onClick={() => navigateToBills("Draft")} />
                <StatCell label="Awaiting Approval" count={billGroups["Awaiting Approval"].count} amount={billGroups["Awaiting Approval"].total} onClick={() => navigateToBills("Awaiting Approval")} />
                <StatCell label="Awaiting Payment" count={billGroups["Awaiting Payment"].count} amount={billGroups["Awaiting Payment"].total} onClick={() => navigateToBills("Awaiting Payment")} />
                <StatCell label="Overdue" count={billGroups.Overdue.count} amount={billGroups.Overdue.total} accent onClick={() => navigateToBills("Awaiting Payment")} />
              </div>
              <div className="p-5">
                <UpcomingBillsChart bills={bills} />
              </div>
            </>
          )}

          {billsTab === "paid" && (
            <CardContent className="pt-4">
              {paidBills.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No paid bills yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-100 dark:bg-slate-800 text-xs text-muted-foreground">
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
                        <td className="px-3 py-2 text-right tabular-nums font-mono">{fmt(bill.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          )}

          {billsTab === "repeating" && (
            <CardContent className="pt-4">
              {repeatingBills.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No repeating bills yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-100 dark:bg-slate-800 text-xs text-muted-foreground">
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
                        <td className="px-3 py-2 text-right tabular-nums font-mono">{fmt(bill.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── PURCHASE ORDERS ────────────────────────────────────────── */}
        <Card>
          <div className="px-5 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <h2 className="text-sm font-bold text-foreground">Purchase orders</h2>
              <div className="flex items-center gap-4 text-xs">
                <Link to="/purchasing/purchase-orders" className="text-primary/70 hover:text-primary">See all</Link>
                <button onClick={() => setPoTab("billed")} className={poTab === "billed" ? "text-primary font-medium" : "text-primary/70 hover:text-primary"}>Billed</button>
              </div>
            </div>
          </div>

          {poTab === "overview" && (
            <div className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border bg-slate-100 dark:bg-slate-800">
              <StatCell label="Draft" count={poGroups.Draft.count} amount={poGroups.Draft.total} onClick={() => navigateToPOs("Draft")} />
              <StatCell label="Awaiting Approval" count={poGroups["Awaiting Approval"].count} amount={poGroups["Awaiting Approval"].total} onClick={() => navigateToPOs("Awaiting Approval")} />
              <StatCell label="Approved" count={poGroups.Approved.count} amount={poGroups.Approved.total} onClick={() => navigateToPOs("Approved")} />
            </div>
          )}

          {poTab === "billed" && (
            <CardContent className="pt-4">
              {billedPOs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No billed purchase orders yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-100 dark:bg-slate-800 text-xs text-muted-foreground">
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
                        <td className="px-3 py-2 text-right tabular-nums font-mono">{fmt(po.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          )}
        </Card>

    </div>
  );
}