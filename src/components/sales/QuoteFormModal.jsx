import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import QuoteFormBody from "@/components/sales/QuoteFormBody";

export default function QuoteFormModal({ open, onClose, onSave, quote, contacts = [], onPrint, onConvertToInvoice }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[92vh] overflow-y-auto" hideClose>
        <QuoteFormBody
          quote={quote}
          contacts={contacts}
          onSave={onSave}
          onClose={onClose}
          onPrint={onPrint}
          onConvertToInvoice={onConvertToInvoice}
          isPage={false}
          active={open}
        />
      </DialogContent>
    </Dialog>
  );
}