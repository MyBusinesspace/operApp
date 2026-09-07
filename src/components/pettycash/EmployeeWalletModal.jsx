import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import {
  Plus, TrendingDown, TrendingUp, Eye, Pencil, Trash2,
  MoreVertical, X, Download, Loader2, Sparkles, FileText, Upload, ImagePlus
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import PettyCashEntryModal from "./PettyCashEntryModal";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

export default function EmployeeWalletModal({ open, onClose, employee, onBehalfEmployees = [], canCreateOnBehalf = false }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [entryModal, setEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [defaultType, setDefaultType] = useState("expense");
  const [receiptViewer, setReceiptViewer] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(null); // entry id being uploaded
  const didChangeRef = useRef(false);
  const receiptFileRef = useRef(null);

  const load = async () => {
    if (!employee?.id) return;
    setLoading(true);
    const list = await base44.entities.PettyCashEntry.filter({ employee_id: employee.id }, "-date").catch(() => []);
    setEntries(list);
    setLoading(false);
  };

  useEffect(() => {
    if (open && employee) {
      didChangeRef.current = false;
      load();
    }
  }, [open, employee]);

  const handleUploadReceiptForEntry = async (entryId, file) => {
    if (!file) return;
    setUploadingDoc(entryId);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.PettyCashEntry.update(entryId, { receipt_url: file_url });
    didChangeRef.current = true;
    // Update local state immediately
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, receipt_url: file_url } : e));
    // Also update receipt viewer if open
    setReceiptViewer(prev => prev?.id === entryId ? { ...prev, receipt_url: file_url } : prev);
    setUploadingDoc(null);
  };

  const totalExpenses = entries.filter(e => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + (e.amount || 0), 0);
  const balance = totalIncome - totalExpenses;
  const currency = entries[0]?.currency || "AED";

  const handleSave = async (form) => {
    if (editingEntry?.id) {
      await base44.entities.PettyCashEntry.update(editingEntry.id, form);
    } else {
      await base44.entities.PettyCashEntry.create(form);
    }
    didChangeRef.current = true;
    setEntryModal(false);
    setEditingEntry(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry?")) return;
    await base44.entities.PettyCashEntry.delete(id);
    didChangeRef.current = true;
    load();
  };

  const openAdd = (type) => {
    setEditingEntry(null);
    setDefaultType(type);
    setEntryModal(true);
  };

  const openEdit = (entry) => {
    setEditingEntry(entry);
    setDefaultType(entry.type);
    setEntryModal(true);
  };

  if (!employee) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={() => onClose(didChangeRef.current)}>
        <DialogContent className="w-[95vw] max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                {employee.avatar_url ? (
                  <img src={employee.avatar_url} alt={employee.full_name} className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <span className="text-base font-bold text-primary">{employee.full_name?.charAt(0)}</span>
                )}
              </div>
              <div>
                <h2 className="font-bold text-foreground text-lg leading-tight">{employee.full_name}</h2>
                <p className="text-xs text-muted-foreground">{employee.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Balance</p>
                <p className={`text-xl font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {currency} {new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(Math.abs(balance))}
                </p>
              </div>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onClose(didChangeRef.current)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex gap-6 px-6 py-3 bg-muted/30 border-b border-border text-sm">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-muted-foreground">Expenses:</span>
              <span className="font-semibold text-red-600">{fmtAmount(totalExpenses, currency)}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-muted-foreground">Received:</span>
              <span className="font-semibold text-emerald-600">{fmtAmount(totalIncome, currency)}</span>
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline"
                className="h-8 text-xs gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => openAdd("expense")}>
                <TrendingDown className="w-3.5 h-3.5" /> Add Expense
              </Button>
              <Button size="sm" variant="outline"
                className="h-8 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => openAdd("income")}>
                <TrendingUp className="w-3.5 h-3.5" /> Add Income
              </Button>
              <Button size="sm"
                className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => openAdd("expense")}>
                <Sparkles className="w-3.5 h-3.5" /> Scan Receipt (AI)
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <FileText className="w-10 h-10 opacity-20" />
                <p className="text-sm">No entries yet. Add an expense or income to get started.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 sticky top-0">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note #</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paid</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Received</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Docs</th>
                    <th className="px-4 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => {
                    // running balance
                    const runningBalance = entries.slice(0, idx + 1).reduce((s, e) =>
                      e.type === "income" ? s + (e.amount || 0) : s - (e.amount || 0), 0);
                    return (
                      <tr key={entry.id} className="border-b border-border hover:bg-muted/20 group transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(entry.date)}</td>
                        <td className="px-4 py-2.5 max-w-[180px]">
                          <p className="text-sm font-medium text-foreground truncate">{entry.provider || "—"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{entry.note_number || "—"}</td>
                        <td className="px-4 py-2.5">
                          {entry.category ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{entry.category}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          <p className="text-sm text-muted-foreground truncate">{entry.note || "—"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {entry.type === "expense" ? (
                            <span className="text-sm font-semibold text-red-600 tabular-nums">
                              {entry.currency} {(entry.amount || 0).toFixed(2)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {entry.type === "income" ? (
                            <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                              {entry.currency} {(entry.amount || 0).toFixed(2)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {entry.receipt_url ? (
                            <button type="button"
                              className="flex items-center justify-center gap-1 mx-auto text-xs text-primary hover:underline"
                              onClick={() => setReceiptViewer(entry)}>
                              <Eye className="w-3.5 h-3.5" /> 1
                            </button>
                          ) : (
                            <label className={`flex items-center justify-center gap-1 mx-auto text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors ${uploadingDoc === entry.id ? "opacity-50 pointer-events-none" : ""}`}>
                              {uploadingDoc === entry.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <ImagePlus className="w-3.5 h-3.5" />}
                              <input type="file" accept="image/*,application/pdf" className="hidden"
                                onChange={e => handleUploadReceiptForEntry(entry.id, e.target.files?.[0])} />
                            </label>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => openEdit(entry)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(entry.id)}>
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Viewer */}
      {receiptViewer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70" onClick={() => setReceiptViewer(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="font-semibold text-sm">{receiptViewer.provider || "Receipt"} — {fmtDate(receiptViewer.date)}</p>
              <div className="flex gap-2 items-center">
                {/* Replace / add photo */}
                <label className={`flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs font-medium cursor-pointer hover:bg-muted transition-colors ${uploadingDoc === receiptViewer.id ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploadingDoc === receiptViewer.id
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
                    : <><Upload className="w-3 h-3" /> {receiptViewer.receipt_url ? "Replace" : "Upload photo"}</>}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => handleUploadReceiptForEntry(receiptViewer.id, e.target.files?.[0])} />
                </label>
                <a href={receiptViewer.receipt_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><Eye className="w-3 h-3" /> View full</Button>
                </a>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setReceiptViewer(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center bg-muted/20 min-h-[300px]">
              {receiptViewer.receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={receiptViewer.receipt_url} alt="Receipt" className="max-w-full max-h-[60vh] object-contain rounded-lg" />
              ) : (
                <iframe src={receiptViewer.receipt_url} className="w-full h-[60vh] rounded-lg border border-border" title="Receipt" />
              )}
            </div>
          </div>
        </div>
      )}

      <PettyCashEntryModal
        open={entryModal}
        onClose={() => { setEntryModal(false); setEditingEntry(null); }}
        onSave={handleSave}
        entry={editingEntry}
        employee={employee}
        defaultType={defaultType}
        onBehalfEmployees={onBehalfEmployees}
        canCreateOnBehalf={canCreateOnBehalf}
      />
    </>
  );
}