import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

// Back to the previous page (keeps the report, filters and scroll where they were).
// Falls back to the Reports list when the page was opened directly.
export default function BackButton({ fallback = "/reports", fallbackLabel = "Reports" }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.key !== "default") {
    return (
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Back
      </Button>
    );
  }
  return (
    <Link to={fallback}>
      <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> {fallbackLabel}</Button>
    </Link>
  );
}
