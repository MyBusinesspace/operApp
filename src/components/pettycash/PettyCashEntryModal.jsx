import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Camera, Upload, Loader2, Sparkles, X, Image as ImageIcon } from "lucide-react";

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR"];
const CATEGORIES = ["Fuel", "Food & Drinks", "Materials", "Transport", "Office Supplies", "Maintenance", "Utilities", "Entertainment", "Other"];

const EMPTY_EXPENSE = {
  type: "expense", date: "", provider: "", note_number: "", note: "",
  amount: "", currency: "AED", category: "", project_name: "", work_order_name: "",
  receipt_url: "", ai_extracted: false, status: "pending"
};

const EMPTY_INCOME = {
  type: "income", date: "", provider: "", note_number: "", note: "",
  amount: "", currency: "AED", category: "", project_name: "", work_order_name: "",
  receipt_url: "", ai_extracted: false, status: "approved"
};

export default function PettyCashEntryModal({ open, onClose, onSave, entry, employee, defaultType = "expense", onBehalfEmployees = [], canCreateOnBehalf = false }) {
  const [form, setForm] = useState(EMPTY_EXPENSE);
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelectedEmployeeId("");
    if (entry) {
      setForm({ ...EMPTY_EXPENSE, ...entry, amount: entry.amount ?? "" });
    } else {
      const base = defaultType === "income" ? EMPTY_INCOME : EMPTY_EXPENSE;
      setForm({ ...base, date: new Date().toISOString().slice(0, 10) });
    }
  }, [open, entry, defaultType]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReceiptUpload = async (file) => {
    if (!file) return;
    setUploadingReceipt(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("receipt_url", file_url);
    setUploadingReceipt(false);
    return file_url;
  };

  const handleAIExtract = async (fileOrUrl) => {
    const url = typeof fileOrUrl === "string" ? fileOrUrl : form.receipt_url;
    if (!url) return;
    setExtracting(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an expense receipt parser. Analyze this receipt image and extract the following information. Be precise with numbers.
      
Return a JSON object with these fields:
- provider: string (store/vendor name, or null)
- note_number: string (receipt/invoice number, or null)  
- date: string in YYYY-MM-DD format (or null if not found)
- amount: number (total amount paid, numbers only)
- currency: string (3-letter code, default AED if not clear)
- note: string (brief description of what was purchased, max 100 chars)
- category: one of ["Fuel", "Food & Drinks", "Materials", "Transport", "Office Supplies", "Maintenance", "Utilities", "Entertainment", "Other"]

Return ONLY the JSON, no other text.`,
      file_urls: [url],
      response_json_schema: {
        type: "object",
        properties: {
          provider: { type: "string" },
          note_number: { type: "string" },
          date: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string" },
          note: { type: "string" },
          category: { type: "string" }
        }
      }
    });
    setForm(f => ({
      ...f,
      provider: result.provider || f.provider,
      note_number: result.note_number || f.note_number,
      date: result.date || f.date,
      amount: result.amount ?? f.amount,
      currency: result.currency || f.currency,
      note: result.note || f.note,
      category: result.category || f.category,
      ai_extracted: true
    }));
    setExtracting(false);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await handleReceiptUpload(file);
    if (url) await handleAIExtract(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const targetEmployee = (canCreateOnBehalf && selectedEmployeeId)
      ? onBehalfEmployees.find(emp => emp.id === selectedEmployeeId)
      : employee;
    setSaving(true);
    await onSave({
      ...form,
      employee_id: targetEmployee.id,
      employee_name: targetEmployee.full_name,
      amount: parseFloat(form.amount) || 0
    });
    setSaving(false);
  };

  const isExpense = form.type === "expense";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry ? "Edit Entry" : isExpense ? "Add Expense" : "Add Income"}
            {form.ai_extracted && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI extracted
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Type selector (only for new entries) */}
          {!entry && (
            <div className="flex gap-2">
              <button type="button"
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${form.type === "expense" ? "border-red-400 bg-red-50 text-red-700" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                onClick={() => set("type", "expense")}>
                − Expense
              </button>
              <button type="button"
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${form.type === "income" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                onClick={() => set("type", "income")}>
                + Income
              </button>
            </div>
          )}

          {/* On behalf of employee selector */}
          {canCreateOnBehalf && !entry && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">On Behalf Of</label>
              <Select value={selectedEmployeeId || "_self"} onValueChange={v => setSelectedEmployeeId(v === "_self" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={`${employee?.full_name} (default)`} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_self">{employee?.full_name} (default)</SelectItem>
                  {onBehalfEmployees.filter(e => e.id !== employee?.id).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Receipt upload + AI */}
          <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Receipt / Document</span>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                  disabled={uploadingReceipt || extracting}
                  onClick={() => fileInputRef.current?.click()}>
                  {uploadingReceipt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {uploadingReceipt ? "Uploading..." : "Upload"}
                </Button>
                {form.receipt_url && !extracting && (
                  <Button type="button" size="sm" variant="outline"
                    className="gap-1.5 h-7 text-xs bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
                    onClick={() => handleAIExtract(form.receipt_url)}>
                    <Sparkles className="w-3 h-3" /> Extract with AI
                  </Button>
                )}
                {extracting && (
                  <span className="flex items-center gap-1.5 text-xs text-violet-600 h-7 px-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Extracting...
                  </span>
                )}
              </div>
            </div>

            {form.receipt_url ? (
              <div className="relative group">
                {form.receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  <img src={form.receipt_url} alt="Receipt"
                    className="w-full max-h-40 object-contain rounded-lg border border-border bg-white" />
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-border">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-foreground truncate">Receipt attached</span>
                    <a href={form.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-auto">View</a>
                  </div>
                )}
                <button type="button"
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => set("receipt_url", "")}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="text-center py-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Camera className="w-8 h-8 text-muted-foreground/30 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Take a photo or upload a receipt — AI will fill in the form</p>
              </div>
            )}
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date <span className="text-destructive">*</span></label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount <span className="text-destructive">*</span></label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount}
                onChange={e => set("amount", e.target.value)} required className={isExpense ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <Select value={form.category || ""} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Provider / Supplier</label>
              <Input placeholder="Company or person name" value={form.provider || ""} onChange={e => set("provider", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Receipt / Note #</label>
              <Input placeholder="Invoice or receipt number" value={form.note_number || ""} onChange={e => set("note_number", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note / Description</label>
            <textarea className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground resize-none"
              placeholder="What was this for?"
              value={form.note || ""} onChange={e => set("note", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Project (optional)</label>
              <Input placeholder="Project name" value={form.project_name || ""} onChange={e => set("project_name", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Work Order (optional)</label>
              <Input placeholder="Work order" value={form.work_order_name || ""} onChange={e => set("work_order_name", e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.date || !form.amount}
              className={isExpense ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}>
              {saving ? "Saving..." : entry ? "Save Changes" : isExpense ? "Add Expense" : "Add Income"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}