import { useMemo } from "react";
import { compareDateOnly, parseDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BillsToPayWidget({ bills }) {
  const { total, awaitingCount, overdueCount, chartData, drafts } = useMemo(() => {
    const baseOutstanding = (b) => ((b.total || 0) - (b.amount_paid || 0)) / (b.exchange_rate || 1);
    const outstanding = bills.filter((b) => b.status === "Awaiting Payment");
    const total = outstanding.reduce((s, b) => s + baseOutstanding(b), 0);
    const now = new Date();
    const overdue = outstanding.filter((b) => b.due_date && compareDateOnly(b.due_date, todayLocalISO()) < 0);
    const buckets = { Older: 0, "This week": 0, "Next week": 0, Later: 0 };
    const sow = new Date(now);
    sow.setHours(12, 0, 0, 0);
    sow.setDate(now.getDate() - now.getDay());
    for (const b of outstanding) {
      const amt = baseOutstanding(b);
      if (!b.due_date) { buckets.Older += amt; continue; }
      const diff = Math.floor((parseDateOnly(b.due_date) - sow) / 86400000);
      if (diff < 0) buckets.Older += amt;
      else if (diff < 7) buckets["This week"] += amt;
      else if (diff < 14) buckets["Next week"] += amt;
      else buckets.Later += amt;
    }
    const chartData = Object.entries(buckets).map(([k, v]) => ({ label: k, value: v }));
    const drafts = bills.filter((b) => b.status === "Draft").length;
    return { total, awaitingCount: outstanding.length, overdueCount: overdue.length, chartData, drafts };
  }, [bills]);

  return (
    <WidgetCard title="Bills to pay">
      <div className="px-5 pb-4">
        <div className="py-2">
          <p className="text-xs text-muted-foreground">Total to pay</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{num(total)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {awaitingCount} awaiting payment · <span className="text-destructive">{overdueCount} overdue</span>
          </p>
        </div>
        <div className="h-28 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="hsl(var(--chart-4))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
          <span>{drafts} drafts</span>
        </div>
      </div>
    </WidgetCard>
  );
}