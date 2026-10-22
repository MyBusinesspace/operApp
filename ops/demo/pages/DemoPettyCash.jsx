import { Wallet } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";

export default function DemoPettyCash() {
  return (
    <DemoDocListPage
      title="Petty Cash"
      subtitle="Cash entries & tracking — view only in this demo."
      icon={Wallet}
      overviewTo="/demo/app/purchasing-overview"
      rowsKey="pettyCash"
      createLabel="New Entry"
      guidePageId="petty-cash"
      searchKeys={["employee_name", "category", "note", "type", "status"]}
      columns={[
        { key: "date", label: "Date" },
        { key: "employee_name", label: "Employee" },
        { key: "type", label: "Type" },
        { key: "category", label: "Category" },
        { key: "note", label: "Note" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount", money: true },
      ]}
    />
  );
}
