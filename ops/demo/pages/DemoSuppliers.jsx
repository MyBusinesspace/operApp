import { Users } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";

export default function DemoSuppliers() {
  return (
    <DemoDocListPage
      title="Suppliers"
      subtitle="Supplier management — view only in this demo."
      icon={Users}
      overviewTo="/demo/app/purchasing-overview"
      createLabel="New Supplier"
      guidePageId="suppliers"
      searchKeys={["full_name", "email", "city", "type", "status"]}
      getRows={(data) =>
        (data.contacts || []).filter(
          (c) => c.type === "Provider" || c.type === "Both"
        )
      }
      columns={[
        { key: "full_name", label: "Company" },
        { key: "email", label: "Email" },
        { key: "type", label: "Type" },
        { key: "city", label: "City" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}