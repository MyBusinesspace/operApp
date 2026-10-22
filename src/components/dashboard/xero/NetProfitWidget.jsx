import { useMemo } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function NetProfitWidget({ journalEntries, chartAccounts }) {
  const { net, monthLabel, changePct, chartData } = useMemo(() => {
    const now = new Date();
    const monthLabel = now.toLocaleString("en", { month: "long", year: "numeric" });
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;

    const revenueIds = new Set(chartAccounts.filter((a) => a.type === "Revenue").map((a) => a.id));
    const expenseIds = new Set(
      chartAccounts.filter((a) => a.type === "Expense" || a.type === "Expenses").map((a) => a.id)
    );

    let income = 0, expenses = 0, prevNet = 0;
    for (const je of journalEntries) {
      if (je.status !== "Posted" || !je.date) continue;
      const d = new Date(je.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const isCur = key === curKey;
      const isPrev = key === prevKey;
      if (!isCur && !isPrev) continue;
      for (const line of je.lines || []) {
        if (revenueIds.has(line.account_id)) {
          const v = (line.credit || 0) - (line.debit || 0);
          if (isCur) income += v;
          if (isPrev) prevNet += v;
        }
        if (expenseIds.has(line.account_id)) {
          const v = (line.debit || 0) - (line.credit || 0);
          if (isCur) expenses += v;
          if (isPrev) prevNet -= v;
        }
      }
    }
    const net = income - expenses;
    const changePct = prevNet !== 0 ? Math.round((net - prevNet) / Math.abs(prevNet) * 100) : null;
    const chartData = [
      { label: "Income", value: income, fill: "hsl(var(--primary))" },
      { label: "Expenses", value: expenses, fill: "hsl(var(--chart-4))" },
    ];
    return { net, monthLabel, changePct, chartData };
  }, [journalEntries, chartAccounts]);

  return (
    <WidgetCard title="Net profit or loss">
      <div className="px-5 pb-4">
        <div className="py-2">
          <p className="text-xs text-muted-foreground">{monthLabel}</p>
          <p className={`text-2xl font-bold tabular-nums ${net >= 0 ? "text-foreground" : "text-destructive"}`}>
            {num(net)}
          </p>
          {changePct !== null && (
            <p className={`text-xs font-medium ${changePct >= 0 ? "text-success" : "text-destructive"}`}>
              {changePct >= 0 ? "▲ Up" : "▼ Down"} {Math.abs(changePct)}% from last month
            </p>
          )}
        </div>
        <div className="h-32 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </WidgetCard>
  );
}