import { useState } from "react";
import { FileText } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";
import DemoSalesDocDialog from "../components/DemoSalesDocDialog.jsx";

function enrichQuote(row, data) {
  if (row.line_items?.length) return row;
  const products = data.products || [];
  const p0 = products[0];
  const p1 = products[1];
  const line_items = [];
  if (p0) {
    line_items.push({
      item_code: p0.code,
      description: p0.name,
      quantity: 1,
      unit_price: Number(p0.sale_price) || 0,
      discount: "",
      tax_rate: 5,
      total: (Number(p0.sale_price) || 0) * 1.05,
    });
  }
  if (p1 && (row.total || 0) > (p0?.sale_price || 0) * 2) {
    line_items.push({
      item_code: p1.code,
      description: p1.name,
      quantity: 2,
      unit_price: Number(p1.sale_price) || 0,
      discount: "",
      tax_rate: 5,
      total: (Number(p1.sale_price) || 0) * 2 * 1.05,
    });
  }
  if (!line_items.length) {
    line_items.push({
      item_code: "",
      description: "Quoted services",
      quantity: 1,
      unit_price: Number(row.total) || 0,
      discount: "",
      tax_rate: 5,
      total: Number(row.total) || 0,
    });
  }
  return { ...row, line_items, currency: row.currency || "AED" };
}

export default function DemoQuotes() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <DemoDocListPage
      title="Quotes"
      subtitle="Quotes & proposals — open New Quote or click a row to explore the form."
      icon={FileText}
      overviewTo="/demo/app/sales-overview"
      rowsKey="quotes"
      createLabel="New Quote"
      searchKeys={["number", "contact_name", "status"]}
      guidePageId="quotes"
      onCreate={() => {
        setEditing(null);
        setOpen(true);
      }}
      onRowClick={(row, data) => {
        setEditing(enrichQuote(row, data));
        setOpen(true);
      }}
      columns={[
        { key: "number", label: "Number" },
        { key: "contact_name", label: "Customer" },
        { key: "status", label: "Status" },
        { key: "total", label: "Total", money: true },
      ]}
    >
      {(data) => (
        <DemoSalesDocDialog
          open={open}
          onClose={() => setOpen(false)}
          kind="quote"
          document={editing}
          contacts={data.contacts || []}
          products={data.products || []}
          projects={data.projects || []}
        />
      )}
    </DemoDocListPage>
  );
}
