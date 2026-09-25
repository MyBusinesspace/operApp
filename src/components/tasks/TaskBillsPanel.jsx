import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Search, X, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCurrency(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

const STATUS_STYLES = {
  Draft: "bg-slate-100 text-slate-600",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  "Awaiting Payment": "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Repeating: "bg-violet-100 text-violet-700",
  Cancelled: "bg-orange-100 text-orange-600",
};

/**
 * TaskBillsPanel
 * Props:
 *   - taskId:    the task id
 *   - task:      the task record (for pre-filling new bills)
 *   - bills:     already-linked bills (filtered by parent)
 *   - onBillsChange: callback after link/unlink so parent can refresh
 */
export default function TaskBillsPanel({ taskId, task, bills = [], onBillsChange }) {
  const navigate = useNavigate();
  const [allBills, setAllBills] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [showLinker, setShowLinker] = useState(false);
  const [linking, setLinking] = useState(false);

  const linkedIds = new Set(bills.map(b => b.id));

  // Load all bills (for linking) only when the linker is opened
  useEffect(() => {
    if (!showLinker) return;
    setLoadingAll(true);
    base44.entities.Bill.list("-created_date", 500)
      .then(list => setAllBills(list || []))
      .catch(() => setAllBills([]))
      .finally(() => setLoadingAll(false));
  }, [showLinker]);

  const availableBills = allBills.filter(b => {
    if (linkedIds.has(b.id)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (b.number || "").toLowerCase().includes(q)
      || (b.contact_name || "").toLowerCase().includes(q)
      || (b.reference || "").toLowerCase().includes(q);
  });

  const linkBill = async (bill) => {
    setLinking(true);
    try {
      const ids = [...(bill.task_ids || []), taskId];
      const names = [...(bill.task_names || []), task?.title || ""].filter(Boolean);
      const refs = [...(bill.task_references || []), task?.reference || ""].filter(Boolean);
      await base44.entities.Bill.update(bill.id, { task_ids: ids, task_names: names, task_references: refs });
      setShowLinker(false);
      setSearch("");
      onBillsChange?.();
    } catch (e) {
      console.error("linkBill error", e);
    }
    setLinking(false);
  };

  const unlinkBill = async (bill) => {
    const idx = (bill.task_ids || []).indexOf(taskId);
    const ids = (bill.task_ids || []).filter(x => x !== taskId);
    const names = (bill.task_names || []).filter((_, i) => i !== idx);
    const refs = (bill.task_references || []).filter((_, i) => i !== idx);
    await base44.entities.Bill.update(bill.id, { task_ids: ids, task_names: names, task_references: refs });
    onBillsChange?.();
  };

  const createNewBill = () => {
    const initial = {
      task_ids: [taskId],
      task_names: task?.title ? [task.title] : [],
      task_references: task?.reference ? [task.reference] : [],
      project_id: task?.project_id || "",
      project_name: task?.project_name || "",
      work_order_id: task?.work_order_id || "",
      work_order_name: task?.work_order_name || "",
      contact_id: task?.contact_id || "",
      contact_name: task?.contact_name || "",
    };
    navigate("/purchasing/bills/new", { state: { initial } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bills (expenses)</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowLinker(s => !s)}>
            <Search className="w-3 h-3" /> Link existing
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={createNewBill}>
            <Plus className="w-3 h-3" /> New Bill
          </Button>
        </div>
      </div>

      {showLinker && (
        <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search bills by number, supplier or reference..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {loadingAll ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading bills...
            </div>
          ) : availableBills.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 px-1">No bills available to link.</p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
              {availableBills.slice(0, 50).map(b => (
                <button key={b.id} type="button"
                  disabled={linking}
                  onClick={() => linkBill(b)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2 disabled:opacity-50">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-primary font-medium">{b.number || "—"}</span>
                    <span className="text-muted-foreground ml-2 truncate">{b.contact_name || "—"}</span>
                  </span>
                  <span className="text-xs font-medium text-foreground shrink-0">{fmtCurrency(b.total, b.currency)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {bills.length === 0 ? (
        <div className="py-10 text-center">
          <Receipt className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No bills linked to this task yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Link supplier bills / material expenses to track task profitability.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left">Number</th>
                <th className="px-4 py-2.5 text-left">Supplier</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">Date</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <button className="font-mono text-xs text-primary font-medium hover:underline"
                      onClick={() => navigate(`/purchasing/bills/${b.id}/edit`)}>
                      {b.number || "—"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-foreground">{b.contact_name || "—"}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{fmtDate(b.issue_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[b.status] || "bg-muted text-muted-foreground"}`}>
                      {b.status || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{fmtCurrency(b.total, b.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <button title="Unlink from this task" onClick={() => unlinkBill(b)}
                      className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}