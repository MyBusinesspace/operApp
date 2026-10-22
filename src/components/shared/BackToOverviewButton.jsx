import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoBack } from "@/hooks/useGoBack";

export default function BackToOverviewButton({ to = "/operations-overview", title = "Back to Overview" }) {
  const goBack = useGoBack(to);
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={goBack}
      className="h-9 w-9 rounded-xl border-border/60 bg-background shadow-sm hover:bg-accent hover:border-primary/40 hover:text-primary transition-all duration-200 hover:-translate-x-0.5 group"
      title={title}
    >
      <ArrowLeft className="w-4.5 h-4.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
    </Button>
  );
}