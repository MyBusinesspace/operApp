import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaySlipModal from "@/components/payroll/PaySlipModal";
import { format } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_STYLES = {
  draft:    "bg-slate-100 text-slate-600",
  reviewed: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  paid:     "bg-emerald-100 text-emerald-700",
};

export default function EmployeePaySlipsTab({ employeeId }) {
  const [entries, setEntries] = useState([]);
  const [periods, setPeriods] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [entriesData, periodsData] = await Promise.all([
        base44.entities.PayrollEntry.filter({ employee_id: employeeId }, "-created_date"),
        base44.entities.PayPeriod.list("-start_date", 100),
      ]);
      const periodMap = {};
      (Array.isArray(periodsData) ? periodsData : []).forEach(p => { periodMap[p.id] = p; });
      setPeriods(periodMap);
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setLoading(false);
    };
    load();
  }, [employeeId]);

  const handleView = (entry) => {
    setSelectedEntry(entry);
    setSelectedPeriod(periods[entry.pay_period_id] || { name: entry.pay_period_name });
  };

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading pay slips…</div>;

  if (entries.length === 0) return (
    <div className="py-16 text-center">
      <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">No pay slips found for this employee.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {entries.map(entry => {
        const period = periods[entry.pay_period_id];
        return (
          <div key={entry.id} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{entry.pay_period_name || "Pay Period"}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                {period && <span>{format(new Date(period.start_date), "dd MMM")} – {format(new Date(period.end_date), "dd MMM yyyy")}</span>}
                <span>Gross: AED {fmt(entry.gross_pay)}</span>
                <span>Net: AED {fmt(entry.net_pay)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[entry.status] || "bg-muted text-muted-foreground"}`}>
                {entry.status}
              </span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleView(entry)}>
                <FileText className="w-3.5 h-3.5" /> View Slip
              </Button>
            </div>
          </div>
        );
      })}

      {selectedEntry && selectedPeriod && (
        <PaySlipModal
          entry={selectedEntry}
          period={selectedPeriod}
          onClose={() => { setSelectedEntry(null); setSelectedPeriod(null); }}
        />
      )}
    </div>
  );
}