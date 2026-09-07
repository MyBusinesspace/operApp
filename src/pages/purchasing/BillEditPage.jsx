import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import BillFormBody from "@/components/purchasing/BillFormBody";
import { syncContactType } from "@/lib/syncContactType";
import { autoPostJournal } from "@/lib/autoPostJournal";

export default function BillEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id;

  const initial = location.state?.duplicate || location.state?.initial || null;
  const [bill, setBill] = useState(isNew ? initial : undefined);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    base44.entities.Contact.list("full_name", 500).then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    base44.entities.Bill.get(id).then(b => { if (active) setBill(b); }).catch(() => { if (active) setBill(null); });
    return () => { active = false; };
  }, [id, isNew]);

  // Re-read duplicate/initial payload when navigating to /new with state
  useEffect(() => {
    if (isNew) {
      const initial = location.state?.duplicate || location.state?.initial || null;
      if (initial) setBill(initial);
    }
  }, [isNew, location.state]);

  const handleSave = async (form, { close = false, pendingFiles } = {}) => {
    const cleanForm = { ...form, line_items: (form.line_items || []).filter(l => l.description || l.unit_price) };
    const prevStatus = bill?.status;
    syncContactType(cleanForm.contact_id, "provider").catch(() => {});
    const attachFiles = (docId, docNumber) => Promise.all((pendingFiles || []).map(f => base44.entities.DocumentFile.create({
      doc_type: "bill", doc_id: docId, doc_number: docNumber || "",
      file_name: f.file_name, file_url: f.file_url, file_size: f.file_size, file_type: f.file_type,
    }))).catch(() => {});
    if (bill?.id) {
      await base44.entities.Bill.update(bill.id, cleanForm);
      if (pendingFiles?.length) await attachFiles(bill.id, bill.number);
      const fresh = await base44.entities.Bill.get(bill.id);
      setBill(fresh);
      if (cleanForm.status === "Awaiting Payment" && prevStatus !== "Awaiting Payment") {
        autoPostJournal("Bill", { ...cleanForm, id: bill.id }).catch(() => {});
      }
    } else {
      const created = await base44.entities.Bill.create(cleanForm);
      if (pendingFiles?.length) await attachFiles(created.id, created.number);
      if (cleanForm.status === "Awaiting Payment") {
        autoPostJournal("Bill", created).catch(() => {});
      }
      navigate(`/purchasing/bills/${created.id}/edit`, { replace: true });
    }
    if (close) navigate("/purchasing/bills");
  };

  if (bill === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading bill...
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
          <Link to="/purchasing/bills" className="hover:text-primary transition-colors">Bills</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{bill?.id ? "Edit" : "New"}</span>
        </div>
      </div>

      {/* White card with the form */}
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <BillFormBody
            bill={bill}
            contacts={contacts}
            onSave={handleSave}
            onClose={() => navigate("/purchasing/bills")}
            isPage
            active
          />
        </div>
      </div>
    </div>
  );
}