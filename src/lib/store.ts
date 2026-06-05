import { create } from "zustand";
import type {
  ActivityLog, FollowUp, Lead, Property, Role, TCM, Tour,
  PostTourUpdate, ClientDecision, LeadStage, Intent,
  HandoffMessage, ActiveSequence, SequenceKind, Booking,
} from "./types";
import { ACTIVITIES, FOLLOWUPS, LEADS, PROPERTIES, TCMS, TOURS, HANDOFFS, SEQUENCES_INIT } from "./mock-data";
import { autoAssign as autoAssignFn } from "./routing";
import { pushObjectionToOwner, pushTourViewToOwner } from "@/owner/team-bridge";
import { emit as emitConnector } from "./connectors";
import { personName } from "./people";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

interface AppState {
  role: Role;
  currentTcmId: string;
  setRole: (r: Role) => void;
  setCurrentTcmId: (id: string) => void;

  selectedLeadId: string | null;
  selectLead: (id: string | null) => void;

  tcms: TCM[];
  properties: Property[];
  leads: Lead[];
  tours: Tour[];
  activities: ActivityLog[];
  followUps: FollowUp[];
  handoffs: HandoffMessage[];
  sequences: ActiveSequence[];
  bookings: Booking[];

  setLeadStage: (leadId: string, stage: LeadStage) => void;
  setLeadIntent: (leadId: string, intent: Intent) => void;
  setLeadFollowUp: (leadId: string, dueAt: string, priority: FollowUp["priority"], reason?: string) => void;
  addLeadTag: (leadId: string, tag: string) => void;
  removeLeadTag: (leadId: string, tag: string) => void;
  reassignLead: (leadId: string, tcmId: string, reason: string) => void;
  autoAssignLead: (leadId: string) => { tcmId: string; reasons: string[] };

  scheduleTour: (input: { leadId: string; propertyId: string; tcmId: string; scheduledAt: string }) => Tour;
  cancelTour: (tourId: string) => void;
  rescheduleTour: (tourId: string, scheduledAt: string) => void;
  completeTour: (tourId: string) => void;

  setDecision: (tourId: string, decision: ClientDecision) => void;
  updatePostTour: (tourId: string, patch: Partial<PostTourUpdate>) => void;

  addNote: (leadId: string, note: string, tourId?: string) => void;
  logCall: (leadId: string) => void;
  sendMessage: (leadId: string, text: string) => void;

  completeFollowUp: (followUpId: string) => void;
  addFollowUp: (input: Omit<FollowUp, "id" | "done">) => void;

  sendHandoff: (input: { leadId: string; from: Role; fromId: string; text: string; priority: "normal" | "urgent" }) => void;
  markHandoffsRead: (leadId: string) => void;

  startSequence: (leadId: string, kind: SequenceKind) => void;
  toggleSequencePause: (leadId: string) => void;
  stopSequence: (leadId: string, reason: string) => void;
  advanceSequenceStep: (leadId: string) => void;

  closeDeal: (input: { leadId: string; tourId: string; propertyId: string; tcmId: string; amount: number }) => void;
  addLead: (input: Omit<Lead, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Lead;
}

export const useApp = create<AppState>((set, get) => ({
  role: "flow-ops",
  currentTcmId: "tcm-1",
  setRole: (r) => set({ role: r }),
  setCurrentTcmId: (id) => set({ currentTcmId: id }),

  selectedLeadId: null,
  selectLead: (id) => set({ selectedLeadId: id }),

  tcms: TCMS,
  properties: PROPERTIES,
  leads: LEADS,
  tours: TOURS,
  activities: ACTIVITIES,
  followUps: FOLLOWUPS,
  handoffs: HANDOFFS,
  sequences: SEQUENCES_INIT,
  bookings: [],

  setLeadStage: (leadId, stage) => {
    set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId ? { ...l, stage, updatedAt: new Date().toISOString() } : l,
      ),
    }));
    pushActivity(set, get, {
      kind: "status_changed", actor: get().role, leadId,
      text: `Status changed to ${stage}`,
    });
  },

  setLeadIntent: (leadId, intent) => {
    set((s) => ({
      leads: s.leads.map((l) => (l.id === leadId ? { ...l, intent } : l)),
    }));
  },

  setLeadFollowUp: (leadId, dueAt, priority, reason = "Manual follow-up") => {
    set((s) => ({
      leads: s.leads.map((l) => (l.id === leadId ? { ...l, nextFollowUpAt: dueAt } : l)),
    }));
    const lead = get().leads.find((l) => l.id === leadId);
    if (!lead) return;
    const f: FollowUp = {
      id: uid("f"), leadId, tcmId: lead.assignedTcmId,
      dueAt, priority, reason, done: false,
    };
    set((s) => ({ followUps: [f, ...s.followUps] }));
    pushActivity(set, get, { kind: "follow_up_set", actor: get().role, leadId, text: `Follow-up set: ${reason}` });
  },

  addLeadTag: (leadId, tag) => {
    set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId && !l.tags.includes(tag) ? { ...l, tags: [...l.tags, tag] } : l,
      ),
    }));
  },

  removeLeadTag: (leadId, tag) => {
    set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId ? { ...l, tags: l.tags.filter((t) => t !== tag) } : l,
      ),
    }));
  },

  scheduleTour: ({ leadId, propertyId, tcmId, scheduledAt }) => {
    const lead = get().leads.find((l) => l.id === leadId)!;
    const tour: Tour = {
      id: uid("t"), leadId, propertyId, tcmId, scheduledAt,
      status: "scheduled", decision: null,
      postTour: {
        outcome: null, confidence: 0, objection: null, objectionNote: "",
        expectedDecisionAt: null, nextFollowUpAt: null, filledAt: null,
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    set((s) => ({
      tours: [tour, ...s.tours],
      leads: s.leads.map((l) =>
        l.id === leadId ? { ...l, stage: "tour-scheduled", updatedAt: new Date().toISOString() } : l,
      ),
    }));
    pushActivity(set, get, {
      kind: "tour_scheduled", actor: tcmId, leadId, tourId: tour.id, propertyId,
      text: `Tour scheduled for ${lead.name}`,
    });
    pushActivity(set, get, {
      kind: "message_sent", actor: "system", leadId, tourId: tour.id,
      text: `Auto WhatsApp confirmation sent to ${lead.name}`,
    });
    // Connector — Flow Ops scheduling earns assist; TCM is primary.
    const actorRole = get().role;
    const actorId = actorRole === "tcm" ? get().currentTcmId : actorRole;
    emitConnector({
      kind: "tour.scheduled",
      actorRole,
      actorId,
      leadId, tourId: tour.id, propertyId,
      text: `${personName(actorId, "Someone")} scheduled tour for ${lead.name}`,
      assists: actorRole === "flow-ops"
        ? [{ role: "tcm", id: tcmId }]
        : actorRole === "tcm" && tcmId !== actorId
          ? [{ role: "tcm", id: tcmId }]
          : undefined,
    });
    return tour;
  },

  cancelTour: (tourId) => {
    const t = get().tours.find((x) => x.id === tourId);
    if (!t) return;
    set((s) => ({
      tours: s.tours.map((x) =>
        x.id === tourId ? { ...x, status: "cancelled", updatedAt: new Date().toISOString() } : x,
      ),
    }));
    pushActivity(set, get, { kind: "tour_cancelled", actor: get().role, leadId: t.leadId, tourId, text: "Tour cancelled" });
  },

  rescheduleTour: (tourId, scheduledAt) => {
    set((s) => ({
      tours: s.tours.map((x) =>
        x.id === tourId ? { ...x, scheduledAt, updatedAt: new Date().toISOString() } : x,
      ),
    }));
    const t = get().tours.find((x) => x.id === tourId);
    if (t) pushActivity(set, get, { kind: "tour_scheduled", actor: get().role, leadId: t.leadId, tourId, text: "Tour rescheduled" });
  },

  completeTour: (tourId) => {
    const t = get().tours.find((x) => x.id === tourId);
    if (!t) return;
    set((s) => ({
      tours: s.tours.map((x) =>
        x.id === tourId ? { ...x, status: "completed", updatedAt: new Date().toISOString() } : x,
      ),
      leads: s.leads.map((l) =>
        l.id === t.leadId ? { ...l, stage: "tour-done", updatedAt: new Date().toISOString() } : l,
      ),
    }));
    pushActivity(set, get, { kind: "tour_completed", actor: t.tcmId, leadId: t.leadId, tourId, text: "Tour marked completed" });
    // Bridge → owner: every completed tour bumps the room's view counter
    const prop = get().properties.find((p) => p.id === t.propertyId);
    if (prop) pushTourViewToOwner(prop.name);
    const lead = get().leads.find((l) => l.id === t.leadId);
    emitConnector({
      kind: "tour.completed",
      actorRole: "tcm", actorId: t.tcmId,
      leadId: t.leadId, tourId, propertyId: t.propertyId,
      text: `${personName(t.tcmId, "TCM")} completed tour with ${lead?.name ?? "lead"}`,
    });
  },

  setDecision: (tourId, decision) => {
    const t = get().tours.find((x) => x.id === tourId);
    if (!t) return;
    set((s) => ({
      tours: s.tours.map((x) => (x.id === tourId ? { ...x, decision, updatedAt: new Date().toISOString() } : x)),
      leads: s.leads.map((l) =>
        l.id === t.leadId
          ? {
              ...l,
              stage:
                decision === "booked" ? "booked" :
                decision === "dropped" ? "dropped" : "negotiation",
              updatedAt: new Date().toISOString(),
            }
          : l,
      ),
    }));
    pushActivity(set, get, {
      kind: "decision_logged", actor: t.tcmId, leadId: t.leadId, tourId,
      text: `Decision: ${decision ?? "—"}`,
    });
  },

  updatePostTour: (tourId, patch) => {
    const t = get().tours.find((x) => x.id === tourId);
    if (!t) return;
    const prevObjection = t.postTour.objection;
    const next: PostTourUpdate = { ...t.postTour, ...patch };
    const complete =
      next.outcome !== null &&
      next.confidence > 0 &&
      next.expectedDecisionAt !== null &&
      next.nextFollowUpAt !== null;
    if (complete && !next.filledAt) {
      next.filledAt = new Date().toISOString();
      pushActivity(set, get, { kind: "post_tour_filled", actor: t.tcmId, leadId: t.leadId, tourId, text: "Post-tour form completed" });
      const lead = get().leads.find((l) => l.id === t.leadId);
      emitConnector({
        kind: "post_tour.filled",
        actorRole: "tcm", actorId: t.tcmId,
        leadId: t.leadId, tourId, propertyId: t.propertyId,
        text: `${personName(t.tcmId, "TCM")} closed post-tour loop · ${lead?.name ?? ""}`.trim(),
      });
    }
    set((s) => ({
      tours: s.tours.map((x) => (x.id === tourId ? { ...x, postTour: next, updatedAt: new Date().toISOString() } : x)),
      leads: s.leads.map((l) =>
        l.id === t.leadId
          ? {
              ...l,
              confidence: next.confidence > 0 ? next.confidence : l.confidence,
              nextFollowUpAt: next.nextFollowUpAt ?? l.nextFollowUpAt,
            }
          : l,
      ),
    }));
    if (next.nextFollowUpAt) {
      const exists = get().followUps.find((f) => f.tourId === tourId && !f.done);
      if (!exists) {
        const f: FollowUp = {
          id: uid("f"), tourId, leadId: t.leadId, tcmId: t.tcmId,
          dueAt: next.nextFollowUpAt,
          priority: next.confidence >= 75 ? "high" : next.confidence >= 50 ? "medium" : "low",
          reason: "Post-tour scheduled follow-up",
          done: false,
        };
        set((s) => ({ followUps: [f, ...s.followUps] }));
      }
    }
    // Bridge → Owner: every NEW objection logged here pushes a demand-signal
    // record into the Owner store so the owner's bars reflect real team activity.
    if (next.objection && next.objection !== prevObjection) {
      const prop = get().properties.find((p) => p.id === t.propertyId);
      const tcm = get().tcms.find((m) => m.id === t.tcmId);
      if (prop) {
        pushObjectionToOwner({
          propertyKey: prop.name,
          reasonLabel: next.objection,
          notes: next.objectionNote || undefined,
          loggedBy: tcm?.name ? `${tcm.name} (TCM)` : "TCM",
        });
      }
    }
  },

  addNote: (leadId, note, tourId) => {
    pushActivity(set, get, { kind: "note_added", actor: get().role, leadId, tourId, text: note });
  },

  logCall: (leadId) => {
    pushActivity(set, get, { kind: "call_logged", actor: get().role, leadId, text: "Call logged" });
  },

  sendMessage: (leadId, text) => {
    pushActivity(set, get, { kind: "message_sent", actor: get().role, leadId, text: `Message: ${text}` });
  },

  completeFollowUp: (followUpId) => {
    const f = get().followUps.find((x) => x.id === followUpId);
    if (!f) return;
    set((s) => ({
      followUps: s.followUps.map((x) => (x.id === followUpId ? { ...x, done: true } : x)),
      leads: s.leads.map((l) => (l.id === f.leadId ? { ...l, nextFollowUpAt: null } : l)),
    }));
    pushActivity(set, get, { kind: "follow_up_done", actor: f.tcmId, leadId: f.leadId, tourId: f.tourId, text: `Follow-up done: ${f.reason}` });
  },

  addFollowUp: (input) => {
    const f: FollowUp = { ...input, id: uid("f"), done: false };
    set((s) => ({ followUps: [f, ...s.followUps] }));
  },

  reassignLead: (leadId, tcmId, reason) => {
    const tcm = get().tcms.find((t) => t.id === tcmId);
    set((s) => ({
      leads: s.leads.map((l) =>
        l.id === leadId ? { ...l, assignedTcmId: tcmId, updatedAt: new Date().toISOString() } : l,
      ),
    }));
    pushActivity(set, get, { kind: "status_changed", actor: get().role, leadId, text: `Reassigned to ${tcm?.name ?? tcmId} · ${reason}` });
    // auto-handoff
    const lead = get().leads.find((l) => l.id === leadId);
    if (lead) {
      get().sendHandoff({
        leadId,
        from: get().role,
        fromId: get().role === "tcm" ? get().currentTcmId : get().role,
        text: `Reassigned to ${tcm?.name ?? tcmId}. Reason: ${reason}`,
        priority: lead.intent === "hot" ? "urgent" : "normal",
      });
    }
  },

  autoAssignLead: (leadId) => {
    const lead = get().leads.find((l) => l.id === leadId);
    if (!lead) return { tcmId: "", reasons: [] };
    const pick = autoAssignFn(lead, get().tcms, get().leads, get().tours);
    get().reassignLead(leadId, pick.tcmId, pick.reasons.join(" · "));
    return { tcmId: pick.tcmId, reasons: pick.reasons };
  },

  sendHandoff: ({ leadId, from, fromId, text, priority }) => {
    const to: Role = from === "flow-ops" ? "tcm" : from === "tcm" ? "flow-ops" : "flow-ops";
    const msg: HandoffMessage = {
      id: uid("h"), leadId, ts: new Date().toISOString(),
      from, fromId, to, text, priority, read: false,
    };
    set((s) => ({ handoffs: [...s.handoffs, msg] }));
    emitConnector({
      kind: "handoff.sent",
      actorRole: from, actorId: fromId, leadId,
      text: `${personName(fromId, from)} → ${to}: ${text.slice(0, 80)}`,
    });
  },

  markHandoffsRead: (leadId) => {
    set((s) => ({
      handoffs: s.handoffs.map((h) => (h.leadId === leadId ? { ...h, read: true } : h)),
    }));
  },

  startSequence: (leadId, kind) => {
    const existing = get().sequences.find((s) => s.leadId === leadId && !s.stoppedReason);
    if (existing) return;
    const seq: ActiveSequence = {
      id: uid("s"), leadId, kind, startedAt: new Date().toISOString(),
      currentStep: 0, paused: false,
    };
    set((s) => ({ sequences: [...s.sequences, seq] }));
    pushActivity(set, get, { kind: "message_sent", actor: "system", leadId, text: `Sequence started: ${kind}` });
  },

  toggleSequencePause: (leadId) => {
    set((s) => ({
      sequences: s.sequences.map((seq) =>
        seq.leadId === leadId && !seq.stoppedReason ? { ...seq, paused: !seq.paused } : seq,
      ),
    }));
  },

  stopSequence: (leadId, reason) => {
    set((s) => ({
      sequences: s.sequences.map((seq) =>
        seq.leadId === leadId && !seq.stoppedReason ? { ...seq, stoppedReason: reason } : seq,
      ),
    }));
  },

  advanceSequenceStep: (leadId) => {
    set((s) => ({
      sequences: s.sequences.map((seq) =>
        seq.leadId === leadId && !seq.stoppedReason ? { ...seq, currentStep: seq.currentStep + 1 } : seq,
      ),
    }));
  },

  closeDeal: ({ leadId, tourId, propertyId, tcmId, amount }) => {
    const booking: Booking = {
      id: uid("b"), leadId, tourId, propertyId, tcmId, amount,
      ts: new Date().toISOString(),
    };
    set((s) => ({
      bookings: [booking, ...s.bookings],
      properties: s.properties.map((p) =>
        p.id === propertyId
          ? { ...p, vacantBeds: Math.max(0, p.vacantBeds - 1), daysSinceLastBooking: 0 }
          : p,
      ),
      leads: s.leads.map((l) =>
        l.id === leadId ? { ...l, stage: "booked", confidence: 100, updatedAt: new Date().toISOString() } : l,
      ),
      tours: s.tours.map((t) =>
        t.id === tourId ? { ...t, decision: "booked", status: "completed" } : t,
      ),
      sequences: s.sequences.map((seq) =>
        seq.leadId === leadId && !seq.stoppedReason ? { ...seq, stoppedReason: "Booked" } : seq,
      ),
    }));
    pushActivity(set, get, { kind: "decision_logged", actor: tcmId, leadId, tourId, propertyId, text: `Deal closed · ₹${amount.toLocaleString("en-IN")}/mo` });
    // Connector — find which Flop scheduled this lead's tour, give them assist XP.
    const sched = get().activities.find(
      (a) => a.kind === "tour_scheduled" && a.leadId === leadId && a.tourId === tourId,
    );
    const lead = get().leads.find((l) => l.id === leadId);
    const ownerEvt = get().properties.find((p) => p.id === propertyId);
    emitConnector({
      kind: "booking.closed",
      actorRole: "tcm", actorId: tcmId,
      leadId, tourId, propertyId, bookingId: booking.id,
      text: `${personName(tcmId, "TCM")} booked ${lead?.name ?? "lead"} at ${ownerEvt?.name ?? "property"} · ₹${Math.round(amount).toLocaleString("en-IN")}/mo`,
      assists: sched && sched.actor !== tcmId
        ? [{ role: sched.actor === "flow-ops" ? "flow-ops" : "tcm", id: sched.actor }]
        : undefined,
    });
  },

  addLead: (input) => {
    const lead: Lead = {
      ...input,
      id: input.id || uid("l"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ leads: [lead, ...s.leads] }));
    pushActivity(set, get, {
      kind: "lead_created",
      actor: get().role,
      leadId: lead.id,
      text: `Lead created: ${lead.name}`,
    });
    return lead;
  },
}));

function pushActivity(
  set: (fn: (s: AppState) => Partial<AppState>) => void,
  _get: () => AppState,
  a: Omit<ActivityLog, "id" | "ts">,
) {
  const log: ActivityLog = { id: uid("a"), ts: new Date().toISOString(), ...a };
  set((s) => ({ activities: [log, ...s.activities] }));
}

/* ============== SELECTORS / DERIVED ============== */

export function getTcm(id: string) {
  return TCMS.find((t) => t.id === id);
}

export function getProperty(id: string, properties: Property[]) {
  return properties.find((p) => p.id === id);
}

export function getLead(id: string, leads: Lead[]) {
  return leads.find((l) => l.id === id);
}

export interface PropertyMetrics {
  property: Property;
  leadCount: number;
  tourCount: number;
  bookings: number;
  conversionPct: number; // 0-100
  occupancyPct: number;
  demandScore: number; // 0-100
  pressureScore: number; // 0-100
  signal: "high-demand-low-conv" | "low-demand-high-vacancy" | "high-conv-low-supply" | "balanced";
}

export function computePropertyMetrics(
  properties: Property[],
  leads: Lead[],
  tours: Tour[],
): PropertyMetrics[] {
  return properties.map((p) => {
    const propTours = tours.filter((t) => t.propertyId === p.id);
    const propLeads = leads.filter((l) => l.preferredArea === p.area);
    const bookings = propTours.filter((t) => t.decision === "booked").length;
    const completed = propTours.filter((t) => t.status === "completed").length;
    const conversionPct = completed > 0 ? Math.round((bookings / completed) * 100) : 0;
    const occupancyPct = Math.round(((p.totalBeds - p.vacantBeds) / p.totalBeds) * 100);
    const demandScore = Math.min(
      100,
      Math.round(propLeads.length * 12 + propTours.length * 8 - p.daysSinceLastBooking * 2),
    );
    const pressureScore = Math.round(
      Math.max(0, Math.min(100, demandScore * 0.6 + (100 - occupancyPct) * 0.4)),
    );

    let signal: PropertyMetrics["signal"] = "balanced";
    if (demandScore >= 60 && conversionPct < 25) signal = "high-demand-low-conv";
    else if (demandScore < 30 && occupancyPct < 60) signal = "low-demand-high-vacancy";
    else if (conversionPct >= 40 && p.vacantBeds <= 3) signal = "high-conv-low-supply";

    return {
      property: p, leadCount: propLeads.length, tourCount: propTours.length,
      bookings, conversionPct, occupancyPct, demandScore, pressureScore, signal,
    };
  });
}

/** Dynamic deal probability score */
export function recomputeConfidence(lead: Lead, tours: Tour[]): number {
  let score = lead.confidence;
  // Response speed weight
  if (lead.responseSpeedMins <= 5) score += 5;
  else if (lead.responseSpeedMins > 15) score -= 5;
  // Tour completed?
  const hasCompleted = tours.some((t) => t.leadId === lead.id && t.status === "completed");
  if (hasCompleted) score += 8;
  // Move-in urgency
  const days = (new Date(lead.moveInDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= 3) score += 6;
  else if (days >= 14) score -= 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function intentForConfidence(c: number): Intent {
  if (c >= 75) return "hot";
  if (c >= 50) return "warm";
  return "cold";
}
