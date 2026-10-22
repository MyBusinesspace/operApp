import { useMemo } from "react";
import { parseDateOnly } from "@/lib/dateOnly";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WatchlistWidget({ chartAccounts, journalEntries }) {
  const rows = useMemo(() => {
    const watchlist = chartAccounts.filter((a) => a.show_on_dashboard);
    if (watchlist.length === 0) return [];
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ytdStart = `${now.getFullYear()}-01-01`;

    const acctMap = new Map(watchlist.map((a) => [a.id, a]));
    const monthBal = new Map();
    const ytdBal = new Map();

    for (const je of journalEntries) {
      if (je.status !== "Posted" || !je.date) continue;
      const d = parseDateOnly(je.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const isYTD = je.date >= ytdStart;
      const isCur = key === curKey;
      if (!isYTD && !isCur) continue;
      for (const line of je.lines || []) {
        if (!acctMap.has(line.account_id)) continue;
        const net = (line.debit || 0) - (line.credit || 0);
        if (isCur) monthBal.set(line.account_id, (monthBal.get(line.account_id) || 0) + net);
        if (isYTD) ytdBal.set(line.account_id, (ytdBal.get(line.account_id) || 0) + net);
      }
    }
    return watchlist.map((a) => ({
      code: a.code,
      name: a.name,
      month: monthBal.get(a.id) || 0,
      ytd: ytdBal.get(a.id) || a.ytd_balance || 0,
    }));
  }, [chartAccounts, journalEntries]);

  return (
    <WidgetCard title="Chart of accounts watchlist">
      <div className="px-5 pb-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No accounts on your watchlist. Enable “Show on dashboard” on any account.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground py-2 w-16">Code</th>
                <th className="text-left font-medium text-muted-foreground py-2">Account</th>
                <th className="text-right font-medium text-muted-foreground py-2">This month</th>
                <th className="text-right font-medium text-muted-foreground py-2">YTD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 text-muted-foreground tabular-nums">{r.code}</td>
                  <td className="py-1.5 text-foreground truncate max-w-[10rem]">{r.name}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{num(r.month)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{num(r.ytd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </WidgetCard>
  );
}