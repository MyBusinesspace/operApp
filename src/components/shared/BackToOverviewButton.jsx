import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BackToOverviewButton({ to = "/operations-overview" }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => navigate(to)}
      className="h-9 w-9 rounded-xl border-border/60 bg-background shadow-sm hover:bg-accent hover:border-primary/40 hover:text-primary transition-all duration-200 hover:-translate-x-0.5 group"
      title="Back to Overview"
    >
      <ArrowLeft className="w-4.5 h-4.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
    </Button>
  );
}