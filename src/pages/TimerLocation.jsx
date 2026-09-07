import React from "react";
import { MapPin } from "lucide-react";

export default function TimerLocation() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="p-4 rounded-2xl bg-muted">
        <MapPin className="w-10 h-10 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold">Timer & Location</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}