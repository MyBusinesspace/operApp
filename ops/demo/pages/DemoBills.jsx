import { Receipt } from "lucide-react";
import DemoDocListPage from "../components/DemoDocListPage.jsx";

export default function DemoBills() {
  return (
    <DemoDocListPage
      title="Bills"
      subtitle="Supplier bills & payments — view only in this demo."
      icon={Receipt}
      overviewTo="/demo/app/purchasing-overview"
      rowsKey="bills"
      createLabel="New Bill"
      guidePageId="bills"
      searchKeys={["number", "contact_name", "status"]}
      columns={[
        { key: "number", label: "Number" },
        { key: "contact_name", label: "Supplier" },
        { key: "issue_date", label: "Issue date" },
        { key: "status", label: "Status" },
        { key: "total", label: "Total", money: true },
      ]}
    />
  );
}
