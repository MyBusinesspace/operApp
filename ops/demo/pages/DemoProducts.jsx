import { useState } from "react";
import { Package } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";
import DemoProductDialog from "../components/DemoProductDialog.jsx";

export default function DemoProducts() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <DemoDocListPage
      title="Products & Services"
      subtitle="Product catalog & services — try New Product or open a row."
      icon={Package}
      overviewTo="/demo/app/sales-overview"
      rowsKey="products"
      createLabel="New Product"
      guidePageId="products"
      searchKeys={["code", "name", "type", "status"]}
      onCreate={() => {
        setEditing(null);
        setOpen(true);
      }}
      onRowClick={(row) => {
        setEditing(row);
        setOpen(true);
      }}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "unit", label: "Unit" },
        { key: "sale_price", label: "Sale price", money: true },
        { key: "status", label: "Status" },
      ]}
    >
      <DemoProductDialog
        open={open}
        onClose={() => setOpen(false)}
        product={editing}
      />
    </DemoDocListPage>
  );
}
