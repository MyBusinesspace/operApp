import { useMemo } from "react";
import { parseDateOnly } from "@/lib/dateOnly";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashInOutWidget({ transactions }) {
  const { chartData, cashIn, cashOut, difference } = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en", { month: "short" }),
        in: 0,
        out: 0,
      });
    }
    const map = new Map(months.map((m) => [m.key, m]));
    for (const t of transactions) {
      if (!t.date) continue;
      const d = parseDateOnly(t.date);
      const m = map.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      if (!m) continue;
      if (t.type === "Receive Money") m.in += t.amount;
      else if (t.type === "Spend Money") m.out += t.amount;
    }
    const cashIn = months.reduce((s, m) => s + m.in, 0);
    const cashOut = months.reduce((s, m) => s + m.out, 0);
    return { chartData: months, cashIn, cashOut, difference: cashIn - cashOut };
  }, [transactions]);

  return (
    <WidgetCard title="Cash in and out">
      <div className="px-5 pb-4">
        <div className="flex items-baseline gap-5 py-2">
          <div>
            <p className="text-xs text-muted-foreground">Cash in</p>
            <p className="text-lg font-semibold text-success tabular-nums">{num(cashIn)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cash out</p>
            <p className="text-lg font-semibold text-destructive tabular-nums">−{num(cashOut)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Difference</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">{num(difference)}</p>
          </div>
        </div>
        <div className="h-32 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => num(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="in" name="Cash in" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="out" name="Cash out" fill="hsl(var(--primary) / 0.35)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </WidgetCard>
  );
}