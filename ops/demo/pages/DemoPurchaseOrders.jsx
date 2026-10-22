import { ClipboardList } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";

export default function DemoPurchaseOrders() {
  return (
    <DemoDocListPage
      title="Purchase Orders"
      subtitle="Purchase orders & approvals — view only in this demo."
      icon={ClipboardList}
      overviewTo="/demo/app/purchasing-overview"
      rowsKey="purchaseOrders"
      createLabel="New PO"
      guidePageId="purchase-orders"
      searchKeys={["number", "contact_name", "status"]}
      columns={[
        { key: "number", label: "Number" },
        { key: "contact_name", label: "Supplier" },
        { key: "issue_date", label: "Date" },
        { key: "status", label: "Status" },
        { key: "total", label: "Total", money: true },
      ]}
    />
  );
}
