import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Play, Calendar, Users, DollarSign, CheckCircle, Clock, AlertCircle, Loader2, Pencil, Copy, Printer, Square, CheckSquare, Trash2, ChevronDown, ChevronUp, ArrowLeft, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import PayPeriodFormModal from "@/components/payroll/PayPeriodFormModal";
import PayrollEntriesInline from "@/components/payroll/PayrollEntriesInline";
import BulkSalaryEditModal from "@/components/payroll/BulkSalaryEditModal";
import MarkPaidModal from "@/components/payroll/MarkPaidModal";

import { renderPaySlipHtml, paySlipPrintStyles } from "@/lib/paySlipPrint";
import { format } from "date-fns";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";
import RequirePermission from "@/components/shared/RequirePermission";
import { usePermission } from "@/hooks/usePermissions";

const STATUS_STYLES = {
  draft:     "bg-slate-100 text-slate-600",
  in_review: "bg-amber-100 text-amber-700",
  approved:  "bg-blue-100 text-blue-700",
  paid:      "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

const STATUS_ICONS = {
  draft:     Clock,
  in_review: AlertCircle,
  approved:  CheckCircle,
  paid:      CheckCircle,
  cancelled: AlertCircle,
};

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return "—";
  return format(new Date(d), "dd MMM yyyy");
}

export default function Payroll() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedPeriodId, setExpandedPeriodId] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [duplicateDefaults, setDuplicateDefaults] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(null);
  const [deletingPeriod, setDeletingPeriod] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [printingBulk, setPrintingBulk] = useState(false);
  const payrollEdit = usePermission("payroll", "can_edit");
  const payrollApprove = usePermission("payroll", "can_approve");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.PayPeriod.list("-start_date", 200);
    setPeriods(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (form) => {
    setCreating(true);
    await base44.entities.PayPeriod.create(form);
    setCreating(false);
    setShowForm(false);
    setDuplicateDefaults(null);
    load();
  };

  const handleDuplicate = (period) => {
    setDuplicateDefaults({
      name: `${period.name} (Copy)`,
      start_date: period.start_date,
      end_date: period.end_date,
      pay_date: period.pay_date,
      notes: period.notes || "",
    });
    setShowForm(true);
  };

  const handleRun = async (period) => {
    setRunningId(period.id);
    try {
      const res = await base44.functions.invoke("calculatePayPeriod", { pay_period_id: period.id });
      if (res.data?.success) {
        load();
      } else {
        alert(res.data?.error || "Failed to calculate payroll.");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setRunningId(null);
  };

  const handleApprove = async (period) => {
    await base44.entities.PayPeriod.update(period.id, { status: "approved" });
    load();
  };

  const handleMarkPaid = (period) => {
    setMarkingPaid(period);
  };

  const confirmDelete = async () => {
    if (!deletingPeriod) return;
    setDeleting(true);
    try {
      // Delete all payroll entries for this period first
      await base44.entities.PayrollEntry.deleteMany({ pay_period_id: deletingPeriod.id });
      // Then delete the period itself
      await base44.entities.PayPeriod.delete(deletingPeriod.id);
      setDeletingPeriod(null);
      load();
    } catch (e) {
      alert("Error deleting pay period: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = periods.filter(p => p.status === "in_review" || p.status === "approved" || p.status === "paid");
    if (selectedIds.size === selectable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map(p => p.id)));
    }
  };

  const handleBulkPrint = async () => {
    setPrintingBulk(true);
    const selected = periods.filter(p => selectedIds.has(p.id));
    let allHtml = "";

    for (const period of selected) {
      const entries = await base44.entities.PayrollEntry.filter({ pay_period_id: period.id });
      const entriesArr = Array.isArray(entries) ? entries : [];
      if (entriesArr.length > 0) {
        allHtml += `<div class="period-heading">${period.name} — ${entriesArr.length} payslip${entriesArr.length > 1 ? "s" : ""}</div>`;
        allHtml += entriesArr.map(e => renderPaySlipHtml(e, period)).join("");
      }
    }

    if (!allHtml) {
      setPrintingBulk(false);
      return;
    }

    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Bulk Pay Slips</title>
      <style>${paySlipPrintStyles}</style></head><body>${allHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
    setPrintingBulk(false);
    setSelectedIds(new Set());
  };

  const summary = {
    total: periods.length,
    in_review: periods.filter(p => p.status === "in_review").length,
    approved: periods.filter(p => p.status === "approved").length,
    paid: periods.filter(p => p.status === "paid").length,
  };
  const pagination = useTablePagination(periods);

  return (
    <RequirePermission module="payroll" action="can_view">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Go back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payroll</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage pay periods, review entries, and approve payroll runs</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/reports/overtime")} className="gap-2">
            <BarChart3 className="w-4 h-4" /> Overtime Report
          </Button>
          {payrollEdit.allowed && (
            <Button variant="outline" onClick={() => setShowBulkEdit(true)} className="gap-2">
              <Pencil className="w-4 h-4" /> Edit Salaries
            </Button>
          )}
          {payrollEdit.allowed && (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" /> New Pay Period
            </Button>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Periods", value: summary.total, color: "text-foreground" },
          { label: "In Review",     value: summary.in_review, color: "text-amber-600" },
          { label: "Approved",      value: summary.approved,  color: "text-blue-600" },
          { label: "Paid",          value: summary.paid,      color: "text-emerald-600" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Pay periods list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pay Periods</h2>
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
      ) : periods.length === 0 ? (
        <div className="py-16 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No pay periods yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {pagination.pageItems.map(period => {
            const StatusIcon = STATUS_ICONS[period.status] || Clock;
            const isRunning = runningId === period.id;
            const isSelectable = period.status === "in_review" || period.status === "approved" || period.status === "paid";
            const isSelected = selectedIds.has(period.id);

            const isExpanded = expandedPeriodId === period.id;
            const canExpand = period.status === "in_review" || period.status === "approved" || period.status === "paid";
            return (
              <div key={period.id} className={`${isExpanded ? "bg-muted/10" : ""}`}>
              <div className={`px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${canExpand ? "cursor-pointer" : ""}`} onClick={canExpand ? () => setExpandedPeriodId(isExpanded ? null : period.id) : undefined}>
                {/* Checkbox */}
                <div className="shrink-0 self-start sm:self-center" onClick={e => e.stopPropagation()}>
                  {isSelectable ? (
                    <button onClick={() => toggleSelect(period.id)} className="text-muted-foreground hover:text-primary transition-colors">
                      {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
                    </button>
                  ) : (
                    <div className="w-5 h-5 rounded border border-border/50 bg-muted/20" />
                  )}
                </div>

                {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {canExpand ? (
                        <button className="font-semibold text-foreground hover:text-primary flex items-center gap-1.5 transition-colors">
                          {period.name}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      ) : (
                        <span className="font-semibold text-foreground">{period.name}</span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${STATUS_STYLES[period.status] || "bg-muted text-muted-foreground"}`}>
                        <StatusIcon className="w-3 h-3" />
                        {period.status?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(period.start_date)} → {fmtDate(period.end_date)}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Pay date: {fmtDate(period.pay_date)}</span>
                      {period.employee_count > 0 && (
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{period.employee_count} employees</span>
                      )}
                    </div>
                  </div>

                  {/* Totals */}
                  {period.total_gross > 0 && (
                    <div className="flex gap-4 text-xs shrink-0">
                      <div className="text-center">
                        <p className="text-muted-foreground">Gross</p>
                        <p className="font-semibold text-foreground">AED {fmt(period.total_gross)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">Deductions</p>
                        <p className="font-semibold text-destructive">-{fmt(period.total_deductions)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">Net Pay</p>
                        <p className="font-bold text-emerald-600">AED {fmt(period.total_net)}</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {/* Duplicate */}
                    {payrollEdit.allowed && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => handleDuplicate(period)} title="Duplicate as draft">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    )}

                    {/* Delete */}
                    {payrollEdit.allowed && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingPeriod(period)} title="Delete pay period">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    )}

                  {/* View / edit entries */}
                    {(period.status === "in_review" || period.status === "approved" || period.status === "paid") && (
                      <Button size="sm" variant="outline" className="gap-1.5"
                        onClick={() => setExpandedPeriodId(isExpanded ? null : period.id)}>
                        <Pencil className="w-3.5 h-3.5" /> {isExpanded ? "Close" : "Edit"}
                      </Button>
                    )}

                    {/* Run / recalculate */}
                    {(period.status === "draft" || period.status === "in_review") && payrollEdit.allowed && (
                      <Button size="sm" variant="outline" className="gap-1.5"
                        disabled={isRunning}
                        onClick={() => handleRun(period)}>
                        {isRunning
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</>
                          : <><Play className="w-3.5 h-3.5" /> {period.status === "draft" ? "Run Payroll" : "Recalculate"}</>
                        }
                      </Button>
                    )}

                    {/* Approve */}
                    {period.status === "in_review" && payrollApprove.allowed && (
                      <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleApprove(period)}>
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </Button>
                    )}

                    {/* Mark Paid */}
                    {period.status === "approved" && payrollApprove.allowed && (
                      <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleMarkPaid(period)}>
                        <DollarSign className="w-3.5 h-3.5" /> Mark Paid
                      </Button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <PayrollEntriesInline period={period} onRefresh={load} />
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <DataTablePagination pagination={pagination} />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-slide-down">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} period{selectedIds.size > 1 ? "s" : ""} selected</span>
          <Button size="sm" className="gap-1.5" onClick={handleBulkPrint} disabled={printingBulk}>
            {printingBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            {printingBulk ? "Generating..." : "Print All Payslips"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
        </div>
      )}

      {showForm && (
        <PayPeriodFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setDuplicateDefaults(null); }}
          onCreate={handleCreate}
          saving={creating}
          defaults={duplicateDefaults}
        />
      )}

      {showBulkEdit && (
        <BulkSalaryEditModal open={showBulkEdit} onClose={() => setShowBulkEdit(false)} />
      )}

      {markingPaid && (
        <MarkPaidModal
          open={!!markingPaid}
          onClose={() => setMarkingPaid(null)}
          period={markingPaid}
          onPaid={load}
        />
      )}

      <AlertDialog open={!!deletingPeriod} onOpenChange={(o) => !o && setDeletingPeriod(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pay period?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deletingPeriod?.name}</strong> and all its payroll entries.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Deleting…</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </RequirePermission>
  );
}