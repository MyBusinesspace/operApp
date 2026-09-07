import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Search, X, RefreshCw, BookOpen, XCircle, MoreVertical, ChevronDown, Paperclip } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import ProductPickerModal from "@/components/sales/ProductPickerModal";
import DocumentFilesPanel from "@/components/shared/DocumentFilesPanel";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import AccountCombobox from "@/components/accounting/AccountCombobox";

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

const EMPTY = {
  number: "", reference: "", contact_id: "", contact_name: "",
  status: "Draft", issue_date: "", delivery_date: "",
  currency: "AED", subtotal: 0, tax_amount: 0, total: 0,
  notes: "", project_id: "", project_name: "", work_order_id: "", work_order_name: "",
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

export default function PurchaseOrderFormModal({ open, onClose, onSave, purchaseOrder, contacts = [], onConvertToBill }) {
  const formRef = useRef(null);
  const closeAfterSaveRef = useRef(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactList, setShowContactList] = useState(false);
  const [genningNumber, setGenningNumber] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const accounts = useChartOfAccounts();

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const taxRec = list.find(t => t.name === "__tax_rates__");
      if (taxRec) {
        try {
          const parsed = JSON.parse(taxRec.footer_notes || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) setTaxRates(parsed);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const ensureBlankRow = (items) => {
    const list = [...(items || [])];
    const last = list[list.length - 1];
    if (!last || last.description || last.unit_price) list.push(getEmptyLine());
    return list;
  };

  useEffect(() => {
    if (!open) return;
    const base = purchaseOrder ? { ...EMPTY, ...purchaseOrder } : { ...EMPTY, issue_date: new Date().toISOString().slice(0, 10) };
    base.line_items = ensureBlankRow(base.line_items || []);
    setForm(base);
    setContactSearch(base.contact_name || "");
    setShowContactList(false);
    if (!base.number) {
      setGenningNumber(true);
      generatePONumber().then(n => { setForm(f => ({ ...f, number: n })); setGenningNumber(false); });
    }
  }, [open, purchaseOrder]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const allSuppliers = contacts;
  const selectedContact = contacts.find(c => c.id === form.contact_id) || null;

  const filteredSuppliers = allSuppliers.filter(c => {
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
    await onSave(form, { close: closeAfterSaveRef.current });
    setSaving(false);
    closeAfterSaveRef.current = false;
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{purchaseOrder?.id ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
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

              {(() => {
                const primaryLabel =
                  !purchaseOrder?.id ? "Submit for Approval" :
                  form.status === "Draft" ? "Submit for Approval" :
                  form.status === "Awaiting Approval" ? "Approve" :
                  form.status === "Approved" ? "Mark as Billed" : null;
                if (!primaryLabel) return null;
                const primaryAction = () => {
                  if (!purchaseOrder?.id) { setSaving(true); onSave({ ...form, status: "Awaiting Approval" }).then(() => setSaving(false)); }
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
                        {form.status === "Approved" && onConvertToBill && (
                          <DropdownMenuItem onClick={() => { onClose(); onConvertToBill(purchaseOrder); }}>Convert to Bill</DropdownMenuItem>
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
                  <DropdownMenuContent align="end" className="w-52">
                    {onConvertToBill && form.status === "Approved" && (
                      <DropdownMenuItem onClick={() => { onClose(); onConvertToBill(purchaseOrder); }}>Convert to Bill</DropdownMenuItem>
                    )}
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
            </div>
          </div>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 pt-2" onClick={() => setShowContactList(false)}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">PO Number</label>
              <div className="relative">
                <Input placeholder="Auto-generated..." value={genningNumber ? "Generating..." : form.number}
                  onChange={e => set("number", e.target.value)} disabled={genningNumber} className="pr-8" />
                <button type="button" onClick={() => { setGenningNumber(true); generatePONumber().then(n => { set("number", n); setGenningNumber(false); }); }}
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
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onMouseDown={() => setContact(c)}>
                      <span className="font-medium">{c.company || c.full_name}</span>
                      {c.company && c.full_name !== c.company && <span className="text-xs text-muted-foreground ml-1.5">{c.full_name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end pb-1">
              <StatusBadge status={form.status} />
            </div>
          </div>

          {selectedContact && (
            <div className="bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Supplier</p>
              <p className="font-semibold text-foreground">{selectedContact.company || selectedContact.full_name}</p>
              {selectedContact.tax_id && <p className="text-muted-foreground text-xs">TRN / VAT: {selectedContact.tax_id}</p>}
            </div>
          )}

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

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Internal notes..."
              value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* Files */}
          {purchaseOrder?.id && (
            <div className="rounded-xl border border-border bg-muted/10 px-4 py-4">
              <DocumentFilesPanel docType="purchase_order" docId={purchaseOrder.id} docNumber={purchaseOrder.number} />
            </div>
          )}

          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </DialogContent>
    </Dialog>
    <ProductPickerModal open={productPicker} onClose={() => setProductPicker(false)} onSelect={addFromProduct} />
    </>
  );
}