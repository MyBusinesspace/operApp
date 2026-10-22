import { useMemo } from "react";
import { parseDateOnly } from "@/lib/dateOnly";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtVal = (v, fmt) => {
  if (v == null || isNaN(v)) return "—";
  if (fmt === "pct") return `${v.toFixed(1)}%`;
  if (fmt === "x") return `${v.toFixed(2)}x`;
  return num(v);
};

const NUM_YEARS = 5;

export default function KeyMetricsWidget({ journalEntries, bankTransactions, chartAccounts }) {
  const { years, rows } = useMemo(() => {
    const now = new Date();
    const curY = now.getFullYear();
    const years = Array.from({ length: NUM_YEARS }, (_, i) => curY - (NUM_YEARS - 1 - i));

    const revenueIds = new Set(chartAccounts.filter((a) => a.type === "Revenue").map((a) => a.id));
    const expenseIds = new Set(chartAccounts.filter((a) => a.type === "Expense" || a.type === "Expenses").map((a) => a.id));
    const liabilityIds = new Set(chartAccounts.filter((a) => a.type === "Liability").map((a) => a.id));
    const equityIds = new Set(chartAccounts.filter((a) => a.type === "Equity").map((a) => a.id));

    // Per-year accumulators
    const byYear = {};
    years.forEach((y) => {
      byYear[y] = { revenue: 0, expenses: 0, cashflow: 0, debt: 0, equity: 0 };
    });

    for (const je of journalEntries) {
      if (je.status !== "Posted" || !je.date) continue;
      const d = parseDateOnly(je.date);
      const y = d.getFullYear();
      if (!byYear[y]) continue;
      const acc = byYear[y];
      const upToEnd = d <= new Date(y, 11, 31, 23, 59, 59);
      for (const line of je.lines || []) {
        if (revenueIds.has(line.account_id)) acc.revenue += (line.credit || 0) - (line.debit || 0);
        if (expenseIds.has(line.account_id)) acc.expenses += (line.debit || 0) - (line.credit || 0);
        if (liabilityIds.has(line.account_id) && upToEnd) acc.debt += (line.credit || 0) - (line.debit || 0);
        if (equityIds.has(line.account_id) && upToEnd) acc.equity += (line.credit || 0) - (line.debit || 0);
      }
    }

    for (const t of bankTransactions) {
      if (!t.date) continue;
      const d = parseDateOnly(t.date);
      const y = d.getFullYear();
      if (!byYear[y]) continue;
      byYear[y].cashflow += t.type === "Receive Money" ? t.amount : t.type === "Spend Money" ? -t.amount : 0;
    }

    const rows = [
      ...["Revenue", "Cashflow", "Debt", "Total EBITDA"].map((label) => {
        const key = label === "Total EBITDA" ? "ebitda" : label.toLowerCase();
        const vals = years.map((y) => {
          const a = byYear[y];
          if (key === "ebitda") return a.revenue - a.expenses;
          return a[key];
        });
        return { label, vals, fmt: "cur" };
      }),
      {
        label: "PER",
        vals: years.map((y) => {
          const a = byYear[y];
          const ebitda = a.revenue - a.expenses;
          return ebitda !== 0 ? a.equity / ebitda : null;
        }),
        fmt: "x",
      },
      {
        label: "Earnings Yield",
        vals: years.map((y) => {
          const a = byYear[y];
          const ebitda = a.revenue - a.expenses;
          return a.equity !== 0 ? (ebitda / a.equity) * 100 : null;
        }),
        fmt: "pct",
      },
      {
        label: "ROE",
        vals: years.map((y) => {
          const a = byYear[y];
          const ebitda = a.revenue - a.expenses;
          return a.equity !== 0 ? (ebitda / a.equity) * 100 : null;
        }),
        fmt: "pct",
      },
    ];

    return { years, rows };
  }, [journalEntries, bankTransactions, chartAccounts]);

  return (
    <WidgetCard title="Key metrics — 5 year overview">
      <div className="px-5 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted-foreground py-2 text-xs sticky left-0 bg-card">Metric</th>
              {years.map((y) => (
                <th key={y} className="text-right font-medium text-muted-foreground py-2 text-xs px-3">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.label}
                className={`border-b border-border/50 last:border-0 ${idx >= 4 ? "bg-muted/20" : ""}`}
              >
                <td className="py-2.5 font-medium text-foreground sticky left-0 bg-card">{r.label}</td>
                {r.vals.map((v, i) => (
                  <td key={i} className="py-2.5 text-right tabular-nums px-3 font-semibold text-foreground">
                    {fmtVal(v, r.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetCard>
  );
}