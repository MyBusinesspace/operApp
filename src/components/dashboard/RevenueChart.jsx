import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfMonth, addMonths } from "date-fns";

function fmtCompact(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="dropdown-glass rounded-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground capitalize">{entry.dataKey}:</span>
          <span className="font-medium">AED {Number(entry.value).toLocaleString("en-AE", { minimumFractionDigits: 0 })}</span>
        </div>
      ))}
    </div>
  );
};

export default function RevenueChart({ invoices, bills }) {
  const chartData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = addMonths(startOfMonth(now), -i);
      months.push({ label: format(m, "MMM"), month: m.getMonth(), year: m.getFullYear(), invoices: 0, bills: 0 });
    }
    for (const inv of invoices) {
      if (!inv.issue_date || inv.status === "Cancelled") continue;
      const d = new Date(inv.issue_date);
      const match = months.find(m => m.month === d.getMonth() && m.year === d.getFullYear());
      if (match) match.invoices += inv.total || 0;
    }
    for (const bl of bills) {
      if (!bl.issue_date || bl.status === "Cancelled") continue;
      const d = new Date(bl.issue_date);
      const match = months.find(m => m.month === d.getMonth() && m.year === d.getFullYear());
      if (match) match.bills += bl.total || 0;
    }
    return months;
  }, [invoices, bills]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-card rounded-2xl border border-border p-6 card-hover"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-foreground">Revenue vs Expenses</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Last 6 months (invoiced vs billed)</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-muted-foreground">Invoiced</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-chart-2" />
            <span className="text-muted-foreground">Billed</span>
          </div>
        </div>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(239 84% 67%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(239 84% 67%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(168 76% 42%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(168 76% 42%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(220 9% 46%)", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(220 9% 46%)", fontSize: 12 }} tickFormatter={fmtCompact} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="invoices" stroke="hsl(239 84% 67%)" strokeWidth={2.5} fill="url(#gradRevenue)" name="Invoiced" />
            <Area type="monotone" dataKey="bills" stroke="hsl(168 76% 42%)" strokeWidth={2} fill="url(#gradExpenses)" name="Billed" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}