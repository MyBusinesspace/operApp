import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, Search, X, RefreshCw, BookOpen, XCircle, Printer,
  MoreVertical, ChevronDown, Paperclip, Sparkles, Upload, Loader2,
  FileText, File, Image as ImageIcon, Copy, Repeat, Pencil, Receipt,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import ProductPickerModal from "@/components/sales/ProductPickerModal";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import DocumentFilesPopover from "@/components/shared/DocumentFilesPopover";
import DocumentHistoryPanel from "@/components/sales/DocumentHistoryPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const STATUS_STYLES = {
  Draft:               "bg-slate-100 text-slate-600",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  Approved:            "bg-emerald-100 text-emerald-700",
  Billed:              "bg-violet-100 text-violet-700",
  Cancelled:           "bg-orange-100 text-orange-600",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR"];
const DEPARTMENTS = ["Operations", "Finance", "HR", "Sales", "IT", "Field Services", "Management"];

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function getFileMeta(fileType, fileName) {
  const type = fileType || "";
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (type.startsWith("image/")) return { Icon: ImageIcon, color: "text-emerald-600 bg-emerald-50" };
  if (type === "application/pdf" || ext === "pdf") return { Icon: FileText, color: "text-red-600 bg-red-50" };
  return { Icon: File, color: "text-sky-600 bg-sky-50" };
}

const EMPTY = {
  number: "", reference: "", contact_id: "", contact_name: "",
  status: "Draft", issue_date: "", delivery_date: "",
  currency: "AED", subtotal: 0, tax_amount: 0, total: 0,
  notes: "", title: "", doc_summary: "",
  project_id: "", project_name: "", work_order_id: "", work_order_name: "",
  department: "",
  line_items: [],
};

const getEmptyLine = () => ({ description: "", quantity: 1, unit_price: 0, tax_rate: 0, total: 0 });

function calcLine(l) {
  const sub = (l.quantity || 0) * (l.unit_price || 0);
  const tax = sub * ((l.tax_rate || 0) / 100);
  return { ...l, total: sub + tax };
}

function recalcTotals(f) {
  const items = f.line_items || [];
  const subtotal = items.reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0);
  const tax_amount = items.reduce((s, l) => {
    const sub = (l.quantity || 0) * (l.unit_price || 0);
    return s + sub * ((l.tax_rate || 0) / 100);
  }, 0);
  return { ...f, subtotal, tax_amount, total: subtotal + tax_amount };
}

async function generatePONumber() {
  const all = await base44.entities.PurchaseOrder.list("-created_date", 200).catch(() => []);
  const nums = all.map(p => p.number).filter(n => n && n.startsWith("PO-"));
  if (nums.length === 0) return "PO-0001";
  const max = Math.max(...nums.map(n => parseInt(n.replace("PO-", "")) || 0));
  return `PO-${String(max + 1).padStart(4, "0")}`;
}

function normalizeDate(d) {
  if (!d) return "";
  const s = String(d).trim();
  let date;
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    date = new Date(s);
  } else {
    const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
    if (m) {
      let [_, p1, p2, p3] = m;
      let year = p3.length === 2 ? "20" + p3 : p3;
      let day, month;
      const n1 = Number(p1), n2 = Number(p2);
      if (n1 > 12 && n2 <= 12) { day = n1; month = n2; }
      else if (n2 > 12 && n1 <= 12) { day = n2; month = n1; }
      else { day = n1; month = n2; }
      date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    } else {
      date = new Date(s);
    }
  }
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function PurchaseOrderFormBody({ purchaseOrder, contacts = [], onSave, onClose, onPrint, isPage = false, active = true, onConvertToBill }) {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const closeAfterSaveRef = useRef(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [genningNumber, setGenningNumber] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [savedPO, setSavedPO] = useState(purchaseOrder || null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const accounts = useChartOfAccounts();

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const taxRec = list.find(t => t.name === "__tax_rates__");
      if (taxRec) {
        try {
          const parsed = JSON.parse(taxRec.footer_notes || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) setTaxRates(parsed);
        } catch {}
      } else {
        const settings = list.find(t => t.name === "__numbering_settings__");
        if (settings) {
          try {
            const parsed = JSON.parse(settings.footer_notes || "{}");
            if (parsed.tax_rates) setTaxRates(parsed.tax_rates);
          } catch {}
        }
      }
    }).catch(() => {});
  }, []);

  const ensureBlankRow = (items) => {
    const list = [...(items || [])];
    const last = list[list.length - 1];
    if (!last || last.description || last.unit_price) list.push(getEmptyLine());
    return list;
  };

  useEffect(() => { setSavedPO(purchaseOrder || null); }, [purchaseOrder]);

  useEffect(() => {
    if (!active) return;
    const base = purchaseOrder ? { ...EMPTY, ...purchaseOrder } : { ...EMPTY, issue_date: new Date().toISOString().slice(0, 10) };
    base.line_items = ensureBlankRow(base.line_items || []);
    setForm(base);
    setContactSearch(base.contact_name || "");
    setShowContactList(false);
    if (!base.number) {
      setGenningNumber(true);
      generatePONumber().then(n => { setForm(f => ({ ...f, number: n })); setGenningNumber(false); });
    }
  }, [active, purchaseOrder]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedContact = contacts.find(c => c.id === form.contact_id) || null;

  const filteredSuppliers = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    return (c.company || c.full_name).toLowerCase().includes(q) || c.full_name.toLowerCase().includes(q);
  });

  const setContact = (c) => {
    setForm(f => ({ ...f, contact_id: c.id, contact_name: c.company || c.full_name }));
    setContactSearch(c.company || c.full_name);
    setShowContactList(false);
  };

  const clearContact = () => {
    setForm(f => ({ ...f, contact_id: "", contact_name: "" }));
    setContactSearch("");
  };

  const removePendingFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  const addAttachment = async (file) => {
    if (!file) return;
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      setPendingFiles(prev => [...prev, { file_url: up.file_url, file_name: file.name, file_type: file.type, file_size: file.size }]);
    } catch {}
  };

  const insertBeforeBlank = (items, newLine) => {
    const list = [...(items || [])];
    const lastIdx = list.length - 1;
    if (list.length > 0 && !list[lastIdx].description && !list[lastIdx].unit_price) {
      list.splice(lastIdx, 0, newLine); return list;
    }
    return [...list, newLine];
  };

  const addLine = () => setForm(f => ({ ...f, line_items: ensureBlankRow(f.line_items || []) }));
  const addFromProduct = (p) => {
    const newLine = calcLine({ description: p.purchase_description || p.sale_description || p.name, quantity: 1, unit_price: p.purchase_price || p.sale_price || 0, tax_rate: p.purchase_tax_rate || p.sale_tax_rate || 0, total: 0 });
    setForm(f => recalcTotals({ ...f, line_items: insertBeforeBlank(f.line_items, newLine) }));
  };
  const removeLine = (i) => setForm(f => recalcTotals({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  const updateLine = (i, k, v) => setForm(f => {
    const items = f.line_items.map((l, idx) => idx === i ? calcLine({ ...l, [k]: Number(v) || v }) : l);
    return recalcTotals({ ...f, line_items: ensureBlankRow(items) });
  });

  const quickStatus = async (newStatus) => {
    if (!purchaseOrder?.id) return;
    setSaving(true);
    const updated = { ...form, status: newStatus };
    setForm(updated);
    await onSave(updated);
    setSaving(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form, { close: closeAfterSaveRef.current, pendingFiles });
    setPendingFiles([]);
    setSaving(false);
    closeAfterSaveRef.current = false;
  };

  // ── Duplicate this PO as a new draft ──
  const duplicatePO = (keepContact) => {
    const src = purchaseOrder?.id ? purchaseOrder : form;
    const dup = {
      ...EMPTY,
      number: "",
      reference: src.reference || "",
      title: src.title || "",
      doc_summary: src.doc_summary || "",
      status: "Draft",
      issue_date: new Date().toISOString().slice(0, 10),
      delivery_date: "",
      currency: src.currency || "AED",
      notes: src.notes || "",
      department: src.department || "",
      project_id: src.project_id || "",
      project_name: src.project_name || "",
      work_order_id: src.work_order_id || "",
      work_order_name: src.work_order_name || "",
      line_items: (src.line_items || []).filter(l => l.description || l.unit_price).map(l => calcLine({ ...l })),
    };
    if (keepContact) {
      dup.contact_id = src.contact_id || "";
      dup.contact_name = src.contact_name || "";
    }
    navigate("/purchasing/purchase-orders/new", { state: { duplicate: dup } });
  };

  const handleCopy = () => duplicatePO(false);
  const handleRepeat = () => duplicatePO(true);

  const handleDeletePO = async () => {
    if (!purchaseOrder?.id) return;
    if (!confirm("Delete this purchase order? This action cannot be undone.")) return;
    await base44.entities.PurchaseOrder.delete(purchaseOrder.id);
    navigate("/purchasing/purchase-orders");
  };

  const handleConvertToBill = () => {
    if (!purchaseOrder?.id) return;
    if (onConvertToBill) { onConvertToBill(purchaseOrder); return; }
    const { id, created_date, updated_date, created_by_id, number, delivery_date, status, ...rest } = purchaseOrder;
    navigate("/purchasing/bills/new", { state: { duplicate: { ...rest, status: "Draft", number: "", issue_date: new Date().toISOString().slice(0, 10), purchase_order_id: purchaseOrder.id, purchase_order_number: purchaseOrder.number } } });
  };

  // ── AI extraction from an uploaded PO ──
  const handleExtract = async (file) => {
    if (!file) return;
    setExtracting(true);
    setExtractError("");
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const file_url = up.file_url;
      setPendingFiles(prev => [...prev, { file_url, file_name: file.name, file_type: file.type, file_size: file.size }]);
      const schema = {
        type: "object",
        properties: {
          supplier_name: { type: "string" },
          po_number: { type: "string" },
          reference: { type: "string" },
          issue_date: { type: "string", description: "Issue date in YYYY-MM-DD format if possible" },
          delivery_date: { type: "string", description: "Delivery date in YYYY-MM-DD format if possible" },
          currency: { type: "string" },
          subtotal: { type: "number" },
          tax_amount: { type: "number" },
          total: { type: "number" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                tax_rate: { type: "number" },
                total: { type: "number" },
              },
            },
          },
          notes: { type: "string" },
        },
      };
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: schema });
      if (res.status === "success" && res.output) {
        const d = res.output;
        let resolvedContactId = "";
        let resolvedContactName = "";
        if (d.supplier_name) {
          const norm = s => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
          const target = norm(d.supplier_name);
          const match = contacts.find(c => norm(c.company || c.full_name) === target)
            || contacts.find(c => { const n = norm(c.company || c.full_name); return n.includes(target) || target.includes(n); });
          if (match) {
            resolvedContactId = match.id;
            resolvedContactName = match.company || match.full_name;
          } else {
            try {
              const created = await base44.entities.Contact.create({ full_name: d.supplier_name, type: "Provider", status: "Active" });
              resolvedContactId = created.id;
              resolvedContactName = created.full_name;
            } catch {
              resolvedContactName = d.supplier_name;
            }
          }
        }
        setForm(f => {
          const extractedItems = Array.isArray(d.line_items) && d.line_items.length > 0
            ? d.line_items.map(l => calcLine({
                description: l.description || "",
                quantity: l.quantity || 1,
                unit_price: l.unit_price || 0,
                tax_rate: l.tax_rate || 0,
                total: 0,
              }))
            : null;
          const next = { ...f };
          if (d.po_number) next.reference = d.po_number;
          else if (d.reference) next.reference = d.reference;
          if (d.issue_date) next.issue_date = normalizeDate(d.issue_date);
          if (d.delivery_date) next.delivery_date = normalizeDate(d.delivery_date);
          if (d.currency && CURRENCIES.includes(d.currency.toUpperCase())) next.currency = d.currency.toUpperCase();
          if (d.notes) next.notes = d.notes;
          if (extractedItems) next.line_items = ensureBlankRow(extractedItems);
          if (resolvedContactName) {
            next.contact_id = resolvedContactId;
            next.contact_name = resolvedContactName;
          }
          const recalc = recalcTotals(next);
          if (!extractedItems) {
            recalc.subtotal = d.subtotal || 0;
            recalc.tax_amount = d.tax_amount || 0;
            recalc.total = d.total || 0;
          }
          return recalc;
        });
        if (resolvedContactName) setContactSearch(resolvedContactName);
      } else {
        setExtractError(res.details || "Could not extract data from the file.");
      }
    } catch (e) {
      setExtractError(e?.message || "Extraction failed.");
    }
    setExtracting(false);
  };

  return (
    <div className={isPage ? "p-5" : "p-1"}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{purchaseOrder?.id ? "Edit Purchase Order" : "New Purchase Order"}</h2>
          {!purchaseOrder?.id && <p className="text-xs text-muted-foreground">Create from scratch, or upload a PO below to auto-fill with AI.</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Save split-button */}
          <div className="flex items-stretch rounded-md border border-input shadow-sm overflow-hidden">
            <Button type="button" variant="outline" disabled={saving || !form.contact_id}
              className="rounded-none border-0 px-4 h-9 text-sm"
              onClick={() => { closeAfterSaveRef.current = false; formRef.current?.requestSubmit(); }}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" disabled={saving || !form.contact_id}
                  className="rounded-none border-0 border-l border-input px-2 h-9">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => { closeAfterSaveRef.current = true; formRef.current?.requestSubmit(); }}>Save &amp; close</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Primary action */}
          {(() => {
            const primaryLabel =
              !purchaseOrder?.id ? "Submit for Approval" :
              form.status === "Draft" ? "Submit for Approval" :
              form.status === "Awaiting Approval" ? "Approve" :
              form.status === "Approved" ? "Mark as Billed" : null;
            if (!primaryLabel) return null;
            const primaryAction = () => {
              if (!purchaseOrder?.id) { setSaving(true); onSave({ ...form, status: "Awaiting Approval" }, { pendingFiles }).then(() => { setSaving(false); setPendingFiles([]); }); }
              else if (form.status === "Draft") quickStatus("Awaiting Approval");
              else if (form.status === "Awaiting Approval") quickStatus("Approved");
              else if (form.status === "Approved") quickStatus("Billed");
            };
            return (
              <div className="flex items-stretch rounded-md overflow-hidden shadow-sm">
                <Button type="button" disabled={saving || !form.contact_id}
                  className="rounded-none bg-blue-600 hover:bg-blue-700 text-white px-4 h-9 border-0 text-sm"
                  onClick={primaryAction}>{primaryLabel}</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" disabled={saving || !form.contact_id}
                      className="rounded-none bg-blue-600 hover:bg-blue-700 text-white border-l border-blue-500 px-2 h-9">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {form.status === "Draft" && (
                      <>
                        <DropdownMenuItem onClick={() => quickStatus("Awaiting Approval")}>Submit for Approval</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => quickStatus("Approved")}>Approve directly</DropdownMenuItem>
                      </>
                    )}
                    {form.status === "Awaiting Approval" && (
                      <>
                        <DropdownMenuItem onClick={() => quickStatus("Approved")}>Approve</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => quickStatus("Draft")}>Revert to Draft</DropdownMenuItem>
                      </>
                    )}
                    {form.status === "Approved" && (
                      <DropdownMenuItem onClick={() => quickStatus("Billed")}>Mark as Billed</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })()}

          {purchaseOrder?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" disabled={saving} className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => (onPrint ? onPrint(purchaseOrder) : window.print())}>
                  <Printer className="w-4 h-4 mr-2" /> Print PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRepeat}>
                  <Repeat className="w-4 h-4 mr-2" /> Repeat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" /> Copy
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
                {form.status === "Approved" && (
                  <DropdownMenuItem onClick={handleConvertToBill}>
                    <Receipt className="w-4 h-4 mr-2" /> Convert to Bill
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeletePO}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
                {!["Billed", "Cancelled"].includes(form.status) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => quickStatus("Cancelled")}>
                      <XCircle className="w-4 h-4 mr-2" /> Cancel PO
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" onClick={() => setShowContactList(false)}>
        {/* AI auto-fill — only when creating a new PO */}
        {!purchaseOrder?.id && (
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Auto-fill from a purchase order</p>
                  <p className="text-xs text-muted-foreground">Upload a PDF or image of a supplier PO and AI will extract the details for you.</p>
                </div>
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleExtract(f); e.target.value = ""; }} />
                <span className="inline-flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3.5 py-2 rounded-md hover:bg-primary/90 transition-colors">
                  {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {extracting ? "Extracting..." : "Upload & Extract"}
                </span>
              </label>
            </div>
            {extractError && <p className="text-xs text-destructive mt-2.5">{extractError}</p>}
          </div>
        )}

        {/* Number + Reference */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">PO Number</label>
            <div className="relative">
              <Input placeholder="Auto-generated..." value={genningNumber ? "Generating..." : form.number}
                onChange={e => set("number", e.target.value)} disabled={genningNumber} className="pr-8" />
              <button type="button" title="Re-generate"
                onClick={() => { setGenningNumber(true); generatePONumber().then(n => { set("number", n); setGenningNumber(false); }); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reference</label>
            <Input placeholder="Internal reference" value={form.reference} onChange={e => set("reference", e.target.value)} />
          </div>
        </div>

        {/* Supplier + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier <span className="text-destructive">*</span></label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input className="pl-9 pr-8" placeholder="Search supplier..."
                value={contactSearch}
                onChange={e => { setContactSearch(e.target.value); setShowContactList(true); }}
                onFocus={() => { if (contactSearch.length > 0) setShowContactList(true); }}
                autoComplete="off"
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); if (filteredSuppliers.length > 0) setContact(filteredSuppliers[0]); }
                  if (e.key === "Escape") setShowContactList(false);
                }}
              />
              {form.contact_id && (
                <button type="button" onClick={clearContact} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showContactList && filteredSuppliers.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredSuppliers.map(c => (
                  <button key={c.id} type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={(e) => { e.stopPropagation(); setContact(c); }}>
                    <span className="font-medium">{c.company || c.full_name}</span>
                    {c.company && c.full_name !== c.company && <span className="text-xs text-muted-foreground ml-1.5">{c.full_name}</span>}
                  </button>
                ))}
              </div>
            )}
            {showContactList && contactSearch && filteredSuppliers.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 text-primary"
                  onClick={async (e) => { e.stopPropagation();
                    const created = await base44.entities.Contact.create({ full_name: contactSearch, type: "Provider", status: "Active" });
                    setContact({ id: created.id, full_name: created.full_name, company: created.company });
                  }}>
                  <span className="text-lg leading-none">+</span>
                  Create <span className="font-medium mx-1">"{contactSearch}"</span> as new supplier
                </button>
              </div>
            )}
          </div>
          <div className="flex items-end pb-1">
            <StatusBadge status={form.status} />
          </div>
        </div>

        {/* Supplier preview */}
        {selectedContact && (
          <div className="bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm space-y-0.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Supplier</p>
            <p className="font-semibold text-foreground">{selectedContact.fiscal_legal_name || selectedContact.company || selectedContact.full_name}</p>
            {selectedContact.tax_id && <p className="text-muted-foreground text-xs">TRN / VAT: {selectedContact.tax_id}</p>}
            {(selectedContact.fiscal_address || selectedContact.address) && <p className="text-muted-foreground">{selectedContact.fiscal_address || selectedContact.address}</p>}
            {(selectedContact.fiscal_city || selectedContact.city) && <p className="text-muted-foreground">{[selectedContact.fiscal_city || selectedContact.city, selectedContact.fiscal_country || selectedContact.country].filter(Boolean).join(", ")}</p>}
          </div>
        )}

        {/* Dates + Currency */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Issue Date</label>
            <Input type="date" value={form.issue_date} onChange={e => set("issue_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delivery Date</label>
            <Input type="date" value={form.delivery_date} onChange={e => set("delivery_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
            <Select value={form.currency} onValueChange={v => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Linked Project / WO */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Project (optional)</label>
            <Input placeholder="Project name" value={form.project_name || ""} onChange={e => set("project_name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Work Order (optional)</label>
            <Input placeholder="Work order name" value={form.work_order_name || ""} onChange={e => set("work_order_name", e.target.value)} />
          </div>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setProductPicker(true)}>
                <BookOpen className="w-3 h-3" /> From catalog
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={addLine}>
                <Plus className="w-3 h-3" /> Add Line
              </Button>
            </div>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-primary/10 border-b-2 border-primary/20">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-primary/80 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-primary/80 uppercase tracking-wide w-40">Account</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-20">Qty</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-28">Unit Price</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-20">Tax %</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-28">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {(form.line_items || []).length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">No line items yet.</td></tr>
                ) : (
                  (form.line_items || []).map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <textarea className="w-full text-xs border-0 bg-transparent focus-visible:outline-none focus-visible:ring-0 px-1 py-0 resize-none overflow-hidden leading-5"
                          rows={1} placeholder="Description..."
                          value={l.description}
                          onChange={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; updateLine(i, "description", e.target.value); }}
                          onFocus={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                        />
                      </td>
                      <td className="px-2 py-1.5 w-44">
                        <AccountCombobox
                          accounts={accounts}
                          value={l.account_id || ""}
                          onChange={acc => setForm(f => {
                            const items = f.line_items.map((ln, idx) => idx === i ? { ...ln, account_id: acc?.id || "", account_code: acc?.code || "", account_name: acc?.name || "" } : ln);
                            return recalcTotals({ ...f, line_items: items });
                          })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1" type="number" min="0"
                          value={l.quantity === 0 ? "" : l.quantity} placeholder="" onChange={e => updateLine(i, "quantity", e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1" type="number" min="0" step="0.01"
                          value={l.unit_price === 0 ? "" : l.unit_price} placeholder="" onChange={e => updateLine(i, "unit_price", e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        {taxRates.length > 0 ? (
                          <select className="h-7 text-xs border border-input rounded-md bg-transparent px-2 w-full focus:outline-none focus:ring-1 focus:ring-ring"
                            value={l.tax_rate} onChange={e => updateLine(i, "tax_rate", parseFloat(e.target.value))}>
                            {taxRates.map((tr, ti) => <option key={ti} value={tr.rate}>{tr.rate}%</option>)}
                          </select>
                        ) : (
                          <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 w-14"
                            type="number" min="0" max="100" value={l.tax_rate} onChange={e => updateLine(i, "tax_rate", e.target.value)} />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{l.total?.toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {(form.line_items || []).length > 0 && (
            <div className="mt-3 flex justify-end">
              <div className="space-y-1 text-sm min-w-[200px]">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{form.subtotal?.toFixed(2)} {form.currency}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="tabular-nums">{form.tax_amount?.toFixed(2)} {form.currency}</span></div>
                <div className="flex justify-between font-bold text-foreground border-t border-border pt-1"><span>Total</span><span className="tabular-nums">{form.total?.toFixed(2)} {form.currency}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
          <textarea className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
            placeholder="Internal notes..."
            value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
        </div>

        {/* Department */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Department</label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={form.department || ""} onChange={e => set("department", e.target.value)}>
            <option value="">Select department</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Files — compact popover button */}
        {purchaseOrder?.id ? (
          <DocumentFilesPopover docType="purchase_order" docId={purchaseOrder.id} docNumber={purchaseOrder.number} />
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-muted/40 hover:bg-muted text-sm font-medium text-foreground transition-colors">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                Files{pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ""}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[440px] p-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">Files enclosed</span>
                  <label className="cursor-pointer">
                    <input type="file" accept="application/pdf,image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) addAttachment(f); e.target.value = ""; }} />
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium border border-input bg-card text-foreground px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors">
                      <Upload className="w-3 h-3" /> Add attachment
                    </span>
                  </label>
                </div>
                {pendingFiles.length > 0 ? (
                  <div className="space-y-2">
                    {pendingFiles.map((f, i) => {
                      const { Icon, color } = getFileMeta(f.file_type, f.file_name);
                      return (
                        <div key={i} className="rounded-lg border border-border bg-card px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{f.file_name}</p>
                              <p className="text-xs text-muted-foreground">{formatBytes(f.file_size)}</p>
                            </div>
                            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removePendingFile(i)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No files attached yet. Upload the PO above to auto-fill with AI, or add attachments here.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* History */}
        {purchaseOrder?.id && (
          <DocumentHistoryPanel docType="purchase_order" docId={purchaseOrder.id} docNumber={purchaseOrder.number} />
        )}

        <button type="submit" className="hidden" aria-hidden="true" />
      </form>

      <ProductPickerModal open={productPicker} onClose={() => setProductPicker(false)} onSelect={addFromProduct} />
    </div>
  );
}