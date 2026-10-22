import { assignOfficialNumber } from "@/lib/assignNumber";
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, CheckCircle2, X, FileText, Printer, Eye } from "lucide-react";
import { toast } from "sonner";
import { todayLocalISO } from "@/lib/dateOnly";
import CreditNotePreviewModal from "@/components/sales/CreditNotePreviewModal";
import { printCreditNotePdfFromHtml } from "@/components/sales/creditNotePdfFromHtml";
import { pickCreditNoteTemplate, isRealTemplate } from "@/lib/creditNoteTemplate";
import { itemsError } from "@/lib/lineItemValidation";
import {
  attachTaxAdapter, computeTotals, isAmountLine, lineDisplayTotal, lineSignConvention,
  lineTaxPct, rescaleLineTax, setLineTaxPct, stripAdapterFields, taxBlockReason,
} from "@/lib/docTaxSemantics";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { postCreditNoteJournal, reverseDocumentJournal } from "@/lib/autoPostJournal";
import { checkPeriodLock } from "@/lib/periodLock";
import DocumentHistoryPanel, { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import AnnexPhotosSection from "@/components/shared/AnnexPhotosSection";
import LinkedRecordsSection from "@/components/sales/LinkedRecordsSection";

const STATUS_STYLES = {
  Draft: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  "Awaiting Application": "bg-blue-100 text-blue-700",
  Applied: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-100 text-red-600",
};

function calcLineTotal(item) {
  const sub = (item.quantity || 0) * (item.unit_price || 0);
  const disc = item.discount ? String(item.discount).trim() : "";
  let discAmt = 0;
  if (disc.endsWith("%")) discAmt = sub * (parseFloat(disc) / 100);
  else discAmt = parseFloat(disc) || 0;
  const net = Math.max(0, sub - discAmt);
  const tax = net * ((item.tax_rate || 0) / 100);
  return { net, tax, total: net + tax };
}

const EMPTY_LINE = { description: "", account_id: "", account_code: "", account_name: "", quantity: 1, unit_price: 0, discount: "", tax_rate: 0 };
const FINANCIAL_KEYS = ["quantity", "unit_price", "discount"];

export default function CreditNoteFormBody({ creditNote, contacts, onSave, onClose, isPage, active }) {
  const navigate = useNavigate();
  const accounts = useChartOfAccounts();
  const { baseCurrency } = useBaseCurrency();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [numSettings, setNumSettings] = useState(null);
  // Real templates only — the "__" prefixed setting records are never offered for printing.
  const [templates, setTemplates] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const rec = (list || []).find(t => t.name === "__numbering_settings__");
      try { setNumSettings(rec ? JSON.parse(rec.footer_notes || "{}") : {}); } catch { setNumSettings({}); }
      setTemplates((list || []).filter(isRealTemplate));
    }).catch(() => { setNumSettings({}); setTemplates([]); });
  }, []);
  useEffect(() => {
    if (!form || numSettings === null || form.id || form.number || form.series !== undefined) return;
    const ds = (numSettings.series || []).find(s => s.doc_type === "credit_note" && s.is_default);
    setForm(f => f && f.series === undefined ? { ...f, series: ds ? ds.code : "" } : f);
  }, [form, numSettings]);

  useEffect(() => {
    base44.entities.Invoice.list("-issue_date", 1000).then(setInvoices).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (!creditNote) {
      const today = todayLocalISO();
      setForm({
        number: "",
        reference: "",
        contact_id: "",
        contact_name: "",
        invoice_id: "",
        invoice_number: "",
        status: "Draft",
        reason: "",
        issue_date: today,
        currency: baseCurrency || "AED",
        exchange_rate: 1,
        line_items: [{ ...EMPTY_LINE }],
        notes: "",
        subtotal: 0, discount_total: 0, tax_amount: 0, total: 0, base_total: 0,
        _taxMode: "rate",
      });
    } else {
      // attachTaxAdapter marks imported (amount) credit notes — their lines store the
      // signed tax amount — and snapshots the stored financials for a no-change save.
      const decorated = attachTaxAdapter(creditNote);
      setForm({ ...decorated, line_items: (decorated.line_items || []).length ? decorated.line_items : [{ ...EMPTY_LINE }] });
    }
  }, [creditNote]);

  // Totals follow the document's tax semantics: native credit notes keep the original
  // rate math, imported ones keep their grounded signed amounts (and their exact
  // stored figures when nothing financial changed).
  const totals = useMemo(() => {
    if (!form) return { subtotal: 0, discount_total: 0, tax_amount: 0, total: 0 };
    return computeTotals(form);
  }, [form]);

  const customerOptions = useMemo(() =>
    contacts
      .filter(c => c.type !== "Provider") // suppliers-only never appear as credit note customers
      .map(c => ({ value: c.id, label: c.full_name || c.company || "Unnamed" })),
    [contacts]);

  const invoiceOptions = useMemo(() => {
    const forCustomer = form?.contact_id
      ? invoices.filter(i => i.contact_id === form.contact_id)
      : invoices;
    return forCustomer
      .filter(i => i.status && i.status !== "Cancelled" && i.status !== "Draft")
      .map(i => ({ value: i.id, label: `${i.number || "—"} · ${i.contact_name || ""} · ${i.total?.toFixed(2) || 0} ${i.currency || ""}` }));
  }, [invoices, form?.contact_id]);

  if (!form) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const setContact = (id) => {
    const c = contacts.find(x => x.id === id);
    setForm(f => ({ ...f, contact_id: id, contact_name: c?.full_name || "", invoice_id: "", invoice_number: "" }));
  };

  const setInvoice = (invId) => {
    if (!invId) {
      setForm(f => ({ ...f, invoice_id: "", invoice_number: "" }));
      return;
    }
    const inv = invoices.find(i => i.id === invId);
    setForm(f => ({
      ...f,
      invoice_id: inv?.id || "",
      invoice_number: inv?.number || "",
      contact_id: f.contact_id || inv?.contact_id || "",
      contact_name: f.contact_name || inv?.contact_name || "",
    }));
  };

  // Native lines store a tax rate; imported lines store the signed tax amount, so a
  // financial edit rescales that amount from the line's tracked percentage instead of
  // multiplying it as a percent.
  const updateLine = (i, key, value) => {
    setForm(f => {
      const amountMode = f._taxMode === "amount";
      const items = f.line_items.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l, [key]: value };
        if (!amountMode) return next;
        if (key === "tax_rate") return setLineTaxPct({ ...next, _taxSign: next._taxSign ?? lineSignConvention(f) }, value);
        if (FINANCIAL_KEYS.includes(key)) return rescaleLineTax(next);
        return next;
      });
      return { ...f, line_items: items };
    });
  };

  const setLineAccount = (i, acc) => {
    setForm(f => ({ ...f, line_items: f.line_items.map((l, idx) => idx === i ? { ...l, account_id: acc?.id || "", account_code: acc?.code || "", account_name: acc?.name || "" } : l) }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));

  const generateNumber = async () => {
    const year = new Date().getFullYear();
    const existing = await base44.entities.CreditNote.list("-created_date", 5000).catch(() => []);
    const nums = existing.map(c => c.number || "").filter(n => n.startsWith(`CN-${year}-`));
    const maxSeq = nums.reduce((m, n) => {
      const seq = parseInt(n.split("-").pop(), 10);
      return isNaN(seq) ? m : Math.max(m, seq);
    }, 0);
    return `CN-${year}-${String(maxSeq + 1).padStart(4, "0")}`;
  };

  // Shared template resolution: a template configured for credit notes wins; otherwise the
  // default invoice template supplies the branding (their stored records are never changed).
  const creditNoteTemplate = () => pickCreditNoteTemplate(templates);

  const currentContact = () => contacts.find(c => c.id === form.contact_id);

  const handlePrint = async () => {
    if (!form.id) { toast.error("Save the credit note first — printing needs a saved document."); return; }
    setPrinting(true);
    const toastId = toast.loading("Generating credit note PDF…");
    try {
      let fresh = form;
      try { fresh = await base44.entities.CreditNote.get(form.id); } catch { fresh = form; }
      await printCreditNotePdfFromHtml({ creditNote: fresh, contact: currentContact(), template: creditNoteTemplate() });
      toast.success("Credit note PDF downloaded", { id: toastId });
    } catch (e) {
      toast.error("Could not generate the PDF: " + e.message, { id: toastId });
    }
    setPrinting(false);
  };

  const buildPayload = (status) => {
    // Native credit notes store net + tax on each line; imported ones keep the
    // imported net amount untouched — their tax lives in the signed line amounts.
    const lineItems = form._taxMode === "amount"
      ? form.line_items
      : form.line_items.map(item => ({ ...item, total: calcLineTotal(item).total }));
    const exchangeRate = form.currency === (baseCurrency || "AED") ? 1 : (form.exchange_rate || 1);
    // stripAdapterFields removes every UI-only adapter field (_taxMode, _srcFinancials,
    // per-line _impliedPct / _taxSign) before the record is written.
    return stripAdapterFields({
      ...form,
      line_items: lineItems,
      status,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_amount: totals.tax_amount,
      total: totals.total,
      exchange_rate: exchangeRate,
      base_total: totals.total / exchangeRate,
    });
  };

  const handleSave = async (approve = false) => {
    if (!form.contact_id) { toast.error("Customer is required"); return; }
    if (!form.issue_date) { toast.error("Date is required"); return; }
    const lineItemsProblem = itemsError(form.line_items, form.status);
    if (lineItemsProblem) { toast.error(lineItemsProblem); return; }
    const taxBlocked = taxBlockReason(form);
    if (taxBlocked) { toast.error(taxBlocked); return; }

    const status = approve ? "Awaiting Application" : (form.status || "Draft");

    // Period lock check
    const { locked, lockDate, error: lockReadError } = await checkPeriodLock(form.issue_date);
    if (locked) {
      toast.error(lockReadError
        ? "The accounting lock date could not be loaded, so the period is treated as locked. Nothing was saved — try again in a moment."
        : `Date is before the period lock date (${lockDate}). Unlock the period first.`);
      return;
    }

    setSaving(true);
    const number = form.number || "";
    const payload = { ...buildPayload(status), number };

    try {
      let saved;
      if (form.id) {
        const prevStatus = form.status;
        await base44.entities.CreditNote.update(form.id, payload);
        saved = await base44.entities.CreditNote.get(form.id);
        if (approve && !saved.number) {
          const num = await assignOfficialNumber("CreditNote", saved.id);
          if (num) saved = await base44.entities.CreditNote.get(saved.id);
        }
        if (approve && prevStatus !== "Awaiting Application") {
          await postCreditNoteJournal(saved).catch(e => toast.error("Journal post failed: " + e.message));
        }
        logDocumentHistory({ docType: "credit_note", docId: saved.id, docNumber: saved.number, action: approve && prevStatus !== "Awaiting Application" ? "Status Changed" : "Updated", detail: approve ? "Approved" : "Saved", userName: "" }).then(() => setHistoryRefresh(n => n + 1)).catch(() => {});
        toast.success(approve ? "Credit note approved" : "Credit note saved");
      } else {
        saved = await base44.entities.CreditNote.create(payload);
        if (approve && !saved.number) {
          const num = await assignOfficialNumber("CreditNote", saved.id);
          if (num) saved = await base44.entities.CreditNote.get(saved.id);
        }
        if (approve) {
          await postCreditNoteJournal(saved).catch(e => toast.error("Journal post failed: " + e.message));
        }
        logDocumentHistory({ docType: "credit_note", docId: saved.id, docNumber: saved.number, action: "Created", detail: approve ? "Created and approved" : "Created as draft", userName: "" }).catch(() => {});
        toast.success(approve ? "Credit note created and approved" : "Credit note saved");
        if (isPage) navigate(`/sales/credit-notes/${saved.id}/edit`, { replace: true });
      }
      onSave?.(saved, { close: false });
    } catch (e) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!form.id) { onClose?.(); return; }
    if (form.number || (form.status && form.status !== "Draft")) { toast.error("An approved or numbered credit note cannot be deleted. Void it instead."); return; }
    if (!confirm("Delete this draft credit note?")) return;
    try {
      await reverseDocumentJournal("CreditNote", form.id, "credit note deleted");
      await base44.entities.CreditNote.delete(form.id);
      toast.success("Credit note deleted");
      onClose?.() || navigate("/sales/credit-notes");
    } catch (e) {
      toast.error("Delete failed: " + e.message);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-300 dark:border-slate-700 bg-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {form.number || "New Credit Note"}
            </h2>
            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[form.status] || "bg-muted text-muted-foreground"}`}>
              {form.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={!form.id}>
            <Eye className="w-4 h-4 mr-1" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!form.id || printing}>
            <Printer className="w-4 h-4 mr-1" /> {printing ? "Preparing…" : "Print PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={saving || form.status === "Applied" || form.status === "Cancelled"}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
          </Button>
          {isPage && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/sales/credit-notes")}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Credit Note Details */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4 space-y-4">
          <div className="flex gap-3 md:w-1/2">
            {(numSettings?.series || []).some(s => s.doc_type === "credit_note") && (
              <div className="w-1/3 min-w-[120px]">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Series</label>
                <select
                  value={form.series || ""}
                  onChange={e => set("series", e.target.value)}
                  disabled={!!form.number}
                  title={form.number ? "Series is locked once the document is numbered." : ""}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
                >
                  <option value="">Standard (CN)</option>
                  {(numSettings?.series || []).filter(s => s.doc_type === "credit_note").map(s => (
                    <option key={s.code} value={s.code}>{s.code}{s.label ? " - " + s.label : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">Credit Note Number</label>
              <Input placeholder="Assigned on approval" value={form.number || ""} readOnly disabled className="bg-muted/40" />
            </div>
          </div>
          {/* Top section: customer + date + reason */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Customer *</Label>
              <SearchableSelect
                value={form.contact_id || ""}
                onValueChange={setContact}
                options={customerOptions}
                placeholder="Select customer"
                searchPlaceholder="Search customers…"
                onNavigate={(id) => navigate(`/contacts/${id}`)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Date *</Label>
              <Input type="date" value={form.issue_date || ""} onChange={e => set("issue_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Reference</Label>
              <Input value={form.reference || ""} onChange={e => set("reference", e.target.value)} placeholder="Internal ref" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Reason</Label>
              <Input value={form.reason || ""} onChange={e => set("reason", e.target.value)} placeholder="e.g. Refund, Overcharge, Returned goods" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Linked Invoice (optional)</Label>
              <SearchableSelect
                value={form.invoice_id || ""}
                onValueChange={setInvoice}
                options={invoiceOptions}
                placeholder="Select invoice"
                searchPlaceholder="Search invoices…"
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
          <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-slate-700">Description</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-700 dark:text-slate-200 w-48">Account</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-700 dark:text-slate-200 w-20">Qty</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-700 dark:text-slate-200 w-28">Unit Price</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-700 dark:text-slate-200 w-24">Discount</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-700 dark:text-slate-200 w-20">Tax %</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-700 dark:text-slate-200 w-28">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {form.line_items.map((item, i) => {
                  const total = lineDisplayTotal(item, form);
                  return (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="px-3 py-2">
                        <Input value={item.description || ""} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Description" className="border-0 bg-transparent shadow-none focus-visible:ring-1" />
                      </td>
                      <td className="px-3 py-2">
                        <AccountCombobox
                          accounts={accounts}
                          value={item.account_id}
                          onSelect={(acc) => setLineAccount(i, acc)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" value={item.quantity || ""} onChange={e => updateLine(i, "quantity", parseFloat(e.target.value) || 0)} className="text-right border-0 bg-transparent shadow-none focus-visible:ring-1 w-full" />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" value={item.unit_price || ""} onChange={e => updateLine(i, "unit_price", parseFloat(e.target.value) || 0)} className="text-right border-0 bg-transparent shadow-none focus-visible:ring-1 w-full" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={item.discount || ""} onChange={e => updateLine(i, "discount", e.target.value)} placeholder="0 or 10%" className="text-right border-0 bg-transparent shadow-none focus-visible:ring-1 w-full" />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" value={isAmountLine(item) ? lineTaxPct(item, form) : (item.tax_rate || "")} onChange={e => updateLine(i, "tax_rate", parseFloat(e.target.value) || 0)} className="text-right border-0 bg-transparent shadow-none focus-visible:ring-1 w-full" />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {total.toFixed(2)}
                      </td>
                      <td className="px-1 py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)} disabled={form.line_items.length <= 1}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-slate-300 dark:border-slate-700 bg-slate-100">
              <Button variant="ghost" size="sm" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add line</Button>
            </div>
          </div>
        </div>

        {/* Totals + notes */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Notes</Label>
              <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={4} placeholder="Internal notes — not shown on the credit note" className="border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums font-medium">{totals.subtotal.toFixed(2)} {form.currency}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums font-medium text-destructive">-{totals.discount_total.toFixed(2)} {form.currency}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums font-medium">{totals.tax_amount.toFixed(2)} {form.currency}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-300 dark:border-slate-700">
                <span>Total Credit</span>
                <span className="tabular-nums">{totals.total.toFixed(2)} {form.currency}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-5 py-4">
          <LinkedRecordsSection
            form={form}
            onChange={updates => setForm(f => ({ ...f, ...updates }))}
            contactId={form.contact_id || null}
            showTasks={false}
          />
        </div>

        <AnnexPhotosSection files={form.annex_photos || []} onChange={(files) => set("annex_photos", files)} />

        {form.id && (
          <DocumentHistoryPanel docType="credit_note" docId={form.id} docNumber={form.number} refreshTrigger={historyRefresh} />
        )}
      </div>

      <CreditNotePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        creditNote={form}
        contact={currentContact()}
        template={creditNoteTemplate()}
        onPrint={handlePrint}
      />
    </div>
  );
}