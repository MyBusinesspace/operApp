import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import QuoteFormBody from "@/components/sales/QuoteFormBody";
import { printQuotePdfFromHtml } from "@/components/sales/quotePdfFromHtml";
import { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import { syncContactType } from "@/lib/syncContactType";
import { useToast } from "@/components/ui/use-toast";

export default function QuoteEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const savedRef = useRef(false);
  const isNew = !id;

  const [quote, setQuote] = useState(isNew ? (location.state?.duplicate || null) : undefined);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    base44.entities.Contact.list("full_name", 200).then(setContacts).catch(() => {});
    base44.entities.DocumentTemplate.list("-created_date", 100).then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    base44.entities.Quote.get(id).then(q => { if (active) setQuote(q); }).catch(() => { if (active) setQuote(null); });
    return () => { active = false; };
  }, [id, isNew]);

  // When navigating to /new with a duplicate payload (copy-to), the component
  // instance is reused by the router, so reset the quote from location.state.
  useEffect(() => {
    if (isNew && location.state?.duplicate) {
      setQuote(location.state.duplicate);
    }
  }, [isNew, location.state]);

  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        toast({ title: "Unsaved changes", description: "You left the quote without saving." });
      }
    };
  }, []);

  const handleSave = async (form) => {
    syncContactType(form.contact_id, "customer").catch(() => {});
    if (quote?.id) {
      await base44.entities.Quote.update(quote.id, form);
      const fresh = await base44.entities.Quote.get(quote.id);
      setQuote(fresh);
    } else {
      const created = await base44.entities.Quote.create(form);
      navigate(`/sales/quotes/${created.id}/edit`, { replace: true });
    }
    savedRef.current = true;
  };

  const handlePrint = async (q) => {
    const template = templates.find(t => t.is_default && (t.document_types || []).includes("quote"))
      || templates.find(t => (t.document_types || []).includes("quote"))
      || templates[0] || {};
    let fresh = q;
    if (q?.id) { try { fresh = await base44.entities.Quote.get(q.id); } catch { fresh = q; } }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    const t = toast({ title: "Generating PDF", description: "Preparing your quote document…" });
    try {
      await printQuotePdfFromHtml({ quote: fresh, contact, template });
      t.update({ title: "PDF ready", description: "Your quote has been downloaded" });
    } catch (e) {
      t.update({ title: "PDF failed", description: "Could not generate the PDF", variant: "destructive" });
    }
  };

  const handleConvertToInvoice = async (q) => {
    if (q.status !== "Invoiced") {
      const user = await base44.auth.me().catch(() => null);
      const userName = user?.full_name || user?.email || "Unknown";
      await base44.entities.Quote.update(q.id, { status: "Invoiced" });
      await logDocumentHistory({ docType: "quote", docId: q.id, docNumber: q.number, action: "Status Changed", detail: `Status changed from ${q.status} to Invoiced (converted to invoice)`, userName });
    }
    const { id: _id, created_date, updated_date, created_by_id, number, expiry_date, status, ...rest } = q;
    navigate("/sales/invoices/new", { state: { fromQuote: { ...rest, number: "", issue_date: new Date().toISOString().slice(0, 10), quote_id: q.id } } });
  };

  if (quote === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading quote...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Breadcrumb */}
      <div className="px-2 pt-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/sales/quotes" className="hover:text-primary transition-colors">Quotes</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{quote?.id ? "Edit" : "New"}</span>
        </div>
      </div>

      {/* White card with the form */}
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <QuoteFormBody
            quote={quote}
            contacts={contacts}
            onSave={handleSave}
            onClose={() => navigate("/sales/quotes")}
            onPrint={handlePrint}
            onConvertToInvoice={handleConvertToInvoice}
            isPage
            active
          />
        </div>
      </div>
    </div>
  );
}