import React, { useState, useEffect, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ChevronRight, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function fmtAmount(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function StatementDetail() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);

  const [invoices, setInvoices] = useState([]);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statementType, setStatementType] = useState(urlParams.get("type") || "Outstanding");
  const [asAtDate, setAsAtDate] = useState(urlParams.get("asAt") || new Date().toISOString().split("T")[0]);

  const load = async () => {
    setLoading(true);
    const [inv, cont] = await Promise.all([
      base44.entities.Invoice.filter({ contact_id: contactId }, "-issue_date"),
      base44.entities.Contact.filter({ id: contactId }).catch(() => []),
    ]);
    setInvoices(inv);
    setContact(cont[0] || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [contactId]);

  const lines = useMemo(() => {
    const asAt = new Date(asAtDate);
    asAt.setHours(23, 59, 59);

    return invoices.filter(inv => {
      if (inv.status === "Draft" || inv.status === "Cancelled") return false;
      const issueDate = inv.issue_date ? new Date(inv.issue_date) : null;
      if (issueDate && issueDate > asAt) return false;
      if (statementType === "Outstanding") {
        const balance = (inv.total || 0) - (inv.amount_paid || 0);
        return balance > 0.005;
      }
      return true;
    }).sort((a, b) => new Date(a.issue_date || 0) - new Date(b.issue_date || 0));
  }, [invoices, asAtDate, statementType]);

  const totalBalance = lines.reduce((s, inv) => s + Math.max(0, (inv.total || 0) - (inv.amount_paid || 0)), 0);
  const currency = lines[0]?.currency || "AED";

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading statement...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-4 pb-4 print:hidden">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/sales/statements" className="hover:text-primary transition-colors">Statements</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-4">Statement for {contact?.full_name || "Unknown Contact"}</h1>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">Statement Type</span>
            <Select value={statementType} onValueChange={setStatementType}>
              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Outstanding">Outstanding</SelectItem>
                <SelectItem value="Activity">Activity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">as at</span>
            <input
              type="date"
              value={asAtDate}
              onChange={e => setAsAtDate(e.target.value)}
              className="h-8 text-sm rounded-md border border-input bg-transparent px-3 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Update
          </Button>
        </div>
      </div>

      {/* Statement content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Print action bar */}
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> Print PDF
          </Button>
        </div>

        {/* Statement document */}
        <div className="border border-border rounded-xl bg-white max-w-4xl mx-auto p-8 print:border-0 print:p-0 print:max-w-none">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="font-bold text-lg text-foreground">{contact?.full_name}</p>
              {contact?.address && <p className="text-sm text-muted-foreground mt-1">{contact.address}</p>}
              {contact?.city && <p className="text-sm text-muted-foreground">{contact.city}{contact?.country ? `, ${contact.country}` : ""}</p>}
              {contact?.tax_id && <p className="text-sm text-muted-foreground">TRN: {contact.tax_id}</p>}
              {contact?.email && <p className="text-sm text-muted-foreground">{contact.email}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">As At Date</p>
              <p className="text-sm font-semibold text-foreground">{fmtDate(asAtDate)}</p>
            </div>
          </div>

          {/* Table */}
          {lines.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No outstanding invoices for this contact.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-foreground/20">
                    <th className="text-left py-2 font-semibold text-foreground">Date</th>
                    <th className="text-left py-2 font-semibold text-foreground">Activity</th>
                    <th className="text-left py-2 font-semibold text-foreground">Reference</th>
                    <th className="text-left py-2 font-semibold text-foreground">Due Date</th>
                    <th className="text-right py-2 font-semibold text-foreground">Invoice Amount</th>
                    <th className="text-right py-2 font-semibold text-foreground">Payments</th>
                    <th className="text-right py-2 font-semibold text-foreground">Balance {currency}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(inv => {
                    const balance = Math.max(0, (inv.total || 0) - (inv.amount_paid || 0));
                    return (
                      <tr key={inv.id} className="border-b border-border/50">
                        <td className="py-2 text-muted-foreground">{fmtDate(inv.issue_date)}</td>
                        <td className="py-2">
                          <Link
                            to={`/sales/invoices?open=true&id=${inv.id}`}
                            className="text-primary hover:underline font-medium print:text-foreground print:no-underline"
                          >
                            Invoice #{inv.number}
                          </Link>
                        </td>
                        <td className="py-2 text-muted-foreground">{inv.reference || "—"}</td>
                        <td className="py-2 text-muted-foreground">{fmtDate(inv.due_date)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtAmount(inv.total)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtAmount(inv.amount_paid || 0)}</td>
                        <td className="py-2 text-right tabular-nums font-medium">{fmtAmount(balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Total row */}
              <div className="flex justify-end mt-6">
                <div className="border-t-2 border-foreground pt-2 min-w-[240px]">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-foreground">BALANCE DUE {currency}</span>
                    <span className="font-bold text-sm text-foreground tabular-nums ml-8">{fmtAmount(totalBalance)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}