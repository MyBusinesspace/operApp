import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, FileText, Printer, Pencil, ArrowUpDown } from "lucide-react";
import PaySlipModal from "@/components/payroll/PaySlipModal";
import PayrollEntryEditModal from "@/components/payroll/PayrollEntryEditModal";
import { renderPaySlipHtml, paySlipPrintStyles } from "@/lib/paySlipPrint";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ENTRY_STATUS_STYLES = {
  draft:    "bg-slate-100 text-slate-600",
  reviewed: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  paid:     "bg-emerald-100 text-emerald-700",
};

function EntryRow({ entry, period, onApprove, approving, onEdit, empMap, expanded, onToggle }) {
  const [showSlip, setShowSlip] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      {showSlip && <PaySlipModal entry={entry} period={period} onClose={() => setShowSlip(false)} />}
      {showEdit && (
        <PayrollEntryEditModal entry={entry} period={period}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => onEdit?.(updated)} />
      )}
      <tr className="border-b border-border hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-foreground">{entry.employee_name}</p>
          <p className="text-xs text-muted-foreground">
            {empMap[entry.employee_id]?.employee_no ? `#${empMap[entry.employee_id].employee_no} · ` : ""}{entry.pay_type} · {entry.employment_type?.replace(/_/g, " ")}
          </p>
        </td>
        <td className="px-3 py-3 text-right text-sm font-mono">{fmt(entry.basic_salary)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono text-emerald-600">+{fmt(entry.allowances_total + entry.bonus)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono text-amber-600" title={`${entry.overtime_hours || 0} OT hours`}>+{fmt(entry.overtime_pay)}</td>
        <td className="px-3 py-3 text-right text-sm font-mono text-destructive">-{fmt(entry.total_deductions)}</td>
        <td className="px-3 py-3 text-right text-sm font-bold text-foreground">{fmt(entry.gross_pay)}</td>
        <td className="px-3 py-3 text-right text-sm font-bold text-emerald-700">AED {fmt(entry.net_pay)}</td>
        <td className="px-3 py-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ENTRY_STATUS_STYLES[entry.status] || "bg-muted text-muted-foreground"}`}>
            {entry.status}
          </span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowSlip(true)} title="Pay Slip" className="text-muted-foreground hover:text-primary transition-colors">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={() => setShowEdit(true)} title="Edit entry" className="text-muted-foreground hover:text-primary transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            {entry.status === "draft" && (
              <button onClick={() => onApprove(entry)} disabled={approving === entry.id}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">
                {approving === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-b border-border">
          <td colSpan={9} className="px-6 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
              <div><span className="text-muted-foreground">Regular Hours</span><p className="font-semibold">{entry.regular_hours}h</p></div>
              <div><span className="text-muted-foreground">Overtime Hours</span><p className="font-semibold">{entry.overtime_hours}h</p></div>
              <div><span className="text-muted-foreground">Days Present</span><p className="font-semibold">{entry.days_present} / {entry.working_days_in_period}</p></div>
              <div>
                <span className="text-muted-foreground">Absent Days</span>
                <p className="font-semibold">{entry.absent_days}{entry.paid_leave_days > 0 && <span className="text-emerald-600 ml-1">({entry.paid_leave_days} paid leave)</span>}</p>
              </div>
              <div><span className="text-muted-foreground">Late Minutes</span><p className="font-semibold">{entry.late_minutes || 0} min</p></div>
            </div>
            {(entry.line_items || []).length > 0 && (
              <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-3 py-1.5 text-left text-muted-foreground">Component</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground">Type</th>
                    <th className="px-3 py-1.5 text-right text-muted-foreground">Amount</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.line_items.map((li, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-3 py-1.5 font-medium">{li.component_name}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded-full font-semibold ${
                          li.type === "earning" ? "bg-emerald-100 text-emerald-700" :
                          li.type === "deduction" ? "bg-red-100 text-red-600" :
                          "bg-slate-100 text-slate-600"
                        }`}>{li.type}</span>
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${li.type === "deduction" || li.type === "tax" ? "text-destructive" : "text-foreground"}`}>
                        {li.type === "deduction" || li.type === "tax" ? "-" : ""}{fmt(li.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{li.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function PayrollEntriesInline({ period, onRefresh }) {
  const [entries, setEntries] = useState([]);
  const [empMap, setEmpMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const expandAll = () => setExpandedIds(new Set(entries.map(e => e.id)));
  const collapseAll = () => setExpandedIds(new Set());

  const SORT_FIELDS = {
    employee: e => e.employee_name?.toLowerCase() || "",
    basic_salary: e => e.basic_salary || 0,
    extras: e => (e.allowances_total || 0) + (e.bonus || 0),
    overtime_pay: e => e.overtime_pay || 0,
    total_deductions: e => e.total_deductions || 0,
    gross_pay: e => e.gross_pay || 0,
    net_pay: e => e.net_pay || 0,
    status: e => e.status || "",
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedEntries = (() => {
    if (!sortKey) return entries;
    const getter = SORT_FIELDS[sortKey];
    if (!getter) return entries;
    return [...entries].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  })();

  const SortIcon = ({ field }) => {
    if (sortKey !== field) return <ArrowUpDown className="w-3 h-3 inline ml-1 text-muted-foreground/40" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3.5 h-3.5 inline ml-0.5 text-primary" />
      : <ChevronDown className="w-3.5 h-3.5 inline ml-0.5 text-primary" />;
  };

  const loadEntries = async () => {
    setLoading(true);
    const [data, employees] = await Promise.all([
      base44.entities.PayrollEntry.filter({ pay_period_id: period.id }),
      base44.entities.Employee.list(200),
    ]);
    const map = {};
    (Array.isArray(employees) ? employees : []).forEach(e => { map[e.id] = e; });
    setEmpMap(map);
    // Safety net: the SDK filter can occasionally bleed entries from other
    // periods into the result set, which produces duplicate-looking rows
    // (same employee appearing once per period). Filter client-side to
    // guarantee only the current period's entries are rendered.
    const periodEntries = (Array.isArray(data) ? data : []).filter(e => e.pay_period_id === period.id);
    setEntries(periodEntries);
    setLoading(false);
  };

  useEffect(() => { loadEntries(); }, [period.id]);

  const handleApproveEntry = async (entry) => {
    setApproving(entry.id);
    await base44.entities.PayrollEntry.update(entry.id, { status: "reviewed" });
    await loadEntries();
    setApproving(null);
  };

  const handleEntrySaved = async () => {
    await loadEntries();
    onRefresh?.();
  };

  const totalGross = entries.reduce((s, e) => s + (e.gross_pay || 0), 0);
  const totalNet   = entries.reduce((s, e) => s + (e.net_pay || 0), 0);
  const totalDed   = entries.reduce((s, e) => s + (e.total_deductions || 0), 0);

  const handlePrintAll = () => {
    const slipsHtml = entries.map(entry => renderPaySlipHtml(entry, period)).join("");
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>All Pay Slips — ${period.name}</title>
      <style>${paySlipPrintStyles}</style></head><body>${slipsHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className="px-4 pb-4 pt-2 bg-muted/10 border-t border-border">
      {/* Totals bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Total Gross</p>
            <p className="text-sm font-bold text-foreground">AED {fmt(totalGross)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Total Deductions</p>
            <p className="text-sm font-bold text-destructive">-{fmt(totalDed)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Total Net Pay</p>
            <p className="text-sm font-bold text-emerald-600">AED {fmt(totalNet)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entries.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={expandAll}>
                <ChevronDown className="w-3.5 h-3.5" /> Expand All
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={collapseAll}>
                <ChevronUp className="w-3.5 h-3.5" /> Collapse All
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintAll}>
                <Printer className="w-3.5 h-3.5" /> Print All
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-border bg-card">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading entries…</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No entries found. Run payroll first.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("employee")}>
                  Employee <SortIcon field="employee" />
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("basic_salary")}>
                  Basic <SortIcon field="basic_salary" />
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("extras")}>
                  Extras <SortIcon field="extras" />
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("overtime_pay")}>
                  Overtime <SortIcon field="overtime_pay" />
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("total_deductions")}>
                  Deductions <SortIcon field="total_deductions" />
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("gross_pay")}>
                  Gross <SortIcon field="gross_pay" />
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("net_pay")}>
                  Net Pay <SortIcon field="net_pay" />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("status")}>
                  Status <SortIcon field="status" />
                </th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map(entry => (
                <EntryRow key={entry.id} entry={entry} period={period} onApprove={handleApproveEntry} approving={approving} onEdit={handleEntrySaved} empMap={empMap} expanded={expandedIds.has(entry.id)} onToggle={() => toggleExpand(entry.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}