import { format } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const paySlipPrintStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 16px; }
  .slip { max-width: 680px; margin: 0 auto 24px; border: 1px solid #ddd; padding: 28px; page-break-after: always; }
  .slip:last-child { page-break-after: auto; }
  .period-heading { max-width: 680px; margin: 0 auto 16px; padding: 10px 16px; background: #f3f4f6; border-radius: 6px; font-size: 14px; font-weight: 700; color: #4f46e5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 14px; margin-bottom: 16px; }
  .header h1 { font-size: 20px; font-weight: 700; color: #4f46e5; }
  .header .sub { font-size: 10px; color: #555; margin-top: 3px; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 99px; font-weight: 600; background: #dbeafe; color: #1d4ed8; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
  .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
  .info-box label { font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: 600; display: block; margin-bottom: 5px; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
  .info-row span:first-child { color: #374151; }
  .info-row span:last-child { font-weight: 500; color: #111; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4f46e5; margin-bottom: 6px; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table thead tr { background: #f3f4f6; }
  table th { padding: 5px 8px; text-align: left; font-size: 10px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  table th:last-child { text-align: right; }
  table td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
  table td:last-child { text-align: right; font-family: monospace; }
  .positive { color: #059669; }
  .negative { color: #dc2626; }
  .tax-color { color: #d97706; }
  .totals-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 16px; }
  .total-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
  .total-box .label { font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 3px; }
  .total-box .amount { font-size: 14px; font-weight: 700; font-family: monospace; }
  .net-box { background: #ecfdf5; border-color: #6ee7b7; }
  .net-box .amount { color: #059669; }
  .footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; text-align: center; }
  @media print {
    body { padding: 0; }
    .slip { border: none; margin: 0; padding: 20px 32px; }
  }
`;

export function renderPaySlipHtml(entry, period) {
  const earnings = (entry.line_items || []).filter(li => li.type === "earning" || li.type === "benefit");
  const deductions = (entry.line_items || []).filter(li => li.type === "deduction");
  const taxes = (entry.line_items || []).filter(li => li.type === "tax");

  const earnRows = [
    `<tr><td>Basic Salary</td><td class="positive">${fmt(entry.basic_salary)}</td></tr>`,
    entry.overtime_pay > 0 ? `<tr><td>Overtime Pay</td><td class="positive">${fmt(entry.overtime_pay)}</td></tr>` : "",
    entry.bonus > 0 ? `<tr><td>Bonus</td><td class="positive">${fmt(entry.bonus)}</td></tr>` : "",
    ...earnings.map(li => `<tr><td>${li.component_name}</td><td class="positive">${fmt(li.amount)}</td></tr>`),
  ].filter(Boolean).join("");

  const dedRows = [
    entry.absence_deduction > 0 ? `<tr><td>Absence Deduction</td><td class="negative">-${fmt(entry.absence_deduction)}</td></tr>` : "",
    entry.late_deduction > 0 ? `<tr><td>Late Deduction</td><td class="negative">-${fmt(entry.late_deduction)}</td></tr>` : "",
    entry.loan_deduction > 0 ? `<tr><td>Loan Repayment</td><td class="negative">-${fmt(entry.loan_deduction)}</td></tr>` : "",
    entry.other_deductions > 0 ? `<tr><td>Other Deductions</td><td class="negative">-${fmt(entry.other_deductions)}</td></tr>` : "",
    ...deductions.map(li => `<tr><td>${li.component_name}</td><td class="negative">-${fmt(li.amount)}</td></tr>`),
  ].filter(Boolean).join("");
  const hasDeductions = dedRows.length > 0;

  const taxRows = taxes.length > 0
    ? taxes.map(li => `<tr><td>${li.component_name}${li.notes ? ` <span style="color:#6b7280;font-size:10px">(${li.notes})</span>` : ""}</td><td class="tax-color">-${fmt(li.amount)}</td></tr>`).join("")
    : entry.tax_amount > 0 ? `<tr><td>Income Tax</td><td class="tax-color">-${fmt(entry.tax_amount)}</td></tr>` : "";

  return `
    <div class="slip">
      <div class="header">
        <div>
          <h1>Pay Slip</h1>
          <div class="sub">${period.name} · Pay Date: ${period.pay_date ? format(new Date(period.pay_date), "dd MMM yyyy") : "—"}</div>
        </div>
        <span class="badge">${(entry.status || "draft").toUpperCase()}</span>
      </div>
      <div class="info-grid">
        <div class="info-box">
          <label>Employee Details</label>
          <div class="info-row"><span>Name</span><span>${entry.employee_name}</span></div>
          <div class="info-row"><span>Employment</span><span>${(entry.employment_type || "").replace(/_/g, " ")}</span></div>
          <div class="info-row"><span>Pay Type</span><span style="text-transform:capitalize">${entry.pay_type}</span></div>
        </div>
        <div class="info-box">
          <label>Pay Period</label>
          <div class="info-row"><span>Period</span><span>${period.name}</span></div>
          <div class="info-row"><span>From</span><span>${period.start_date ? format(new Date(period.start_date), "dd MMM yyyy") : "—"}</span></div>
          <div class="info-row"><span>To</span><span>${period.end_date ? format(new Date(period.end_date), "dd MMM yyyy") : "—"}</span></div>
          <div class="info-row"><span>Days Present</span><span>${entry.days_present} / ${entry.working_days_in_period}</span></div>
        </div>
      </div>
      <div class="section-title">Attendance</div>
      <table>
        <thead><tr><th>Regular Hours</th><th>Overtime Hours</th><th>Absent Days</th><th>Late (min)</th></tr></thead>
        <tbody><tr><td>${entry.regular_hours || 0}h</td><td>${entry.overtime_hours || 0}h</td><td>${entry.absent_days || 0}</td><td>${entry.late_minutes || 0}</td></tr></tbody>
      </table>
      <div class="section-title">Earnings</div>
      <table>
        <thead><tr><th>Component</th><th>Amount (AED)</th></tr></thead>
        <tbody>
          ${earnRows}
          <tr style="border-top:2px solid #d1d5db;background:#f9fafb"><td style="font-weight:700">Gross Pay</td><td style="font-weight:700">${fmt(entry.gross_pay)}</td></tr>
        </tbody>
      </table>
      ${hasDeductions ? `<div class="section-title">Deductions</div>
      <table>
        <thead><tr><th>Component</th><th>Amount (AED)</th></tr></thead>
        <tbody>
          ${dedRows}
          <tr style="border-top:2px solid #d1d5db;background:#f9fafb"><td style="font-weight:700;color:#dc2626">Total Deductions</td><td style="font-weight:700;color:#dc2626">-${fmt(entry.total_deductions)}</td></tr>
        </tbody>
      </table>` : ""}
      ${taxRows ? `<div class="section-title">Tax Withholdings</div>
      <table>
        <thead><tr><th>Component</th><th>Amount (AED)</th></tr></thead>
        <tbody>${taxRows}</tbody>
      </table>` : ""}
      <div class="totals-grid">
        <div class="total-box"><div class="label">Gross Pay</div><div class="amount">${fmt(entry.gross_pay)}</div></div>
        <div class="total-box"><div class="label">Total Deductions</div><div class="amount" style="color:#dc2626">-${fmt((entry.total_deductions || 0) + (entry.tax_amount || 0))}</div></div>
        <div class="net-box"><div class="label" style="color:#059669">Net Pay</div><div class="amount">AED ${fmt(entry.net_pay)}</div></div>
      </div>
      <div class="footer">Computer-generated · ${format(new Date(), "dd MMM yyyy, HH:mm")}</div>
    </div>`;
}