import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, Search, X, RefreshCw, BookOpen, XCircle, Printer,
  MoreVertical, ChevronDown, Sparkles, Upload, Loader2,
  FileText, File, Image as ImageIcon, Copy, Repeat, Pencil, ExternalLink,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import { dateOnlyKey, todayLocalISO } from "@/lib/dateOnly";
import ProductPickerModal from "@/components/sales/ProductPickerModal";
import LinkedRecordsSection from "@/components/sales/LinkedRecordsSection";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import DocumentHistoryPanel from "@/components/sales/DocumentHistoryPanel";
import RecordPaymentPanel from "@/components/shared/RecordPaymentPanel";
import { loadPurchasingNumberingSettings } from "@/lib/purchasingNumbering";
import { retireDocumentNumber } from "@/lib/documentNumbering";
import { uploadPrivateFile, getSignedUrl } from "@/lib/privateFile";
import { checkPeriodLock } from "@/lib/periodLock";
import { toast } from "@/components/ui/use-toast";
import { calcBillLine as calcLine, recalcBillTotals as recalcTotals, prepareBillSave } from "@/lib/billFormValues";
import {
  amountModeLine, attachTaxAdapter, isAmountLine, lineSignConvention, lineTaxPct,
  setLineTaxPct, stripAdapterFields, taxBlockReason,
} from "@/lib/docTaxSemantics";
import AnnexPhotosSection from "@/components/shared/AnnexPhotosSection";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { CURRENCIES, toBaseAmount } from "@/lib/currency";
import ExchangeRateField from "@/components/shared/ExchangeRateField";
import { itemsError } from "@/lib/lineItemValidation";

const STATUS_STYLES = {
  Draft:               "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  "Awaiting Payment":  "bg-blue-100 text-blue-700",
  Paid:                "bg-emerald-100 text-emerald-700",
  Repeating:           "bg-violet-100 text-violet-700",
  Cancelled:           "bg-orange-100 text-orange-600",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

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
  status: "Draft", issue_date: "", due_date: "",
  currency: "AED", subtotal: 0, discount_total: 0, tax_amount: 0, total: 0,
  exchange_rate: 1, base_total: 0,
  notes: "", title: "", doc_summary: "",
  project_id: "", project_name: "", work_order_id: "", work_order_name: "",
  task_ids: [], task_names: [], task_references: [],
  purchase_order_id: "", purchase_order_number: "",
  department: "",
  line_items: [],
  annex_photos: [],
};


function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const getEmptyLine = () => ({ description: "", quantity: 1, unit_price: 0, discount: "", tax_rate: 0, total: 0 });



async function generateBillNumber() {
  const settings = await loadPurchasingNumberingSettings();
  const prefix = settings.bill_prefix || "BILL";
  const includeYear = settings.include_year !== false;
  const year = new Date().getFullYear();
  const all = await base44.entities.Bill.list("-created_date", 5000).catch(() => []);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = includeYear
    ? new RegExp(`^${escaped}-(?:\\d{4}|\\d{2})-(\\d+)$`)
    : new RegExp(`^${escaped}-(\\d+)$`);
  const nums = all.map(b => b.number).filter(Boolean);
  let max = 0;
  for (const n of nums) {
    const m = n.match(regex);
    if (m) { const v = parseInt(m[1], 10); if (v > max) max = v; }
  }
  // Also count imported numbers without a year segment (e.g. BILL-0001 from Xero)
  if (includeYear) {
    const lenientRegex = new RegExp(`^${escaped}-(\\d+)$`);
    for (const n of nums) {
      const m = n.match(lenientRegex);
      if (m) { const v = parseInt(m[1], 10); if (v > max) max = v; }
    }
  }
  const next = max + 1;
  return includeYear ? `${prefix}-${year}-${next}` : `${prefix}-${next}`;
}

function normalizeDate(d) {
  if (!d) return "";
  const s = String(d).trim();
  // Already YYYY-MM-DD — return as-is, no timezone conversion
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let date;
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    date = new Date(s);
  } else {
    // Numeric split dates: DD/MM/YYYY or MM/DD/YYYY (also dots/dashes)
    const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
    if (m) {
      let [_, p1, p2, p3] = m;
      let year = p3.length === 2 ? "20" + p3 : p3;
      let day, month;
      const n1 = Number(p1), n2 = Number(p2);
      if (n1 > 12 && n2 <= 12) { day = n1; month = n2; }        // DD/MM
      else if (n2 > 12 && n1 <= 12) { day = n2; month = n1; }    // MM/DD
      else { day = n1; month = n2; }                            // ambiguous → DD/MM (UAE)
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    } else {
      // Textual: "20 Aug 2026", "August 20, 2026", "20-Aug-2026"
      date = new Date(s);
    }
  }
  if (isNaN(date.getTime())) return "";
  // Local calendar parts only — never toISOString (it shifts the day by timezone)
  return dateOnlyKey(date);
}

export default function BillFormBody({ bill, contacts = [], onSave, onClose, onPrint, isPage = false, active = true }) {
  const navigate = useNavigate();
  const { currency: baseCurrency } = useBaseCurrency();
  const formRef = useRef(null);
  const closeAfterSaveRef = useRef(false);
  const isNewDocRef = useRef(false);
  const currencyTouchedRef = useRef(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const contactWrapRef = useRef(null);
  const contactPortalRef = useRef(null);
  const [contactRect, setContactRect] = useState(null);

  // Track the supplier input position so the dropdown can render in a portal
  // and escape any ancestor with overflow-hidden (e.g. the rounded card wrapper).
  useLayoutEffect(() => {
    if (!showContactList) return;
    const update = () => {
      if (contactWrapRef.current) setContactRect(contactWrapRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [showContactList]);

  // Close the dropdown when clicking outside the input and the portal
  useEffect(() => {
    if (!showContactList) return;
    const handle = (e) => {
      if (contactWrapRef.current?.contains(e.target)) return;
      if (contactPortalRef.current?.contains(e.target)) return;
      setShowContactList(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showContactList]);
  const [genningNumber, setGenningNumber] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [savedBill, setSavedBill] = useState(bill || null);

  // Auto-compute base_total whenever total / exchange rate / currency changes.
  useEffect(() => {
    setForm(f => {
      const same = !f.currency || !baseCurrency || f.currency === baseCurrency;
      const rate = same ? 1 : Number(f.exchange_rate) || 0;
      const baseTotal = same ? (f.total || 0) : toBaseAmount(f.total || 0, rate);
      if (Math.abs((f.base_total || 0) - baseTotal) < 0.0001 && (same ? f.exchange_rate === 1 : true)) return f;
      return { ...f, exchange_rate: same ? 1 : (f.exchange_rate || 0), base_total: baseTotal };
    });
  }, [form.total, form.exchange_rate, form.currency, baseCurrency]);

  // For new documents, default currency to the org base currency when it loads
  // (useBaseCurrency resolves async). A manual currency selection wins.
  useEffect(() => {
    if (!isNewDocRef.current || currencyTouchedRef.current || !baseCurrency) return;
    setForm(f => f.currency === baseCurrency ? f : { ...f, currency: baseCurrency });
  }, [baseCurrency]);

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
    }).catch(err => console.error(err));
  }, []);

  const ensureBlankRow = (items) => {
    const list = [...(items || [])];
    const last = list[list.length - 1];
    if (!last || last.description || last.unit_price) list.push(getEmptyLine());
    return list;
  };

  useEffect(() => { setSavedBill(bill || null); }, [bill]);

  useEffect(() => {
    if (!active) return;
    isNewDocRef.current = !bill;
    currencyTouchedRef.current = false;
    // attachTaxAdapter marks imported (amount) bills and snapshots their stored
    // financials, so a no-change save writes back the exact source figures.
    const base = bill
      ? attachTaxAdapter({ ...EMPTY, ...bill })
      : { ...EMPTY, currency: baseCurrency, issue_date: todayLocalISO(), _taxMode: "rate" };
    // Normalize dates to YYYY-MM-DD without timezone conversion (server may return ISO with TZ)
    if (base.issue_date) base.issue_date = normalizeDate(base.issue_date);
    if (base.due_date) base.due_date = normalizeDate(base.due_date);
    base.line_items = ensureBlankRow(base.line_items || []);
    setForm(base);
    if (!(bill)) {
      loadPurchasingNumberingSettings().then(st => {
        setForm(f => ({
          ...f,
          due_date: f.due_date || (st.bill_due_days ? addDaysISO(f.issue_date, Number(st.bill_due_days)) : ""),
          notes: f.notes || st.bill_default_notes || "",
        }));
      });
    }
    setContactSearch(base.contact_name || "");
    setShowContactList(false);
  }, [active, bill]);

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
      const { file_uri } = await uploadPrivateFile(file);
      setPendingFiles(prev => [...prev, { file_url: file_uri, file_name: file.name, file_type: file.type, file_size: file.size }]);
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
  const addFromProduct = (p) => setForm(f => {
    const fields = { description: p.purchase_description || p.sale_description || p.name, quantity: 1, unit_price: p.purchase_price || p.sale_price || 0, discount: "", total: 0 };
    const rate = p.purchase_tax_rate || p.sale_tax_rate || 0;
    const newLine = f._taxMode === "amount"
      ? amountModeLine(fields, rate, lineSignConvention(f))
      : calcLine({ ...fields, tax_rate: rate });
    return recalcTotals({ ...f, line_items: insertBeforeBlank(f.line_items, newLine) });
  });
  const removeLine = (i) => setForm(f => recalcTotals({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  const updateLine = (i, k, v) => setForm(f => {
    // Don't use || for numeric fields — it treats 0 as falsy. Number(v) keeps 0 as 0.
    const val = (k === "discount" || k === "description") ? v : Number(v);
    const mode = f._taxMode || "rate";
    const items = f.line_items.map((l, idx) => idx === i ? calcLine({ ...l, [k]: val }, mode) : l);
    return recalcTotals({ ...f, line_items: ensureBlankRow(items) });
  });

  // Tax input: imported lines show the percentage implied by their stored amount and
  // write the matching amount back; native lines keep storing the rate itself.
  const updateLineTax = (i, pct) => setForm(f => {
    const mode = f._taxMode || "rate";
    const items = f.line_items.map((l, idx) => idx !== i ? l : (mode === "amount"
      ? setLineTaxPct({ ...l, _taxSign: l._taxSign ?? lineSignConvention(f) }, pct)
      : calcLine({ ...l, tax_rate: pct }, mode)));
    return recalcTotals({ ...f, line_items: ensureBlankRow(items) });
  });
  const taxValueOf = (l) => (isAmountLine(l) ? lineTaxPct(l, form) : l.tax_rate);

  const quickStatus = async (newStatus) => {
    if (!bill?.id) return;
    const lineItemsProblem = itemsError(form.line_items, newStatus);
    if (lineItemsProblem) { toast({ title: "Bill not saved", description: lineItemsProblem, variant: "destructive" }); return; }
    const taxBlocked = taxBlockReason(form);
    if (taxBlocked) { toast({ title: "Bill not saved", description: taxBlocked, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const updated = { ...form, status: newStatus };
      setForm(updated);
      await onSave(stripAdapterFields(updated));
    } catch (err) {
      toast({ title: "Error updating bill", description: err?.message || "Could not update the bill status", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const lineItemsProblem = itemsError(form.line_items, form.status);
    if (lineItemsProblem) { toast({ title: "Bill not saved", description: lineItemsProblem, variant: "destructive" }); return; }
    const taxBlocked = taxBlockReason(form);
    if (taxBlocked) { toast({ title: "Bill not saved", description: taxBlocked, variant: "destructive" }); return; }
    if (saving) return;
    setSaving(true);
    try {
      // Snapshot the current text and zero-safe totals before awaiting validation.
      const payload = prepareBillSave(form);
      const { locked, lockDate, error: lockReadError } = await checkPeriodLock(payload.issue_date);
      if (locked) throw new Error(lockReadError
        ? "This bill cannot be saved: the accounting lock date could not be loaded, so the period is treated as locked. Try again in a moment."
        : `This bill cannot be saved: its issue date is before the accounting lock date (${lockDate}). Unlock the period in accounting settings first.`);
      await onSave(payload, { close: closeAfterSaveRef.current, pendingFiles });
      setPendingFiles([]);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message;
      toast({ title: "Bill not saved", description: typeof detail === "string" ? detail : JSON.stringify(detail) || "Could not save the bill", variant: "destructive" });
    } finally {
      setSaving(false);
      closeAfterSaveRef.current = false;
    }
  };

  // ── Duplicate this bill as a new draft ──
  const duplicateBill = (keepContact) => {
    const src = bill?.id ? bill : form;
    const dup = {
      ...EMPTY,
      number: "",
      reference: src.reference || "",
      title: src.title || "",
      doc_summary: src.doc_summary || "",
      status: "Draft",
      issue_date: todayLocalISO(),
      due_date: "",
      currency: src.currency || "AED",
      notes: src.notes || "",
      department: src.department || "",
      project_id: src.project_id || "",
      project_name: src.project_name || "",
      work_order_id: src.work_order_id || "",
      work_order_name: src.work_order_name || "",
      purchase_order_id: src.purchase_order_id || "",
      purchase_order_number: src.purchase_order_number || "",
      line_items: (src.line_items || []).filter(l => l.description || l.unit_price).map(l => calcLine({ ...l })),
    };
    if (keepContact) {
      dup.contact_id = src.contact_id || "";
      dup.contact_name = src.contact_name || "";
    }
    navigate("/purchasing/bills/new", { state: { duplicate: dup } });
  };

  const handleCopy = () => duplicateBill(false);
  const handleRepeat = () => duplicateBill(true);

  const handleDeleteBill = async () => {
    if (!bill?.id) return;
    if (!confirm("Delete this bill? This action cannot be undone.")) return;
    if (bill.number) await retireDocumentNumber("bill", bill.number, bill.id, "bill deleted");
    await base44.entities.Bill.delete(bill.id);
    navigate("/purchasing/bills");
  };

  // ── AI extraction from an uploaded bill ──
  const handleExtract = async (file) => {
    if (!file) return;
    setExtracting(true);
    setExtractError("");
    try {
      const { file_uri } = await uploadPrivateFile(file);
      set("annex_photos", [...(form.annex_photos || []), { url: file_uri, caption: file.name, include: true }]);
      const file_url = await getSignedUrl(file_uri);
      const schema = {
        type: "object",
        properties: {
          supplier_name: { type: "string" },
          invoice_number: { type: "string" },
          reference: { type: "string" },
          issue_date: { type: "string", description: "Issue date in YYYY-MM-DD format if possible" },
          due_date: { type: "string", description: "Due date in YYYY-MM-DD format if possible" },
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
        // Resolve supplier: match an existing contact, else auto-create one so the bill can be saved
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
            ? d.line_items.map(l => {
                // Extracted rates are native percentages; in an imported (amount) bill
                // they are stored as the matching tax amounts.
                const fields = { description: l.description || "", quantity: l.quantity || 1, unit_price: l.unit_price || 0, discount: "", total: 0 };
                return f._taxMode === "amount"
                  ? amountModeLine(fields, l.tax_rate || 0, lineSignConvention(f))
                  : calcLine({ ...fields, tax_rate: l.tax_rate || 0 });
              })
            : null;
          const next = { ...f };
          if (d.invoice_number) next.reference = d.invoice_number;
          else if (d.reference) next.reference = d.reference;
          if (d.issue_date) next.issue_date = normalizeDate(d.issue_date);
          if (d.due_date) next.due_date = normalizeDate(d.due_date);
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
          <h2 className="text-lg font-bold text-foreground truncate">{bill?.id ? "Edit Bill" : "New Bill"}</h2>
          {!bill?.id && <p className="text-xs text-muted-foreground">Create from scratch, or upload a bill below to auto-fill with AI.</p>}
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
              !bill?.id ? "Submit for Approval" :
              form.status === "Draft" ? "Submit for Approval" :
              form.status === "Awaiting Approval" ? "Approve" :
              form.status === "Awaiting Payment" ? "Mark as Paid" : null;
            if (!primaryLabel) return null;
            const primaryAction = () => {
              const lineItemsProblem = itemsError(form.line_items, form.status);
              if (lineItemsProblem) { toast({ title: "Bill not saved", description: lineItemsProblem, variant: "destructive" }); return; }
              const taxBlocked = taxBlockReason(form);
              if (taxBlocked) { toast({ title: "Bill not saved", description: taxBlocked, variant: "destructive" }); return; }
              if (!bill?.id) { setSaving(true); onSave(stripAdapterFields({ ...form, status: "Awaiting Approval" }), { pendingFiles }).then(() => { setSaving(false); setPendingFiles([]); }).catch(err => { setSaving(false); toast({ title: "Bill not saved", description: err?.message || "Could not save the bill", variant: "destructive" }); }); }
              else if (form.status === "Draft") quickStatus("Awaiting Approval");
              else if (form.status === "Awaiting Approval") quickStatus("Awaiting Payment");
              else if (form.status === "Awaiting Payment") quickStatus("Paid");
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
                        <DropdownMenuItem onClick={() => quickStatus("Awaiting Payment")}>Approve directly</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => quickStatus("Paid")}>Mark as Paid</DropdownMenuItem>
                      </>
                    )}
                    {form.status === "Awaiting Approval" && (
                      <>
                        <DropdownMenuItem onClick={() => quickStatus("Awaiting Payment")}>Approve</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => quickStatus("Draft")}>Revert to Draft</DropdownMenuItem>
                      </>
                    )}
                    {form.status === "Awaiting Payment" && (
                      <DropdownMenuItem onClick={() => quickStatus("Paid")}>Mark as Paid</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })()}

          {bill?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" disabled={saving} className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => (onPrint ? onPrint(bill) : window.print())}>
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
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeleteBill}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
                {!["Paid", "Cancelled"].includes(form.status) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => quickStatus("Cancelled")}>
                      <XCircle className="w-4 h-4 mr-2" /> Cancel Bill
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

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" onClick={() => setShowContactList(false)}
        onInvalidCapture={e => {
          closeAfterSaveRef.current = false;
          toast({ title: "Bill not saved", description: e.target.validationMessage || "Please check the bill fields.", variant: "destructive" });
        }}>
        {/* AI auto-fill — only when creating a new bill */}
        {!bill?.id && (
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Auto-fill from a bill</p>
                  <p className="text-xs text-muted-foreground">Upload a PDF or image of a supplier bill and AI will extract the details for you.</p>
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



        {/* Bill Details */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4 space-y-4">
        {/* Number + Reference */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Bill Number</label>
            <div className="relative">
              <Input placeholder="Assigned on approval" value={form.number || ""} disabled className="pr-8" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Reference</label>
            <Input placeholder="Supplier invoice number / ref" value={form.reference} onChange={e => set("reference", e.target.value)} />
          </div>
        </div>

        {/* Supplier + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div ref={contactWrapRef} className="relative">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Supplier <span className="text-destructive">*</span></label>
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
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => navigate(`/contacts/${form.contact_id}`)} className="text-muted-foreground hover:text-primary transition-colors" title="View contact">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={clearContact} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {showContactList && contactRect && createPortal(
              <div ref={contactPortalRef}
                style={{ position: "fixed", top: contactRect.bottom + 4, left: contactRect.left, width: contactRect.width, zIndex: 9999 }}
                className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                {filteredSuppliers.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto">
                    {filteredSuppliers.map(c => (
                      <button key={c.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={(e) => { e.stopPropagation(); setContact(c); }}>
                        <span className="font-medium">{c.company || c.full_name}</span>
                        {c.company && c.full_name !== c.company && <span className="text-xs text-muted-foreground ml-1.5">{c.full_name}</span>}
                      </button>
                    ))}
                  </div>
                ) : contactSearch ? (
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 text-primary"
                    onClick={async (e) => { e.stopPropagation();
                      const created = await base44.entities.Contact.create({ full_name: contactSearch, type: "Provider", status: "Active" });
                      setContact({ id: created.id, full_name: created.full_name, company: created.company });
                    }}>
                    <span className="text-lg leading-none">+</span>
                    Create <span className="font-medium mx-1">"{contactSearch}"</span> as new supplier
                  </button>
                ) : null}
              </div>,
              document.body
            )}
          </div>
          <div className="flex items-end pb-1">
            <StatusBadge status={form.status} />
          </div>
        </div>

        {/* Bill From preview */}
        {selectedContact && (
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm space-y-0.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">Bill From</p>
            <p className="font-semibold text-foreground">{selectedContact.fiscal_legal_name || selectedContact.company || selectedContact.full_name}</p>
            {selectedContact.tax_id && <p className="text-muted-foreground text-xs">TRN / VAT: {selectedContact.tax_id}</p>}
            {(selectedContact.fiscal_address || selectedContact.address) && <p className="text-muted-foreground">{selectedContact.fiscal_address || selectedContact.address}</p>}
            {(selectedContact.fiscal_city || selectedContact.city) && <p className="text-muted-foreground">{[selectedContact.fiscal_city || selectedContact.city, selectedContact.fiscal_country || selectedContact.country].filter(Boolean).join(", ")}</p>}
          </div>
        )}

        {/* Dates + Currency + Exchange Rate */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Issue Date</label>
            <Input type="date" value={form.issue_date} onChange={e => set("issue_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Due Date</label>
            <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Currency</label>
            <Select value={form.currency} onValueChange={v => { currencyTouchedRef.current = true; set("currency", v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <ExchangeRateField
            currency={form.currency}
            exchangeRate={form.exchange_rate}
            total={form.total}
            baseCurrency={baseCurrency}
            onChange={r => set("exchange_rate", r)}
          />
        </div>

        </div>

        {/* Linked Project / WO / Tasks */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
        <LinkedRecordsSection
          form={form}
          onChange={updates => setForm(f => ({ ...f, ...updates }))}
          contactId={form.contact_id}
        />

        </div>

        {/* Line Items */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Line Items</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setProductPicker(true)}>
                <BookOpen className="w-3 h-3" /> From catalog
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={addLine}>
                <Plus className="w-3 h-3" /> Add Line
              </Button>
            </div>
          </div>
          <div className="border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-40">Account</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-20">Qty</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-28">Unit Price</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-20">Tax %</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-20">Disc</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-28">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {(form.line_items || []).length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">No line items yet.</td></tr>
                ) : (
                  (form.line_items || []).map((l, i) => (
                    <tr key={i} className="border-t border-slate-200">
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
                          value={l.quantity ?? ""} placeholder="0" onChange={e => updateLine(i, "quantity", e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1" type="number" min="0" step="0.01"
                          value={l.unit_price ?? ""} placeholder="0" onChange={e => updateLine(i, "unit_price", e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        {taxRates.length > 0 ? (
                          <select className="h-7 text-xs border border-input rounded-md bg-transparent px-2 w-full focus:outline-none focus:ring-1 focus:ring-ring"
                            value={taxValueOf(l)} onChange={e => updateLineTax(i, e.target.value)}>
                            {isAmountLine(l) && !taxRates.some(tr => Number(tr.rate) === lineTaxPct(l, form)) && (
                              <option value={lineTaxPct(l, form)}>{lineTaxPct(l, form)}%</option>
                            )}
                            {taxRates.map((tr, ti) => <option key={ti} value={tr.rate}>{tr.rate}%</option>)}
                          </select>
                        ) : (
                          <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 w-14"
                            type="number" min="0" max="100" value={taxValueOf(l)} onChange={e => updateLineTax(i, e.target.value)} />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 w-16"
                          value={l.discount || ""} placeholder="0"
                          onChange={e => { const v = e.target.value; if (v === "" || /^\d*\.?\d*%?$/.test(v)) updateLine(i, "discount", v); }} />
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
              <div className="space-y-1.5 text-sm min-w-[220px] border border-slate-300 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-800 dark:bg-slate-800">
                <div className="flex justify-between font-semibold text-foreground"><span>Subtotal</span><span className="tabular-nums">{form.subtotal?.toFixed(2)} {form.currency}</span></div>
                {form.discount_total > 0 && (
                  <div className="flex justify-between font-semibold text-foreground"><span>Discount</span><span className="tabular-nums">-{form.discount_total?.toFixed(2)} {form.currency}</span></div>
                )}
                <div className="flex justify-between font-semibold text-foreground"><span>Tax</span><span className="tabular-nums">{form.tax_amount?.toFixed(2)} {form.currency}</span></div>
                <div className="flex justify-between font-bold text-base text-foreground border-t-2 border-slate-300 dark:border-slate-700 pt-2 mt-1"><span>Total</span><span className="tabular-nums">{form.total?.toFixed(2)} {form.currency}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Record Payment */}
        {savedBill?.id && ["Awaiting Payment", "Paid"].includes(form.status) && (
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
            <RecordPaymentPanel
              docType="bill"
              doc={{ ...savedBill, ...form, payments: savedBill.payments || form.payments }}
              currency={form.currency}
              onPaymentSaved={async () => {
                const updated = await base44.entities.Bill.get(savedBill.id).catch(() => null);
                if (updated) { setSavedBill(updated); setForm(f => ({ ...f, status: updated.status, amount_paid: updated.amount_paid, payments: updated.payments })); }
                onSave && onSave(stripAdapterFields({ ...form, ...(updated ? { status: updated.status, amount_paid: updated.amount_paid, payments: updated.payments } : {}), _skipClose: true }));
              }}
            />
          </div>
        )}

        {/* Notes & Department */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4 space-y-4">
        {/* Notes */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Notes</label>
          <textarea className="w-full min-h-[80px] rounded-md border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
            placeholder="Internal notes..."
            value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
        </div>

        {/* Department */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Department</label>
          <select className="flex h-9 w-full rounded-md border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={form.department || ""} onChange={e => set("department", e.target.value)}>
            <option value="">Select department</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        </div>

        {/* Annex files — images and documents (JPEG, PDF, etc.) */}
        <AnnexPhotosSection files={form.annex_photos || []} onChange={(files) => set("annex_photos", files)} />

        {/* History */}
        {bill?.id && (
          <DocumentHistoryPanel docType="bill" docId={bill.id} docNumber={bill.number} />
        )}

        <button type="submit" className="hidden" aria-hidden="true" />
      </form>

      <ProductPickerModal open={productPicker} onClose={() => setProductPicker(false)} onSelect={addFromProduct} />
    </div>
  );
}