import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { computeLabourCost, fetchProfiles } from "@/lib/labourCost";
import { Loader2, TrendingUp, TrendingDown, Wallet, Receipt, Users, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from "recharts";

function fmtCurrency(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

// Exclude cancelled documents from financial totals
const isCounted = (d) => d.status !== "Cancelled";

/**
 * TaskFinancialSummary
 * Props:
 *   - taskId: the task id
 *   - task:   the task record
 *   - invoices: linked invoices (already filtered by parent)
 *   - bills:   linked bills (already filtered by parent)
 *   - refreshKey: bump to reload labour cost
 */
export default function TaskFinancialSummary({ taskId, task, invoices = [], bills = [], refreshKey = 0 }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [labourTotal, setLabourTotal] = useState(0);
  const [labourByDay, setLabourByDay] = useState({});
  const [missingProfiles, setMissingProfiles] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!taskId) return;
      setLoading(true);
      try {
        const timeEntries = await base44.entities.TimeEntry.filter({ task_id: taskId }).catch(() => []);
        const employeeIds = [...new Set((timeEntries || []).map(e => e.employee_id).filter(Boolean))];
        const profileMap = await fetchProfiles(employeeIds);
        const { totals, byDay, missingProfiles } = computeLabourCost(timeEntries || [], profileMap);
        if (!active) return;
        setLabourTotal(totals.total);
        setLabourByDay(byDay);
        setMissingProfiles(missingProfiles);
      } catch (e) {
        console.error("TaskFinancialSummary labour error", e);
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [taskId, refreshKey]);

  const countedInvoices = invoices.filter(isCounted);
  const countedBills = bills.filter(isCounted);

  const revenue = countedInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const billsCost = countedBills.reduce((s, b) => s + (b.total || 0), 0);
  const totalCost = labourTotal + billsCost;
  const grossProfit = revenue - totalCost;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : null;

  // Build cumulative timeline: costs (labour + bills) vs revenue (invoices)
  const seriesMap = {};
  const addPoint = (date, cost = 0, rev = 0) => {
    if (!date) return;
    const key = String(date).slice(0, 10);
    if (!seriesMap[key]) seriesMap[key] = { cost: 0, revenue: 0 };
    seriesMap[key].cost += cost;
    seriesMap[key].revenue += rev;
  };
  Object.entries(labourByDay).forEach(([d, v]) => addPoint(d, v.labourCost, 0));
  countedBills.forEach(b => addPoint(b.issue_date, b.total || 0, 0));
  countedInvoices.forEach(i => addPoint(i.issue_date, 0, i.total || 0));

  const dates = Object.keys(seriesMap).sort();
  let cumCost = 0, cumRev = 0;
  const chartData = dates.map(d => {
    cumCost += seriesMap[d].cost;
    cumRev += seriesMap[d].revenue;
    return {
      date: d,
      label: new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      "Cumulative Cost": Math.round(cumCost * 100) / 100,
      "Cumulative Revenue": Math.round(cumRev * 100) / 100,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculating financial summary...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Big headline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{fmtCurrency(revenue, task?.currency || "AED")}</p>
          <p className="text-xs text-emerald-600/70 mt-1">{countedInvoices.length} invoice(s) linked</p>
        </div>
        <div className={`rounded-xl border p-4 ${grossProfit >= 0 ? "border-primary/30 bg-primary/5" : "border-red-200 bg-red-50"}`}>
          <div className={`flex items-center gap-2 mb-1 ${grossProfit >= 0 ? "text-primary" : "text-red-600"}`}>
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Gross Profit</span>
          </div>
          <p className={`text-2xl font-bold ${grossProfit >= 0 ? "text-primary" : "text-red-600"}`}>
            {fmtCurrency(grossProfit, task?.currency || "AED")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {margin !== null ? `Margin ${margin.toFixed(1)}%` : "Revenue − Total Costs"}
          </p>
        </div>
      </div>

      {/* Cost breakdown cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Labour Cost", value: labourTotal, icon: Users, color: "text-primary", bg: "bg-primary/10" },
          { label: "Bills / Expenses", value: billsCost, icon: Receipt, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Total Costs", value: totalCost, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { label: "Net Profit", value: grossProfit, icon: Wallet, color: grossProfit >= 0 ? "text-emerald-600" : "text-red-600", bg: grossProfit >= 0 ? "bg-emerald-50" : "bg-red-50" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-3">
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className={`text-base font-bold ${card.color} tabular-nums`}>{fmtCurrency(card.value, task?.currency || "AED")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {missingProfiles.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span className="font-semibold">Missing payroll profiles:</span>
          <span>{missingProfiles.join(", ")}. Labour cost for these employees is not included.</span>
        </div>
      )}

      {/* Timeline chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Costs vs Revenue over time
          </p>
        </div>
        {chartData.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No dated financial activity yet. The chart will populate as invoices, bills and time entries are recorded.
          </div>
        ) : (
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={48}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => fmtCurrency(v, task?.currency || "AED")}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Cumulative Revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" />
                <Area type="monotone" dataKey="Cumulative Cost" stroke="#ef4444" strokeWidth={2} fill="url(#costGrad)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Linked documents summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Invoices</p>
          {countedInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No invoices linked.</p>
          ) : (
            <ul className="space-y-1">
              {countedInvoices.map(i => (
                <li key={i.id} className="flex items-center justify-between text-sm">
                  <button className="font-mono text-xs text-primary hover:underline" onClick={() => navigate(`/sales/invoices/${i.id}/edit`)}>
                    {i.number || "—"}
                  </button>
                  <span className="font-medium tabular-nums">{fmtCurrency(i.total, i.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Linked Bills</p>
          {countedBills.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No bills linked.</p>
          ) : (
            <ul className="space-y-1">
              {countedBills.map(b => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <button className="font-mono text-xs text-primary hover:underline" onClick={() => navigate(`/purchasing/bills/${b.id}/edit`)}>
                    {b.number || "—"}
                  </button>
                  <span className="font-medium tabular-nums">{fmtCurrency(b.total, b.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}