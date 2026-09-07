import React from "react";
import PlaceholderPage from "../components/shared/PlaceholderPage";
import { FileText } from "lucide-react";

export default function Sales() {
  return <PlaceholderPage title="Sales" subtitle="Invoices, quotes & customer management" icon={FileText} actionLabel="New Invoice" />;
}