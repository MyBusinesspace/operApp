import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Search, X, RefreshCw, XCircle, Printer, Copy, MoreVertical, ChevronDown, Tag, Sparkles, ExternalLink, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import { addDaysISO, todayLocalISO } from "@/lib/dateOnly";
import { numberSeriesMismatch, fetchUniqueNextNumber, retireDocumentNumber } from "@/lib/documentNumbering";
import DocumentHistoryPanel, { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import ProductPickerModal from "@/components/sales/ProductPickerModal";
import LinkedRecordsSection from "@/components/sales/LinkedRecordsSection";
import AnnexPhotosSection from "@/components/shared/AnnexPhotosSection";
import QuickProductModal from "@/components/sales/QuickProductModal";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import RecordPaymentPanel from "@/components/shared/RecordPaymentPanel";
import { loadIncoterms, defaultIncoterm, getIncotermExplanation } from "@/lib/incoterms";
import { amountToWords } from "@/lib/numberToWords";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { CURRENCIES, toBaseAmount } from "@/lib/currency";
import ExchangeRateField from "@/components/shared/ExchangeRateField";
import { checkPeriodLock } from "@/lib/periodLock";
import { itemsError } from "@/lib/lineItemValidation";
import {
  amountModeLine, attachTaxAdapter, computeTotals, isAmountLine, lineSignConvention,
  lineTaxPct, normalizeAmountLines, rescaleLineTax, setLineTaxPct, stripAdapterFields, taxBlockReason,
} from "@/lib/docTaxSemantics";
import { toast } from "sonner";

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

const STATUSES_ALL = ["Draft", "Awaiting Approval", "Awaiting Payment", "Paid", "Repeating", "Cancelled"];

const EMPTY = {
  number: "", reference: "", contact_id: "", contact_name: "",
  status: "Draft", issue_date: "", due_date: "",
  currency: "AED", incoterm: "", subtotal: 0, tax_amount: 0, total: 0,
  exchange_rate: 1, base_total: 0,
  notes: "", terms: "", title: "", doc_summary: "",
  project_id: "", project_name: "", work_order_id: "", work_order_name: "",
  task_ids: [], task_names: [], task_references: [],
  line_items: [],
  annex_photos: [],
};

const getEmptyLine = (taxRates) => {
  const def = taxRates.find(r => r.is_default_invoice) ?? taxRates.find(r => r.is_default) ?? null;
  return { description: "", quantity: 1, unit_price: 0, discount: "", tax_rate: def ? def.rate : 0, total: 0 };
};

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

// A financial edit on an imported (amount) line rescales the stored tax amount from
// the line's tracked percentage instead of multiplying that amount as a percent.
function editLine(line, key, value) {
  const next = { ...line, [key]: value };
  return isAmountLine(line) ? rescaleLineTax(next) : calcLine(next);
}

// Product lines carry a native rate; in an amount document it is stored as the
// matching tax amount and tracked as that percentage from then on.
function buildProductLine(form, fields, rate) {
  const line = { ...fields, discount: fields.discount ?? "", total: 0 };
  return form?._taxMode === "amount"
    ? amountModeLine(line, rate, lineSignConvention(form))
    : calcLine({ ...line, tax_rate: rate });
}

// Totals follow the document's tax semantics: native documents keep the original
// rate math, imported documents keep their grounded amounts (and their exact stored
// figures when nothing financial changed).
function recalcTotals(f) {
  const items = f._taxMode === "amount"
    ? normalizeAmountLines(f.line_items, lineSignConvention(f))
    : (f.line_items || []);
  return { ...f, line_items: items, ...computeTotals({ ...f, line_items: items }) };
}

export default function InvoiceFormBody({ invoice, contacts = [], onSave, onClose, onPrint, onDuplicateAsInvoice, onDuplicateAsQuote, isPage = false, active = true }) {
  const navigate = useNavigate();
  const { currency: baseCurrency } = useBaseCurrency();
  const formRef = useRef(null);
  const closeAfterSaveRef = useRef(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const contactWrapRef = useRef(null);
  const contactPortalRef = useRef(null);
  const [contactRect, setContactRect] = useState(null);

  // Track the customer input position so the dropdown can render in a portal
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
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [productPicker, setProductPicker] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [incoterms, setIncoterms] = useState([]);

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

  const [quickProductRow, setQuickProductRow] = useState(null);
  const [numSettings, setNumSettings] = useState(null);
  const prevStatusRef = useRef(null);
  const isNewDocRef = useRef(false);
  const currencyTouchedRef = useRef(false);
  const accounts = useChartOfAccounts();

  const [defaultTerms, setDefaultTerms] = useState("");
  const [savedInvoice, setSavedInvoice] = useState(invoice || null);
  const savingRef = useRef(false);
  const [activeLineIdx, setActiveLineIdx] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const settings = list.find(t => t.name === "__numbering_settings__");
      if (settings) {
        try {
          const parsed = JSON.parse(settings.footer_notes || "{}");
          setNumSettings(parsed);
          if (parsed.tax_rates) setTaxRates(parsed.tax_rates);
        } catch {}
      }
      const taxRec = list.find(t => t.name === "__tax_rates__");
      if (taxRec) {
        try {
          const parsed = JSON.parse(taxRec.footer_notes || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) setTaxRates(parsed);
        } catch {}
      }
      loadIncoterms().then(setIncoterms);
      const defTemplate = list.find(t => t.is_default && (t.document_types || []).includes("invoice") && t.name !== "__numbering_settings__" && t.name !== "__tax_rates__")
        || list.find(t => (t.document_types || []).includes("invoice") && t.name !== "__numbering_settings__" && t.name !== "__tax_rates__");
      if (defTemplate?.footer_notes) setDefaultTerms(defTemplate.footer_notes);
    }).catch(() => { setNumSettings({}); });
  }, []);

  const autoNumber = async (status, currentNumber) => {
    const s = numSettings ?? {};
    if (currentNumber && !numberSeriesMismatch("invoice", currentNumber, status, s)) return currentNumber;
    setGenningNumber(true);
    const year = new Date().getFullYear();
    const num = await fetchUniqueNextNumber("invoice", status, year, s, invoice?.id || null);
    setGenningNumber(false);
    return num;
  };

  useEffect(() => {
    setSavedInvoice(invoice || null);
  }, [invoice]);

  useEffect(() => {
    if (!active || numSettings === null) return;
    isNewDocRef.current = !invoice;
    currencyTouchedRef.current = false;
    // attachTaxAdapter marks imported (amount) documents and snapshots their stored
    // financials, so a no-change save writes back the exact source figures.
    const base = invoice
      ? attachTaxAdapter({ ...EMPTY, ...invoice })
      : { ...EMPTY, currency: baseCurrency, incoterm: defaultIncoterm(incoterms, "invoice"), issue_date: todayLocalISO(), line_items: [getEmptyLine(taxRates)], terms: defaultTerms, _taxMode: "rate" };
    if (!invoice) { const dd = Number(numSettings?.invoice_due_days) || 0; if (dd > 0) base.due_date = addDaysISO(base.issue_date, dd); if (numSettings?.invoice_default_notes) base.notes = numSettings.invoice_default_notes; }
    if (!invoice) { const ds = (numSettings?.series || []).find(s => s.doc_type === "invoice" && s.is_default); base.series = ds ? ds.code : ""; }
    base.line_items = ensureBlankRow(base.line_items || [getEmptyLine(taxRates)]);
    setForm({ ...base, _showTitleSummary: !!(base.title || base.doc_summary) });
    setContactSearch(base.contact_name || "");
    setShowContactList(false);
    prevStatusRef.current = base.status || "Draft";
    const status = base.status || "Draft";
  }, [active, invoice, numSettings]);

  const set = (k, v) => {
    setForm(f => {
      const updated = { ...f, [k]: v };
      return updated;
    });
  };

  const customers = contacts;

  const handleTabIndent = (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd, value, name } = ta;
    const indent = "  ";
    let newVal, newSelStart, newSelEnd;
    if (selectionStart === selectionEnd) {
      newVal = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
      newSelStart = newSelEnd = selectionStart + indent.length;
    } else {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const block = value.slice(lineStart, selectionEnd);
      const lines = block.split("\n");
      const indented = lines.map(l => (e.shiftKey ? l.replace(/^ {1,2}/, "") : indent + l));
      newVal = value.slice(0, lineStart) + indented.join("\n") + value.slice(selectionEnd);
      newSelStart = lineStart;
      newSelEnd = lineStart + indented.join("\n").length;
    }
    set(name, newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newSelStart, newSelEnd);
    });
  };

  const generateSummary = async () => {
    const items = (form.line_items || []).filter(l => l.description);
    if (items.length === 0) return;
    setGeneratingSummary(true);
    const itemsList = items.map(l => `- ${l.description}${l.quantity > 1 ? ` (x${l.quantity})` : ""}`).join("\n");
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are writing a professional invoice summary for a service company. Based on the following line items, write a concise 2-3 sentence scope-of-work summary paragraph suitable for a client-facing invoice document. Be professional and specific.\n\nLine items:\n${itemsList}\n\nCustomer: ${form.contact_name || ""}\nTitle: ${form.title || ""}\n\nWrite only the summary paragraph, no headings or labels.`,
    });
    setForm(f => ({ ...f, doc_summary: result }));
    setGeneratingSummary(false);
  };

  const setContact = (c) => {
    setForm(f => ({ ...f, contact_id: c.id, contact_name: c.company || c.full_name, project_id: "", project_name: "", work_order_id: "", work_order_name: "", task_ids: [], task_names: [], task_references: [] }));
    setContactSearch(c.company || c.full_name);
    setShowContactList(false);
  };

  const clearContact = () => {
    setForm(f => ({ ...f, contact_id: "", contact_name: "", project_id: "", project_name: "", work_order_id: "", work_order_name: "", task_ids: [], task_names: [], task_references: [] }));
    setContactSearch("");
  };

  const filteredCustomers = customers.filter(c => {
    const q = contactSearch.toLowerCase();
    return (c.company || c.full_name).toLowerCase().includes(q) || c.full_name.toLowerCase().includes(q);
  });

  const ensureBlankRow = (items) => {
    const list = [...(items || [])];
    const last = list[list.length - 1];
    const lastIsBlank = last && !last.description && !last.unit_price && !last.item_code;
    if (!lastIsBlank) list.push(getEmptyLine(taxRates));
    return list;
  };

  const insertBeforeBlank = (items, newLine) => {
    const list = [...(items || [])];
    const lastIdx = list.length - 1;
    const lastIsBlank = list.length > 0 && !list[lastIdx].description && !list[lastIdx].unit_price && !list[lastIdx].item_code;
    if (lastIsBlank) { list.splice(lastIdx, 0, newLine); return list; }
    return [...list, newLine];
  };
  const addLine = () => setForm(f => ({ ...f, line_items: ensureBlankRow(f.line_items || []) }));
  const addFromProduct = (p) => setForm(f => {
    const newLine = buildProductLine(f, { item_code: p.code || "", description: p.sale_description || p.name, quantity: 1, unit_price: p.sale_price || 0 }, p.sale_tax_rate || 0);
    return recalcTotals({ ...f, line_items: insertBeforeBlank(f.line_items, newLine) });
  });
  const removeLine = (i) => setForm(f => {
    const items = f.line_items.filter((_, idx) => idx !== i);
    return recalcTotals({ ...f, line_items: items });
  });
  const updateLine = (i, k, v) => setForm(f => {
    const val = k === "discount" ? v : (Number(v) || v);
    const items = f.line_items.map((l, idx) => idx === i ? editLine(l, k, val) : l);
    return recalcTotals({ ...f, line_items: ensureBlankRow(items) });
  });

  // Tax input: imported lines show the percentage implied by their stored amount and
  // write the matching amount back; native lines keep storing the rate itself.
  const updateLineTax = (i, pct) => setForm(f => {
    const items = f.line_items.map((l, idx) => idx !== i ? l : (f._taxMode === "amount" ? setLineTaxPct(l, pct) : calcLine({ ...l, tax_rate: pct })));
    return recalcTotals({ ...f, line_items: ensureBlankRow(items) });
  });
  const taxValueOf = (l) => (isAmountLine(l) ? lineTaxPct(l, form) : l.tax_rate);

  const quickStatus = async (newStatus) => {
    if (!invoice?.id) return;
    const lineItemsProblem = itemsError(form.line_items, newStatus);
    if (lineItemsProblem) { toast.error(lineItemsProblem); return; }
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    if (newStatus === "Paid" && (Number(form.amount_paid) || 0) < (Number(form.total) || 0) - 0.005) {
      toast.error("Record the payment first (Record Payment section). An invoice becomes Paid only when its payments cover the total.");
      setSaving(false); return;
    }
    let updated = { ...form, status: newStatus };
    if (newStatus === "Awaiting Payment" && !form.issue_date) {
      const v = prompt("This invoice has no issue date. Enter the issue date (YYYY-MM-DD):", todayLocalISO());
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) { toast.error("A valid issue date is required to approve this invoice."); setSaving(false); return; }
      updated = { ...updated, issue_date: v.trim(), due_date: form.due_date || v.trim() };
    }
    if (newStatus === "Cancelled" && Number(form.amount_paid) > 0) { toast.error("Cannot void an invoice with payments. Remove the payments first."); setSaving(false); return; }
    if (newStatus === "Cancelled" && !confirm("Anular (void) this invoice? It stays in the records as Anulada and its journal is reversed.")) { setSaving(false); return; }
    const taxBlocked = taxBlockReason(form);
    if (taxBlocked) { toast.error(taxBlocked); setSaving(false); return; }
    setForm(updated);
    await onSave(stripAdapterFields(updated));
    await logDocumentHistory({ docType: "invoice", docId: invoice.id, docNumber: form.number, action: "Status Changed", detail: `Status changed from ${form.status} to ${newStatus}`, userName });
    setSaving(false);
  };

  const handleDeleteInvoice = async () => {
    if (!invoice?.id) return;
    if (!["Draft", "Awaiting Approval"].includes(invoice.status) || invoice.number) {
      toast.error("An approved or numbered invoice cannot be deleted. Void it instead (Anular).");
      return;
    }
    if (!confirm("Delete this draft invoice? This action cannot be undone.")) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    if (invoice.number) await retireDocumentNumber("invoice", invoice.number, invoice.id, "invoice deleted");
    await logDocumentHistory({ docType: "invoice", docId: null, docNumber: invoice.number, action: "Deleted", detail: `Invoice ${invoice.number} deleted. Number retired.`, userName });
    await base44.entities.Invoice.delete(invoice.id);
    navigate("/sales/invoices");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const lineItemsProblem = itemsError(form.line_items, form.status);
    if (lineItemsProblem) { toast.error(lineItemsProblem); return; }
    const taxBlocked = taxBlockReason(form);
    if (taxBlocked) { toast.error(taxBlocked); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    const isNew = !invoice?.id;

    // Period lock — block saves dated before the accounting lock date
    const { locked, lockDate, error: lockReadError } = await checkPeriodLock(form.issue_date);
    if (locked) {
      toast.error(lockReadError
        ? "The accounting lock date could not be loaded, so the period is treated as locked. Nothing was saved — try again in a moment."
        : `Date is before the period lock date (${lockDate}). Unlock the period in accounting settings.`);
      savingRef.current = false;
      setSaving(false);
      return;
    }

    const created = await onSave(stripAdapterFields(form), { close: closeAfterSaveRef.current });
    if (isNew) {
      await logDocumentHistory({ docType: "invoice", docId: created?.id, docNumber: created?.number || form.number || "", action: "Created", detail: `Invoice ${created?.number || "(draft)"} created for ${form.contact_name}`, userName });
    } else {
      const statusChanged = prevStatusRef.current && prevStatusRef.current !== form.status;
      if (statusChanged) {
        await logDocumentHistory({ docType: "invoice", docId: invoice.id, docNumber: form.number, action: "Status Changed", detail: `Status changed from ${prevStatusRef.current} to ${form.status}`, userName });
      } else {
        await logDocumentHistory({ docType: "invoice", docId: invoice.id, docNumber: form.number, action: "Updated", detail: `Invoice ${form.number} updated`, userName });
      }
    }
    setHistoryRefresh(r => r + 1);
    savingRef.current = false;
    setSaving(false);
    closeAfterSaveRef.current = false;
  };

  const titleText = invoice?.id ? "Edit Invoice" : "New Invoice";

  const headerActions = (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* Save split-button */}
      <div className="flex items-stretch rounded-md border border-input shadow-sm overflow-hidden">
        <Button type="button" variant="outline" disabled={saving || !form.contact_id}
          className="rounded-none border-0 px-4 h-9 text-sm"
          onClick={() => { closeAfterSaveRef.current = false; formRef.current?.requestSubmit(); }}
        >
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

      {/* Primary action split-button */}
      {(() => {
        const primaryLabel =
          !invoice?.id ? "Submit for Approval" :
          form.status === "Draft" ? "Submit for Approval" :
          form.status === "Awaiting Approval" ? "Approve" :
          form.status === "Awaiting Payment" ? "Mark as Paid" : null;

        if (!primaryLabel) return null;

        const primaryAction = async () => {
          // Submit for Approval / Approve / Mark as Paid all activate the invoice.
          const lineItemsProblem = itemsError(form.line_items, form.status);
          if (lineItemsProblem) { toast.error(lineItemsProblem); return; }
          const taxBlocked = taxBlockReason(form);
          if (taxBlocked) { toast.error(taxBlocked); return; }
          if (!invoice?.id) {
            setSaving(true);
            const savedForm = { ...form, status: "Awaiting Approval" };
            const created = await onSave(stripAdapterFields(savedForm));
            const user = await base44.auth.me().catch(() => null);
            const userName = user?.full_name || user?.email || "Unknown";
            await logDocumentHistory({ docType: "invoice", docId: created?.id, docNumber: created?.number || "", action: "Created", detail: `Invoice ${created?.number || "(draft)"} created for ${form.contact_name}`, userName });
            setHistoryRefresh(r => r + 1);
            setSaving(false);
          } else if (form.status === "Draft") quickStatus("Awaiting Approval");
          else if (form.status === "Awaiting Approval") quickStatus("Awaiting Payment");
          else if (form.status === "Awaiting Payment") quickStatus("Paid");
        };

        return (
          <div className="flex items-stretch rounded-md overflow-hidden shadow-sm">
            <Button type="button" disabled={saving || !form.contact_id}
              className="rounded-none bg-blue-600 hover:bg-blue-700 text-white px-4 h-9 border-0 text-sm"
              onClick={primaryAction}>
              {primaryLabel}
            </Button>
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

      {/* ⋮ more menu — only show when editing an existing invoice */}
      {invoice?.id && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={saving} className="h-9 w-9">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => (onPrint ? onPrint(invoice) : window.print())}>
            <Printer className="w-4 h-4 mr-2" /> Print PDF
          </DropdownMenuItem>
          {invoice?.id && onDuplicateAsInvoice && (
            <DropdownMenuItem onClick={() => { onClose(); onDuplicateAsInvoice(invoice); }}>
              <Copy className="w-4 h-4 mr-2" /> Duplicate
            </DropdownMenuItem>
          )}
          {invoice?.id && onDuplicateAsQuote && (
            <DropdownMenuItem onClick={() => { onClose(); onDuplicateAsQuote(invoice); }}>
              <Copy className="w-4 h-4 mr-2" /> Copy to draft quote
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <Pencil className="w-4 h-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeleteInvoice}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </DropdownMenuItem>
          {invoice?.id && !["Paid", "Repeating", "Cancelled"].includes(form.status) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => quickStatus("Cancelled")}>
                <XCircle className="w-4 h-4 mr-2" /> Anular factura (Void)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  );

  const header = isPage ? (
    <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-b border-border sticky top-0 bg-card z-20">
      <h1 className="text-lg font-semibold leading-none tracking-tight">{titleText}</h1>
      {headerActions}
    </div>
  ) : (
    <DialogHeader>
      <div className="flex items-center justify-between gap-3">
        <DialogTitle>{titleText}</DialogTitle>
        {headerActions}
      </div>
    </DialogHeader>
  );

  const formClassName = isPage ? "space-y-5 pt-2 px-6 py-6" : "space-y-5 pt-2";

  return (
    <>
      {header}
      <form ref={formRef} onSubmit={handleSubmit} className={formClassName} onClick={() => { setShowContactList(false); }}>
        {/* Invoice Details */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4 space-y-4">
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex gap-3">
            {(numSettings?.series || []).some(s => s.doc_type === "invoice") && (
              <div className="w-1/3 min-w-[120px]">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Series</label>
                <select
                  value={form.series || ""}
                  onChange={e => set("series", e.target.value)}
                  disabled={!!form.number}
                  title={form.number ? "Series is locked once the invoice is numbered." : ""}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
                >
                  <option value="">Standard (INV)</option>
                  {(numSettings?.series || []).filter(s => s.doc_type === "invoice").map(s => (
                    <option key={s.code} value={s.code}>{s.code}{s.label ? " - " + s.label : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Invoice Number</label>
              <Input
                placeholder="Assigned on approval"
                value={form.number || ""}
                readOnly
                disabled
                className="bg-muted/40"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Reference</label>
            <Input placeholder="Customer / internal ref" value={form.reference} onChange={e => set("reference", e.target.value)} />
          </div>
        </div>

        {/* Customer + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div ref={contactWrapRef} className="relative">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
              Customer <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 pr-8"
                placeholder="Search customer..."
                value={contactSearch}
                onChange={e => { setContactSearch(e.target.value); setShowContactList(true); }}
                onFocus={() => { if (contactSearch.length > 0) setShowContactList(true); }}
                autoComplete="off"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filteredCustomers.length > 0) setContact(filteredCustomers[0]);
                  }
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
                {filteredCustomers.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button key={c.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={(e) => { e.stopPropagation(); setContact(c); }}>
                        <span className="font-medium">{c.company || c.full_name}</span>
                        {c.company && c.full_name !== c.company && (
                          <span className="text-xs text-muted-foreground ml-1.5">{c.full_name}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : contactSearch ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2 text-primary"
                    onClick={async (e) => { e.stopPropagation();
                      const created = await base44.entities.Contact.create({ full_name: contactSearch, type: "Customer", status: "Active" });
                      setContact({ id: created.id, full_name: created.full_name, company: created.company });
                    }}
                  >
                    <span className="text-lg leading-none">+</span>
                    Create <span className="font-medium mx-1">"{contactSearch}"</span> as a new customer
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

        {/* Title & Summary toggle */}
        {form._showTitleSummary ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Title</label>
              <Input placeholder="e.g. Office Maintenance Services" value={form.title || ""} onChange={e => set("title", e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Summary</label>
                <button
                  type="button"
                  onClick={generateSummary}
                  disabled={generatingSummary || (form.line_items || []).filter(l => l.description).length === 0}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                  title="Generate summary from line items"
                >
                  <Sparkles className="w-3 h-3" />
                  {generatingSummary ? "Generating..." : "Generate with AI"}
                </button>
              </div>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                placeholder="Brief description of the scope of work..."
                value={form.doc_summary || ""}
                onChange={e => set("doc_summary", e.target.value)}
              />
            </div>
            <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={() => setForm(f => ({ ...f, _showTitleSummary: false, title: "", doc_summary: "" }))}>
              <X className="w-3 h-3" /> Remove title &amp; summary
            </button>
          </div>
        ) : (
          <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={() => setForm(f => ({ ...f, _showTitleSummary: true }))}>
            <Plus className="w-3 h-3" /> Add a title &amp; summary
          </button>
        )}

        {/* Dates + Currency + Exchange Rate + Incoterm */}
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Issue Date</label>
            <Input type="date" value={form.issue_date} onChange={e => set("issue_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Due Date</label>
            <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
            <div className="flex gap-1.5 mt-1.5">
              {[7, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors border border-border"
                  onClick={() => {
                    set("due_date", addDaysISO(form.issue_date || todayLocalISO(), days));
                  }}
                >
                  +{days}d
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Currency</label>
            <Select value={form.currency} onValueChange={v => { currencyTouchedRef.current = true; set("currency", v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ExchangeRateField
            currency={form.currency}
            exchangeRate={form.exchange_rate}
            total={form.total}
            baseCurrency={baseCurrency}
            onChange={r => set("exchange_rate", r)}
          />
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Incoterm</label>
            <Select value={form.incoterm || ""} onValueChange={v => set("incoterm", v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>— None —</SelectItem>
                {incoterms.filter(i => i.code).map(i => (
                  <SelectItem key={i.code} value={i.code}>{i.code} — {i.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        </div>

        {/* Line Items */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Line Items</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={addLine}>
                <Plus className="w-3 h-3" /> Add Line
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setProductPicker(true)}>
                <Tag className="w-3 h-3" /> From catalog
              </Button>
            </div>
          </div>
          <div className="border border-slate-400 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:bg-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                 <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-24">Item</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-40">Account</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-20">Qty</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-28">Unit Price</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-20">Disc.</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-20">Tax %</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide w-28">Total</th>
                  <th className="w-8"></th>
                 </tr>
               </thead>
              <tbody>
                {(form.line_items || []).length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-4 text-center text-xs text-muted-foreground">No line items yet. Click "Add Line" to start.</td></tr>
                ) : (
                (form.line_items || []).map((l, i) => (
                  <tr key={i} className={`border-t border-slate-200 dark:border-slate-700 transition-colors ${activeLineIdx === i ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                    <td className="px-2 py-1.5 w-24">
                      {l.item_code ? (
                          <span className="inline-block px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono font-medium text-foreground whitespace-nowrap">{l.item_code}</span>
                        ) : (
                          <button
                            type="button"
                            title="Create new product / service for this line"
                            onClick={e => { e.stopPropagation(); setQuickProductRow(i); }}
                            className="w-6 h-6 rounded border border-dashed border-muted-foreground/40 hover:border-primary hover:text-primary text-muted-foreground/50 flex items-center justify-center transition-colors"
                          >
                            <Tag className="w-3 h-3" />
                          </button>
                        )}
                    </td>
                    <td className="px-2 py-1.5">
                      <textarea
                          className="w-full text-xs border-0 bg-transparent focus-visible:outline-none focus-visible:ring-0 px-1 py-0 resize-none overflow-hidden leading-5"
                          rows={1}
                          placeholder="Description..."
                          value={l.description}
                          onChange={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; updateLine(i, "description", e.target.value); }}
                          onFocus={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; setActiveLineIdx(i); }}
                          onKeyDown={e => {
                            if (e.key === "Tab" && !e.shiftKey) {
                              e.preventDefault();
                              e.currentTarget.closest("tr")?.querySelector("[data-col='qty']")?.focus();
                            }
                          }}
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
                      value={l.quantity === 0 ? "" : l.quantity} placeholder="" onChange={e => updateLine(i, "quantity", e.target.value)}
                       data-col="qty"
                       onFocus={() => {
                         setForm(f => {
                           const items = f.line_items || [];
                           if (i === items.length - 1 && (l.description || l.unit_price)) {
                             return { ...f, line_items: ensureBlankRow(items) };
                           }
                           return f;
                         });
                       }}
                       onKeyDown={e => {
                         if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                           e.preventDefault();
                           e.currentTarget.closest("tr")?.querySelector("[data-col='price']")?.focus();
                         }
                       }} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1" type="number" min="0" step="0.01"
                        value={l.unit_price === 0 ? "" : l.unit_price} placeholder="" onChange={e => updateLine(i, "unit_price", e.target.value)}
                        data-col="price"
                        onKeyDown={e => {
                          if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                            e.preventDefault();
                            const isLast = i === (form.line_items || []).length - 1;
                            if (isLast) {
                              addLine();
                              setTimeout(() => {
                                const rows = document.querySelectorAll("table tbody tr");
                                const newRow = rows[rows.length - 1];
                                newRow?.querySelector("textarea")?.focus();
                              }, 50);
                            } else {
                              const nextRow = e.currentTarget.closest("tr")?.nextElementSibling;
                              nextRow?.querySelector("textarea")?.focus();
                            }
                          }
                        }} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                        placeholder=""
                        value={l.discount || ""}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*%?$/.test(v)) updateLine(i, "discount", v);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {taxRates.length > 0 ? (
                        <select
                          className="h-7 text-xs border border-input rounded-md bg-transparent px-2 w-full focus:outline-none focus:ring-1 focus:ring-ring"
                          value={taxValueOf(l)}
                          onChange={e => updateLineTax(i, e.target.value)}
                        >
                          {isAmountLine(l) && !taxRates.some(tr => Number(tr.rate) === lineTaxPct(l, form)) && (
                            <option value={lineTaxPct(l, form)}>{lineTaxPct(l, form)}%</option>
                          )}
                          {taxRates.map((tr, ti) => (
                            <option key={ti} value={tr.rate}>{tr.rate}%</option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 w-14"
                          type="number" min="0" max="100"
                          value={taxValueOf(l)}
                          onChange={e => updateLineTax(i, e.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">
                      {l.total?.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive transition-colors">
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
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{form.subtotal?.toFixed(2)} {form.currency}</span>
                </div>
                {form.discount_total > 0 && (
                  <div className="flex justify-between font-semibold text-green-600">
                    <span>Discount</span>
                    <span className="tabular-nums">-{form.discount_total?.toFixed(2)} {form.currency}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{form.tax_amount?.toFixed(2)} {form.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-foreground border-t-2 border-border pt-2 mt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{form.total?.toFixed(2)} {form.currency}</span>
                </div>
                {Number(form.total || 0) > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground italic leading-snug">
                    <span className="not-italic font-medium text-foreground/70">Amount in words:</span> {amountToWords(form.total, form.currency)}
                  </div>
                )}
                {form.incoterm && (() => {
                  const expl = getIncotermExplanation(incoterms, form.incoterm);
                  return expl ? (
                    <div className="text-[11px] text-muted-foreground leading-snug">
                      <span className="font-semibold text-foreground/70">{form.incoterm}</span> — {expl}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Record Payment — shown when invoice exists and is Awaiting Payment or Paid */}
        {savedInvoice?.id && ["Awaiting Payment", "Paid"].includes(form.status) && (
          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-5 py-4">
            <RecordPaymentPanel
              docType="invoice"
              doc={{ ...savedInvoice, ...form, payments: savedInvoice.payments || form.payments }}
              currency={form.currency}
              onPaymentSaved={async () => {
                const updated = await base44.entities.Invoice.filter({ id: savedInvoice.id }).catch(() => []);
                if (updated[0]) { setSavedInvoice(updated[0]); setForm(f => ({ ...f, status: updated[0].status, amount_paid: updated[0].amount_paid, payments: updated[0].payments })); }
                onSave && onSave(stripAdapterFields({ ...form, ...(updated[0] ? { status: updated[0].status, amount_paid: updated[0].amount_paid, payments: updated[0].payments } : {}), _skipClose: true }));
              }}
            />
          </div>
        )}

        {/* Linked Operations */}
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-5 py-4">
          <LinkedRecordsSection
            form={form}
            onChange={updates => setForm(f => ({ ...f, ...updates }))}
            contactId={form.contact_id || null}
          />
        </div>

        {/* Notes & Terms */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Notes</label>
            <p className="text-xs text-transparent mb-1.5 select-none">&nbsp;</p>
            <textarea
              name="notes"
              className="w-full h-[240px] resize-none rounded-md border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Internal notes..."
              value={form.notes || ""}
              onChange={e => set("notes", e.target.value)}
              onKeyDown={handleTabIndent}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Terms &amp; Conditions</label>
            <p className="text-xs text-muted-foreground/70 mb-1.5">Shown on the printed / PDF document.</p>
            <textarea
              name="terms"
              className="w-full h-[240px] resize-none rounded-md border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Payment terms, conditions..."
              value={form.terms || ""}
              onChange={e => set("terms", e.target.value)}
              onKeyDown={handleTabIndent}
            />
          </div>
        </div>
        </div>

        {/* Annex Files */}
        <AnnexPhotosSection photos={form.annex_photos || []} onChange={(photos) => set("annex_photos", photos)} />

        {/* History & Notes — only when editing existing invoice */}
        {invoice?.id && (
          <DocumentHistoryPanel
            docType="invoice"
            docId={invoice.id}
            docNumber={invoice.number}
            refreshTrigger={historyRefresh}
          />
        )}

        {/* Hidden submit */}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>

      <ProductPickerModal
        open={productPicker}
        onClose={() => setProductPicker(false)}
        onSelect={addFromProduct}
      />
      <QuickProductModal
        open={quickProductRow !== null}
        onClose={() => setQuickProductRow(null)}
        onCreated={(p) => {
          if (quickProductRow !== null) {
            setForm(f => {
              const items = f.line_items.map((l, idx) => idx === quickProductRow
                ? buildProductLine(f, { ...l, item_code: p.code, description: p.sale_description || p.name, unit_price: p.sale_price || 0 }, p.sale_tax_rate || 0)
                : l
              );
              return recalcTotals({ ...f, line_items: items });
            });
          }
          setQuickProductRow(null);
        }}
      />
    </>
  );
}