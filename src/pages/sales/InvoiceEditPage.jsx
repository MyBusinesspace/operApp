import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import InvoiceFormBody from "@/components/sales/InvoiceFormBody";
import { printInvoicePdfFromHtml } from "@/components/sales/invoicePdfFromHtml";
import { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import { syncContactType } from "@/lib/syncContactType";
import { autoPostJournal } from "@/lib/autoPostJournal";
import { useToast } from "@/components/ui/use-toast";

export default function InvoiceEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const savedRef = useRef(false);
  const isNew = !id;

  const initial = location.state?.fromQuote || location.state?.duplicate || location.state?.initial || null;
  const [invoice, setInvoice] = useState(isNew ? initial : undefined);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    base44.entities.Contact.list("full_name", 500).then(setContacts).catch(() => {});
    base44.entities.DocumentTemplate.list("-created_date", 50).then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    base44.entities.Invoice.get(id).then(inv => { if (active) setInvoice(inv); }).catch(() => { if (active) setInvoice(null); });
    return () => { active = false; };
  }, [id, isNew]);

  // When navigating to /new with a duplicate/convert payload, the component
  // instance is reused by the router, so reset the invoice from location.state.
  useEffect(() => {
    if (isNew) {
      const initial = location.state?.fromQuote || location.state?.duplicate || location.state?.initial || null;
      if (initial) setInvoice(initial);
    }
  }, [isNew, location.state]);

  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        toast({ title: "Unsaved changes", description: "You left the invoice without saving." });
      }
    };
  }, []);

  const handleSave = async (form, { close = false } = {}) => {
    const prevStatus = invoice?.status;
    syncContactType(form.contact_id, "customer").catch(() => {});
    if (invoice?.id) {
      await base44.entities.Invoice.update(invoice.id, form);
      const fresh = await base44.entities.Invoice.get(invoice.id);
      setInvoice(fresh);
      if (form.status === "Awaiting Payment" && prevStatus !== "Awaiting Payment") {
        autoPostJournal("Invoice", { ...form, id: invoice.id }).catch(() => {});
      }
    } else {
      const created = await base44.entities.Invoice.create(form);
      if (form.status === "Awaiting Payment") {
        autoPostJournal("Invoice", created).catch(() => {});
      }
      navigate(`/sales/invoices/${created.id}/edit`, { replace: true });
    }
    savedRef.current = true;
  };

  const handlePrint = async (inv) => {
    const template = templates.find(t => t.is_default && (t.document_types || []).includes("invoice"))
      || templates.find(t => (t.document_types || []).includes("invoice"))
      || templates[0] || {};
    let fresh = inv;
    if (inv?.id) { try { fresh = await base44.entities.Invoice.get(inv.id); } catch { fresh = inv; } }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    const t = toast({ title: "Generating PDF", description: "Preparing your invoice document…" });
    try {
      await printInvoicePdfFromHtml({ invoice: fresh, contact, template });
      t.update({ title: "PDF ready", description: "Your invoice has been downloaded" });
    } catch (e) {
      t.update({ title: "PDF failed", description: "Could not generate the PDF", variant: "destructive" });
    }
  };

  const handleDuplicateAsInvoice = (inv) => {
    const { id, created_date, updated_date, created_by_id, number, contact_id, contact_name, ...rest } = inv;
    navigate("/sales/invoices/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const handleDuplicateAsQuote = (inv) => {
    const { id, created_date, updated_date, created_by_id, number, due_date, contact_id, contact_name, ...rest } = inv;
    navigate("/sales/quotes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  if (invoice === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading invoice...
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
          <Link to="/sales/invoices" className="hover:text-primary transition-colors">Invoices</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{invoice?.id ? "Edit" : "New"}</span>
        </div>
      </div>

      {/* White card with the form */}
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <InvoiceFormBody
            invoice={invoice}
            contacts={contacts}
            onSave={handleSave}
            onClose={() => navigate("/sales/invoices")}
            onPrint={handlePrint}
            onDuplicateAsInvoice={handleDuplicateAsInvoice}
            onDuplicateAsQuote={handleDuplicateAsQuote}
            isPage
            active
          />
        </div>
      </div>
    </div>
  );
}