import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, MapPin, Loader2, X, CheckCircle, AlertCircle, Plus } from "lucide-react";
import TimesheetPhotoCapture from "./TimesheetPhotoCapture";
import { getEffectiveStatus } from "@/lib/taskStatus";
import { generateTaskReference } from "@/lib/taskReference";

export default function ClockInModal({ open, onClose, onSuccess, switchFromEntry = null }) {
  const [contacts, setContacts] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedWO, setSelectedWO] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [contactSearch, setContactSearch] = useState("");
  const [woSearch, setWoSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [empSearch, setEmpSearch] = useState("");

  const [showContactDD, setShowContactDD] = useState(false);
  const [showWODD, setShowWODD] = useState(false);
  const [showTaskDD, setShowTaskDD] = useState(false);
  const [showEmpDD, setShowEmpDD] = useState(false);

  const [gpsStatus, setGpsStatus] = useState("idle"); // idle | fetching | ok | error
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [requirePhoto, setRequirePhoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedContact(null); setSelectedWO(null); setSelectedTask(null);
    setCoords(null); setGpsStatus("idle"); setSubmitError(null);
    setContactSearch(""); setWoSearch(""); setTaskSearch(""); setEmpSearch("");
    setPhotoUrl(null);

    // If switching, pre-fill and lock the employee from the active entry
    if (switchFromEntry) {
      setSelectedEmployee({ id: switchFromEntry.employee_id, full_name: switchFromEntry.employee_name });
    } else {
      setSelectedEmployee(null);
    }

    Promise.all([
      base44.entities.Contact.list("full_name", 200).catch(() => []),
      base44.entities.WorkOrder.list("title", 200).catch(() => []),
      base44.entities.Task.list("title", 500).catch(() => []),
      base44.entities.Employee.list("full_name", 500).catch(() => []),
      base44.entities.OperationsSettings.list("-created_date", 10).catch(() => []),
    ]).then(([c, w, t, e, ops]) => {
      setContacts(c); setWorkOrders(w); setTasks(t); setEmployees(e);
      const s = ops[0] || {};
      setRequirePhoto(switchFromEntry ? (s.require_photo_task_switch || false) : (s.require_photo_clock_in || false));
      // Auto-capture GPS on open when tracking is enabled (default true)
      if (s.track_gps_location !== false) requestGPS();
    });
  }, [open]);

  // All non-completed/archived/template tasks — scope for Contact/WO filters and the task list
  const availableTasks = tasks.filter(t => {
    const eff = getEffectiveStatus(t);
    if (eff === "Completed" || eff === "Archived" || eff === "Template") return false;
    return true;
  });

  // Only show contacts that are linked to at least one available task
  const linkedContactIds = new Set(availableTasks.map(t => t.contact_id).filter(Boolean));
  const filteredContacts = contacts.filter(c => {
    if (!linkedContactIds.has(c.id)) return false;
    return !contactSearch || c.full_name?.toLowerCase().includes(contactSearch.toLowerCase()) || c.company?.toLowerCase().includes(contactSearch.toLowerCase());
  });

  // Only show work orders that are linked to at least one available task
  const linkedWOIds = new Set(availableTasks.map(t => t.work_order_id).filter(Boolean));
  const filteredWOs = workOrders.filter(w => {
    if (!linkedWOIds.has(w.id)) return false;
    if (selectedContact && w.contact_id !== selectedContact.id) return false;
    return !woSearch || w.title?.toLowerCase().includes(woSearch.toLowerCase()) || w.reference?.toLowerCase().includes(woSearch.toLowerCase());
  });

  // Tasks matching the Contact/WO/search filters
  const matchedTasks = availableTasks.filter(t => {
    if (selectedContact && t.contact_id !== selectedContact.id) return false;
    if (selectedWO && t.work_order_id !== selectedWO.id) return false;
    return !taskSearch || t.title?.toLowerCase().includes(taskSearch.toLowerCase());
  });
  // Split into the worker's assigned tasks vs other available tasks
  const myTasks = selectedEmployee
    ? matchedTasks.filter(t => (t.assigned_employees || []).includes(selectedEmployee.id))
    : matchedTasks;
  const otherTasks = selectedEmployee
    ? matchedTasks.filter(t => !(t.assigned_employees || []).includes(selectedEmployee.id))
    : [];
  const filteredEmps = employees.filter(e => !empSearch || e.full_name?.toLowerCase().includes(empSearch.toLowerCase()));

  const selectTask = (t) => {
    setSelectedTask(t);
    setShowTaskDD(false);
    setTaskSearch("");
    if (t.contact_id && !selectedContact) {
      const c = contacts.find(x => x.id === t.contact_id);
      if (c) setSelectedContact(c);
    }
    if (t.work_order_id && !selectedWO) {
      const w = workOrders.find(x => x.id === t.work_order_id);
      if (w) setSelectedWO(w);
    }
  };
  const renderTaskRow = (t) => (
    <button key={t.id} type="button" onMouseDown={() => selectTask(t)}
      className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors">
      <p className="text-sm font-medium">{t.title}</p>
      {(t.contact_name || t.work_order_name) && <p className="text-xs text-muted-foreground">{[t.contact_name, t.work_order_name].filter(Boolean).join(" · ")}</p>}
    </button>
  );

  const requestGPS = () => {
    setGpsStatus("fetching");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus("ok"); },
      () => setGpsStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCreateTask = async () => {
    if (!taskSearch.trim()) return;
    const now = new Date();
    const planningDate = now.toISOString().split("T")[0];
    const planningTimeIn = now.toTimeString().slice(0, 5); // HH:MM
    const reference = await generateTaskReference();
    const newTask = await base44.entities.Task.create({
      reference,
      title: taskSearch.trim(),
      planning_date: planningDate,
      planning_time_in: planningTimeIn,
      ...(selectedContact ? { contact_id: selectedContact.id, contact_name: selectedContact.company || selectedContact.full_name } : {}),
      ...(selectedWO ? { work_order_id: selectedWO.id, work_order_name: selectedWO.title } : {}),
    });
    setSelectedTask(newTask);
    setTaskSearch("");
    setShowTaskDD(false);
  };

  const handleSubmit = async () => {
    if (!selectedTask || !selectedEmployee) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const payload = {
        employee_id: selectedEmployee.id,
        employee_name: selectedEmployee.full_name,
        task_id: selectedTask.id,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        clock_in_photo_url: photoUrl || null,
      };
      if (switchFromEntry) {
        const res = await base44.functions.invoke("switchTask", {
          current_entry_id: switchFromEntry.id,
          new_task_id: selectedTask.id,
          employee_id: selectedEmployee.id,
          employee_name: selectedEmployee.full_name,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        onSuccess(res.data);
      } else {
        const res = await base44.functions.invoke("clockIn", payload);
        onSuccess(res.data);
      }
      onClose();
    } catch (e) {
      setSubmitError(e?.response?.data?.error || e.message || "An error occurred.");
    }
    setLoading(false);
  };

  const Dropdown = ({ show, items, onSelect, keyField = "id", labelField, subField, onCreateNew, createLabel }) => {
    if (!show) return null;
    if (!items.length && !onCreateNew) return null;
    return (
      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
        {items.slice(0, 12).map(item => (
          <button key={item[keyField]} type="button"
            onMouseDown={() => onSelect(item)}
            className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors">
            <p className="text-sm font-medium">{item[labelField] || item[subField]}</p>
            {subField && item[subField] && item[labelField] && item[labelField] !== item[subField] && <p className="text-xs text-muted-foreground">{item[subField]}</p>}
          </button>
        ))}
        {onCreateNew && createLabel && (
          <button type="button" onMouseDown={onCreateNew}
            className="w-full text-left px-4 py-2.5 hover:bg-primary/10 transition-colors border-t border-border flex items-center gap-2 text-primary">
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="text-sm font-medium">{createLabel}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{switchFromEntry ? "Switch Task" : "Clock In"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">

          {/* Employee */}
          <div className="space-y-1.5">
            <Label>Employee</Label>
            {selectedEmployee ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/30">
                <span className="text-sm font-medium">{selectedEmployee.full_name}</span>
                {!switchFromEntry && <button onClick={() => setSelectedEmployee(null)}><X className="w-4 h-4 text-muted-foreground" /></button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Search employee..." value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); setShowEmpDD(true); }}
                  onFocus={() => setShowEmpDD(true)} onBlur={() => setTimeout(() => setShowEmpDD(false), 150)} />
                <Dropdown show={showEmpDD} items={filteredEmps} labelField="full_name" subField="role"
                  onSelect={e => { setSelectedEmployee(e); setShowEmpDD(false); setEmpSearch(""); }} />
              </div>
            )}
          </div>

          {/* Contact → WO → Task cascade */}
          <div className="space-y-1.5">
            <Label>Contact <span className="text-muted-foreground text-xs font-normal">(optional filter)</span></Label>
            {selectedContact ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/30">
                <span className="text-sm font-medium">{selectedContact.company || selectedContact.full_name}</span>
                {!selectedWO && <button onClick={() => { setSelectedContact(null); setSelectedWO(null); setSelectedTask(null); }}><X className="w-4 h-4 text-muted-foreground" /></button>}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Filter by contact..." value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); setShowContactDD(true); }}
                  onFocus={() => setShowContactDD(true)} onBlur={() => setTimeout(() => setShowContactDD(false), 150)} />
                <Dropdown show={showContactDD} items={filteredContacts} labelField="company" subField="full_name"
                  onSelect={c => { setSelectedContact(c); setShowContactDD(false); setContactSearch(""); }} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Work Order <span className="text-muted-foreground text-xs font-normal">(optional filter)</span></Label>
            {selectedWO ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/30">
                <span className="text-sm font-medium">{selectedWO.title}</span>
                <button onClick={() => { setSelectedWO(null); setSelectedContact(null); setSelectedTask(null); }}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Filter by work order..." value={woSearch}
                  onChange={e => { setWoSearch(e.target.value); setShowWODD(true); }}
                  onFocus={() => setShowWODD(true)} onBlur={() => setTimeout(() => setShowWODD(false), 150)} />
                <Dropdown show={showWODD} items={filteredWOs} labelField="title" subField="reference"
                  onSelect={w => {
                    setSelectedWO(w);
                    setShowWODD(false);
                    setWoSearch("");
                    // Auto-fill contact from work order
                    if (w.contact_id) {
                      const c = contacts.find(x => x.id === w.contact_id);
                      if (c) { setSelectedContact(c); setContactSearch(""); }
                      else if (w.contact_name) setSelectedContact({ id: w.contact_id, full_name: w.contact_name, company: w.contact_name });
                    }
                    setSelectedTask(null);
                  }} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Task *</Label>
            {selectedTask ? (
              <div className="flex flex-col px-3 py-2 rounded-md border bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{selectedTask.title}</span>
                  <button onClick={() => setSelectedTask(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                {(selectedTask.contact_name || selectedTask.work_order_name || selectedTask.asset_name) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[selectedTask.contact_name, selectedTask.work_order_name, selectedTask.asset_name].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input className="pl-9" placeholder="Search task..." value={taskSearch}
                  onChange={e => { setTaskSearch(e.target.value); setShowTaskDD(true); }}
                  onFocus={() => setShowTaskDD(true)} onBlur={() => setTimeout(() => setShowTaskDD(false), 150)} />
                {showTaskDD && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-y-auto">
                    {selectedEmployee && myTasks.length > 0 && (
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary bg-primary/5 border-b border-border">
                        Assigned to {selectedEmployee.full_name}
                      </div>
                    )}
                    {selectedEmployee && myTasks.slice(0, 12).map(renderTaskRow)}
                    {selectedEmployee && otherTasks.length > 0 && (
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 border-y border-border">
                        Other available tasks
                      </div>
                    )}
                    {selectedEmployee && otherTasks.slice(0, 12).map(renderTaskRow)}
                    {!selectedEmployee && myTasks.slice(0, 12).map(renderTaskRow)}
                    {myTasks.length === 0 && otherTasks.length === 0 && taskSearch.trim() && (
                      <button type="button" onMouseDown={handleCreateTask}
                        className="w-full text-left px-4 py-2.5 hover:bg-primary/10 transition-colors border-t border-border flex items-center gap-2 text-primary">
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-medium">Create task "{taskSearch.trim()}"</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* GPS */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Location</Label>
            {gpsStatus === "idle" && (
              <Button type="button" variant="outline" size="sm" onClick={requestGPS} className="w-full">
                <MapPin className="w-4 h-4 mr-2" /> Capture GPS Location
              </Button>
            )}
            {gpsStatus === "fetching" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 border rounded-md">
                <Loader2 className="w-4 h-4 animate-spin" /> Getting location...
              </div>
            )}
            {gpsStatus === "ok" && (
              <div className="flex items-center gap-2 text-sm text-success px-3 py-2 border border-success/30 rounded-md bg-success/5">
                <CheckCircle className="w-4 h-4" /> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            )}
            {gpsStatus === "error" && (
              <div className="flex items-center gap-2 text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
                <AlertCircle className="w-4 h-4" /> Location unavailable — will clock in without GPS
              </div>
            )}
          </div>

          {/* Photo Capture */}
          <TimesheetPhotoCapture
            label={switchFromEntry ? "Task Switch Photo" : "Clock-In Photo"}
            required={requirePhoto}
            onPhoto={setPhotoUrl}
          />

          {submitError && (
            <div className="flex items-center gap-2 text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
              <AlertCircle className="w-4 h-4 shrink-0" /> {submitError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!selectedTask || !selectedEmployee || loading || (requirePhoto && !photoUrl)}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {switchFromEntry ? "Switch Task" : "Clock In"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}