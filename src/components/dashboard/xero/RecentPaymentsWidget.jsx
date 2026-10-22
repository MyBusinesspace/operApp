import { useMemo } from "react";
import { Link } from "react-router-dom";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RecentPaymentsWidget({ invoices }) {
  const payments = useMemo(() => {
    const all = [];
    for (const inv of invoices) {
      if (!inv.payments) continue;
      const rate = inv.exchange_rate || 1;
      for (const p of inv.payments) {
        all.push({
          invoiceNumber: inv.number,
          contact: inv.contact_name,
          date: p.date,
          amount: (p.amount || 0) / rate,
          invoiceId: inv.id,
        });
      }
    }
    return all.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  }, [invoices]);

  return (
    <WidgetCard title="Recent invoice payments">
      <div className="px-5 pb-4">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No recent payments recorded.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground py-2">Invoice #</th>
                <th className="text-left font-medium text-muted-foreground py-2">Contact</th>
                <th className="text-left font-medium text-muted-foreground py-2">Date received</th>
                <th className="text-right font-medium text-muted-foreground py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5">
                    <Link to={`/sales/invoices/${p.invoiceId}/edit`} className="text-primary hover:underline">
                      {p.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-1.5 text-foreground truncate max-w-[8rem]">{p.contact || "—"}</td>
                  <td className="py-1.5 text-muted-foreground whitespace-nowrap">{p.date || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium text-foreground">{num(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </WidgetCard>
  );
}