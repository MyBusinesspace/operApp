import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText, FileCheck, Send, Clock, AlertCircle,
  TrendingUp, Users, Plus, ChevronRight, Download, ExternalLink
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { format, startOfMonth, endOfMonth, addMonths, isAfter, isBefore, parseISO, differenceInDays } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n) {
  return (n || 0).toLocaleString("en-AE");
}

function fmtCompact(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

// ── Invoice Status Card ──────────────────────────────────────────────
function InvoiceStatusCard({ title, count, amount, accentClass = "text-foreground", onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col p-4 rounded-lg hover:bg-muted/30 transition-colors text-left w-full"
    >
      <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{title}</span>
      <span className="text-lg font-bold text-foreground mt-0.5">({count})</span>
      <span className={`text-sm font-semibold mt-0.5 ${accentClass}`}>{fmt(amount)}</span>
    </button>
  );
}

// ── Money Coming In Chart ────────────────────────────────────────────
function MoneyComingInChart({ invoices }) {
  const chartData = useMemo(() => {
    const today = new Date();
    const buckets = {};

    // Include invoices that are not paid/cancelled
    const active = invoices.filter(i => i.status !== "Paid" && i.status !== "Cancelled" && i.due_date);

    for (const inv of active) {
      const due = parseISO(inv.due_date);
      let key;
      if (isBefore(due, startOfMonth(today))) key = "Older";
      else if (isBefore(due, addMonths(startOfMonth(today), 1))) key = format(today, "MMM");
      else if (isBefore(due, addMonths(startOfMonth(today), 2))) key = format(addMonths(today, 1), "MMM");
      else if (isBefore(due, addMonths(startOfMonth(today), 3))) key = format(addMonths(today, 2), "MMM");
      else if (isBefore(due, addMonths(startOfMonth(today), 4))) key = format(addMonths(today, 3), "MMM");
      else key = "Future";

      if (!buckets[key]) buckets[key] = 0;
      buckets[key] += inv.total - (inv.amount_paid || 0);
    }

    const ordered = ["Older", format(today, "MMM"), format(addMonths(today, 1), "MMM"), format(addMonths(today, 2), "MMM"), format(addMonths(today, 3), "MMM"), "Future"];
    return ordered.map(m => ({ month: m, amount: Math.round(buckets[m] || 0) }));
  }, [invoices]);

  const dueThisWeek = useMemo(() => {
    const today = new Date();
    const weekEnd = addMonths(today, 0);
    weekEnd.setDate(today.getDate() + (7 - today.getDay()));

    return invoices
      .filter(i => i.status !== "Paid" && i.status !== "Cancelled" && i.due_date)
      .filter(i => {
        const d = parseISO(i.due_date);
        return !isBefore(d, today) && !isAfter(d, weekEnd);
      })
      .reduce((s, i) => s + (i.total - (i.amount_paid || 0)), 0);
  }, [invoices]);

  const dueNextWeek = useMemo(() => {
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + (7 - today.getDay()));
    const nextWeekEnd = new Date(weekEnd);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

    return invoices
      .filter(i => i.status !== "Paid" && i.status !== "Cancelled" && i.due_date)
      .filter(i => {
        const d = parseISO(i.due_date);
        return isAfter(d, weekEnd) && !isAfter(d, nextWeekEnd);
      })
      .reduce((s, i) => s + (i.total - (i.amount_paid || 0)), 0);
  }, [invoices]);

  const maxAmount = Math.max(...chartData.map(d => d.amount), 100000);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          Money coming in <span className="text-muted-foreground">ⓘ</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Due this week</p>
            <p className="text-lg font-bold text-foreground">{fmt(dueThisWeek)}</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Due next week</p>
            <p className="text-lg font-bold text-foreground">{fmt(dueNextWeek)}</p>
          </div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} />
              <Tooltip formatter={(v) => [fmt(v), "Amount"]} />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Customers Owing Table ────────────────────────────────────────────
function CustomersOwingTable({ invoices }) {
  const customerData = useMemo(() => {
    const map = {};
    for (const inv of invoices) {
      if (inv.status === "Paid" || inv.status === "Cancelled") continue;
      const key = inv.contact_id || "__none__";
      if (!map[key]) {
        map[key] = {
          contact_name: inv.contact_name || "Unknown",
          contact_id: inv.contact_id,
          due: 0,
          overdue: 0,
        };
      }
      const outstanding = inv.total - (inv.amount_paid || 0);
      map[key].due += outstanding;
      if (inv.due_date && isBefore(parseISO(inv.due_date), new Date())) {
        map[key].overdue += outstanding;
      }
    }
    return Object.values(map)
      .sort((a, b) => b.due - a.due)
      .slice(0, 8);
  }, [invoices]);

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").slice(0, 3).map(w => w[0]).join("").toUpperCase();
  };

  const avatarColors = [
    "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-red-500",
    "bg-purple-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Customers owing the most</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {customerData.map((c, i) => (
              <tr key={c.contact_id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                      {getInitials(c.contact_name)}
                    </div>
                    <span className="text-xs font-medium truncate max-w-[140px]">{c.contact_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(c.due)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-destructive">{fmt(c.overdue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2.5 border-t border-border">
          <Link to="/sales/statements" className="text-xs text-primary hover:underline font-medium">
            View all statements
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Billable Expenses Card ───────────────────────────────────────────
function BillableExpensesCard({ invoices }) {
  // Use invoices that are linked to projects but not yet paid
  const billable = useMemo(() => {
    return invoices
      .filter(i => i.status !== "Paid" && i.status !== "Cancelled" && i.project_id)
      .reduce((acc, inv) => {
        const key = inv.contact_id || inv.project_id;
        if (!acc[key]) {
          acc[key] = { contact_name: inv.contact_name, project_name: inv.project_name, amount: 0, contact_id: inv.contact_id };
        }
        acc[key].amount += inv.total - (inv.amount_paid || 0);
        return acc;
      }, {});
  }, [invoices]);

  const entries = Object.values(billable);
  const totalOwing = entries.reduce((s, e) => s + e.amount, 0);
  const customerCount = entries.length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Billable expenses</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xl font-bold text-foreground">{customerCount}</p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{fmt(totalOwing)}</p>
            <p className="text-xs text-muted-foreground">Owing</p>
          </div>
        </div>

        {entries.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Contact</th>
                <th className="py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 5).map((e, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5 text-xs font-medium">{e.contact_name}</td>
                  <td className="py-1.5 text-right text-xs font-mono">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center gap-2">
          <Link to="/sales/invoices">
            <Button variant="default" size="sm" className="text-xs">Create invoice</Button>
          </Link>
          <span className="text-xs text-muted-foreground">View all billable expenses</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quote Metrics Card ───────────────────────────────────────────────
function QuoteMetricsCard({ quotes }) {
  const statusGroups = useMemo(() => {
    const groups = { Draft: { count: 0, total: 0 }, Sent: { count: 0, total: 0 }, Accepted: { count: 0, total: 0 }, Expired: { count: 0, total: 0 } };
    for (const q of quotes) {
      if (q.status === "Draft") { groups.Draft.count++; groups.Draft.total += q.total || 0; }
      else if (q.status === "Sent") { groups.Sent.count++; groups.Sent.total += q.total || 0; }
      else if (q.status === "Accepted") { groups.Accepted.count++; groups.Accepted.total += q.total || 0; }
      else if (q.status === "Declined" || q.status === "Cancelled") { groups.Expired.count++; groups.Expired.total += q.total || 0; }
    }
    return groups;
  }, [quotes]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">
          <Link to="/sales/quotes" className="hover:underline">Quotes</Link>
        </CardTitle>
        <Link to="/sales/quotes" className="text-xs text-primary hover:underline">View all</Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          <InvoiceStatusCard title="Draft" count={statusGroups.Draft.count} amount={statusGroups.Draft.total} />
          <InvoiceStatusCard title="Sent" count={statusGroups.Sent.count} amount={statusGroups.Sent.total} />
          <InvoiceStatusCard title="Accepted" count={statusGroups.Accepted.count} amount={statusGroups.Accepted.total} />
          <InvoiceStatusCard title="Expired" count={statusGroups.Expired.count} amount={statusGroups.Expired.total} accentClass="text-destructive" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────
export default function SalesOverview() {
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("invoices");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [invData, qData] = await batchedAll([
        () => withRetry(() => base44.entities.Invoice.list("-issue_date", 500)),
        () => withRetry(() => base44.entities.Quote.list("-issue_date", 500)),
      ], 2);
      setInvoices(Array.isArray(invData) ? invData : []);
      setQuotes(Array.isArray(qData) ? qData : []);
      setLoading(false);
    };
    load();
  }, []);

  const invoiceStatusGroups = useMemo(() => {
    const groups = {
      Draft: { count: 0, total: 0 },
      "Awaiting Approval": { count: 0, total: 0 },
      "Awaiting Payment": { count: 0, total: 0 },
      Overdue: { count: 0, total: 0 },
    };
    const today = new Date();
    for (const inv of invoices) {
      if (inv.status === "Draft") {
        groups.Draft.count++; groups.Draft.total += inv.total || 0;
      } else if (inv.status === "Awaiting Approval") {
        groups["Awaiting Approval"].count++; groups["Awaiting Approval"].total += inv.total || 0;
      } else if (inv.status === "Awaiting Payment") {
        if (inv.due_date && isBefore(parseISO(inv.due_date), today)) {
          groups.Overdue.count++; groups.Overdue.total += (inv.total - (inv.amount_paid || 0));
        } else {
          groups["Awaiting Payment"].count++; groups["Awaiting Payment"].total += (inv.total - (inv.amount_paid || 0));
        }
      }
    }
    return groups;
  }, [invoices]);

  const navigateToInvoices = (status) => {
    // Navigate to invoices filtered by status
    window.location.href = `/sales/invoices?status=${encodeURIComponent(status)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f4f5] dark:bg-background">
      {/* Page Header */}
      <div className="bg-white dark:bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Sales overview</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Search
          </Button>
          <Link to="/sales/invoices"><Button size="sm" className="text-xs">Create</Button></Link>
        </div>
      </div>

      <div className="p-5 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Invoices & Payments ────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab("invoices")}
                className={`text-sm font-semibold pb-2 -mb-[1px] border-b-2 transition-colors ${
                  activeTab === "invoices" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >Invoices</button>
              <button
                onClick={() => setActiveTab("repeating")}
                className={`text-sm font-semibold pb-2 -mb-[1px] border-b-2 transition-colors ${
                  activeTab === "repeating" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >Repeating invoices</button>
              <button
                onClick={() => setActiveTab("statements")}
                className={`text-sm font-semibold pb-2 -mb-[1px] border-b-2 transition-colors ${
                  activeTab === "statements" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >Statements</button>
            </div>
            <Button variant="ghost" size="sm" className="text-xs">Edit dashboard</Button>
          </CardHeader>
          <div className="border-t border-border" />

          {activeTab === "invoices" && (
            <CardContent className="pt-4">
              <div className="grid grid-cols-4 gap-3">
                <InvoiceStatusCard
                  title="Draft"
                  count={invoiceStatusGroups.Draft.count}
                  amount={invoiceStatusGroups.Draft.total}
                  onClick={() => navigateToInvoices("Draft")}
                />
                <InvoiceStatusCard
                  title="Awaiting approval"
                  count={invoiceStatusGroups["Awaiting Approval"].count}
                  amount={invoiceStatusGroups["Awaiting Approval"].total}
                  onClick={() => navigateToInvoices("Awaiting Approval")}
                />
                <InvoiceStatusCard
                  title="Awaiting payment"
                  count={invoiceStatusGroups["Awaiting Payment"].count}
                  amount={invoiceStatusGroups["Awaiting Payment"].total}
                  onClick={() => navigateToInvoices("Awaiting Payment")}
                />
                <InvoiceStatusCard
                  title="Overdue"
                  count={invoiceStatusGroups.Overdue.count}
                  amount={invoiceStatusGroups.Overdue.total}
                  accentClass="text-destructive"
                  onClick={() => navigateToInvoices("Awaiting Payment")}
                />
              </div>
            </CardContent>
          )}

          {activeTab === "repeating" && (
            <CardContent className="pt-4">
              <div className="py-12 text-center text-sm text-muted-foreground">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p>Repeating invoices will appear here.</p>
              </div>
            </CardContent>
          )}

          {activeTab === "statements" && (
            <CardContent className="pt-4">
              <div className="py-12 text-center text-sm text-muted-foreground">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p>
                  <Link to="/sales/statements" className="text-primary hover:underline">View customer statements</Link>
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── Middle Row: Create New | Money Coming In | Customers Owing ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Create New + Online Payments */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Create new</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Link to="/sales/invoices" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors text-sm font-medium text-foreground">
                  <Plus className="w-4 h-4 text-muted-foreground" /> Invoice
                </Link>
                <Link to="/sales/quotes" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors text-sm font-medium text-foreground">
                  <Plus className="w-4 h-4 text-muted-foreground" /> Quote
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm font-semibold text-foreground">Online payments</p>
                <p className="text-xs text-muted-foreground">Powered by Stripe</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">VISA</span>
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">MC</span>
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">AMEX</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total balance</span><span className="font-mono font-medium">0.00</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Available to pay out</span><span className="font-mono font-medium">0.00</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Next payout</span><span className="font-mono font-medium">-</span></div>
                </div>
                <Button variant="default" size="sm" className="w-full text-xs">Start with Stripe</Button>
              </CardContent>
            </Card>
          </div>

          {/* Money Coming In Chart */}
          <MoneyComingInChart invoices={invoices} />

          {/* Customers Owing */}
          <CustomersOwingTable invoices={invoices} />
        </div>

        {/* ── Billable Expenses ──────────────────────────────────────── */}
        <BillableExpensesCard invoices={invoices} />

        {/* ── Quotes ─────────────────────────────────────────────────── */}
        <QuoteMetricsCard quotes={quotes} />
      </div>
    </div>
  );
}