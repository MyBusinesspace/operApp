import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PurchaseOrderFormBody from "@/components/purchasing/PurchaseOrderFormBody";
import { syncContactType } from "@/lib/syncContactType";

export default function PurchaseOrderEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id;

  const initial = location.state?.duplicate || location.state?.initial || null;
  const [po, setPO] = useState(isNew ? initial : undefined);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    base44.entities.Contact.list("full_name", 500).then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    base44.entities.PurchaseOrder.get(id).then(p => { if (active) setPO(p); }).catch(() => { if (active) setPO(null); });
    return () => { active = false; };
  }, [id, isNew]);

  // Re-read duplicate/initial payload when navigating to /new with state
  useEffect(() => {
    if (isNew) {
      const initial = location.state?.duplicate || location.state?.initial || null;
      if (initial) setPO(initial);
    }
  }, [isNew, location.state]);

  const handleSave = async (form, { close = false, pendingFiles } = {}) => {
    const cleanForm = { ...form, line_items: (form.line_items || []).filter(l => l.description || l.unit_price) };
    syncContactType(cleanForm.contact_id, "provider").catch(() => {});
    const attachFiles = (docId, docNumber) => Promise.all((pendingFiles || []).map(f => base44.entities.DocumentFile.create({
      doc_type: "purchase_order", doc_id: docId, doc_number: docNumber || "",
      file_name: f.file_name, file_url: f.file_url, file_size: f.file_size, file_type: f.file_type,
    }))).catch(() => {});
    if (po?.id) {
      await base44.entities.PurchaseOrder.update(po.id, cleanForm);
      if (pendingFiles?.length) await attachFiles(po.id, po.number);
      const fresh = await base44.entities.PurchaseOrder.get(po.id);
      setPO(fresh);
    } else {
      const created = await base44.entities.PurchaseOrder.create(cleanForm);
      if (pendingFiles?.length) await attachFiles(created.id, created.number);
      navigate(`/purchasing/purchase-orders/${created.id}/edit`, { replace: true });
    }
    if (close) navigate("/purchasing/purchase-orders");
  };

  const handleConvertToBill = (purchaseOrder) => {
    const { id, created_date, updated_date, created_by_id, number, delivery_date, status, ...rest } = purchaseOrder;
    navigate("/purchasing/bills/new", { state: { duplicate: { ...rest, status: "Draft", number: "", issue_date: new Date().toISOString().slice(0, 10), purchase_order_id: purchaseOrder.id, purchase_order_number: purchaseOrder.number } } });
  };

  if (po === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading purchase order...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Breadcrumb */}
      <div className="px-2 pt-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/purchasing-overview" className="hover:text-primary transition-colors">Purchasing overview</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/purchasing/purchase-orders" className="hover:text-primary transition-colors">Purchase Orders</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{po?.id ? "Edit" : "New"}</span>
        </div>
      </div>

      {/* White card with the form */}
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <PurchaseOrderFormBody
            purchaseOrder={po}
            contacts={contacts}
            onSave={handleSave}
            onClose={() => navigate("/purchasing/purchase-orders")}
            onConvertToBill={handleConvertToBill}
            isPage
            active
          />
        </div>
      </div>
    </div>
  );
}