import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import {
  FileText, Receipt, Landmark, Coins, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Wallet, BarChart3, ChevronRight
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { format, addDays, startOfDay } from "date-fns";
import {
  DarkHeader, DarkHero, Metric, StatusRow, DarkSection, DarkQuickLink, DarkLoading
} from "@/components/shared/DarkOverview";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

export default function FinanceOverview() {
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [pettyCash, setPettyCash] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [inv, bl, ba, pc] = await batchedAll([
        () => withRetry(() => base44.entities.Invoice.list("-created_date", 500)),
        () => withRetry(() => base44.entities.Bill.list("-created_date", 500)),
        () => withRetry(() => base44.entities.BankAccount.list("name", 50)),
        () => withRetry(() => base44.entities.PettyCashEntry.list("-created_date", 200)),
      ], 2);
      setInvoices(Array.isArray(inv) ? inv : []);
      setBills(Array.isArray(bl) ? bl : []);
      setBankAccounts(Array.isArray(ba) ? ba : []);
      setPettyCash(Array.isArray(pc) ? pc : []);
      setLoading(false);
    };
    load();
  }, []);

  const invoiceGroups = useMemo(() => {
    const groups = { Draft: 0, "Awaiting Payment": 0, Paid: 0, Overdue: 0 };
    const today = startOfDay(new Date());
    for (const inv of invoices) {
      if (inv.status === "Draft") groups.Draft++;
      else if (inv.status === "Awaiting Payment") {
        if (inv.due_date && new Date(inv.due_date) < today) groups.Overdue++;
        else groups["Awaiting Payment"]++;
      } else if (inv.status === "Paid") groups.Paid++;
    }
    return groups;
  }, [invoices]);

  const billGroups = useMemo(() => {
    const groups = { Draft: 0, "Awaiting Payment": 0, Paid: 0, Overdue: 0 };
    const today = startOfDay(new Date());
    for (const bl of bills) {
      if (bl.status === "Draft") groups.Draft++;
      else if (bl.status === "Awaiting Payment") {
        if (bl.due_date && new Date(bl.due_date) < today) groups.Overdue++;
        else groups["Awaiting Payment"]++;
      } else if (bl.status === "Paid") groups.Paid++;
    }
    return groups;
  }, [bills]);

  const totalInvoiced = invoices.filter(i => i.status !== "Cancelled").reduce((s, i) => s + (i.total || 0), 0);
  const totalReceivable = invoices
    .filter(i => i.status === "Awaiting Payment" || i.status === "Draft")
    .reduce((s, i) => s + (i.total - (i.amount_paid || 0)), 0);
  const totalPayable = bills
    .filter(b => b.status === "Awaiting Payment" || b.status === "Draft")
    .reduce((s, b) => s + (b.total - (b.amount_paid || 0)), 0);

  const bankBalances = bankAccounts.map(ba => ({
    name: ba.name,
    balance: ba.opening_balance || 0,
    currency: ba.currency || "AED",
  }));

  const pettyTotal = pettyCash.reduce((s, p) => {
    if (p.type === "Receive Money" || p.type === "Deposit") return s + (p.amount || 0);
    return s - (p.amount || 0);
  }, 0);

  const cashFlowChart = useMemo(() => {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 11; i >= 0; i--) {
      const d = addDays(today, -i);
      days.push({ label: format(d, "d"), fullLabel: format(d, "d MMM"), dateKey: format(d, "yyyy-MM-dd"), invoices: 0, bills: 0 });
    }
    for (const inv of invoices) {
      if (!inv.issue_date) continue;
      const match = days.find(d => d.dateKey === inv.issue_date);
      if (match && inv.status !== "Cancelled") match.invoices += inv.total || 0;
    }
    for (const bl of bills) {
      if (!bl.issue_date) continue;
      const match = days.find(d => d.dateKey === bl.issue_date);
      if (match && bl.status !== "Cancelled") match.bills += bl.total || 0;
    }
    return days;
  }, [invoices, bills]);

  if (loading) return <DarkLoading />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DarkHeader sectionLabel="Finance" createTo="/sales" />

      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        <DarkHero
          title="Finance overview"
          subtitle="Monitor invoices, bills, bank accounts and petty cash — your complete financial picture in one place."
        />

        {/* Top metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
          <Metric icon={TrendingUp} iconColor="text-indigo-400" label="Invoiced" value={fmtCompact(totalInvoiced)} />
          <Metric icon={ArrowUpRight} iconColor="text-emerald-400" label="Receivable" value={fmtCompact(totalReceivable)} />
          <Metric icon={TrendingDown} iconColor="text-amber-400" label="Payable" value={fmtCompact(totalPayable)} />
          <Metric icon={Wallet} iconColor="text-rose-400" label="Petty Cash" value={fmtCompact(Math.abs(pettyTotal))} />
        </div>

        {/* Invoices + Bills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DarkSection title="Invoices" icon={FileText} iconColor="text-indigo-400" seeAllTo="/sales/invoices">
            <StatusRow title="Draft" count={invoiceGroups.Draft} />
            <StatusRow title="Awaiting Payment" count={invoiceGroups["Awaiting Payment"]} accentColor="text-amber-400" />
            <StatusRow title="Overdue" count={invoiceGroups.Overdue} accentColor="text-rose-400" />
            <StatusRow title="Paid" count={invoiceGroups.Paid} accentColor="text-emerald-400" />
          </DarkSection>

          <DarkSection title="Bills" icon={Receipt} iconColor="text-amber-400" seeAllTo="/purchasing/bills">
            <StatusRow title="Draft" count={billGroups.Draft} />
            <StatusRow title="Awaiting Payment" count={billGroups["Awaiting Payment"]} accentColor="text-amber-400" />
            <StatusRow title="Overdue" count={billGroups.Overdue} accentColor="text-rose-400" />
            <StatusRow title="Paid" count={billGroups.Paid} accentColor="text-emerald-400" />
          </DarkSection>
        </div>

        {/* Cash flow chart + Bank balances */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DarkSection title="Cash flow — last 12 days" icon={BarChart3} iconColor="text-indigo-400" bgClass="bg-card">
            <div className="h-52 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1a", border: "1px solid #27272a", borderRadius: 8, fontSize: 12, color: "#fff" }}
                    formatter={(v, name) => [fmt(v), name === "invoices" ? "Invoiced" : "Billed"]}
                    labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""}
                    cursor={{ fill: "#ffffff0a" }}
                  />
                  <Bar dataKey="invoices" name="Invoiced" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="bills" name="Billed" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DarkSection>

          <DarkSection title="Bank Accounts" icon={Landmark} iconColor="text-emerald-400" seeAllTo="/accounting/banks" bgClass="bg-card">
            {bankBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-6 text-center">No bank accounts yet.</p>
            ) : (
              <div className="py-2 space-y-1">
                {bankBalances.map((ba, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-muted-foreground/70" strokeWidth={1.5} />
                      <span className="text-sm font-medium text-foreground/90">{ba.name}</span>
                    </div>
                    <span className="text-sm font-medium text-foreground tabular-nums">{fmt(ba.balance)} {ba.currency}</span>
                  </div>
                ))}
              </div>
            )}
          </DarkSection>
        </div>

        {/* Petty Cash summary */}
        <DarkSection title="Petty Cash" icon={Coins} iconColor="text-rose-400" seeAllTo="/petty-cash" bgClass="bg-card">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4">
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Entries</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{pettyCash.length}</p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Balance</p>
              <p className={`text-xl font-bold mt-0.5 ${pettyTotal >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                AED {fmt(pettyTotal)}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Received</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">
                {fmt(pettyCash.filter(p => p.type === "Receive Money" || p.type === "Deposit").reduce((s, p) => s + (p.amount || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground font-medium">Spent</p>
              <p className="text-xl font-bold text-rose-400 mt-0.5">
                {fmt(pettyCash.filter(p => p.type === "Spend Money" || p.type === "Withdrawal").reduce((s, p) => s + (p.amount || 0), 0))}
              </p>
            </div>
          </div>
        </DarkSection>

        {/* Quick Links */}
        <div>
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">Quick access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <DarkQuickLink to="/sales-overview" icon={FileText} iconColor="text-indigo-400" label="Sales" subtitle={`${invoices.length} invoices`} />
            <DarkQuickLink to="/purchasing-overview" icon={Receipt} iconColor="text-amber-400" label="Purchases" subtitle={`${bills.length} bills`} />
            <DarkQuickLink to="/accounting/banks" icon={Landmark} iconColor="text-emerald-400" label="Banking" subtitle={`${bankAccounts.length} accounts`} />
            <DarkQuickLink to="/petty-cash" icon={Coins} iconColor="text-rose-400" label="Petty Cash" subtitle={`${pettyCash.length} entries`} />
            <DarkQuickLink to="/accounting" icon={BarChart3} iconColor="text-sky-400" label="Accounting" subtitle="Reports & entries" />
          </div>
        </div>
      </div>
    </div>
  );
}