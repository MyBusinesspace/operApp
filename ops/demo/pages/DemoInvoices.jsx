import { useState } from "react";
import { FileText } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";
import DemoSalesDocDialog from "../components/DemoSalesDocDialog.jsx";

function enrichInvoice(row, data) {
  if (row.line_items?.length) return row;
  const products = data.products || [];
  const p0 = products[0];
  const line_items = p0
    ? [
        {
          item_code: p0.code,
          description: p0.name,
          quantity: 1,
          unit_price: Number(p0.sale_price) || Number(row.total) || 0,
          discount: "",
          tax_rate: 5,
          total: Number(row.total) || (Number(p0.sale_price) || 0) * 1.05,
        },
      ]
    : [
        {
          item_code: "",
          description: "Invoiced services",
          quantity: 1,
          unit_price: Number(row.total) || 0,
          discount: "",
          tax_rate: 5,
          total: Number(row.total) || 0,
        },
      ];
  return {
    ...row,
    line_items,
    currency: row.currency || "AED",
    due_date: row.due_date || row.issue_date,
  };
}

export default function DemoInvoices() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <DemoDocListPage
      title="Invoices"
      subtitle="Create & manage customer invoices — try New Invoice or open a row."
      icon={FileText}
      overviewTo="/demo/app/sales-overview"
      rowsKey="invoices"
      createLabel="New Invoice"
      searchKeys={["number", "contact_name", "status"]}
      guidePageId="invoices"
      onCreate={() => {
        setEditing(null);
        setOpen(true);
      }}
      onRowClick={(row, data) => {
        setEditing(enrichInvoice(row, data));
        setOpen(true);
      }}
      columns={[
        { key: "number", label: "Number" },
        { key: "contact_name", label: "Customer" },
        { key: "issue_date", label: "Issue date" },
        { key: "status", label: "Status" },
        { key: "total", label: "Total", money: true },
      ]}
    >
      {(data) => (
        <DemoSalesDocDialog
          open={open}
          onClose={() => setOpen(false)}
          kind="invoice"
          document={editing}
          contacts={data.contacts || []}
          products={data.products || []}
          projects={data.projects || []}
        />
      )}
    </DemoDocListPage>
  );
}
