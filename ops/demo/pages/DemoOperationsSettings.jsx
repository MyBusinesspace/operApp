import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  MapPin,
  Save,
  Settings,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WorkingReportLogicInfo from "@/components/timesheets/WorkingReportLogicInfo";
import { TIMEZONES, getTimezoneShortLabel } from "@/lib/timezones";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import {
  DEMO_NUMBERING,
  DEMO_OPS_SETTINGS,
  DEMO_TASK_CATEGORIES,
  DEMO_TASK_SHIFTS,
  DEMO_WO_CATEGORIES,
  DEMO_WO_STATUSES,
} from "../fixtures/settingsDefaults.js";
import {
  DemoLabelItemList,
  DemoNumberingSection,
  DemoShiftList,
} from "../components/DemoSettingsShared.jsx";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

const TABS = [
  { id: "workorders", label: "Work Orders", icon: Wrench },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "general", label: "Timesheet", icon: Settings },
  { id: "location", label: "Location", icon: MapPin },
  { id: "photos", label: "Photos", icon: Camera },
  { id: "report", label: "Working Report", icon: FileText },
];

const INTERVAL_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "5", label: "Every 5 minutes" },
  { value: "10", label: "Every 10 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every 60 minutes" },
];

export default function DemoOperationsSettings() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );
  const [activeTab, setActiveTab] = useState("workorders");
  const [settings, setSettings] = useState(DEMO_OPS_SETTINGS);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const set = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }));
  const noopSave = (e) => e?.preventDefault?.();

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
          <Link
            to="/demo/app"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Overall Quick View
          </Link>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Operations Settings
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configure timesheet, GPS, and photo requirements
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div
            className={`bg-card border border-border rounded-xl p-6 space-y-4 ${
              activeTab === "workorders" || activeTab === "tasks"
                ? "max-w-4xl"
                : "max-w-2xl"
            }`}
          >
            {activeTab === "workorders" && (
              <div className="space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="w-4 h-4 text-orange-600" />
                    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Work Orders
                    </h2>
                  </div>
                  <DemoNumberingSection
                    label="Work Order"
                    prefix={DEMO_NUMBERING.workOrder.prefix}
                    nextNumber={DEMO_NUMBERING.workOrder.next_number}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DemoLabelItemList title="Categories" items={DEMO_WO_CATEGORIES} />
                    <DemoLabelItemList title="Statuses" items={DEMO_WO_STATUSES} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckSquare className="w-4 h-4 text-orange-600" />
                    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Tasks
                    </h2>
                  </div>
                  <DemoNumberingSection
                    label="Task"
                    prefix={DEMO_NUMBERING.task.prefix}
                    nextNumber={DEMO_NUMBERING.task.next_number}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DemoLabelItemList title="Categories" items={DEMO_TASK_CATEGORIES} />
                    <DemoShiftList shifts={DEMO_TASK_SHIFTS} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "general" && (
              <>
                <ToggleRow
                  label="Track GPS Location"
                  desc="Record location when clocking in/out"
                  value={settings.track_gps_location}
                  onChange={(v) => set("track_gps_location", v)}
                />
                <ToggleRow
                  label="Require Work Order"
                  desc="Employees must select a work order to clock in"
                  value={settings.require_work_order}
                  onChange={(v) => set("require_work_order", v)}
                />
                <ToggleRow
                  label="Allow Manual Edit"
                  desc="Employees can edit their timesheet times"
                  value={settings.allow_manual_edit}
                  onChange={(v) => set("allow_manual_edit", v)}
                />
                <ToggleRow
                  label="Enable Alarms"
                  desc="Notify employees before work order start time"
                  value={settings.enable_alarms}
                  onChange={(v) => set("enable_alarms", v)}
                />
                {settings.enable_alarms && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Alarm Minutes Before
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.alarm_minutes_before}
                      onChange={(e) =>
                        set("alarm_minutes_before", Number(e.target.value))
                      }
                      className="max-w-xs"
                    />
                  </div>
                )}

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Validation Timezone
                    </label>
                    <Select
                      value={
                        settings.working_report_validation_timezone || "Asia/Dubai"
                      }
                      onValueChange={(v) =>
                        set("working_report_validation_timezone", v)
                      }
                    >
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.id} value={tz.id}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Timezone in which the validation hour is interpreted.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Working Report Validation Time
                    </label>
                    <Select
                      value={String(settings.working_report_validation_hour ?? 20)}
                      onValueChange={(v) =>
                        set("working_report_validation_hour", Number(v))
                      }
                    >
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, h) => {
                          const label =
                            h === 0
                              ? "12:00 AM"
                              : h < 12
                                ? `${h}:00 AM`
                                : h === 12
                                  ? "12:00 PM"
                                  : `${h - 12}:00 PM`;
                          return (
                            <SelectItem key={h} value={String(h)}>
                              {label} (
                              {getTimezoneShortLabel(
                                settings.working_report_validation_timezone
                              )}
                              )
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {activeTab === "location" && (
              <>
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
                  Configure GPS tracking settings including accuracy requirements and
                  how often location points are recorded during active timesheets.
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    GPS Accuracy Threshold (meters)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.gps_accuracy_threshold_m}
                    onChange={(e) =>
                      set("gps_accuracy_threshold_m", Number(e.target.value))
                    }
                    className="max-w-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Tracking Interval
                  </label>
                  <Select
                    value={String(settings.tracking_interval_min)}
                    onValueChange={(v) => set("tracking_interval_min", Number(v))}
                  >
                    <SelectTrigger className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-secondary/40 rounded-xl border border-border p-4 space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Current Configuration
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GPS Accuracy:</span>
                    <span className="font-medium">
                      {settings.gps_accuracy_threshold_m}m
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tracking Interval:</span>
                    <span className="font-medium">
                      {settings.tracking_interval_min === 0
                        ? "Disabled"
                        : `${settings.tracking_interval_min} minutes`}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                  <strong>Note:</strong> GPS tracking pins are automatically recorded
                  at clock-in and clock-out regardless of this interval setting.
                </div>
              </>
            )}

            {activeTab === "photos" && (
              <>
                <ToggleRow
                  label="Require Photo on Clock In"
                  desc="Employees must take a photo when clocking in"
                  value={settings.require_photo_clock_in}
                  onChange={(v) => set("require_photo_clock_in", v)}
                />
                <ToggleRow
                  label="Require Photo on Clock Out"
                  desc="Employees must take a photo when clocking out"
                  value={settings.require_photo_clock_out}
                  onChange={(v) => set("require_photo_clock_out", v)}
                />
                <ToggleRow
                  label="Require Photo on Task Switch"
                  desc="Employees must take a photo when switching tasks"
                  value={settings.require_photo_task_switch}
                  onChange={(v) => set("require_photo_task_switch", v)}
                />
                <div className="border-t border-border pt-4">
                  <ToggleRow
                    label="Show Photos Column in Timesheets"
                    desc="Display clock-in/out photo thumbnails in the timesheet table"
                    value={settings.show_timesheet_photos_column}
                    onChange={(v) => set("show_timesheet_photos_column", v)}
                  />
                </div>
              </>
            )}

            {activeTab === "report" && (
              <div className="space-y-3">
                <WorkingReportLogicInfo />
                <div
                  className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border hover:bg-secondary/60 transition-colors cursor-default"
                  title="Demo — view only"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Working Report Template
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Configure logo, colors, and company details for Service &amp;
                        Maintenance Reports
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <div
                  className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border hover:bg-secondary/60 transition-colors cursor-default"
                  title="Demo — view only"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Daily Schedule Report
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Configure company branding for the Working Day Schedule
                        document sent to employees
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            )}

            {activeTab !== "report" && (
              <div className="flex justify-end pt-2">
                <Button title="Demo — view only" onClick={noopSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Save {TABS.find((t) => t.id === activeTab)?.label} Settings
                </Button>
              </div>
            )}
          </div>
        </div>

        <DemoGuideCard pageId="operations-settings" />
      </main>
    </div>
  );
}
