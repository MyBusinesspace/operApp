import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  FileText, ChevronRight, Download, Search, Settings, ChevronDown, Info
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { todayLocalISO, addDaysISO } from "@/lib/dateOnly";
import { format, startOfMonth, addMonths, isAfter, isBefore, parseISO } from "date-fns";

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
  return (
    <button
      onClick={onClick}
      className="flex flex-col px-5 py-4 text-left hover:bg-muted/30 transition-colors w-full"
    >
      <span className={`text-xs ${accent ? "text-destructive" : "text-muted-foreground"}`}>
        {label} ({count})
      </span>
      <span className={`text-xl font-semibold mt-1 tabular-nums font-mono ${accent ? "text-destructive" : "text-foreground"}`}>{fmt(amount)}</span>
    </button>
  );
}

// ── Money Coming In Chart ────────────────────────────────────────────
function MoneyComingInChart({ invoices }) {
  const chartData = useMemo(() => {
    const today = new Date();
    const buckets = {};
    const active = invoices.filter(i => i.status === "Awaiting Payment" && i.due_date);

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

  const { dueThisWeek, dueNextWeek } = useMemo(() => {
    const todayIso = todayLocalISO();
    const dow = new Date().getDay();
    const weekEnd = addDaysISO(todayIso, 7 - dow);
    const nextEnd = addDaysISO(weekEnd, 7);
    let a = 0, b = 0;
    for (const i of invoices) {
      if (i.status !== "Awaiting Payment" || !i.due_date) continue;
      const out = (i.total || 0) - (i.amount_paid || 0);
      if (i.due_date >= todayIso && i.due_date <= weekEnd) a += out;
      else if (i.due_date > weekEnd && i.due_date <= nextEnd) b += out;
    }
    return { dueThisWeek: a, dueNextWeek: b };
  }, [invoices]);

  return (
    <Card className="h-full">
      <div className="px-5 pt-4 pb-2 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-foreground">Money coming in</span>
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <CardContent className="space-y-3 pt-1">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Due this week</p>
            <p className="text-lg font-semibold text-foreground tabular-nums font-mono">{fmt(dueThisWeek)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due next week</p>
            <p className="text-lg font-semibold text-foreground tabular-nums font-mono">{fmt(dueNextWeek)}</p>
          </div>
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} />
              <Tooltip formatter={(v) => [fmt(v), "Amount"]} />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={36} />
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
      if (inv.status !== "Awaiting Payment") continue;
      const key = inv.contact_id || "__none__";
      if (!map[key]) {
        map[key] = { contact_name: inv.contact_name || "Unknown", contact_id: inv.contact_id, due: 0, overdue: 0 };
      }
      const outstanding = inv.total - (inv.amount_paid || 0);
      map[key].due += outstanding;
      if (inv.due_date && inv.due_date < todayLocalISO()) {
        map[key].overdue += outstanding;
      }
    }
    return Object.values(map).sort((a, b) => b.due - a.due).slice(0, 8);
  }, [invoices]);

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").slice(0, 3).map(w => w[0]).join("").toUpperCase();
  };

  const avatarColors = [
    "bg-orange-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-red-500", "bg-purple-500", "bg-cyan-500", "bg-pink-500"
  ];

  return (
    <Card className="h-full">
      <div className="px-5 pt-4 pb-2">
        <span className="text-xs font-semibold text-foreground">Customers owing the most</span>
      </div>
      <CardContent className="p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-border bg-slate-100 dark:bg-slate-800 text-xs text-muted-foreground">
              <th className="px-5 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Due</th>
              <th className="px-5 py-2 text-right font-medium">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {customerData.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground text-xs">No outstanding invoices</td></tr>
            ) : customerData.map((c, i) => (
              <tr key={c.contact_id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                      {getInitials(c.contact_name)}
                    </div>
                    {c.contact_id ? (
                      <Link to={`/contacts/${c.contact_id}`} className="text-xs font-medium truncate max-w-[160px] hover:underline text-foreground">{c.contact_name}</Link>
                    ) : (
                      <span className="text-xs font-medium truncate max-w-[160px]">{c.contact_name}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs font-medium font-mono">{fmt(c.due)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-xs font-medium text-destructive font-mono">{fmt(c.overdue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────
export default function SalesOverview() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("invoices");

  const [creditNotes, setCreditNotes] = useState([]);
  const [recentPaid, setRecentPaid] = useState([]);
  useEffect(() => {
    const pageAll = async (fn) => {
      const out = [];
      for (let skip = 0; skip < 20000; skip += 500) {
        const page = await withRetry(() => fn(skip));
        if (!Array.isArray(page) || page.length === 0) break;
        out.push(...page);
        if (page.length < 500) break;
      }
      return out;
    };
    const load = async () => {
      setLoading(true);
      // Only the invoices that still matter for the dashboard (not Paid / Cancelled) so totals cover ALL of them.
      const [aw, dr, ap, qData, cnData, paid] = await batchedAll([
        () => pageAll(skip => base44.entities.Invoice.filter({ status: "Awaiting Payment" }, "-due_date", 500, skip)),
        () => pageAll(skip => base44.entities.Invoice.filter({ status: "Draft" }, "-issue_date", 500, skip)),
        () => pageAll(skip => base44.entities.Invoice.filter({ status: "Awaiting Approval" }, "-issue_date", 500, skip)),
        () => pageAll(skip => base44.entities.Quote.list("-issue_date", 500, skip)),
        () => pageAll(skip => base44.entities.CreditNote.list("-issue_date", 500, skip)),
        () => withRetry(() => base44.entities.Invoice.filter({ status: "Paid" }, "-updated_date", 8)),
      ], 3);
      setInvoices([...(aw || []), ...(dr || []), ...(ap || [])]);
      setQuotes(Array.isArray(qData) ? qData : []);
      setCreditNotes(Array.isArray(cnData) ? cnData : []);
      setRecentPaid(Array.isArray(paid) ? paid : []);
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
        // Same as Xero: "Awaiting payment" is every unpaid approved invoice; "Overdue" is the part of it past its due date.
        groups["Awaiting Payment"].count++; groups["Awaiting Payment"].total += (inv.total - (inv.amount_paid || 0));
        if (inv.due_date && inv.due_date < todayLocalISO()) {
          groups.Overdue.count++; groups.Overdue.total += (inv.total - (inv.amount_paid || 0));
        }
      }
    }
    return groups;
  }, [invoices]);

  const quoteStatusGroups = useMemo(() => {
    const groups = { Draft: { count: 0, total: 0 }, Sent: { count: 0, total: 0 }, Accepted: { count: 0, total: 0 }, Expired: { count: 0, total: 0 }, Declined: { count: 0, total: 0 } };
    const todayIso = todayLocalISO();
    for (const q of quotes) {
      if (q.status === "Draft") { groups.Draft.count++; groups.Draft.total += q.total || 0; }
      else if (q.status === "Sent") {
        if (q.expiry_date && q.expiry_date < todayIso) { groups.Expired.count++; groups.Expired.total += q.total || 0; }
        else { groups.Sent.count++; groups.Sent.total += q.total || 0; }
      }
      else if (q.status === "Accepted") { groups.Accepted.count++; groups.Accepted.total += q.total || 0; }
      else if (q.status === "Declined") { groups.Declined.count++; groups.Declined.total += q.total || 0; }
    }
    return groups;
  }, [quotes]);

  const creditGroups = useMemo(() => {
    const g = { open: { count: 0, total: 0 }, draft: { count: 0, total: 0 } };
    for (const c of creditNotes) {
      if (c.status === "Awaiting Application") { g.open.count++; g.open.total += (c.total || 0) - (c.amount_applied || 0); }
      else if (c.status === "Draft") { g.draft.count++; g.draft.total += c.total || 0; }
    }
    return g;
  }, [creditNotes]);

  const navigateToInvoices = (status) => {
    navigate(`/sales/invoices?status=${encodeURIComponent(status)}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-5 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Sales overview</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"><Download className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Search className="w-3.5 h-3.5" /> Search
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs h-8">
                Create <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => navigate("/sales/invoices/new")}>
                <FileText className="w-4 h-4 mr-2" /> Invoice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/sales/quotes/new")}>
                <FileText className="w-4 h-4 mr-2" /> Quote
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/settings/sales">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings"><Settings className="w-4 h-4" /></Button>
          </Link>
        </div>
      </div>

        {/* ── Invoices and payments ─────────────────────────────────── */}
        <Card>
          <div className="px-5 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <span className="text-xs font-semibold text-foreground">Invoices and payments</span>
              <div className="flex items-center gap-4 text-xs">
                <button onClick={() => setActiveTab("invoices")} className={activeTab === "invoices" ? "text-primary font-medium" : "text-primary/70 hover:text-primary"}>Invoices</button>
                <button onClick={() => setActiveTab("repeating")} className={activeTab === "repeating" ? "text-primary font-medium" : "text-primary/70 hover:text-primary"}>Repeating invoices</button>
                <Link to="/sales/statements" className="text-primary/70 hover:text-primary">Statements</Link>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8">Edit dashboard</Button>
          </div>

          {activeTab === "invoices" && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-t border-border bg-slate-100 dark:bg-slate-800">
              <StatCell label="Draft" count={invoiceStatusGroups.Draft.count} amount={invoiceStatusGroups.Draft.total} onClick={() => navigateToInvoices("Draft")} />
              <StatCell label="Awaiting approval" count={invoiceStatusGroups["Awaiting Approval"].count} amount={invoiceStatusGroups["Awaiting Approval"].total} onClick={() => navigateToInvoices("Awaiting Approval")} />
              <StatCell label="Awaiting payment" count={invoiceStatusGroups["Awaiting Payment"].count} amount={invoiceStatusGroups["Awaiting Payment"].total} onClick={() => navigateToInvoices("Awaiting Payment")} />
              <StatCell label="Overdue" count={invoiceStatusGroups.Overdue.count} amount={invoiceStatusGroups.Overdue.total} accent onClick={() => navigateToInvoices("Awaiting Payment")} />
            </div>
          )}

          {activeTab === "repeating" && (
            <div className="py-12 text-center text-xs text-muted-foreground border-t border-border mt-3">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p>Repeating invoices will appear here.</p>
            </div>
          )}
        </Card>

        {/* ── Quick links | Money coming in ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card>
            <div className="px-5 pt-4 pb-2">
              <span className="text-xs font-semibold text-foreground">Quick links</span>
            </div>
            <CardContent className="p-0">
              <Link to="/sales/invoices/new" className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors border-t border-border">
                <span className="text-xs text-foreground">Create invoice</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
              <Link to="/sales/invoices/new" state={{ initial: { status: "Repeating" } }} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors border-t border-border">
                <span className="text-xs text-foreground">Create repeating invoice</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <MoneyComingInChart invoices={invoices} />
          </div>
        </div>

        {/* ── Customers owing the most ─────────────────────────────── */}
        <CustomersOwingTable invoices={invoices} />

        {/* ── Credit notes | Recently paid ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <div className="px-5 pt-4 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Credit notes</span>
              <Link to="/sales/credit-notes" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-3 grid grid-cols-2 divide-x divide-border border-t border-border bg-slate-100 dark:bg-slate-800">
              <StatCell label="Draft" count={creditGroups.draft.count} amount={creditGroups.draft.total} onClick={() => navigate("/sales/credit-notes")} />
              <StatCell label="Awaiting application" count={creditGroups.open.count} amount={creditGroups.open.total} onClick={() => navigate("/sales/credit-notes")} />
            </div>
          </Card>
          <Card>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Recently paid invoices</span>
              <Link to="/sales/invoices?status=Paid" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <CardContent className="p-0">
              {recentPaid.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-muted-foreground">No paid invoices yet</p>
              ) : recentPaid.map(i => (
                <div key={i.id} className="flex items-center justify-between px-5 py-2 border-t border-border text-xs">
                  <span className="truncate max-w-[60%]"><span className="font-medium">{i.number}</span> <span className="text-muted-foreground">{i.contact_name}</span></span>
                  <span className="tabular-nums font-mono">{fmt(i.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── Quotes ───────────────────────────────────────────────── */}
        <Card>
          <div className="px-5 pt-4 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Quotes</span>
            <Link to="/sales/quotes" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 divide-x divide-border border-t border-border bg-slate-100 dark:bg-slate-800">
            <StatCell label="Draft" count={quoteStatusGroups.Draft.count} amount={quoteStatusGroups.Draft.total} onClick={() => navigate("/sales/quotes?status=Draft")} />
            <StatCell label="Sent" count={quoteStatusGroups.Sent.count} amount={quoteStatusGroups.Sent.total} onClick={() => navigate("/sales/quotes?status=Sent")} />
            <StatCell label="Accepted" count={quoteStatusGroups.Accepted.count} amount={quoteStatusGroups.Accepted.total} onClick={() => navigate("/sales/quotes?status=Accepted")} />
            <StatCell label="Expired" count={quoteStatusGroups.Expired.count} amount={quoteStatusGroups.Expired.total} accent onClick={() => navigate("/sales/quotes?status=Sent")} />
            <StatCell label="Declined" count={quoteStatusGroups.Declined.count} amount={quoteStatusGroups.Declined.total} onClick={() => navigate("/sales/quotes?status=Declined")} />
          </div>
        </Card>
    </div>
  );
}