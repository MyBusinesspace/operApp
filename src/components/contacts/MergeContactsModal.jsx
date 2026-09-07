import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Merge, ChevronLeft, ChevronRight, Check, AlertTriangle } from "lucide-react";

const FIELDS = [
  { key: "full_name", label: "Company Name" },
  { key: "company", label: "Nickname" },
  { key: "reference", label: "Reference" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "type", label: "Category" },
  { key: "status", label: "Status" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "tax_id", label: "Tax ID / VAT" },
  { key: "website", label: "Website" },
  { key: "notes", label: "Notes" },
  { key: "fiscal_legal_name", label: "Legal Name" },
  { key: "fiscal_address", label: "Fiscal Address" },
  { key: "fiscal_city", label: "Fiscal City" },
  { key: "fiscal_country", label: "Fiscal Country" },
  { key: "fiscal_zip", label: "Postal / ZIP" },
  { key: "fiscal_currency", label: "Currency" },
  { key: "fiscal_payment_terms", label: "Payment Terms" },
  { key: "fiscal_bank_name", label: "Bank Name" },
  { key: "fiscal_iban", label: "IBAN" },
  { key: "fiscal_swift", label: "SWIFT / BIC" },
];

// Entities that may reference a contact_id
const LINKED_ENTITIES = [
  "Invoice", "Bill", "Quote", "PurchaseOrder",
  "Project", "WorkOrder", "Task",
  "BankTransaction", "JournalEntry",
  "PettyCashEntry", "Asset",
];

export default function MergeContactsModal({ open, contacts, onClose, onDone }) {
  const [a, b] = contacts; // exactly 2

  // chosen[field] = "a" | "b" — which record's value to keep
  const [chosen, setChosen] = useState(() => {
    const init = {};
    FIELDS.forEach(f => {
      init[f.key] = a[f.key] ? "a" : "b";
    });
    return init;
  });

  // Which record becomes the "primary" (survives); the other is deleted
  const [primary, setPrimary] = useState("a");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  // When the primary (or the contact pair) changes, default every field to the
  // primary's value — falling back to the other record only when the primary has none.
  useEffect(() => {
    const prim = primary === "a" ? a : b;
    const otherSide = primary === "a" ? "b" : "a";
    const init = {};
    FIELDS.forEach(f => {
      init[f.key] = prim[f.key] ? primary : otherSide;
    });
    setChosen(init);
  }, [primary, a?.id, b?.id]);

  const primaryContact = primary === "a" ? a : b;
  const secondaryContact = primary === "a" ? b : a;

  const pick = (field, side) => setChosen(prev => ({ ...prev, [field]: side }));

  const handleMerge = async () => {
    setMerging(true);
    setError("");
    try {
      // Build merged record from chosen fields
      const merged = {};
      FIELDS.forEach(f => {
        const src = chosen[f.key] === "a" ? a : b;
        if (src[f.key] !== undefined && src[f.key] !== "") merged[f.key] = src[f.key];
      });

      // Merge contact_persons arrays (dedupe by name)
      const cpA = a.contact_persons || [];
      const cpB = b.contact_persons || [];
      const cpNames = new Set(cpA.map(p => p.name?.toLowerCase()));
      const mergedPersons = [...cpA, ...cpB.filter(p => !cpNames.has(p.name?.toLowerCase()))];
      if (mergedPersons.length > 0) merged.contact_persons = mergedPersons;

      // Merge notes from both if both have notes
      if (a.notes && b.notes && a.notes !== b.notes) {
        merged.notes = `${a.notes}\n---\n${b.notes}`;
      }

      // Update primary record
      await base44.entities.Contact.update(primaryContact.id, merged);

      // Re-link all dependent records from secondary → primary
      await Promise.all(LINKED_ENTITIES.map(async (entityName) => {
        try {
          const records = await base44.entities[entityName].filter({ contact_id: secondaryContact.id });
          await Promise.all(records.map(r =>
            base44.entities[entityName].update(r.id, {
              contact_id: primaryContact.id,
              contact_name: merged.full_name || primaryContact.full_name,
            }).catch(() => {})
          ));
        } catch {}
      }));

      // Delete secondary record
      await base44.entities.Contact.delete(secondaryContact.id);

      onDone(primaryContact.id);
    } catch (err) {
      setError(err.message || "Merge failed");
    }
    setMerging(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-primary" />
            Merge Duplicate Contacts
          </DialogTitle>
        </DialogHeader>

        {/* Primary selector */}
        <div className="flex items-stretch gap-3 mb-4 p-3 rounded-xl bg-muted/40 border border-border">
          {[a, b].map((c, idx) => {
            const side = idx === 0 ? "a" : "b";
            const isPrimary = primary === side;
            return (
              <button key={c.id} onClick={() => setPrimary(side)}
                className={`flex-1 text-left rounded-lg border p-3 transition-all ${isPrimary ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isPrimary ? "text-primary" : "text-muted-foreground"}`}>
                    {isPrimary ? "✓ Keep (Primary)" : "Merge into primary"}
                  </span>
                </div>
                <p className="font-semibold text-sm text-foreground">{c.full_name}</p>
                {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                {c.reference && <p className="text-xs font-mono text-primary/70">{c.reference}</p>}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Click a value to choose which one to keep. All linked records (invoices, projects, etc.) will be re-assigned to the primary contact.
        </p>

        {/* Field-by-field picker */}
        <div className="rounded-xl border border-border overflow-hidden mb-4">
          <div className="grid grid-cols-[120px_1fr_1fr] text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 border-b border-border px-3 py-2">
            <span>Field</span>
            <span className="pl-2">{a.full_name || "Contact A"}</span>
            <span className="pl-2">{b.full_name || "Contact B"}</span>
          </div>
          <div className="divide-y divide-border">
            {FIELDS.filter(f => a[f.key] || b[f.key]).map(f => {
              const valA = a[f.key] || "";
              const valB = b[f.key] || "";
              const same = valA === valB;
              return (
                <div key={f.key} className={`grid grid-cols-[120px_1fr_1fr] items-stretch ${same ? "opacity-50" : ""}`}>
                  <div className="px-3 py-2.5 text-xs font-medium text-muted-foreground flex items-center">{f.label}</div>
                  {["a", "b"].map(side => {
                    const val = side === "a" ? valA : valB;
                    const isChosen = chosen[f.key] === side;
                    return (
                      <button key={side} disabled={same || !val}
                        onClick={() => pick(f.key, side)}
                        className={`text-left px-3 py-2.5 text-xs transition-colors border-l border-border ${
                          same ? "bg-muted/20 text-muted-foreground cursor-default"
                          : !val ? "bg-muted/10 text-muted-foreground/30 cursor-default"
                          : isChosen ? "bg-emerald-50 text-emerald-800 font-medium"
                          : "hover:bg-muted/30 text-foreground cursor-pointer"
                        }`}>
                        {val && isChosen && !same && <Check className="w-3 h-3 inline mr-1 text-emerald-600" />}
                        {val || <span className="italic opacity-40">—</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {/* contact_persons summary row */}
            {((a.contact_persons?.length || 0) + (b.contact_persons?.length || 0)) > 0 && (
              <div className="grid grid-cols-[120px_1fr_1fr] items-center bg-blue-50/50">
                <div className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Contact Persons</div>
                <div className="px-3 py-2.5 text-xs text-blue-700 border-l border-border col-span-2">
                  All {(a.contact_persons?.length || 0) + (b.contact_persons?.length || 0)} persons from both records will be merged (duplicates removed)
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={merging}>Cancel</Button>
          <Button onClick={handleMerge} disabled={merging} className="gap-2 min-w-[160px]">
            {merging ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Merging...</>
            ) : (
              <><Merge className="w-4 h-4" /> Merge Contacts</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}