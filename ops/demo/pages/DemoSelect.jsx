import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, HeartPulse, Wrench } from "lucide-react";
import {
  INDUSTRIES,
  isDemoEnabled,
  setDemoIndustryId,
} from "@demo/index.js";
import "../demo.css";

const ICONS = {
  construction: Building2,
  healthcare: HeartPulse,
  facilities: Wrench,
};

export default function DemoSelect() {
  const navigate = useNavigate();

  if (!isDemoEnabled()) {
    return <Navigate to="/" replace />;
  }

  const start = (id) => {
    setDemoIndustryId(id);
    navigate("/demo/app");
  };

  return (
    <div className="demo-shell">
      <div className="demo-select">
        <Link to="/" className="demo-back">
          <ArrowLeft size={16} aria-hidden />
          Back to OperApp
        </Link>
        <p className="demo-kicker">Interactive demo</p>
        <h1>Choose your industry</h1>
        <p className="demo-lead">
          Explore a sample OperApp dashboard with realistic fake data. Nothing
          here is saved to your real workspace.
        </p>
        <div className="demo-industry-grid">
          {INDUSTRIES.map((ind) => {
            const Icon = ICONS[ind.id] || Building2;
            return (
              <button
                key={ind.id}
                type="button"
                className="demo-industry-card"
                style={{ "--demo-accent": ind.accent }}
                onClick={() => start(ind.id)}
              >
                <span className="demo-industry-icon">
                  <Icon size={22} aria-hidden />
                </span>
                <span className="demo-industry-label">{ind.label}</span>
                <span className="demo-industry-blurb">{ind.blurb}</span>
                <span className="demo-industry-cta">
                  Open dashboard
                  <ArrowRight size={14} aria-hidden />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
