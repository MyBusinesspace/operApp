import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Search,
  X,
  Tag,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/currency";
import { DEFAULT_INCOTERMS, getIncotermExplanation } from "@/lib/incoterms";
import { amountToWords } from "@/lib/numberToWords";

const QUOTE_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Declined",
  "Invoiced",
  "Cancelled",
];
const INVOICE_STATUSES = [
  "Draft",
  "Awaiting Approval",
  "Awaiting Payment",
  "Paid",
  "Repeating",
  "Cancelled",
];

const TAX_RATES = [
  { label: "0%", rate: 0 },
  { label: "5% VAT", rate: 5 },
];

function emptyLine() {
  return {
    item_code: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    discount: "",
    tax_rate: 5,
    total: 0,
  };
}

function calcDiscount(sub, discount) {
  if (!discount && discount !== 0) return 0;
  const s = String(discount).trim();
  if (s.endsWith("%")) return sub * (parseFloat(s) / 100);
  return parseFloat(s) || 0;
}

function calcLine(l) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const sub = qty * price;
  const disc = calcDiscount(sub, l.discount);
  const taxable = sub - disc;
  const tax = taxable * ((Number(l.tax_rate) || 0) / 100);
  return { ...l, quantity: qty, unit_price: price, total: taxable + tax };
}

function recalcTotals(f) {
  const items = f.line_items || [];
  const subtotal = items.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0
  );
  const discount_total = items.reduce((s, l) => {
    const sub =
      (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
    return s + calcDiscount(sub, l.discount);
  }, 0);
  const tax_amount = items.reduce((s, l) => {
    const sub =
      (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
    const disc = calcDiscount(sub, l.discount);
    return s + (sub - disc) * ((Number(l.tax_rate) || 0) / 100);
  }, 0);
  return {
    ...f,
    subtotal,
    discount_total,
    tax_amount,
    total: subtotal - discount_total + tax_amount,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextDemoNumber(kind) {
  const n = String(Math.floor(100 + Math.random() * 800));
  return kind === "invoice" ? `INV-DEMO-${n}` : `QT-DEMO-${n}`;
}

/**
 * Demo quote / invoice form — mirrors the live Sales document form (view/save closes).
 * kind: "quote" | "invoice"
 */
export default function DemoSalesDocDialog({
  open,
  onClose,
  kind = "quote",
  document,
  contacts = [],
  products = [],
  projects = [],
}) {
  const isInvoice = kind === "invoice";
  const statuses = isInvoice ? INVOICE_STATUSES : QUOTE_STATUSES;
  const titleNoun = isInvoice ? "Invoice" : "Quote";

  const customers = useMemo(
    () =>
      (contacts || []).filter(
        (c) => c.type === "Customer" || c.type === "Both" || !c.type
      ),
    [contacts]
  );

  const emptyForm = () =>
    recalcTotals({
      number: nextDemoNumber(kind),
      reference: "",
      contact_id: "",
      contact_name: "",
      status: "Draft",
      issue_date: today(),
      expiry_date: "",
      due_date: "",
      currency: "AED",
      incoterm: DEFAULT_INCOTERMS[0]?.code || "",
      notes: "",
      terms: "",
      title: "",
      doc_summary: "",
      project_id: "",
      project_name: "",
      line_items: [emptyLine()],
      _showTitleSummary: false,
      subtotal: 0,
      discount_total: 0,
      tax_amount: 0,
      total: 0,
    });

  const [form, setForm] = useState(emptyForm);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [activeLineIdx, setActiveLineIdx] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (document) {
      const base = recalcTotals({
        ...emptyForm(),
        ...document,
        line_items:
          document.line_items?.length > 0
            ? document.line_items.map(calcLine)
            : [emptyLine()],
        _showTitleSummary: !!(document.title || document.doc_summary),
      });
      setForm(base);
      setContactSearch(document.contact_name || "");
    } else {
      setForm(emptyForm());
      setContactSearch("");
    }
    setShowContactList(false);
    setProductPicker(false);
    setProductSearch("");
    setActiveLineIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, document, kind]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const filteredCustomers = customers.filter((c) => {
    const q = contactSearch.toLowerCase();
    if (!q) return true;
    return (
      (c.company || "").toLowerCase().includes(q) ||
      (c.full_name || "").toLowerCase().includes(q)
    );
  });

  const setContact = (c) => {
    setForm((f) => ({
      ...f,
      contact_id: c.id,
      contact_name: c.company || c.full_name,
    }));
    setContactSearch(c.company || c.full_name || "");
    setShowContactList(false);
  };

  const clearContact = () => {
    setForm((f) => ({ ...f, contact_id: "", contact_name: "" }));
    setContactSearch("");
  };

  const addLine = () =>
    setForm((f) =>
      recalcTotals({ ...f, line_items: [...(f.line_items || []), emptyLine()] })
    );

  const removeLine = (i) =>
    setForm((f) => {
      const items = f.line_items.filter((_, idx) => idx !== i);
      return recalcTotals({
        ...f,
        line_items: items.length ? items : [emptyLine()],
      });
    });

  const updateLine = (i, k, val) =>
    setForm((f) => {
      const items = f.line_items.map((l, idx) =>
        idx === i ? calcLine({ ...l, [k]: val }) : l
      );
      return recalcTotals({ ...f, line_items: items });
    });

  const addFromProduct = (p) => {
    const line = calcLine({
      ...emptyLine(),
      item_code: p.code || "",
      description: p.name || p.sale_description || "",
      unit_price: Number(p.sale_price) || 0,
      tax_rate: Number(p.sale_tax_rate) || 5,
    });
    setForm((f) =>
      recalcTotals({ ...f, line_items: [...(f.line_items || []), line] })
    );
    setProductPicker(false);
    setProductSearch("");
  };

  const filteredProducts = (products || []).filter((p) => {
    const q = productSearch.toLowerCase();
    if (!q) return true;
    return (
      (p.code || "").toLowerCase().includes(q) ||
      (p.name || "").toLowerCase().includes(q)
    );
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose();
  };

  const secondDateLabel = isInvoice ? "Due Date" : "Expiry Date";
  const secondDateKey = isInvoice ? "due_date" : "expiry_date";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {document ? `Edit ${titleNoun}` : `New ${titleNoun}`}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 pt-1"
          onClick={() => setShowContactList(false)}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                {titleNoun} Number
              </label>
              <div className="relative">
                <Input
                  value={form.number}
                  onChange={(e) => set("number", e.target.value)}
                  className="pr-8 font-mono"
                />
                <button
                  type="button"
                  title="Re-generate number"
                  onClick={() => set("number", nextDemoNumber(kind))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Reference
              </label>
              <Input
                placeholder="Customer / internal ref"
                value={form.reference || ""}
                onChange={(e) => set("reference", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Customer <span className="text-destructive">*</span>
                <span className="ml-1 text-muted-foreground/50 font-normal">
                  (customers only)
                </span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 pr-8"
                  placeholder="Search customer..."
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    setShowContactList(true);
                  }}
                  onFocus={() => setShowContactList(true)}
                  autoComplete="off"
                  required={!form.contact_id}
                />
                {form.contact_id && (
                  <button
                    type="button"
                    onClick={clearContact}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {showContactList && filteredCustomers.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => setContact(c)}
                    >
                      <span className="font-medium">
                        {c.company || c.full_name}
                      </span>
                      {c.company && c.full_name !== c.company && (
                        <span className="text-xs text-muted-foreground ml-1.5">
                          {c.full_name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Status
              </label>
              <Select
                value={form.status || "Draft"}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form._showTitleSummary ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Title
                </label>
                <Input
                  placeholder="e.g. Office Maintenance Services"
                  value={form.title || ""}
                  onChange={(e) => set("title", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Summary
                </label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                  placeholder="Brief description of the scope of work..."
                  value={form.doc_summary || ""}
                  onChange={(e) => set("doc_summary", e.target.value)}
                />
              </div>
              <button
                type="button"
                className="text-xs text-primary flex items-center gap-1 hover:underline"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    _showTitleSummary: false,
                    title: "",
                    doc_summary: "",
                  }))
                }
              >
                <X className="w-3 h-3" /> Remove title &amp; summary
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
              onClick={() => setForm((f) => ({ ...f, _showTitleSummary: true }))}
            >
              <Plus className="w-3 h-3" /> Add a title &amp; summary
            </button>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Issue Date
              </label>
              <Input
                type="date"
                value={form.issue_date || ""}
                onChange={(e) => set("issue_date", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                {secondDateLabel}
              </label>
              <Input
                type="date"
                value={form[secondDateKey] || ""}
                onChange={(e) => set(secondDateKey, e.target.value)}
              />
              <div className="flex gap-1.5 mt-1.5">
                {[7, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors border border-border"
                    onClick={() => {
                      const base = form.issue_date
                        ? new Date(form.issue_date)
                        : new Date();
                      base.setDate(base.getDate() + days);
                      set(secondDateKey, base.toISOString().slice(0, 10));
                    }}
                  >
                    +{days}d
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Currency
              </label>
              <Select
                value={form.currency || "AED"}
                onValueChange={(v) => set("currency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Incoterm
              </label>
              <Select
                value={form.incoterm || "__none__"}
                onValueChange={(v) =>
                  set("incoterm", v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {DEFAULT_INCOTERMS.filter((i) => i.code).map((i) => (
                    <SelectItem key={i.code} value={i.code}>
                      {i.code} — {i.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(projects || []).length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Linked project
              </label>
              <Select
                value={form.project_id || "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") {
                    setForm((f) => ({
                      ...f,
                      project_id: "",
                      project_name: "",
                    }));
                    return;
                  }
                  const p = projects.find((x) => x.id === v);
                  setForm((f) => ({
                    ...f,
                    project_id: v,
                    project_name: p?.name || "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Line Items
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7 text-xs"
                  onClick={addLine}
                >
                  <Plus className="w-3 h-3" /> Add Line
                </Button>
                {(products || []).length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => setProductPicker((v) => !v)}
                  >
                    <Tag className="w-3 h-3" /> From catalog
                  </Button>
                )}
              </div>
            </div>

            {productPicker && (
              <div className="mb-3 rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <Input
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="max-h-40 overflow-y-auto divide-y divide-border/60">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id || p.code}
                      type="button"
                      className="w-full flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-accent/50 text-left"
                      onClick={() => addFromProduct(p)}
                    >
                      <span>
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {p.code}
                        </span>
                        {p.name}
                      </span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        AED {Number(p.sale_price || 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                  {!filteredProducts.length && (
                    <p className="text-xs text-muted-foreground px-2 py-3">
                      No products match.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground uppercase tracking-wide w-24">
                        Item
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground uppercase tracking-wide">
                        Description
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide w-20">
                        Qty
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide w-28">
                        Unit Price
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide w-20">
                        Disc.
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide w-20">
                        Tax %
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wide w-28">
                        Total
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {(form.line_items || []).map((l, i) => (
                      <tr
                        key={i}
                        className={`border-t border-border transition-colors ${
                          activeLineIdx === i
                            ? "bg-blue-50 dark:bg-blue-950/30"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-1.5 w-24">
                          {l.item_code ? (
                            <span className="inline-block px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono font-medium whitespace-nowrap">
                              {l.item_code}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <textarea
                            className="w-full text-xs border-0 bg-transparent focus-visible:outline-none focus-visible:ring-0 px-1 py-0 resize-none overflow-hidden leading-5 min-h-[28px]"
                            rows={1}
                            placeholder="Description..."
                            value={l.description}
                            onChange={(e) =>
                              updateLine(i, "description", e.target.value)
                            }
                            onFocus={() => setActiveLineIdx(i)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                            type="number"
                            min="0"
                            value={l.quantity === 0 ? "" : l.quantity}
                            onChange={(e) =>
                              updateLine(i, "quantity", e.target.value)
                            }
                            onFocus={() => setActiveLineIdx(i)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unit_price === 0 ? "" : l.unit_price}
                            onChange={(e) =>
                              updateLine(i, "unit_price", e.target.value)
                            }
                            onFocus={() => setActiveLineIdx(i)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1"
                            placeholder="%"
                            value={l.discount || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d*\.?\d*%?$/.test(v))
                                updateLine(i, "discount", v);
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            className="h-7 text-xs border border-input rounded-md bg-transparent px-2 w-full focus:outline-none focus:ring-1 focus:ring-ring"
                            value={l.tax_rate}
                            onChange={(e) =>
                              updateLine(
                                i,
                                "tax_rate",
                                parseFloat(e.target.value)
                              )
                            }
                          >
                            {TAX_RATES.map((tr) => (
                              <option key={tr.rate} value={tr.rate}>
                                {tr.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">
                          {(Number(l.total) || 0).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <div className="space-y-1.5 text-sm min-w-[220px] border border-border rounded-lg p-3 bg-muted/20">
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {(form.subtotal || 0).toFixed(2)} {form.currency}
                  </span>
                </div>
                {form.discount_total > 0 && (
                  <div className="flex justify-between font-semibold text-green-600">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      -{(form.discount_total || 0).toFixed(2)} {form.currency}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">
                    {(form.tax_amount || 0).toFixed(2)} {form.currency}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-base text-foreground border-t-2 border-border pt-2 mt-1">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {(form.total || 0).toFixed(2)} {form.currency}
                  </span>
                </div>
                {Number(form.total || 0) > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground italic leading-snug">
                    <span className="not-italic font-medium text-foreground/70">
                      Amount in words:
                    </span>{" "}
                    {amountToWords(form.total, form.currency)}
                  </div>
                )}
                {form.incoterm &&
                  (() => {
                    const expl = getIncotermExplanation(
                      DEFAULT_INCOTERMS,
                      form.incoterm
                    );
                    return expl ? (
                      <div className="text-[11px] text-muted-foreground leading-snug">
                        <span className="font-semibold text-foreground/70">
                          {form.incoterm}
                        </span>{" "}
                        — {expl}
                      </div>
                    ) : null;
                  })()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Notes
              </label>
              <textarea
                className="w-full h-[140px] resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                placeholder="Internal notes..."
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Terms &amp; Conditions
              </label>
              <p className="text-xs text-muted-foreground/70 mb-1.5">
                Shown on the printed / PDF document.
              </p>
              <textarea
                className="w-full h-[120px] resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                placeholder="Payment terms, conditions..."
                value={form.terms || ""}
                onChange={(e) => set("terms", e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gap-2">
              Save {titleNoun}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
