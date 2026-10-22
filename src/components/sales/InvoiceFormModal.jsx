import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import InvoiceFormBody from "@/components/sales/InvoiceFormBody";

export default function InvoiceFormModal({ open, onClose, onSave, invoice, contacts = [], onPrint, onDuplicateAsInvoice, onDuplicateAsQuote }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[92vh] overflow-y-auto" hideClose>
        <InvoiceFormBody
          invoice={invoice}
          contacts={contacts}
          onSave={onSave}
          onClose={onClose}
          onPrint={onPrint}
          onDuplicateAsInvoice={onDuplicateAsInvoice}
          onDuplicateAsQuote={onDuplicateAsQuote}
          isPage={false}
          active={open}
        />
      </DialogContent>
    </Dialog>
  );
}