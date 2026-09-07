import React, { useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaySlipModal({ entry, period, onClose }) {
  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`
      <html>
        <head>
          <title>Pay Slip — ${entry.employee_name} — ${period.name}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 32px; }
            .slip { max-width: 680px; margin: 0 auto; border: 1px solid #ddd; padding: 32px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 20px; }
            .header h1 { font-size: 22px; font-weight: 700; color: #4f46e5; }
            .header .sub { font-size: 11px; color: #555; margin-top: 4px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
            .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
            .info-box label { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; display: block; margin-bottom: 6px; }
            .info-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
            .info-row span:first-child { color: #374151; }
            .info-row span:last-child { font-weight: 500; color: #111; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #4f46e5; margin-bottom: 8px; letter-spacing: 0.05em; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            table thead tr { background: #f3f4f6; }
            table th { padding: 7px 10px; text-align: left; font-size: 11px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
            table th:last-child { text-align: right; }
            table td { padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
            table td:last-child { text-align: right; font-family: monospace; }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .tax-color { color: #d97706; }
            .totals-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 20px; }
            .total-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; text-align: center; }
            .total-box .label { font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
            .total-box .amount { font-size: 16px; font-weight: 700; font-family: monospace; }
            .net-box { background: #ecfdf5; border-color: #6ee7b7; }
            .net-box .amount { color: #059669; }
            .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
            .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 99px; font-weight: 600; background: #dbeafe; color: #1d4ed8; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const earnings = (entry.line_items || []).filter(li => li.type === "earning" || li.type === "benefit");
  const deductions = (entry.line_items || []).filter(li => li.type === "deduction");
  const taxes = (entry.line_items || []).filter(li => li.type === "tax");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Pay Slip Preview</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="w-4 h-4" /> Print / Save PDF
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Slip preview */}
        <div className="overflow-auto flex-1 bg-muted/30 p-6">
          <div ref={printRef}>
            <div className="slip bg-white border border-border rounded-xl p-8 max-w-2xl mx-auto shadow-sm">
              {/* Header */}
              <div className="header flex items-start justify-between border-b-2 border-primary pb-5 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-primary">Pay Slip</h1>
                  <p className="sub text-xs text-muted-foreground mt-1">{period.name} &nbsp;·&nbsp; Pay Date: {period.pay_date ? format(new Date(period.pay_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <span className="badge text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                  {entry.status?.toUpperCase()}
                </span>
              </div>

              {/* Employee + Period info */}
              <div className="info-grid grid grid-cols-2 gap-4 mb-6">
                <div className="info-box bg-muted/30 border border-border rounded-lg p-4">
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-2">Employee Details</label>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-semibold">{entry.employee_name}</span>
                  </div>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">Employment Type</span>
                    <span className="font-medium">{entry.employment_type?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">Pay Type</span>
                    <span className="font-medium capitalize">{entry.pay_type}</span>
                  </div>
                </div>
                <div className="info-box bg-muted/30 border border-border rounded-lg p-4">
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-2">Pay Period</label>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">Period</span>
                    <span className="font-semibold">{period.name}</span>
                  </div>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium">{period.start_date ? format(new Date(period.start_date), "dd MMM yyyy") : "—"}</span>
                  </div>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">To</span>
                    <span className="font-medium">{period.end_date ? format(new Date(period.end_date), "dd MMM yyyy") : "—"}</span>
                  </div>
                  <div className="info-row flex justify-between text-sm py-1">
                    <span className="text-muted-foreground">Work Days (No Leave)</span>
                    <span className="font-medium">{entry.days_present} / {entry.working_days_in_period}</span>
                  </div>
                </div>
              </div>

              {/* Attendance summary */}
              <div className="mb-5">
                <p className="section-title text-[11px] uppercase font-bold text-primary mb-2 tracking-wide">Attendance</p>
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Regular Hours</th>
                      <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">OT Hours</th>
                      <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Paid Leave</th>
                      <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Unpaid Absent</th>
                      <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Late (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 font-mono">{entry.regular_hours || 0}h</td>
                      <td className="px-3 py-2 font-mono">{entry.overtime_hours || 0}h</td>
                      <td className="px-3 py-2 font-mono">{entry.paid_leave_days || 0}d</td>
                      <td className="px-3 py-2 font-mono">{Math.max(0, (entry.absent_days || 0) - (entry.paid_leave_days || 0))}d</td>
                      <td className="px-3 py-2 font-mono">{entry.late_minutes || 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Earnings */}
              <div className="mb-5">
                <p className="section-title text-[11px] uppercase font-bold text-primary mb-2 tracking-wide">Earnings</p>
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Component</th>
                      <th className="px-3 py-2 text-right text-xs text-muted-foreground font-semibold">Amount (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/50">
                      <td className="px-3 py-2">Basic Salary</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(entry.basic_salary)}</td>
                    </tr>
                    {entry.overtime_pay > 0 && (
                      <tr className="border-t border-border/50">
                        <td className="px-3 py-2">Overtime Pay</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(entry.overtime_pay)}</td>
                      </tr>
                    )}
                    {entry.bonus > 0 && (
                      <tr className="border-t border-border/50">
                        <td className="px-3 py-2">Bonus</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(entry.bonus)}</td>
                      </tr>
                    )}
                    {earnings.map((li, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-2">{li.component_name}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(li.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td className="px-3 py-2 font-bold">Gross Pay</td>
                      <td className="px-3 py-2 text-right font-bold font-mono">{fmt(entry.gross_pay)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Deductions */}
              {(deductions.length > 0 || entry.absence_deduction > 0 || entry.late_deduction > 0 || entry.loan_deduction > 0 || entry.other_deductions > 0) && (
                <div className="mb-5">
                  <p className="section-title text-[11px] uppercase font-bold text-primary mb-2 tracking-wide">Deductions</p>
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Component</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground font-semibold">Amount (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.absence_deduction > 0 && (
                        <tr className="border-t border-border/50">
                          <td className="px-3 py-2">Absence Deduction</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">-{fmt(entry.absence_deduction)}</td>
                        </tr>
                      )}
                      {entry.late_deduction > 0 && (
                        <tr className="border-t border-border/50">
                          <td className="px-3 py-2">Late Deduction</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">-{fmt(entry.late_deduction)}</td>
                        </tr>
                      )}
                      {entry.loan_deduction > 0 && (
                        <tr className="border-t border-border/50">
                          <td className="px-3 py-2">Loan Repayment</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">-{fmt(entry.loan_deduction)}</td>
                        </tr>
                      )}
                      {entry.other_deductions > 0 && (
                        <tr className="border-t border-border/50">
                          <td className="px-3 py-2">Other Deductions</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">-{fmt(entry.other_deductions)}</td>
                        </tr>
                      )}
                      {deductions.map((li, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-2">{li.component_name}</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">-{fmt(li.amount)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td className="px-3 py-2 font-bold">Total Deductions</td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-destructive">-{fmt(entry.total_deductions)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tax */}
              {entry.tax_amount > 0 && (
                <div className="mb-5">
                  <p className="section-title text-[11px] uppercase font-bold text-primary mb-2 tracking-wide">Tax Withholdings</p>
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground font-semibold">Component</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground font-semibold">Amount (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxes.length > 0 ? taxes.map((li, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-2">{li.component_name}{li.notes ? <span className="text-muted-foreground text-xs ml-2">({li.notes})</span> : ""}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-600">-{fmt(li.amount)}</td>
                        </tr>
                      )) : (
                        <tr className="border-t border-border/50">
                          <td className="px-3 py-2">Income Tax</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-600">-{fmt(entry.tax_amount)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Net Pay summary */}
              <div className="totals-grid grid grid-cols-3 gap-3 mt-5">
                <div className="total-box border border-border rounded-lg p-3 text-center">
                  <div className="label text-[10px] uppercase text-muted-foreground font-semibold mb-1">Gross Pay</div>
                  <div className="amount text-base font-bold font-mono">{fmt(entry.gross_pay)}</div>
                </div>
                <div className="total-box border border-border rounded-lg p-3 text-center">
                  <div className="label text-[10px] uppercase text-muted-foreground font-semibold mb-1">Total Deductions</div>
                  <div className="amount text-base font-bold font-mono text-destructive">-{fmt((entry.total_deductions || 0) + (entry.tax_amount || 0))}</div>
                </div>
                <div className="net-box total-box border-2 border-emerald-300 bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="label text-[10px] uppercase text-emerald-700 font-semibold mb-1">Net Pay</div>
                  <div className="amount text-lg font-bold font-mono text-emerald-600">AED {fmt(entry.net_pay)}</div>
                </div>
              </div>

              <div className="footer mt-6 pt-4 border-t border-border text-xs text-muted-foreground text-center">
                This pay slip is computer-generated. &nbsp;·&nbsp; Generated on {format(new Date(), "dd MMM yyyy, HH:mm")}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}