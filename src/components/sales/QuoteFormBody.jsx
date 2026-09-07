import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Search, X, RefreshCw, Send, CheckCircle2, XCircle, Receipt, Printer, Copy, ChevronDown, MoreVertical, Sparkles, ExternalLink, Share2, Tag, Pencil, Repeat } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import { numberSeriesMismatch, fetchUniqueNextNumber, retireDocumentNumber } from "@/lib/documentNumbering";
import { useToast } from "@/components/ui/use-toast";
import DocumentHistoryPanel, { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import ProductPickerModal from "@/components/sales/ProductPickerModal";
import QuickProductModal from "@/components/sales/QuickProductModal";
import LinkedRecordsSection from "@/components/sales/LinkedRecordsSection";
import SendQuoteModal from "@/components/sales/SendQuoteModal";
import CopyQuoteToModal from "@/components/sales/CopyQuoteToModal";
import DocumentFilesPopover from "@/components/shared/DocumentFilesPopover";
import { loadIncoterms, defaultIncoterm, getIncotermExplanation } from "@/lib/incoterms";
import { amountToWords } from "@/lib/numberToWords";

const STATUSES_ALL = ["Draft", "Sent", "Accepted", "Declined", "Invoiced", "Cancelled"];
const getAvailableStatuses = (currentStatus) => {
  if (!currentStatus || currentStatus === "Draft") return STATUSES_ALL;
  return STATUSES_ALL.filter(s => s !== "Draft");
};
const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR"];

const EMPTY = {
  number: "", reference: "", contact_id: "", contact_name: "",
  status: "Draft", issue_date: "", expiry_date: "",
  currency: "AED", incoterm: "", subtotal: 0, tax_amount: 0, total: 0,
  notes: "", title: "", doc_summary: "",
  project_id: "", project_name: "", work_order_id: "", work_order_name: "",
  task_ids: [], task_names: [], task_references: [],
  line_items: [],
  annex_photos: [],
};

const getEmptyLine = (taxRates) => {
  const def = taxRates.find(r => r.is_default_quote) ?? taxRates.find(r => r.is_default) ?? null;
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

export default function QuoteFormBody({ quote, contacts = [], onSave, onClose, onPrint, onConvertToInvoice, isPage = false, active = true }) {
  const formRef = useRef(null);
  const closeAfterSaveRef = useRef(false);
  const savingRef = useRef(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [genningNumber, setGenningNumber] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [productPicker, setProductPicker] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [incoterms, setIncoterms] = useState([]);

  const [sendModal, setSendModal] = useState(false);
  const [copyToModal, setCopyToModal] = useState(false);
  const [declineModal, setDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [numSettings, setNumSettings] = useState(null);
  const prevStatusRef = useRef(null);
  const pendingInitRef = useRef(null);

  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState(null);
  const [activeLineIdx, setActiveLineIdx] = useState(null);
  const [quickProductRow, setQuickProductRow] = useState(null);
  const navigate = useNavigate();

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
      prompt: `You are writing a professional quote summary for a service company. Based on the following line items, write a concise 2-3 sentence scope-of-work summary paragraph suitable for a client-facing quote document. Be professional and specific.\n\nLine items:\n${itemsList}\n\nCustomer: ${form.contact_name || ""}\nTitle: ${form.title || ""}\n\nWrite only the summary paragraph, no headings or labels.`,
    });
    setForm(f => ({ ...f, doc_summary: result }));
    setGeneratingSummary(false);
  };

  const autoNumber = async (status, currentNumber, settings) => {
    const s = settings ?? numSettings ?? {};
    if (currentNumber && !numberSeriesMismatch("quote", currentNumber, status, s)) return currentNumber;
    setGenningNumber(true);
    const year = new Date().getFullYear();
    const num = await fetchUniqueNextNumber("quote", status, year, s, quote?.id || null);
    setGenningNumber(false);
    return num;
  };

  const initForm = (q, settings, defaultTemplate) => {
    const templateTerms = defaultTemplate?.quote_terms || "";
    const base = q ? { ...EMPTY, ...q } : { ...EMPTY, incoterm: defaultIncoterm(incoterms, "quote"), issue_date: new Date().toISOString().slice(0, 10), line_items: [getEmptyLine(taxRates)], terms: templateTerms };
    setForm({ ...base, _showTitleSummary: !!(base.title || base.doc_summary) });
    setContactSearch(q?.contact_name || "");
    setShowContactList(false);
    prevStatusRef.current = base.status || "Draft";
    const status = base.status || "Draft";
    if (!base.number || numberSeriesMismatch("quote", base.number, status, settings)) {
      autoNumber(status, base.number, settings).then(num => setForm(f => ({ ...f, number: num })));
    }
  };

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const settings = list.find(t => t.name === "__numbering_settings__");
      let parsed = {};
      if (settings) {
        try { parsed = JSON.parse(settings.footer_notes || "{}"); } catch {}
        if (parsed.tax_rates) setTaxRates(parsed.tax_rates);
      }
      const taxRec = list.find(t => t.name === "__tax_rates__");
      if (taxRec) {
        try {
          const tr = JSON.parse(taxRec.footer_notes || "[]");
          if (Array.isArray(tr) && tr.length > 0) setTaxRates(tr);
        } catch {}
      }
      loadIncoterms().then(setIncoterms);
      const defTpl = list.find(t => t.is_default && t.document_types?.includes("quote")) || list.find(t => t.document_types?.includes("quote")) || null;
      setDefaultTemplate(defTpl);
      setNumSettings(parsed);
      if (pendingInitRef.current) {
        initForm(pendingInitRef.current.quote, parsed, defTpl);
        pendingInitRef.current = null;
      }
    }).catch(() => { setNumSettings({}); });
  }, []);

  useEffect(() => {
    if (!active) return;
    if (numSettings === null) {
      pendingInitRef.current = { quote };
      return;
    }
    initForm(quote, numSettings, defaultTemplate);
  }, [active, quote]);

  const set = (k, v) => {
    setForm(f => {
      const updated = { ...f, [k]: v };
      if (k === "status" && numberSeriesMismatch("quote", f.number, v, numSettings ?? {})) {
        autoNumber(v, null, numSettings ?? {}).then(num => setForm(ff => ({ ...ff, number: num })));
      }
      return updated;
    });
  };

  const customers = contacts;
  const selectedContact = contacts.find(c => c.id === form.contact_id) || null;

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

  const insertBeforeBlank = (items, newLine) => {
    const list = [...(items || [])];
    const lastIdx = list.length - 1;
    const lastIsBlank = list.length > 0 && !list[lastIdx].description && !list[lastIdx].unit_price && !list[lastIdx].item_code;
    if (lastIsBlank) { list.splice(lastIdx, 0, newLine); return list; }
    return [...list, newLine];
  };
  const addLine = () => setForm(f => ({ ...f, line_items: [...(f.line_items || []), getEmptyLine(taxRates)] }));
  const addFromProduct = (p) => {
    const newLine = calcLine({ item_code: p.code || "", description: p.sale_description || p.name, quantity: 1, unit_price: p.sale_price || 0, tax_rate: p.sale_tax_rate || 0, total: 0 });
    setForm(f => {
      const items = [...(f.line_items || [])];
      const line = items[activeLineIdx];
      if (line && !line.item_code && !line.description && !line.unit_price) {
        items[activeLineIdx] = newLine;
        return recalcTotals({ ...f, line_items: items });
      }
      return recalcTotals({ ...f, line_items: insertBeforeBlank(items, newLine) });
    });
  };
  const removeLine = (i) => setForm(f => {
    const items = f.line_items.filter((_, idx) => idx !== i);
    return recalcTotals({ ...f, line_items: items });
  });
  const updateLine = (i, k, v) => setForm(f => {
    const val = k === "discount" ? v : (Number(v) || v);
    let items = f.line_items.map((l, idx) => idx === i ? calcLine({ ...l, [k]: val }) : l);
    const last = items[items.length - 1];
    const lastIsBlank = last && !last.description && !last.unit_price && !last.item_code;
    if (!lastIsBlank) items = [...items, getEmptyLine(taxRates)];
    return recalcTotals({ ...f, line_items: items });
  });

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

  const quickStatus = async (newStatus) => {
    if (!quote?.id) return;
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    const updated = { ...form, status: newStatus };
    setForm(updated);
    await onSave(updated);
    await logDocumentHistory({ docType: "quote", docId: quote.id, docNumber: form.number, action: "Status Changed", detail: `Status changed from ${form.status} to ${newStatus}`, userName });
    setSaving(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    const isNew = !quote?.id;
    try {
      await onSave(form);
      if (isNew) {
        const allQ = await base44.entities.Quote.filter({ number: form.number }).catch(() => []);
        const created = allQ[0];
        const amt = Number(form.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        await logDocumentHistory({ docType: "quote", docId: created?.id, docNumber: form.number, action: "Created", detail: `Quote ${form.number} to ${form.contact_name} for ${amt} ${form.currency}`, userName });
      } else if (prevStatusRef.current && prevStatusRef.current !== form.status) {
        await logDocumentHistory({ docType: "quote", docId: quote.id, docNumber: form.number, action: "Status Changed", detail: `Status changed from ${prevStatusRef.current} to ${form.status}`, userName });
      }
      setHistoryRefresh(r => r + 1);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (closeAfterSaveRef.current) {
      closeAfterSaveRef.current = false;
      onClose();
    }
  };

  const handleDeleteQuote = async () => {
    if (!quote?.id) return;
    if (!confirm("Delete this quote? This action will be permanently recorded in history.")) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await logDocumentHistory({ docType: "quote", docId: null, docNumber: quote.number, action: "Deleted", detail: `Quote ${quote.number} deleted (${form.contact_name || ""}). Number retired.`, userName });
    await base44.entities.Quote.delete(quote.id);
    onClose();
  };

  const handleDuplicateQuote = () => {
    const src = quote?.id ? quote : form;
    const { id, created_date, updated_date, created_by_id, ...rest } = src;
    navigate("/sales/quotes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const titleText = quote ? "Edit Quote" : "New Quote";

  const headerActions = (
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

      {/* Primary action split-button */}
      {(() => {
        if (!quote?.id) {
          return (
            <div className="flex items-stretch rounded-md overflow-hidden shadow-sm">
              <Button type="button" disabled={saving || !form.contact_id}
                className="rounded-none bg-blue-600 hover:bg-blue-700 text-white px-4 h-9 border-0 text-sm"
                onClick={async () => {
                  setSaving(true);
                  const user = await base44.auth.me().catch(() => null);
                  const userName = user?.full_name || user?.email || "Unknown";
                  const savedForm = { ...form, status: "Sent" };
                  await onSave(savedForm);
                  const allQ = await base44.entities.Quote.filter({ number: form.number }).catch(() => []);
                  const created = allQ[0];
                  const amt = Number(form.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  await logDocumentHistory({ docType: "quote", docId: created?.id, docNumber: form.number, action: "Created", detail: `Quote ${form.number} to ${form.contact_name} for ${amt} ${form.currency}`, userName });
                  setSaving(false);
                }}>
                Save & Mark as Sent
              </Button>
            </div>
          );
        }
        const primaryLabel =
          form.status === "Draft" ? "Mark as Sent" :
          form.status === "Sent" ? "Mark as Accepted" :
          form.status === "Accepted" ? "Create Invoice" : null;
        if (!primaryLabel) return null;
        const primaryAction = () => {
          if (form.status === "Draft") quickStatus("Sent");
          else if (form.status === "Sent") quickStatus("Accepted");
          else if (form.status === "Accepted" && onConvertToInvoice) { onClose(); onConvertToInvoice(quote); }
        };
        return (
          <div className="flex items-stretch rounded-md overflow-hidden shadow-sm">
            <Button type="button" disabled={saving}
              className="rounded-none bg-blue-600 hover:bg-blue-700 text-white px-4 h-9 border-0 text-sm"
              onClick={primaryAction}>
              {primaryLabel}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" disabled={saving}
                  className="rounded-none bg-blue-600 hover:bg-blue-700 text-white border-l border-blue-500 px-2 h-9">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {form.status === "Draft" && (
                  <DropdownMenuItem onClick={() => setSendModal(true)}>
                    <Send className="w-4 h-4 mr-2" /> Send / Share link
                  </DropdownMenuItem>
                )}
                {form.status === "Sent" && (
                  <>
                    <DropdownMenuItem onClick={() => setSendModal(true)}>
                      <Send className="w-4 h-4 mr-2" /> Send / Share link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => quickStatus("Accepted")}>Mark as Accepted</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setDeclineReason(""); setDeclineModal(true); }}>Mark as Declined</DropdownMenuItem>
                  </>
                )}
                {form.status === "Accepted" && (
                  <DropdownMenuItem onClick={() => quickStatus("Sent")}>Unmark as Accepted</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })()}

      {/* ⋮ more menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={saving} className="h-9 w-9">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {onPrint && quote?.id && (
            <DropdownMenuItem onClick={() => onPrint(quote)}>
              <Printer className="w-4 h-4 mr-2" /> Print PDF
            </DropdownMenuItem>
          )}
          {quote?.id && (
            <DropdownMenuItem onClick={handleDuplicateQuote}>
              <Repeat className="w-4 h-4 mr-2" /> Duplicate
            </DropdownMenuItem>
          )}
          {quote?.id && (
            <DropdownMenuItem onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </DropdownMenuItem>
          )}
          {quote?.id && (
            <DropdownMenuItem onClick={() => setSendModal(true)}>
              <Send className="w-4 h-4 mr-2" /> Send
            </DropdownMenuItem>
          )}
          {quote?.id && ["Draft", "Sent"].includes(form.status) && (
            <DropdownMenuItem onClick={() => { setDeclineReason(""); setDeclineModal(true); }}>
              <XCircle className="w-4 h-4 mr-2" /> Mark as declined
            </DropdownMenuItem>
          )}
          {quote?.id && (
            <DropdownMenuItem onClick={() => setCopyToModal(true)}>
              <Copy className="w-4 h-4 mr-2" /> Copy to
            </DropdownMenuItem>
          )}
          {quote?.id && (
            <DropdownMenuItem onClick={() => setSendModal(true)}>
              <Share2 className="w-4 h-4 mr-2" /> Get link
            </DropdownMenuItem>
          )}
          {quote?.id && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeleteQuote}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </>
          )}
          {quote?.id && form.status === "Invoiced" && (
            <DropdownMenuItem onClick={() => quickStatus("Accepted")}>
              Unmark as Invoiced
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/settings/sales")}>
            <ExternalLink className="w-4 h-4 mr-2" /> Invoice settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Quote Number</label>
            <div className="relative">
              <Input
                placeholder="Auto-generated..."
                value={genningNumber ? "Generating..." : form.number}
                onChange={e => set("number", e.target.value)}
                disabled={genningNumber}
                className="pr-8"
              />
              <button
                type="button"
                title="Re-generate number"
                onClick={() => autoNumber(form.status, null).then(n => setForm(f => ({ ...f, number: n })))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reference</label>
            <Input placeholder="Customer / internal ref" value={form.reference} onChange={e => set("reference", e.target.value)} />
          </div>
        </div>

        {/* Customer + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Customer <span className="text-destructive">*</span>
              <span className="ml-1 text-muted-foreground/50 font-normal">(customers only)</span>
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
                <button type="button" onClick={clearContact} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showContactList && filteredCustomers.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={(e) => { e.stopPropagation(); setContact(c); }}
                  >
                    <span className="font-medium">{c.company || c.full_name}</span>
                    {c.company && c.full_name !== c.company && (
                      <span className="text-xs text-muted-foreground ml-1.5">{c.full_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showContactList && contactSearch && filteredCustomers.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
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
              </div>
            )}
          </div>
          <div className="flex flex-col justify-end">
            {form.status && form.status !== "Draft" && (
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Status:</span>
                <span className="font-semibold text-foreground">{form.status}</span>
              </div>
            )}
          </div>
        </div>

        {/* Title & Summary toggle */}
        {form._showTitleSummary ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
              <Input placeholder="e.g. Office Maintenance Services" value={form.title || ""} onChange={e => set("title", e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Summary</label>
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

        {/* Dates + Currency + Incoterm */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Issue Date</label>
            <Input type="date" value={form.issue_date} onChange={e => set("issue_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Expiry Date</label>
            <Input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} />
            <div className="flex gap-1.5 mt-1.5">
              {[7, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors border border-border"
                  onClick={() => {
                    const base = form.issue_date ? new Date(form.issue_date) : new Date();
                    base.setDate(base.getDate() + days);
                    set("expiry_date", base.toISOString().slice(0, 10));
                  }}
                >
                  +{days}d
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
            <Select value={form.currency} onValueChange={v => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Incoterm</label>
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

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={addLine}>
                <Plus className="w-3 h-3" /> Add Line
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setProductPicker(true)}>
                <Tag className="w-3 h-3" /> From catalog
              </Button>
            </div>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-primary/10 border-b-2 border-primary/20">
                 <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-primary/80 uppercase tracking-wide w-24">Item</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-primary/80 uppercase tracking-wide">Description</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-20">Qty</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-28">Unit Price</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-20">Disc.</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-20">Tax %</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-primary/80 uppercase tracking-wide w-28">Total</th>
                  <th className="w-8"></th>
                 </tr>
               </thead>
              <tbody>
                {(form.line_items || []).length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">No line items yet. Click "Add Line" to start.</td></tr>
                ) : (
                  (form.line_items || []).map((l, i) => (
                    <tr key={i} className={`border-t border-border transition-colors ${activeLineIdx === i ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
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
                          ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                          onChange={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; updateLine(i, "description", e.target.value); }}
                          onFocus={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                          tabIndex={i * 4 + 1}
                          onKeyDown={e => {
                            if (e.key === "Tab" && !e.shiftKey) {
                              e.preventDefault();
                              e.currentTarget.closest("tr")?.querySelector("[data-col='qty']")?.focus();
                            }
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                          type="number" min="0"
                          value={l.quantity === 0 ? "" : l.quantity}
                          placeholder=""
                          onChange={e => updateLine(i, "quantity", e.target.value)}
                          data-col="qty"
                          onFocus={() => setActiveLineIdx(i)}
                          onKeyDown={e => {
                            if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                              e.preventDefault();
                              e.currentTarget.closest("tr")?.querySelector("[data-col='price']")?.focus();
                            }
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                          type="number" min="0" step="0.01"
                          value={l.unit_price === 0 ? "" : l.unit_price}
                          placeholder=""
                          onChange={e => updateLine(i, "unit_price", e.target.value)}
                          tabIndex={i * 4 + 3}
                          data-col="price"
                          onFocus={() => setActiveLineIdx(i)}
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
                          }}
                        />
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
                          data-col="disc"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {taxRates.length > 0 ? (
                          <select
                            className="h-7 text-xs border border-input rounded-md bg-transparent px-2 w-full focus:outline-none focus:ring-1 focus:ring-ring"
                            value={l.tax_rate}
                            onChange={e => updateLine(i, "tax_rate", parseFloat(e.target.value))}
                          >
                            {taxRates.map((tr, ti) => (
                              <option key={ti} value={tr.rate}>{tr.rate}%</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 w-14"
                            type="number" min="0" max="100"
                            value={l.tax_rate}
                            onChange={e => updateLine(i, "tax_rate", e.target.value)}
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

          {/* Totals */}
          {(form.line_items || []).length > 0 && (
            <div className="mt-3 flex justify-end">
              <div className="space-y-1 text-sm min-w-[200px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{form.subtotal?.toFixed(2)} {form.currency}</span>
                </div>
                {form.discount_total > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span className="tabular-nums">-{form.discount_total?.toFixed(2)} {form.currency}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{form.tax_amount?.toFixed(2)} {form.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-foreground border-t border-border pt-1">
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

        {/* Linked Operations */}
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <LinkedRecordsSection
            form={form}
            onChange={updates => setForm(f => ({ ...f, ...updates }))}
            contactId={form.contact_id || null}
          />
        </div>

        {/* Notes & Terms */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <p className="text-xs text-transparent mb-1.5 select-none">&nbsp;</p>
            <textarea
              name="notes"
              className="w-full h-[240px] resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Internal notes..."
              value={form.notes || ""}
              onChange={e => set("notes", e.target.value)}
              onKeyDown={handleTabIndent}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Terms &amp; Conditions</label>
            <p className="text-xs text-muted-foreground/70 mb-1.5">Shown on the printed / PDF document.</p>
            <textarea
              name="terms"
              className="w-full h-[240px] resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Payment terms, conditions..."
              value={form.terms || ""}
              onChange={e => set("terms", e.target.value)}
              onKeyDown={handleTabIndent}
            />
          </div>
        </div>

        {/* Files — only when editing existing quote */}
        {quote?.id && (
          <DocumentFilesPopover docType="quote" docId={quote.id} docNumber={quote.number} />
        )}

        {/* History & Notes — only when editing existing quote */}
        {quote?.id && (
          <DocumentHistoryPanel
            docType="quote"
            docId={quote.id}
            docNumber={quote.number}
            refreshTrigger={historyRefresh}
          />
        )}

        {/* Bottom footer — just a hidden submit for form submission */}
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
                ? calcLine({ ...l, item_code: p.code, description: p.sale_description || p.name, unit_price: p.sale_price || 0, tax_rate: p.sale_tax_rate || 0 })
                : l
              );
              return recalcTotals({ ...f, line_items: items });
            });
          }
          setQuickProductRow(null);
        }}
      />
      <SendQuoteModal
        open={sendModal}
        onClose={() => setSendModal(false)}
        quote={quote}
        onMarkAsSent={() => quickStatus("Sent")}
      />
      <CopyQuoteToModal
        open={copyToModal}
        onClose={() => setCopyToModal(false)}
        onSelect={(type) => {
          setCopyToModal(false);
          if (!quote?.id) return;
          const { id, created_date, updated_date, created_by_id, number, contact_id, contact_name, ...rest } = quote;
          const draftBody = { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" };
          if (type === "invoice") {
            navigate("/sales/invoices/new", { state: { duplicate: draftBody } });
          } else {
            navigate("/sales/quotes/new", { state: { duplicate: draftBody } });
          }
        }}
      />
      {/* Decline reason modal */}
      <Dialog open={declineModal} onOpenChange={setDeclineModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <label className="text-sm font-semibold text-foreground block">Reason for declining the quote</label>
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Enter reason..."
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDeclineModal(false)}>Cancel</Button>
              <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={async () => {
                setDeclineModal(false);
                await quickStatus("Declined");
                if (declineReason.trim() && quote?.id) {
                  const user = await base44.auth.me().catch(() => null);
                  await logDocumentHistory({ docType: "quote", docId: quote.id, docNumber: form.number, action: "Note Added", detail: declineReason.trim(), userName: user?.full_name || user?.email || "Unknown", note: declineReason.trim() });
                  setHistoryRefresh(r => r + 1);
                }
              }}>Decline</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}