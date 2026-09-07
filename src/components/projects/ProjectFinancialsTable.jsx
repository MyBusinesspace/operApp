import React from "react";
import { Link } from "react-router-dom";
import { FileText, Receipt } from "lucide-react";

const STATUS_STYLES = {
  Draft: "bg-slate-100 text-slate-600",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  "Awaiting Payment": "bg-orange-100 text-orange-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Repeating: "bg-indigo-100 text-indigo-700",
  Cancelled: "bg-red-100 text-red-600",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCurrency(amount, currency = "AED") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const TH = ({ children, className = "" }) => (
  <th className={`px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider ${className}`}>{children}</th>
);
const TD = ({ children, muted, className = "" }) => (
  <td className={`px-3 py-2.5 text-sm ${muted ? "text-muted-foreground" : "text-foreground"} ${className}`}>{children}</td>
);

/**
 * Renders invoices or bills linked to a project.
 * kind: "invoice" | "bill"
 */
export default function ProjectFinancialsTable({ rows, kind }) {
  if (!rows || rows.length === 0) {
    const Icon = kind === "invoice" ? FileText : Receipt;
    const label = kind === "invoice" ? "invoices" : "bills";
    return (
      <div className="py-10 text-center">
        <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No {label} found for this project.</p>
      </div>
    );
  }

  const basePath = kind === "invoice" ? "/sales/invoices" : "/purchasing/bills";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <TH>Number</TH>
            <TH>Reference</TH>
            <TH>{kind === "invoice" ? "Customer" : "Supplier"}</TH>
            <TH>Issue Date</TH>
            <TH>Due Date</TH>
            <TH className="text-right">Total</TH>
            <TH>Status</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <TD>
                <Link to={`${basePath}?open=${r.id}`} className="font-medium text-primary hover:underline">
                  {r.number || "—"}
                </Link>
              </TD>
              <TD muted>{r.reference || "—"}</TD>
              <TD muted>{r.contact_name || "—"}</TD>
              <TD muted>{fmtDate(r.issue_date)}</TD>
              <TD muted>{fmtDate(r.due_date)}</TD>
              <TD className="px-3 py-2.5 text-sm text-right font-semibold text-foreground">
                {fmtCurrency(r.total, r.currency)}
              </TD>
              <TD>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status] || "bg-slate-100 text-slate-600"}`}>
                  {r.status || "Draft"}
                </span>
              </TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}