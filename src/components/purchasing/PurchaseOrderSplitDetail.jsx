import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import InvoicePreviewModal from "@/components/sales/InvoicePreviewModal";


// PO eye preview: the same central modal and DocContent used by Invoices.
export default function PurchaseOrderSplitDetail({ po: initialPo, contact, onClose, onEdit, onPrint }) {
  const { data: templates = [] } = useQuery({
    queryKey: ["document-templates", "po-preview"],
    queryFn: () => base44.entities.DocumentTemplate.list("-created_date", 50),
    staleTime: 5 * 60 * 1000,
  });
  const { data: po = initialPo } = useQuery({
    queryKey: ["purchase-orders", "detail", initialPo?.id],
    queryFn: () => base44.entities.PurchaseOrder.get(initialPo.id),
    enabled: Boolean(initialPo?.id),
    initialData: initialPo ?? undefined,
  });
  if (!po) return null;
  const real = (templates || []).filter(t => !String(t.name || "").startsWith("__"));
  const template = real.find(t => t.is_default && (t.document_types || []).includes("invoice"))
    || real.find(t => t.is_default) || real[0] || {};
  return (
    <InvoicePreviewModal
      open
      onClose={onClose}
      invoice={{ ...po, number: po.number || "Assigned on approval", terms: "", subtotal: po.subtotal ?? 0, doc_summary: po.doc_summary || (po.delivery_date ? `Delivery date: ${(()=>{const m=String(po.delivery_date).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m[2])-1]} ${m[1]}`:po.delivery_date;})()}` : ""), line_items: (po.line_items || []).map(l => ({ ...l, quantity: l.quantity ?? 1 })) }}
      contact={contact}
      template={template}
      docTitle="Purchase Order"
      docName="Purchase Order"
      numberLabel="PO No."
      onPrint={onPrint ? () => onPrint(po) : undefined}
      onEdit={onEdit ? () => onEdit(po) : undefined}
    />
  );
}
