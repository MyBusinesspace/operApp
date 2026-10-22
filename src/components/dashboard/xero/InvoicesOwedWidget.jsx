import { useMemo } from "react";
import { compareDateOnly, parseDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InvoicesOwedWidget({ invoices }) {
  const { total, overdue, chartData, drafts, awaitingApproval } = useMemo(() => {
    const baseOutstanding = (i) => ((i.total || 0) - (i.amount_paid || 0)) / (i.exchange_rate || 1);
    const outstanding = invoices.filter(
      (i) => i.status === "Awaiting Payment" || i.status === "Overdue"
    );
    const total = outstanding.reduce((s, i) => s + baseOutstanding(i), 0);
    const now = new Date();
    const overdue = outstanding
      .filter((i) => i.due_date && compareDateOnly(i.due_date, todayLocalISO()) < 0)
      .reduce((s, i) => s + baseOutstanding(i), 0);

    const buckets = { Older: 0, "This week": 0, "Next week": 0, "In 2 weeks": 0, Later: 0 };
    const sow = new Date(now);
    sow.setHours(12, 0, 0, 0);
    sow.setDate(now.getDate() - now.getDay());
    for (const inv of outstanding) {
      const amt = baseOutstanding(inv);
      if (!inv.due_date) { buckets.Older += amt; continue; }
      const diff = Math.floor((parseDateOnly(inv.due_date) - sow) / 86400000);
      if (diff < 0) buckets.Older += amt;
      else if (diff < 7) buckets["This week"] += amt;
      else if (diff < 14) buckets["Next week"] += amt;
      else if (diff < 21) buckets["In 2 weeks"] += amt;
      else buckets.Later += amt;
    }
    const chartData = Object.entries(buckets).map(([k, v]) => ({ label: k, value: v }));
    const drafts = invoices.filter((i) => i.status === "Draft").length;
    const awaitingApproval = invoices.filter((i) => i.status === "Awaiting Approval").length;
    return { total, overdue, chartData, drafts, awaitingApproval };
  }, [invoices]);

  return (
    <WidgetCard title="Invoices owed to you">
      <div className="px-5 pb-4">
        <div className="flex items-baseline gap-6 py-2">
          <div>
            <p className="text-xs text-muted-foreground">Total owed</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{num(total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-2xl font-semibold text-destructive tabular-nums">{num(overdue)}</p>
          </div>
        </div>
        <div className="h-28 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
          <span>{drafts} drafts</span>
          <span>{awaitingApproval} awaiting approval</span>
        </div>
      </div>
    </WidgetCard>
  );
}