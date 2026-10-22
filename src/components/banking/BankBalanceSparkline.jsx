import React, { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { base44 } from "@/api/base44Client";
import { parseDateOnly } from "@/lib/dateOnly";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  if (!iso || iso === "start") return "";
  const d = parseDateOnly(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const fmtAxis = (iso) => {
  if (!iso || iso === "start") return "";
  const d = parseDateOnly(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{fmtDate(p.date) || "Opening"}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Balance</span>
        <span className="font-semibold text-primary tabular-nums">{num(p.balance)} {currency}</span>
      </div>
    </div>
  );
}

/**
 * Balance-trend chart rendered inside a bank account card.
 * Fetches the account's transactions, computes a running balance from the
 * opening balance, and draws an area chart with per-day markers and a hover
 * tooltip. Also reports the Operapp (computed) and Bank (statement) balances.
 */
export default function BankBalanceSparkline({ bank, height = 120 }) {
  const [points, setPoints] = useState([]);
  const [bankBalance, setBankBalance] = useState(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const txs = await base44.entities.BankTransaction.filter(
          { bank_account_id: bank.id },
          "date",
          5000
        );
        if (!active) return;
        let bal = bank.opening_balance || 0;
        const series = [{ date: "start", balance: bal }];
        [...txs]
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .forEach((tx) => {
            if (tx.type === "Receive Money") bal += tx.amount || 0;
            else if (tx.type === "Spend Money") bal -= tx.amount || 0;
            series.push({ date: tx.date, balance: bal });
          });
        setPoints(series);
        // Bank (statement) balance = last reconciled running balance, or latest
        const reconciled = [...txs]
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .filter(t => t.status === "Reconciled");
        if (reconciled.length) {
          let rb = bank.opening_balance || 0;
          reconciled.forEach(t => {
            if (t.type === "Receive Money") rb += t.amount || 0;
            else if (t.type === "Spend Money") rb -= t.amount || 0;
          });
          setBankBalance(rb);
        } else {
          setBankBalance(bank.opening_balance || 0);
        }
      } catch {
        if (active) {
          setPoints([]);
          setBankBalance(bank.opening_balance || 0);
        }
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [bank.id, bank.opening_balance]);

  const color = bank.color || "#6366f1";
  const fillId = `spark-fill-${bank.id}`;
  const currency = bank.currency || "AED";

  const operappBalance = points.length ? points[points.length - 1].balance : bank.opening_balance || 0;

  const data = useMemo(() => points, [points]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-4 text-xs">
          <div>
            <p className="text-muted-foreground">Balance in Operapp</p>
            <p className="font-semibold text-foreground tabular-nums">{num(operappBalance)} {currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Balance in Bank</p>
            <p className="font-semibold text-foreground tabular-nums">{num(bankBalance ?? 0)} {currency}</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground/60" style={{ height }}>
          No balance history yet
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end gap-4 text-xs mb-1">
        <div className="text-right">
          <p className="text-muted-foreground">Balance in Operapp</p>
          <p className="font-semibold text-foreground tabular-nums">{num(operappBalance)} {currency}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">Balance in Bank</p>
          <p className="font-semibold text-foreground tabular-nums">{num(bankBalance ?? 0)} {currency}</p>
        </div>
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip content={<ChartTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              dot={{ r: 3, fill: "hsl(var(--card))", stroke: color, strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "hsl(var(--card))", stroke: color, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}