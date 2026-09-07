import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer, ChevronDown, ChevronRight, Download, Plus, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

const fmt = (n) =>
  (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES = {
  draft:     "bg-slate-100 text-slate-600",
  in_review: "bg-amber-100 text-amber-700",
  approved:  "bg-blue-100 text-blue-700",
  paid:      "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function PayrollReport() {
  const [periods, setPeriods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compact, setCompact] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState({});
  const [expandedBreakdowns, setExpandedBreakdowns] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [periodsData, entriesData] = await Promise.all([
        base44.entities.PayPeriod.list("-start_date", 200),
        base44.entities.PayrollEntry.list("-created_date", 500),
      ]);
      setPeriods(Array.isArray(periodsData) ? periodsData : []);
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setLoading(false);
    };
    load();
  }, []);

  const filteredPeriods = useMemo(() => {
    if (selectedPeriod === "all") return periods.filter(p => p.status !== "draft" && p.status !== "cancelled");
    return periods.filter(p => p.id === selectedPeriod);
  }, [periods, selectedPeriod]);

  // Group entries by period, then by employee
  const reportData = useMemo(() => {
    return filteredPeriods.map(period => {
      const periodEntries = entries.filter(e => e.pay_period_id === period.id);

      const employeeRows = periodEntries.map(entry => {
        // Build line item breakdown
        const earnings = (entry.line_items || []).filter(li => li.type === "earning" || li.type === "benefit");
        const deductions = (entry.line_items || []).filter(li => li.type === "deduction");
        const taxes = (entry.line_items || []).filter(li => li.type === "tax");

        return {
          id: entry.id,
          employee_name: entry.employee_name,
          pay_type: entry.pay_type,
          regular_hours: entry.regular_hours || 0,
          overtime_hours: entry.overtime_hours || 0,
          basic_salary: entry.basic_salary || 0,
          allowances_total: entry.allowances_total || 0,
          overtime_pay: entry.overtime_pay || 0,
          bonus: entry.bonus || 0,
          gross_pay: entry.gross_pay || 0,
          absence_deduction: entry.absence_deduction || 0,
          late_deduction: entry.late_deduction || 0,
          loan_deduction: entry.loan_deduction || 0,
          other_deductions: entry.other_deductions || 0,
          total_deductions: entry.total_deductions || 0,
          tax_amount: entry.tax_amount || 0,
          net_pay: entry.net_pay || 0,
          status: entry.status,
          earnings,
          deductions,
          taxes,
          line_items: entry.line_items || [],
          days_present: entry.days_present || 0,
          working_days_in_period: entry.working_days_in_period || 0,
        };
      });

      const totals = {
        gross: periodEntries.reduce((s, e) => s + (e.gross_pay || 0), 0),
        deductions: periodEntries.reduce((s, e) => s + (e.total_deductions || 0), 0),
        tax: periodEntries.reduce((s, e) => s + (e.tax_amount || 0), 0),
        net: periodEntries.reduce((s, e) => s + (e.net_pay || 0), 0),
      };

      return { period, employeeRows, totals };
    });
  }, [filteredPeriods, entries]);

  const grandTotals = useMemo(() => ({
    gross: reportData.reduce((s, r) => s + r.totals.gross, 0),
    deductions: reportData.reduce((s, r) => s + r.totals.deductions, 0),
    tax: reportData.reduce((s, r) => s + r.totals.tax, 0),
    net: reportData.reduce((s, r) => s + r.totals.net, 0),
  }), [reportData]);

  const togglePeriod = (id) =>
    setExpandedPeriods(prev => ({ ...prev, [id]: !prev[id] }));

  const exportCSV = () => {
    const rows = [];
    // Header
    rows.push([
      "Pay Period", "Status", "Employee", "Pay Type",
      "Days Present", "Working Days", "Regular Hours", "Overtime Hours",
      "Basic Salary", "Allowances", "Overtime Pay", "Bonus", "Gross Pay",
      "Absence Deduction", "Late Deduction", "Loan Deduction", "Other Deductions",
      "Total Deductions", "Tax Amount", "Net Pay", "Entry Status"
    ]);

    for (const { period, employeeRows } of reportData) {
      for (const emp of employeeRows) {
        rows.push([
          period.name,
          period.status,
          emp.employee_name,
          emp.pay_type,
          emp.days_present,
          emp.working_days_in_period,
          emp.regular_hours,
          emp.overtime_hours,
          emp.basic_salary,
          emp.allowances_total,
          emp.overtime_pay,
          emp.bonus,
          emp.gross_pay,
          emp.absence_deduction,
          emp.late_deduction,
          emp.loan_deduction,
          emp.other_deductions,
          emp.total_deductions,
          emp.tax_amount,
          emp.net_pay,
          emp.status,
        ]);
      }
    }

    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");

    const label = selectedPeriod === "all" ? "all-periods" : (filteredPeriods[0]?.name || "payroll");
    const filename = `payroll-summary-${label}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowPy = compact ? "py-1" : "py-2";

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/reports">
          <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Payroll Summary Report</h1>
          <p className="text-xs text-muted-foreground">Total payments, taxes, and deductions by employee per pay period</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={loading || reportData.length === 0} className="gap-1.5">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Pay Period</label>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background"
          >
            <option value="all">All Periods</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Compact</span>
          <button
            onClick={() => setCompact(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compact ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${compact ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <button
          onClick={() => {
            const allIds = filteredPeriods.reduce((acc, p) => ({ ...acc, [p.id]: true }), {});
            const anyExpanded = Object.values(expandedPeriods).some(Boolean);
            setExpandedPeriods(anyExpanded ? {} : allIds);
          }}
          className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors"
        >
          {Object.values(expandedPeriods).some(Boolean) ? "Collapse All" : "Expand All"}
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : reportData.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground text-sm">No payroll data found. Run payroll for at least one pay period first.</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          {/* Report title block */}
          <div className="px-4 py-4 border-b border-border bg-background">
            <p className="text-lg font-bold text-foreground">Payroll Summary</p>
            <p className="text-sm text-muted-foreground">
              {selectedPeriod === "all"
                ? `All pay periods (${filteredPeriods.length} periods)`
                : filteredPeriods[0]?.name}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-28">Basic</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-28">Allowances</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-28">Gross Pay</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-destructive w-28">Deductions</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground w-24">Tax</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-700 w-28">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map(({ period, employeeRows, totals }) => {
                const isExpanded = expandedPeriods[period.id];
                return (
                  <React.Fragment key={period.id}>
                    {/* Period header row — clickable to expand */}
                    <tr
                      className="border-b border-border bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => togglePeriod(period.id)}
                    >
                      <td className="px-4 py-2.5 font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <span>{period.name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[period.status] || "bg-muted text-muted-foreground"}`}>
                            {period.status?.replace("_", " ")}
                          </span>
                          <span className="text-xs text-muted-foreground font-normal">
                            {employeeRows.length} employee{employeeRows.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold font-mono tabular-nums text-foreground">
                        {fmt(employeeRows.reduce((s, e) => s + e.basic_salary, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold font-mono tabular-nums text-foreground">
                        {fmt(employeeRows.reduce((s, e) => s + e.allowances_total + e.overtime_pay + e.bonus, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold font-mono tabular-nums text-foreground">
                        {fmt(totals.gross)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold font-mono tabular-nums text-destructive">
                        -{fmt(totals.deductions)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold font-mono tabular-nums text-muted-foreground">
                        {fmt(totals.tax)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold font-mono tabular-nums text-emerald-600">
                        {fmt(totals.net)}
                      </td>
                    </tr>

                    {/* Employee rows — shown when expanded */}
                    {isExpanded && employeeRows.map(emp => {
                      const showBreakdown = expandedBreakdowns[emp.id];
                      const allEarnings = [
                        { name: "Basic Salary", amount: emp.basic_salary },
                        ...(emp.earnings || []).map(li => ({ name: li.component_name || "Allowance", amount: li.amount || 0, code: li.component_code })),
                      ];
                      const allDeductions = [
                        { name: "Absence", amount: emp.absence_deduction },
                        { name: "Late", amount: emp.late_deduction },
                        { name: "Loan", amount: emp.loan_deduction },
                        { name: "Other", amount: emp.other_deductions },
                        ...(emp.deductions || []).map(li => ({ name: li.component_name || "Deduction", amount: li.amount || 0, code: li.component_code })),
                      ].filter(d => d.amount > 0);
                      const allTaxes = (emp.taxes || []).filter(t => t.amount > 0);
                      return (
                        <React.Fragment key={emp.id}>
                          <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors group">
                            <td className={`px-4 ${rowPy} pl-6`}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedBreakdowns(prev => ({ ...prev, [emp.id]: !prev[emp.id] })); }}
                                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors shrink-0"
                                >
                                  {showBreakdown ? <Minus className="w-3 h-3 text-muted-foreground" /> : <Plus className="w-3 h-3 text-muted-foreground" />}
                                </button>
                                <span className="text-sm text-foreground font-medium">{emp.employee_name}</span>
                                {!compact && (
                                  <span className="text-xs text-muted-foreground">
                                    {emp.pay_type === "hourly"
                                      ? `${emp.regular_hours}h regular${emp.overtime_hours > 0 ? ` + ${emp.overtime_hours}h OT` : ""}`
                                      : `${emp.days_present}/${emp.working_days_in_period} days`}
                                  </span>
                                )}
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_STYLES[emp.status] || "bg-muted text-muted-foreground"}`}>
                                  {emp.status}
                                </span>
                              </div>
                            </td>
                            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums text-foreground`}>
                              {fmt(emp.basic_salary)}
                            </td>
                            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums text-foreground`}>
                              {fmt(emp.allowances_total + emp.overtime_pay + emp.bonus)}
                            </td>
                            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums text-foreground`}>
                              {fmt(emp.gross_pay)}
                            </td>
                            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums text-destructive`}>
                              {emp.total_deductions > 0 ? `-${fmt(emp.total_deductions)}` : "—"}
                            </td>
                            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums text-muted-foreground`}>
                              {emp.tax_amount > 0 ? fmt(emp.tax_amount) : "—"}
                            </td>
                            <td className={`px-4 ${rowPy} text-right text-sm font-bold font-mono tabular-nums text-emerald-600`}>
                              {fmt(emp.net_pay)}
                            </td>
                          </tr>

                          {/* Expandable detail breakdown */}
                          {showBreakdown && (
                            <tr className="border-b border-border/20 bg-muted/5">
                              <td className="px-4 py-3" colSpan={7}>
                                <div className="pl-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Earnings column */}
                                  <div>
                                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Earnings</p>
                                    <div className="space-y-1">
                                      {allEarnings.map((e, i) => (
                                        <div key={i} className="flex justify-between text-xs">
                                          <span className="text-muted-foreground">{e.name}{e.code ? ` (${e.code})` : ""}</span>
                                          <span className="font-mono text-foreground tabular-nums">{fmt(e.amount)}</span>
                                        </div>
                                      ))}
                                      {/* Overtime & Bonus if not in line items */}
                                      {emp.overtime_pay > 0 && (
                                        <div className="flex justify-between text-xs">
                                          <span className="text-muted-foreground">Overtime Pay</span>
                                          <span className="font-mono text-foreground tabular-nums">{fmt(emp.overtime_pay)}</span>
                                        </div>
                                      )}
                                      {emp.bonus > 0 && (
                                        <div className="flex justify-between text-xs">
                                          <span className="text-muted-foreground">Bonus</span>
                                          <span className="font-mono text-foreground tabular-nums">{fmt(emp.bonus)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-border">
                                        <span className="font-semibold text-emerald-700">Gross Pay</span>
                                        <span className="font-mono font-bold text-emerald-700 tabular-nums">{fmt(emp.gross_pay)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Deductions column */}
                                  <div>
                                    <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">Deductions</p>
                                    {allDeductions.length > 0 ? (
                                      <div className="space-y-1">
                                        {allDeductions.map((d, i) => (
                                          <div key={i} className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">{d.name}{d.code ? ` (${d.code})` : ""}</span>
                                            <span className="font-mono text-destructive tabular-nums">-{fmt(d.amount)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-border">
                                          <span className="font-semibold text-destructive">Total Deductions</span>
                                          <span className="font-mono font-bold text-destructive tabular-nums">-{fmt(emp.total_deductions)}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">None</p>
                                    )}
                                  </div>

                                  {/* Tax column */}
                                  <div>
                                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Tax</p>
                                    {allTaxes.length > 0 ? (
                                      <div className="space-y-1">
                                        {allTaxes.map((t, i) => (
                                          <div key={i} className="flex justify-between text-xs">
                                            <div>
                                              <span className="text-muted-foreground">{t.component_name || "Income Tax"}</span>
                                              {t.notes && <p className="text-muted-foreground/60 text-xs leading-tight">{t.notes}</p>}
                                            </div>
                                            <span className="font-mono text-amber-600 tabular-nums">-{fmt(t.amount)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between text-xs pt-1.5 mt-1.5 border-t border-border">
                                          <span className="font-semibold text-amber-700">Total Tax</span>
                                          <span className="font-mono font-bold text-amber-700 tabular-nums">-{fmt(emp.tax_amount)}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No tax applied</p>
                                    )}
                                  </div>
                                </div>

                                {/* Net pay formula line */}
                                <div className="mt-3 pt-3 border-t border-border flex items-center justify-end gap-2 text-xs font-mono">
                                  <span className="text-muted-foreground">{fmt(emp.gross_pay)}</span>
                                  <span className="text-muted-foreground">−</span>
                                  <span className="text-destructive">{fmt(emp.total_deductions)}</span>
                                  <span className="text-muted-foreground">−</span>
                                  <span className="text-amber-600">{fmt(emp.tax_amount)}</span>
                                  <span className="text-muted-foreground">=</span>
                                  <span className="text-base font-bold text-emerald-600">{fmt(emp.net_pay)} AED</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Period subtotal (only when multiple periods shown) */}
                    {selectedPeriod === "all" && isExpanded && (
                      <tr className="border-b border-border bg-muted/20">
                        <td className="px-4 py-2 pl-10 text-xs font-semibold text-muted-foreground">Subtotal — {period.name}</td>
                        <td className="px-4 py-2 text-right text-xs font-semibold font-mono tabular-nums text-foreground">
                          {fmt(employeeRows.reduce((s, e) => s + e.basic_salary, 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-semibold font-mono tabular-nums text-foreground">
                          {fmt(employeeRows.reduce((s, e) => s + e.allowances_total + e.overtime_pay + e.bonus, 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-semibold font-mono tabular-nums text-foreground">
                          {fmt(totals.gross)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-semibold font-mono tabular-nums text-destructive">
                          -{fmt(totals.deductions)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-semibold font-mono tabular-nums text-muted-foreground">
                          {fmt(totals.tax)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-emerald-600">
                          {fmt(totals.net)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Grand total row */}
              {reportData.length > 1 && (
                <>
                  <tr className="h-2 bg-background"><td colSpan={7} /></tr>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="px-4 py-3 text-sm font-bold text-foreground">Grand Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-foreground">
                      {fmt(reportData.reduce((s, r) => s + r.employeeRows.reduce((ss, e) => ss + e.basic_salary, 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-foreground">
                      {fmt(reportData.reduce((s, r) => s + r.employeeRows.reduce((ss, e) => ss + e.allowances_total + e.overtime_pay + e.bonus, 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-foreground">
                      {fmt(grandTotals.gross)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-destructive">
                      -{fmt(grandTotals.deductions)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold font-mono tabular-nums text-muted-foreground">
                      {fmt(grandTotals.tax)}
                    </td>
                    <td className="px-4 py-3 text-right text-base font-bold font-mono tabular-nums text-emerald-600">
                      {fmt(grandTotals.net)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}