import { format } from "date-fns";
import { fmtMins, fmtAED } from "@/lib/overtimeCalc";

/**
 * Opens a print-ready A4 window for the Extra Time report.
 */
export default function printExtraTimeReport({ employee, profile, rows, totals, refMonth }) {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;

  const empName = employee?.full_name || "Employee";
  const empNo = employee?.employee_no || "—";
  const department = employee?.department || "—";
  const monthLabel = format(refMonth, "MMMM yyyy");

  const bodyRows = rows.map((d, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${format(new Date(d.dayKey + "T12:00:00"), "dd MMM yyyy")}</td>
      <td class="num">${d.entries.length}</td>
      <td class="num">${fmtMins(d.totalMins)}</td>
      <td class="num">${fmtMins(d.regularMins)}</td>
      <td class="num ot">${fmtMins(d.overtimeMins)}</td>
      <td class="capitalize">${d.dayType}</td>
      <td class="num">${d.otRate.toFixed(1)}</td>
      <td class="num ot">${d.overtimeCost.toFixed(1)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Extra Time — ${empName} — ${monthLabel}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; color: #1f2937; font-size: 9.5pt; padding: 16mm 14mm; max-width: 210mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { font-size: 16pt; margin: 0; color: #111827; }
  .header .sub { font-size: 9pt; color: #6b7280; margin-top: 2px; }
  .header .right { text-align: right; font-size: 9pt; color: #6b7280; }
  .header .right b { color: #111827; }
  .meta { display: flex; gap: 24px; margin-bottom: 14px; font-size: 9pt; }
  .meta span { color: #6b7280; }
  .meta b { color: #111827; }
  .summary { display: flex; gap: 10px; margin-bottom: 16px; }
  .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
  .card.accent { border-color: #fed7aa; background: #fff7ed; }
  .card .l { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .card .v { font-size: 13pt; font-weight: 700; margin-top: 2px; }
  .card.accent .v { color: #ea580c; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .03em; color: #6b7280; text-align: left; padding: 6px 5px; border-bottom: 1.5px solid #e5e7eb; }
  thead th.num { text-align: right; }
  tbody td { padding: 5px 5px; border-bottom: 1px solid #f3f4f6; font-size: 8.5pt; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.ot { color: #ea580c; font-weight: 600; }
  td.task { max-width: 180px; }
  tfoot td { background: #fef3c7; font-weight: 700; padding: 7px 5px; border-top: 2px solid #f59e0b; font-size: 9pt; }
  tfoot td.num { color: #c2410c; }
  .capitalize { text-transform: capitalize; }
  .footer { margin-top: 18px; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; }
  .sign { margin-top: 30px; display: flex; justify-content: space-between; }
  .sign div { width: 45%; font-size: 8.5pt; color: #6b7280; }
  .sign .line { border-top: 1px solid #9ca3af; margin-top: 36px; padding-top: 4px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Extra Time Report</h1>
      <div class="sub">${monthLabel} · ${totals.count} day${totals.count === 1 ? "" : "s"}</div>
    </div>
    <div class="right">
      <div><b>${empName}</b></div>
      <div>Employee No: ${empNo}</div>
      <div>Department: ${department}</div>
    </div>
  </div>

  <div class="meta">
    <span>Basic Salary: <b>${profile?.basic_salary ? fmtAED(profile.basic_salary) : "—"}</b></span>
    <span>Pay Type: <b>${profile?.pay_type || "—"}</b></span>
    <span>Generated: <b>${format(new Date(), "dd MMM yyyy")}</b></span>
  </div>

  <div class="summary">
    <div class="card accent"><div class="l">Total OT</div><div class="v">${fmtMins(totals.otMins)}</div></div>
    <div class="card accent"><div class="l">OT Rate</div><div class="v">${fmtAED(totals.avgRate)}/h</div></div>
    <div class="card accent"><div class="l">Total Cost</div><div class="v">${fmtAED(totals.cost)}</div></div>
    <div class="card"><div class="l">Days</div><div class="v">${totals.count}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th class="num">Entries</th>
        <th class="num">Total</th>
        <th class="num">Regular</th>
        <th class="num">OT</th>
        <th>Type</th>
        <th class="num">Rate/h</th>
        <th class="num">Cost</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5">Total</td>
        <td class="num">${fmtMins(totals.otMins)}</td>
        <td colspan="2"></td>
        <td class="num">${fmtAED(totals.cost)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="sign">
    <div><div class="line">Employee Signature</div></div>
    <div><div class="line">Authorized Signature</div></div>
  </div>

  <div class="footer">
    <span>Extra Time Report — ${empName} — ${monthLabel}</span>
    <span>Generated by OPERAPP360</span>
  </div>

  <script>window.onload = () => { setTimeout(() => { window.print(); }, 300); };</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}