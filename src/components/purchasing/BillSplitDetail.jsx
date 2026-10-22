import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import InvoicePreviewModal from "@/components/sales/InvoicePreviewModal";
import { billAsInvoice } from "@/components/purchasing/BillPrintDocument";

// Bill eye preview: the same central modal and DocContent used by Invoices.
export default function BillSplitDetail({ bill: initialBill, contact, onClose, onEdit, onPrint }) {
  const { data: templates = [] } = useQuery({
    queryKey: ["document-templates", "bill-preview"],
    queryFn: () => base44.entities.DocumentTemplate.list("-created_date", 50),
    staleTime: 5 * 60 * 1000,
  });
  const { data: bill = initialBill } = useQuery({
    queryKey: ["bills", "detail", initialBill?.id],
    queryFn: () => base44.entities.Bill.get(initialBill.id),
    enabled: Boolean(initialBill?.id),
    initialData: initialBill ?? undefined,
  });
  if (!bill) return null;
  const real = (templates || []).filter(t => !String(t.name || "").startsWith("__"));
  const template = real.find(t => t.is_default && (t.document_types || []).includes("invoice"))
    || real.find(t => t.is_default) || real[0] || {};
  return (
    <InvoicePreviewModal
      open
      onClose={onClose}
      invoice={billAsInvoice(bill)}
      contact={contact}
      template={template}
      docTitle="Bill"
      docName="Bill"
      numberLabel="Bill No."
      onPrint={onPrint ? () => onPrint(bill) : undefined}
      onEdit={onEdit ? () => onEdit(bill) : undefined}
    />
  );
}
