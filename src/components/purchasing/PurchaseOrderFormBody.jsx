import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, Search, X, RefreshCw, BookOpen, XCircle, Printer,
  MoreVertical, ChevronDown, Sparkles, Upload, Loader2,
  Copy, Repeat, Pencil, Receipt, ExternalLink,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import ProductPickerModal from "@/components/sales/ProductPickerModal";
import LinkedRecordsSection from "@/components/sales/LinkedRecordsSection";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import DocumentHistoryPanel from "@/components/sales/DocumentHistoryPanel";
import { loadPurchasingNumberingSettings } from "@/lib/purchasingNumbering";
import { retireDocumentNumber } from "@/lib/documentNumbering";
import { uploadPrivateFile, getSignedUrl } from "@/lib/privateFile";
import AnnexPhotosSection from "@/components/shared/AnnexPhotosSection";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { CURRENCIES, toBaseAmount } from "@/lib/currency";
import ExchangeRateField from "@/components/shared/ExchangeRateField";

const STATUS_STYLES = {
  Draft:               "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
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

const DEPARTMENTS = ["Operations", "Finance", "HR", "Sales", "IT", "Field Services", "Management"];

const EMPTY = {
  number: "", reference: "", contact_id: "", contact_name: "",
  status: "Draft", issue_date: "", delivery_date: "",
  currency: "AED", subtotal: 0, discount_total: 0, tax_amount: 0, total: 0,
  exchange_rate: 1, base_total: 0,
  notes: "", title: "", doc_summary: "",
  project_id: "", project_name: "", work_order_id: "", work_order_name: "",
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

function calcDiscount(sub, discount) {
  if (!discount && discount !== 0) return 0;
  const s = String(discount).trim();
  if (s.endsWith("%")) return sub * (parseFloat(s) / 100);
  return parseFloat(s) || 0;
}

function calcLine(l) {
  const sub = (l.quantity || 0) * (l.unit_price || 0);
  const disc = calcDiscount(sub, l.discount);
  const taxable = sub - disc;
  const tax = taxable * ((l.tax_rate || 0) / 100);
  return { ...l, total: taxable + tax };
}

function recalcTotals(f) {
  const items = f.line_items || [];
  const subtotal = items.reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0);
  const discount_total = items.reduce((s, l) => {
    const sub = (l.quantity || 0) * (l.unit_price || 0);
    return s + calcDiscount(sub, l.discount);
  }, 0);
  const tax_amount = items.reduce((s, l) => {
    const sub = (l.quantity || 0) * (l.unit_price || 0);
    const disc = calcDiscount(sub, l.discount);
    return s + (sub - disc) * ((l.tax_rate || 0) / 100);
  }, 0);
  return { ...f, subtotal, discount_total, tax_amount, total: subtotal - discount_total + tax_amount };
}

async function generatePONumber() {
  const settings = await loadPurchasingNumberingSettings();
  const prefix = settings.po_prefix || "PO";
  const includeYear = settings.include_year !== false;
  const year = new Date().getFullYear();
  const all = await base44.entities.PurchaseOrder.list("-created_date", 5000).catch(() => []);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = includeYear
    ? new RegExp(`^${escaped}-(?:\\d{4}|\\d{2})-(\\d+)$`)
    : new RegExp(`^${escaped}-(\\d+)$`);
  const nums = all.map(p => p.number).filter(Boolean);
  let max = 0;
  for (const n of nums) {
    const m = n.match(regex);
    if (m) { const v = parseInt(m[1], 10); if (v > max) max = v; }
  }
  // Also count imported numbers without a year segment (e.g. PO-0001 from Xero)
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
  const { currency: baseCurrency } = useBaseCurrency();
  const formRef = useRef(null);
  const closeAfterSaveRef = useRef(false);
  const isNewDocRef = useRef(false);
  const currencyTouchedRef = useRef(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [genningNumber, setGenningNumber] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [savedPO, setSavedPO] = useState(purchaseOrder || null);

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

  useEffect(() => { setSavedPO(purchaseOrder || null); }, [purchaseOrder]);

  useEffect(() => {
    if (!active) return;
    isNewDocRef.current = !purchaseOrder;
    currencyTouchedRef.current = false;
    const base = purchaseOrder ? { ...EMPTY, ...purchaseOrder } : { ...EMPTY, currency: baseCurrency, issue_date: new Date().toLocaleDateString("en-CA") };
    base.line_items = ensureBlankRow(base.line_items || []);
    setForm(base);
    if (!(purchaseOrder)) {
      loadPurchasingNumberingSettings().then(st => {
        setForm(f => ({
          ...f,
          delivery_date: f.delivery_date || (st.po_delivery_days ? addDaysISO(f.issue_date, Number(st.po_delivery_days)) : ""),
          notes: f.notes || st.po_default_notes || "",
        }));
      });
    }
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
    setForm(f => ({ ...f, contact_id: c.id, contact_name: c.company || c.full_name, project_id: "", project_name: "", work_order_id: "", work_order_name: "" }));
    setContactSearch(c.company || c.full_name);
    setShowContactList(false);
  };

  const clearContact = () => {
    setForm(f => ({ ...f, contact_id: "", contact_name: "", project_id: "", project_name: "", work_order_id: "", work_order_name: "" }));
    setContactSearch("");
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
    const val = k === "discount" ? v : (Number(v) || v);
    const items = f.line_items.map((l, idx) => idx === i ? calcLine({ ...l, [k]: val }) : l);
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
      issue_date: new Date().toLocaleDateString("en-CA"),
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
    if (purchaseOrder.number) await retireDocumentNumber("purchase_order", purchaseOrder.number, purchaseOrder.id, "purchase order deleted");
    await base44.entities.PurchaseOrder.delete(purchaseOrder.id);
    navigate("/purchasing/purchase-orders");
  };

  const handleConvertToBill = () => {
    if (!purchaseOrder?.id) return;
    if (onConvertToBill) { onConvertToBill(purchaseOrder); return; }
    const { id, created_date, updated_date, created_by_id, number, delivery_date, status, ...rest } = purchaseOrder;
    navigate("/purchasing/bills/new", { state: { duplicate: { ...rest, status: "Draft", number: "", issue_date: new Date().toLocaleDateString("en-CA"), purchase_order_id: purchaseOrder.id, purchase_order_number: purchaseOrder.number } } });
  };

  // ── AI extraction from an uploaded PO ──
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

        {/* PO Details */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4 space-y-4">
        {/* Number + Reference */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">PO Number</label>
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
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Reference</label>
            <Input placeholder="Internal reference" value={form.reference} onChange={e => set("reference", e.target.value)} />
          </div>
        </div>

        {/* Supplier + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
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
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm space-y-0.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">Supplier</p>
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
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Delivery Date</label>
            <Input type="date" value={form.delivery_date} onChange={e => set("delivery_date", e.target.value)} />
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

        {/* Linked Project / WO */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
          <LinkedRecordsSection
            form={form}
            onChange={updates => setForm(f => ({ ...f, ...updates }))}
            contactId={form.contact_id || null}
            showTasks={false}
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

        {/* Annex Files */}
        <AnnexPhotosSection photos={form.annex_photos || []} onChange={(photos) => set("annex_photos", photos)} />

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