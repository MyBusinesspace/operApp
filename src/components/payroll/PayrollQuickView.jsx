import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const num = (v) => (parseFloat(v) || 0);

// Collapsible payroll breakdown — shows every earning and deduction line with subtotals.
export default function PayrollQuickView({ form }) {
  const [expanded, setExpanded] = useState(false);

  const earnings = [
    { label: "Basic Salary", amount: num(form.basic_salary) },
    { label: "Overtime Pay", amount: num(form.overtime_pay) },
    { label: "Bonus", amount: num(form.bonus) },
    ...(form.line_items || []).filter(li => li.type === "earning").map(li => ({
      label: li.component_name || "Earning",
      amount: num(li.amount),
      note: li.notes,
    })),
  ].filter(e => e.amount !== 0);

  const deductions = [
    { label: "Absence Deduction", amount: num(form.absence_deduction) },
    { label: "Late Deduction", amount: num(form.late_deduction) },
    { label: "Loan / Advance", amount: num(form.loan_deduction) },
    { label: "Other Deductions", amount: num(form.other_deductions) },
    { label: "Tax", amount: num(form.tax_amount) },
    ...(form.line_items || []).filter(li => li.type === "deduction" || li.type === "tax").map(li => ({
      label: li.component_name || li.type,
      amount: num(li.amount),
      note: li.notes,
    })),
  ].filter(d => d.amount !== 0);

  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeds = deductions.reduce((s, d) => s + d.amount, 0);
  const net = totalEarnings - totalDeds;

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Payroll Quick View
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Gross <span className="font-semibold text-foreground">{fmt(totalEarnings)}</span></span>
          <span className="text-muted-foreground">Ded <span className="font-semibold text-destructive">-{fmt(totalDeds)}</span></span>
          <span className="bg-emerald-50 px-2 py-0.5 rounded">
            <span className="text-emerald-600">Net </span>
            <span className="font-bold text-emerald-700">{fmt(net)}</span>
          </span>
        </div>
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-px bg-border border-t border-border">
          <div className="bg-card p-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase text-emerald-600 mb-1.5">Earnings</p>
            {earnings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No earnings</p>
            ) : earnings.map((e, i) => (
              <div key={i} className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground truncate" title={e.note}>{e.label}</span>
                <span className="font-medium text-foreground shrink-0">{fmt(e.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs pt-1.5 mt-1 border-t border-border/50">
              <span className="font-semibold">Total Earnings</span>
              <span className="font-bold text-emerald-700">{fmt(totalEarnings)}</span>
            </div>
          </div>
          <div className="bg-card p-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase text-red-600 mb-1.5">Deductions</p>
            {deductions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No deductions</p>
            ) : deductions.map((d, i) => (
              <div key={i} className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground truncate" title={d.note}>{d.label}</span>
                <span className="font-medium text-destructive shrink-0">-{fmt(d.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs pt-1.5 mt-1 border-t border-border/50">
              <span className="font-semibold">Total Deductions</span>
              <span className="font-bold text-destructive">-{fmt(totalDeds)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}