import { Link } from "react-router-dom";
import { compareDateOnly } from "@/lib/dateOnly";
import WidgetCard from "./WidgetCard";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BankAccountWidget({ account, transactions }) {
  const acctTx = transactions.filter((t) => t.bank_account_id === account.id);
  let balance = account.opening_balance || 0;
  let unreconciled = 0;
  for (const t of acctTx) {
    if (t.type === "Receive Money") balance += t.amount;
    else if (t.type === "Spend Money") balance -= t.amount;
    if (t.status === "Unreconciled") {
      unreconciled += t.type === "Receive Money" ? t.amount : -t.amount;
    }
  }
  const lastDate = acctTx.length > 0
    ? [...acctTx].sort((a, b) => compareDateOnly(b.date, a.date))[0].date
    : account.opening_balance_date;

  return (
    <WidgetCard
      title={account.name}
      subtitle={account.account_number ? `···${account.account_number}` : account.account_type}
    >
      <div className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-4 py-3 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Statement balance{lastDate ? ` (${lastDate})` : ""}</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {num(balance)} <span className="text-xs font-normal text-muted-foreground">{account.currency}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balance in OPERAPP</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {num(balance)} <span className="text-xs font-normal text-muted-foreground">{account.currency}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between py-2.5 border-t border-border">
          <span className="text-xs text-muted-foreground">Balance difference</span>
          <span className={`text-sm font-medium tabular-nums ${unreconciled === 0 ? "text-muted-foreground" : "text-amber-600"}`}>
            {num(unreconciled)} {account.currency}
          </span>
        </div>
        <div className="pt-2">
          <Link to="/accounting" className="text-xs text-primary hover:underline">View transactions →</Link>
        </div>
      </div>
    </WidgetCard>
  );
}