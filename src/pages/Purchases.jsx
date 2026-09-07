import React from "react";
import PlaceholderPage from "../components/shared/PlaceholderPage";
import { ShoppingCart } from "lucide-react";

export default function Purchases() {
  return <PlaceholderPage title="Purchases" subtitle="Bills, purchase orders & expenses" icon={ShoppingCart} actionLabel="New Bill" />;
}