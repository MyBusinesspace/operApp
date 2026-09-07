import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, Crown, GripVertical, ArrowUp, ArrowDown, ArrowRightLeft
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const TABS = ["Teams", "Members", "Unassigned", "On Leave"];

const TEAM_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#64748b"
];

const ABSENCE_OPTIONS = [
  { value: "vacation", label: "🏖️ Vacation" },
  { value: "sick", label: "🤒 Sick Leave" },
  { value: "other", label: "📋 Other" },
];

function TeamCard({ team, employees, onUpdate, onDelete, onAddMember, onRemoveMember, onDropEmployee, dragOverTeamId, setDragOverTeamId, index, total, onMoveUp, onMoveDown, onDragStartCard, onDragOverCard, onDropCard, dragOverCardIndex }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color || "#6366f1");
  const [expanded, setExpanded] = useState(true);
  const [showLeaderPicker, setShowLeaderPicker] = useState(false);

  const teamMembers = employees.filter((e) => e.team_id === team.id);
  const activeMembers = teamMembers.filter((e) => !e.absence_status && e.status !== "On Leave");
  const onLeaveMembers = teamMembers.filter((e) => e.absence_status || e.status === "On Leave");
  const isDragOver = dragOverTeamId === team.id;
  const isDragOverCard = dragOverCardIndex === index;
  const leader = teamMembers.find((e) => e.id === team.leader_id);

  const saveEdit = async () => {
    await onUpdate(team.id, { name, color });
    setEditing(false);
  };

  const setLeader = async (emp) => {
    await onUpdate(team.id, { leader_id: emp ? emp.id : null, leader_name: emp ? emp.full_name : null });
    setShowLeaderPicker(false);
  };

  return (
    <div
      className={`border-2 rounded-xl p-4 bg-card space-y-3 transition-colors ${isDragOver ? "border-primary bg-primary/5" : isDragOverCard ? "border-primary/40 border-dashed" : "border-border"}`}
      draggable
      onDragStart={(e) => { onDragStartCard(index); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverCard(index);
        setDragOverTeamId(team.id);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverTeamId(null); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOverTeamId(null);
        const empId = e.dataTransfer.getData("employeeId");
        if (empId) {
          onDropEmployee(team, empId);
        } else {
          onDropCard(index);
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground" title="Drag to reorder">
            <GripVertical className="w-3.5 h-3.5" />
            <div className="flex flex-col">
              <button
                onClick={() => onMoveUp(index)}
                disabled={index === 0}
                className="disabled:opacity-20 hover:text-primary transition-colors"
                title="Move up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => onMoveDown(index)}
                disabled={index === total - 1}
                className="disabled:opacity-20 hover:text-primary transition-colors"
                title="Move down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: color }}
          >
            {(name || "T")[0].toUpperCase()}
          </div>
          {editing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <div className="flex gap-1 flex-wrap">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-125" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-sm text-foreground">{team.name}</p>
              <p className="text-xs text-muted-foreground">{teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={saveEdit}><Check className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEditing(false); setName(team.name); setColor(team.color); }}><X className="w-3.5 h-3.5" /></Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(team.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border pt-3 space-y-3">
          {/* Team Leader */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team Leader</p>
            </div>
            {leader ? (
              <div className="flex items-center gap-2">
                {leader.avatar_url ? (
                  <img src={leader.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-[9px] font-bold text-amber-700">{leader.full_name[0]}</div>
                )}
                <span className="text-xs font-medium text-foreground">{leader.full_name}</span>
                <button onClick={() => setShowLeaderPicker(true)} className="text-[10px] text-primary underline ml-1">Change</button>
                <button onClick={() => setLeader(null)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowLeaderPicker(true)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Assign leader
              </button>
            )}
          </div>

          {/* Leader picker dropdown */}
          {showLeaderPicker && (
            <div className="bg-muted/60 border border-border rounded-lg p-2 space-y-1">
              {activeMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-2">No active members to select from</p>
              ) : (
                activeMembers.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => setLeader(emp)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-accent ${team.leader_id === emp.id ? "bg-amber-50 text-amber-700" : ""}`}
                  >
                    {emp.avatar_url ? (
                      <img src={emp.avatar_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">{emp.full_name[0]}</div>
                    )}
                    <span className="text-xs font-medium">{emp.full_name}</span>
                    {team.leader_id === emp.id && <Crown className="w-3 h-3 text-amber-500 ml-auto" />}
                  </button>
                ))
              )}
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs mt-1" onClick={() => setShowLeaderPicker(false)}>Cancel</Button>
            </div>
          )}

          {/* Members */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team Members</p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAddMember(team)}>
              <Plus className="w-3 h-3" /> Add Member
            </Button>
          </div>
          {isDragOver && (
            <div className="mb-2 border-2 border-dashed border-primary rounded-lg py-2 text-center text-xs text-primary font-medium">
              Drop here to assign to {team.name}
            </div>
          )}
          {teamMembers.length === 0 && !isDragOver ? (
            <p className="text-xs text-muted-foreground italic">No members yet — drag an employee here</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {teamMembers.map((emp) => (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("employeeId", emp.id); e.dataTransfer.effectAllowed = "move"; }}
                  className={`flex items-center gap-1.5 bg-muted rounded-full pl-1 pr-2 py-0.5 cursor-grab active:cursor-grabbing active:opacity-60 transition-opacity ${(emp.absence_status || emp.status === "On Leave") ? "opacity-50 ring-1 ring-amber-300/60 bg-amber-50" : ""}`}
                  title={(emp.absence_status || emp.status === "On Leave") ? `${emp.full_name} — on leave` : emp.full_name}
                >
                  {emp.avatar_url ? (
                    <img src={emp.avatar_url} alt={emp.full_name} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                      {emp.full_name[0]}
                    </div>
                  )}
                  <span className="text-xs font-medium">{emp.full_name}</span>
                  {team.leader_id === emp.id && <Crown className="w-3 h-3 text-amber-500" title="Team Leader" />}
                  {emp.absence_status && (
                    <span title={emp.absence_status} className="text-base leading-none">
                      {emp.absence_status === "vacation" ? "🏖️" : emp.absence_status === "sick" ? "🤒" : "📋"}
                    </span>
                  )}
                  <button onClick={() => onRemoveMember(emp)} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddMemberDropdown({ team, unassignedEmployees, allEmployees, onAssign, onClose }) {
  const available = allEmployees.filter((e) => e.team_id !== team.id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-4 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold mb-3">Add to {team.name}</p>
        {available.length === 0 ? (
          <p className="text-xs text-muted-foreground">All employees are already in this team.</p>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {available.map((emp) => (
              <button
                key={emp.id}
                onClick={() => { onAssign(emp, team); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
              >
                {emp.avatar_url ? (
                  <img src={emp.avatar_url} className="w-6 h-6 rounded-full object-cover" alt="" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{emp.full_name[0]}</div>
                )}
                <div>
                  <p className="text-sm font-medium">{emp.full_name}</p>
                  {emp.team_name && <p className="text-[10px] text-muted-foreground">Currently: {emp.team_name}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

export default function TeamManagementModal({ open, onClose, onRefresh }) {
  const [tab, setTab] = useState("Teams");
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingMemberTo, setAddingMemberTo] = useState(null);
  const [dragOverTeamId, setDragOverTeamId] = useState(null);
  const [draggingCardIndex, setDraggingCardIndex] = useState(null);
  const [dragOverCardIndex, setDragOverCardIndex] = useState(null);
  const [movingEmpId, setMovingEmpId] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    const [tList, eList, leaveList] = await Promise.all([
      base44.entities.Team.list("sort_order", 200),
      base44.entities.Employee.list("full_name", 500),
      base44.entities.LeaveRequest.filter({ status: "approved" }).catch(() => []),
    ]);
    // Clear stale leave flags: an employee still flagged "On Leave" whose
    // approved leave has already ended and who has no approved leave covering
    // today. (The Leave page sets the flag on approval but never clears it
    // when the leave ends, so the badge would otherwise persist forever.)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const approvedLeaves = leaveList || [];
    const fixPromises = [];
    eList.forEach((e) => {
      if (!e.absence_status && e.status !== "On Leave") return;
      const hasCurrent = approvedLeaves.some(
        (lr) => lr.employee_id === e.id && lr.start_date <= today && lr.end_date >= today
      );
      const hasPastEnded = approvedLeaves.some(
        (lr) => lr.employee_id === e.id && lr.end_date < today
      );
      if (!hasCurrent && hasPastEnded) {
        fixPromises.push(
          base44.entities.Employee.update(e.id, { status: "Active", absence_status: null })
        );
        e.status = "Active";
        e.absence_status = null;
      }
    });
    if (fixPromises.length > 0) {
      Promise.all(fixPromises).then(() => onRefresh?.());
    }
    const sorted = [...tList].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    setTeams(sorted);
    setEmployees(eList);
    setLoading(false);
  };

  const persistOrder = async (newOrder) => {
    setTeams(newOrder);
    await Promise.all(
      newOrder.map((t, i) =>
        (t.sort_order ?? 0) !== i
          ? base44.entities.Team.update(t.id, { sort_order: i })
          : Promise.resolve()
      )
    );
    onRefresh?.();
  };

  const moveCard = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= teams.length) return;
    const newOrder = [...teams];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    persistOrder(newOrder);
  };

  const handleCardDragStart = (index) => {
    setDraggingCardIndex(index);
  };

  const handleCardDragOver = (index) => {
    if (draggingCardIndex !== null && draggingCardIndex !== index) {
      setDragOverCardIndex(index);
    }
  };

  const handleCardDrop = (index) => {
    if (draggingCardIndex === null || draggingCardIndex === index) {
      setDraggingCardIndex(null);
      setDragOverCardIndex(null);
      return;
    }
    const newOrder = [...teams];
    const [moved] = newOrder.splice(draggingCardIndex, 1);
    newOrder.splice(index, 0, moved);
    setDraggingCardIndex(null);
    setDragOverCardIndex(null);
    persistOrder(newOrder);
  };

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    await base44.entities.Team.create({ name: newTeamName.trim(), color: "#6366f1", description: "", sort_order: teams.length });
    setNewTeamName("");
    loadData();
    toast({ title: "Team created" });
  };

  const updateTeam = async (id, data) => {
    await base44.entities.Team.update(id, data);
    loadData();
  };

  const deleteTeam = async (id) => {
    await base44.entities.Team.delete(id);
    // Unassign employees from this team
    const affected = employees.filter((e) => e.team_id === id);
    await Promise.all(affected.map((e) => base44.entities.Employee.update(e.id, { team_id: null, team_name: null })));
    loadData();
    toast({ title: "Team deleted" });
  };

  const assignToTeam = async (employee, team) => {
    // Optimistic local update so the UI reflects the move instantly (the On Leave
    // tab keeps showing the employee, but under the new team name).
    setEmployees((prev) => prev.map((e) => (e.id === employee.id ? { ...e, team_id: team.id, team_name: team.name } : e)));
    await base44.entities.Employee.update(employee.id, { team_id: team.id, team_name: team.name });
    loadData();
    onRefresh?.();
    toast({ title: `${employee.full_name} moved to ${team.name}` });
  };


  const removeFromTeam = async (employee) => {
    await base44.entities.Employee.update(employee.id, { team_id: null, team_name: null });
    loadData();
    onRefresh?.();
    toast({ title: `${employee.full_name} removed from team` });
  };

  const setAbsence = async (employee, status) => {
    await base44.entities.Employee.update(employee.id, { absence_status: status });
    loadData();
    onRefresh?.();
    toast({ title: status ? `${employee.full_name} marked as ${status}` : `${employee.full_name} absence cleared` });
  };

  const onLeaveEmployees = employees.filter((e) => e.absence_status || e.status === "On Leave");
  const unassigned = employees.filter((e) => !e.team_id && !e.absence_status && e.status !== "On Leave");
  const onAbsence = onLeaveEmployees;

  const tabCounts = {
    Teams: teams.length,
    Members: employees.length,
    Unassigned: unassigned.length,
    "On Leave": onLeaveEmployees.length,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 bg-primary rounded-t-lg">
          <DialogTitle className="text-white flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" /> Team Management
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 bg-card">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t} ({tabCounts[t] ?? 0})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* TEAMS TAB */}
              {tab === "Teams" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="New team name..."
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && createTeam()}
                      className="flex-1"
                    />
                    <Button onClick={createTeam} className="gap-1.5 shrink-0">
                      <Plus className="w-4 h-4" /> New Team
                    </Button>
                  </div>
                  {teams.map((team, i) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      employees={employees}
                      onUpdate={updateTeam}
                      onDelete={deleteTeam}
                      onAddMember={(t) => setAddingMemberTo(t)}
                      onRemoveMember={removeFromTeam}
                      onDropEmployee={(targetTeam, empId) => {
                        if (!empId) return;
                        const emp = employees.find((e) => e.id === empId);
                        if (!emp || emp.team_id === targetTeam.id) return;
                        assignToTeam(emp, targetTeam);
                      }}
                      dragOverTeamId={dragOverTeamId}
                      setDragOverTeamId={setDragOverTeamId}
                      index={i}
                      total={teams.length}
                      onMoveUp={(idx) => moveCard(idx, -1)}
                      onMoveDown={(idx) => moveCard(idx, 1)}
                      onDragStartCard={handleCardDragStart}
                      onDragOverCard={handleCardDragOver}
                      onDropCard={handleCardDrop}
                      dragOverCardIndex={dragOverCardIndex}
                    />
                  ))}
                </div>
              )}

              {/* MEMBERS TAB */}
              {tab === "Members" && (
                <div className="space-y-2">
                  {teams.map((team) => {
                    const members = employees.filter((e) => e.team_id === team.id && !e.absence_status && e.status !== "On Leave");
                    return (
                      <div key={team.id} className="border border-border rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-muted/40">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color || "#6366f1" }} />
                          <p className="text-sm font-semibold">{team.name}</p>
                          <Badge variant="secondary" className="text-xs">{members.length}</Badge>
                        </div>
                        {members.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-4 py-3 italic">No members</p>
                        ) : (
                          <div className="divide-y divide-border">
                            {members.map((emp) => (
                              <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5">
                                {emp.avatar_url ? (
                                  <img src={emp.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{emp.full_name[0]}</div>
                                )}
                                <div className="flex-1">
                                  <p className="text-sm font-medium flex items-center gap-1.5">
                                    {emp.full_name}
                                    {team.leader_id === emp.id && <Crown className="w-3.5 h-3.5 text-amber-500" title="Team Leader" />}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{emp.role} · {emp.department}</p>
                                </div>
                                {emp.absence_status && (
                                  <span className="text-sm">{emp.absence_status === "vacation" ? "🏖️" : emp.absence_status === "sick" ? "🤒" : "📋"}</span>
                                )}
                                <Badge variant={emp.status === "Active" ? "default" : "secondary"} className="text-xs">{emp.status}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* UNASSIGNED TAB */}
              {tab === "Unassigned" && (
                <div className="space-y-2">
                  {unassigned.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">All employees are assigned to teams</p>
                    </div>
                  ) : (
                    unassigned.map((emp) => (
                      <div key={emp.id} className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 bg-card">
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} className="w-9 h-9 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold">{emp.full_name[0]}</div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{emp.full_name}</p>
                          <p className="text-xs text-muted-foreground">{emp.role} · {emp.department}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {teams.map((t) => (
                            <Button key={t.id} size="sm" variant="outline" className="h-7 text-xs" onClick={() => assignToTeam(emp, t)}>
                              {t.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ON LEAVE TAB */}
              {tab === "On Leave" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Employees on leave remain assigned to their team (shown faded in the Teams tab) and can be moved to another team here.</p>
                  {onAbsence.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No employees on leave</p>
                    </div>
                  ) : onAbsence.map((emp) => (
                    <div key={emp.id} className="border border-border rounded-xl px-4 py-3 bg-card space-y-2">
                      <div className="flex items-center gap-3">
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} className="w-9 h-9 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold">{emp.full_name[0]}</div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{emp.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {teams.find((t) => t.id === emp.team_id)?.name || emp.team_name || "Unassigned"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {emp.absence_status ? (
                            <>
                              <Badge className="text-xs gap-1">
                                {emp.absence_status === "vacation" ? "🏖️ Vacation" : emp.absence_status === "sick" ? "🤒 Sick" : "📋 Other"}
                              </Badge>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setMovingEmpId(movingEmpId === emp.id ? null : emp.id)}>
                                <ArrowRightLeft className="w-3 h-3" /> Move to
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive gap-1" onClick={() => setAbsence(emp, null)}>
                                <X className="w-3 h-3" /> Clear
                              </Button>
                            </>
                          ) : (
                            ABSENCE_OPTIONS.map((opt) => (
                              <Button key={opt.value} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAbsence(emp, opt.value)}>
                                {opt.label}
                              </Button>
                            ))
                          )}
                        </div>
                      </div>
                      {emp.absence_status && movingEmpId === emp.id && (
                        <div className="flex items-center gap-1.5 flex-wrap pl-12 pt-2 border-t border-border">
                          <span className="text-xs font-medium text-muted-foreground">Move to:</span>
                          {teams.filter((t) => t.id !== emp.team_id).length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">No other teams</span>
                          ) : (
                            teams.filter((t) => t.id !== emp.team_id).map((t) => (
                              <button
                                key={t.id}
                                onClick={() => { assignToTeam(emp, t); setMovingEmpId(null); }}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border border-border bg-muted/40 hover:bg-accent transition-colors"
                              >
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color || "#6366f1" }} />
                                <span className="truncate max-w-[140px]">{t.name}</span>
                              </button>
                            ))
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMovingEmpId(null)}>Cancel</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {addingMemberTo && (
          <AddMemberDropdown
            team={addingMemberTo}
            allEmployees={employees}
            unassignedEmployees={unassigned}
            onAssign={assignToTeam}
            onClose={() => setAddingMemberTo(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}