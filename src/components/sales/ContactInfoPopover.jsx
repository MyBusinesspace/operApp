import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Mail, Phone, MapPin, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const fmt = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ContactInfoPopover({ contact, currency = "AED", currentDocId = null }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!contact?.id) { setStats(null); return; }
    // Fetch invoices for this contact to compute totals
    Promise.all([
      base44.entities.Invoice.filter({ contact_id: contact.id }).catch(() => []),
    ]).then(([invoices]) => {
      const today = new Date();
      let overdue = 0;
      let outstanding = 0;
      invoices.forEach(inv => {
        if (["Cancelled", "Draft"].includes(inv.status)) return;
        const remaining = (inv.total || 0) - (inv.amount_paid || 0);
        if (remaining > 0) {
          outstanding += remaining;
          if (inv.due_date && new Date(inv.due_date) < today && inv.status !== "Paid") {
            overdue += remaining;
          }
        }
      });
      setStats({ overdue, outstanding });
    });
  }, [contact?.id]);

  if (!contact) return null;

  const name = contact.fiscal_legal_name || contact.company || contact.full_name;
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const address = [
    contact.tax_id ? `TRN: ${contact.tax_id}` : null,
    contact.fiscal_address || contact.address,
    [contact.fiscal_city || contact.city, contact.fiscal_country || contact.country].filter(Boolean).join(", "),
    contact.fiscal_zip,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          {contact.avatar_url ? (
            <img src={contact.avatar_url} alt={name} className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700 shrink-0">
              {initials}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-foreground">{name}</span>
              <Link
                to={`/contacts/${contact.id}`}
                target="_blank"
                className="text-primary hover:text-primary/80 transition-colors"
                title="Open contact"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            {contact.company && contact.full_name !== contact.company && (
              <p className="text-xs text-muted-foreground">{contact.full_name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contact details */}
      <div className="px-4 py-3 space-y-2">
        {contact.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
            <a href={`mailto:${contact.email}`} className="hover:text-primary hover:underline transition-colors">{contact.email}</a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
            <span>{contact.phone}</span>
          </div>
        )}
        {address.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60 mt-0.5" />
            <div className="space-y-0.5">
              {address.map((line, i) => <p key={i}>{line}</p>)}
            </div>
          </div>
        )}
      </div>

      {/* Invoice totals */}
      {stats !== null && (
        <div className="border-t border-border px-4 py-3 bg-muted/10">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice totals</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Amount overdue</span>
              <span className={`font-semibold tabular-nums ${stats.overdue > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {fmt(stats.overdue)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">They owe you</span>
              <span className="font-medium tabular-nums text-foreground">{fmt(stats.outstanding)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}