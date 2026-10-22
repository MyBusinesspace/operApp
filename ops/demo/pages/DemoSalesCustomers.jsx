import { useState } from "react";
import { Users } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";
import DemoCompanyDialog from "../components/DemoCompanyDialog.jsx";

export default function DemoSalesCustomers() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <DemoDocListPage
      title="Customers"
      subtitle="Customer management — try New Customer or open a row."
      icon={Users}
      overviewTo="/demo/app/sales-overview"
      createLabel="New Customer"
      guidePageId="sales-customers"
      searchKeys={["full_name", "email", "city", "type", "status"]}
      getRows={(data) =>
        (data.contacts || []).filter(
          (c) => c.type === "Customer" || c.type === "Both"
        )
      }
      onCreate={() => {
        setEditing(null);
        setOpen(true);
      }}
      onRowClick={(row) => {
        setEditing(row);
        setOpen(true);
      }}
      columns={[
        { key: "full_name", label: "Company" },
        { key: "email", label: "Email" },
        { key: "type", label: "Type" },
        { key: "city", label: "City" },
        { key: "status", label: "Status" },
      ]}
    >
      {(data) => (
        <DemoCompanyDialog
          open={open}
          onClose={() => setOpen(false)}
          contact={editing}
          groups={data.groups || []}
          defaults={{ type: "Customer", status: "Active" }}
        />
      )}
    </DemoDocListPage>
  );
}
