// Quick Add Lead — full lead schema in a single floating panel.
// Designed for the "WhatsApp + PiP dashboard" workflow:
//  • Paste an entire WhatsApp message into ANY field → auto-parse every column
//  • Manual edit any auto-filled field
//  • Save + Next keeps panel open for rapid one-handed entry
//  • ⌘/Ctrl+Enter saves and closes
//  • Works identically inside the PiP window and the main tab
//
// Captures: Name · Phone · Email · Areas (multi) · Full Address · Budget ·
// Move-in · Type · Room · Need · Special Reqs · In-BLR · Lead Quality ·
// Zone (categorical) · Assign Member · Lead Stage · Notes
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { detectZone, parseLead } from "@/lib/lead-identity/parser";
import { teamMembers } from "@/myt/lib/mock-data";
import { toast } from "sonner";
import { Save, Repeat2, Phone, MapPin, Sparkles, X, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "@/shims/react-router-dom";
import { useAppState } from "@/myt/lib/app-context";
import { useApp } from "@/lib/store";
import type { LeadStage } from "@/lib/types";
import { bestInventoryFits, detectAreaZone, recommendedFlowOps, recommendedTcm } from "@/myt/lib/inventory-intelligence";
import { QUICKAD_NEED_OPTIONS, QUICKAD_ROOM_OPTIONS, QUICKAD_TYPE_OPTIONS, parseBudgetAmount } from "@/lib/quickad-shared";
import type { ParsedLeadDraft } from "@/lib/lead-identity/types";

interface Props { open: boolean; onClose: () => void; }

const todayIso = () => new Date().toISOString().slice(0, 10);

const ZONE_BUCKETS = [
  "CENTRAL STUDENTS", "CU YPR / STUDENTS / WORKING", "HOMES KORA", "HOMES MWB",
  "KORA CORE", "MTECH HUB", "MWB MORE", "OTHERS COLLEGE STUDENTS",
  "YPR MAJOR MAIN", "OTHERS",
] as const;

const STAGES = [
  "MYT [TENANT]",
  "2A. Options Shared – BLR",
  "2B. Options Shared – Non-BLR",
  "3A. Visit Intent Confirmed",
  "3B. try.prebook / virtual tour Intent",
  "4A. Visit Scheduled in BLR",
  "5A. Visit Done",
  "Finalizing",
  "WON 🏆",
  "LOST 😭",
] as const;

const TYPE_OPTS = QUICKAD_TYPE_OPTIONS;
const ROOM_OPTS = QUICKAD_ROOM_OPTIONS;
const NEED_OPTS = QUICKAD_NEED_OPTIONS;
const QUALITY_OPTS = [
  { v: "hot" as const, label: "🔥 Hot" },
  { v: "good" as const, label: "✅ Good" },
  { v: "bad" as const, label: "❌ Bad" },
];
const BLR_OPTS = [
  { v: true as const, label: "🏙 In" },
  { v: false as const, label: "✈️ Out" },
  { v: null, label: "❓ Unknown" },
];

const mapMytStageToCrmStage = (mytStage: string): LeadStage => {
  if (mytStage === "MYT [TENANT]") return "new";
  if (mytStage.includes("Options Shared")) return "contacted";
  if (mytStage.includes("Visit Intent")) return "contacted";
  if (mytStage.includes("Scheduled")) return "tour-scheduled";
  if (mytStage.includes("Visit Done")) return "tour-done";
  if (mytStage === "Finalizing") return "negotiation";
  if (mytStage.includes("WON")) return "booked";
  if (mytStage.includes("LOST")) return "dropped";
  return "new";
};

export function QuickAddLeadPanel({ open, onClose }: Props) {
  const checkDup = useIdentityStore((s) => s.checkDuplicates);
  const create = useIdentityStore((s) => s.createLead);
  const { rooms, blocks, tours, leads: mytLeads, setLeads: setMytLeads } = useAppState();
  const addCrmLead = useApp((s) => s.addLead);
  const navigate = useNavigate();

  // Core
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [areasText, setAreasText] = useState("");        // comma-separated areas
  const [fullAddress, setFullAddress] = useState("");
  const [budget, setBudget] = useState("");
  const [moveIn, setMoveIn] = useState(todayIso());
  const [type, setType] = useState("");
  const [room, setRoom] = useState("");
  const [need, setNeed] = useState("");
  const [specialReqs, setSpecialReqs] = useState("");
  // Editorial
  const [inBLR, setInBLR] = useState<boolean | null>(null);
  const [quality, setQuality] = useState<"hot" | "good" | "bad" | null>(null);
  const [zoneBucket, setZoneBucket] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [stage, setStage] = useState<string>(STAGES[0]);
  const [notes, setNotes] = useState("");
  const [lastParsed, setLastParsed] = useState<ParsedLeadDraft | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => nameRef.current?.focus(), 50); }, [open]);

  const detectedZone = useMemo(
    () => detectZone(`${areasText} ${fullAddress}`),
    [areasText, fullAddress],
  );
  const areaFit = useMemo(() => {
    const areaText = `${areasText} ${fullAddress}`.trim();
    if (!areaText) return null;
    const budgetNum = parseBudgetAmount(budget);
    const zone = detectAreaZone(areaText);
    const fits = bestInventoryFits({ areaText, budget: budgetNum, room, rooms, blocks, limit: 3 });
    return { zone, fits, flowOps: recommendedFlowOps(zone.id), tcm: recommendedTcm(tours, zone.id) };
  }, [areasText, fullAddress, budget, room, rooms, blocks, tours]);

  const reset = () => {
    setName(""); setPhone(""); setEmail("");
    setAreasText(""); setFullAddress("");
    setBudget(""); setMoveIn(todayIso());
    setType(""); setRoom(""); setNeed(""); setSpecialReqs("");
    setInBLR(null); setQuality(null); setZoneBucket("");
    setAssigneeId(""); setStage(STAGES[0]); setNotes("");
    setLastParsed(null);
    setTimeout(() => nameRef.current?.focus(), 30);
  };

  const buildScheduleLead = (source?: ParsedLeadDraft | null) => ({
    name: source?.name || name,
    phone: source?.phone || phone,
    email: source?.email || email,
    location: source?.location || areasText,
    area: source?.areas?.length ? source.areas.join(", ") : source?.location || areasText,
    areas: source?.areas?.length ? source.areas : areasText.split(",").map((a) => a.trim()).filter(Boolean),
    fullAddress: source?.fullAddress || fullAddress,
    budget: source?.budget || budget,
    moveInDate: source?.moveIn || moveIn,
    room: source?.room || room,
    type: source?.type || type,
    need: source?.need || need,
    specialReqs: source?.specialReqs || specialReqs,
    extraContent: source?.extraContent || notes || specialReqs,
    links: source?.links ?? (fullAddress.match(/https?:\/\/\S+/g) ?? []),
    geoIntel: source?.geoIntel,
    rawSource: source?.rawSource,
  });

  const scheduleExisting = (lead: ReturnType<typeof checkDup>["candidates"][number]["lead"], parsedOverride?: ParsedLeadDraft | null) => {
    onClose();
    navigate("/myt/schedule", { state: { lead, pastedLead: buildScheduleLead(parsedOverride ?? lastParsed), inventoryFit: areaFit?.fits[0] } });
    toast.info(`Scheduling tour for ${lead.name}`);
  };

  const scheduleDraft = () => {
    if (!name.trim() || !phone.trim()) { toast.error("Need name and phone before scheduling"); return; }
    const dup = checkDup({ name, phone, email, location: areasText });
    const existing = dup.candidates[0]?.lead;
    if (existing && (dup.type === "exact" || dup.type === "strong")) {
      scheduleExisting(existing);
      return;
    }
    onClose();
    navigate("/myt/schedule", {
      state: {
        lead: buildScheduleLead(lastParsed),
        inventoryFit: areaFit?.fits[0],
      },
    });
  };

  const save = (keepOpen: boolean) => {
    if (!name.trim() || !phone.replace(/\D/g, "").match(/^[6-9]\d{9}$/)) {
      toast.error("Need a name and a valid 10-digit phone");
      return;
    }
    const dup = checkDup({ name, phone, email, location: areasText });
    if (dup.type === "exact" || dup.type === "strong") {
      const existing = dup.candidates[0]?.lead;
      toast.warning(`Duplicate detected: ${existing?.name}`, {
        action: existing
          ? { label: "Schedule tour", onClick: () => scheduleExisting(existing) }
          : undefined,
      });
      return;
    }
    const areasArr = areasText.split(",").map((a) => a.trim()).filter(Boolean);
    const assignee = teamMembers.find((m) => m.id === assigneeId);
    const lead = create(
      {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        location: areasText.trim(),
        areas: areasArr,
        fullAddress: fullAddress.trim(),
        budget: budget.trim(),
        moveIn,
        type, room, need,
        specialReqs: [specialReqs, notes].filter(Boolean).join(" · "),
        extraContent: notes.trim(),
        budgets: budget.split(/\s*(?:,|\/|\bor\b)\s*/i).filter(Boolean),
        links: fullAddress.match(/https?:\/\/\S+/g) ?? [],
        inBLR,
        zone: detectedZone,
        rawSource: `[QuickAdd] ${name} ${phone}`,
      },
      {
        quality,
        stage,
        zoneCategory: zoneBucket,
        assigneeId: assignee?.id ?? null,
        assigneeName: assignee?.name ?? null,
      },
    );

    // Sync with CRM Zustand store
    const parsedBudget = parseBudgetAmount(budget) || 10000;
    const crmStage = mapMytStageToCrmStage(stage);
    addCrmLead({
      id: lead.ulid, // Use same id for sync/traceability
      name: name.trim(),
      phone: phone.trim(),
      source: "Quick Add",
      budget: parsedBudget,
      moveInDate: moveIn,
      preferredArea: areasText.trim() || "Unknown",
      assignedTcmId: assigneeId || "tcm-1",
      stage: crmStage,
      intent: quality === "hot" ? "hot" : quality === "good" ? "warm" : "cold",
      confidence: quality === "hot" ? 80 : quality === "good" ? 50 : 20,
      tags: [],
      nextFollowUpAt: null,
      responseSpeedMins: 5,
    });

    // Sync with MYT Context store
    const areaCovered = areaFit?.zone ? true : false;
    const moveInDateObj = new Date(moveIn);
    const daysToMoveIn = (moveInDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const mytQualified = areaCovered && parsedBudget >= 7000 && daysToMoveIn <= 15;
    const mytStatus = stage.includes("WON")
      ? "qualified"
      : stage.includes("LOST")
      ? "dead"
      : stage.includes("Scheduled")
      ? "tour-scheduled"
      : mytQualified
      ? "qualified"
      : "contacted";

    const newMytLead = {
      id: lead.ulid, // Use same id for consistency
      name: name.trim(),
      phone: phone.trim(),
      area: areasText.trim().split(",")[0] || "Unknown",
      budget: parsedBudget,
      moveInDate: moveIn,
      dateConfirmed: true,
      status: mytStatus,
      mytQualified,
      addedBy: assigneeId || "m1",
      addedByName: assignee?.name || "Rahul Sharma",
      createdAt: new Date().toISOString(),
      notes: [specialReqs, notes].filter(Boolean).join(" · ") || "",
    };
    setMytLeads((prev) => [newMytLead, ...prev]);

    toast.success(`Lead saved · ${lead.name}`);
    if (keepOpen) reset(); else onClose();
  };

  // Paste WhatsApp message into ANY input → auto-fill everything we can
  const onAnyPaste = (e: React.ClipboardEvent) => {
    const txt = e.clipboardData.getData("text");
    if (!txt || txt.length < 30) return;
    const parsed = parseLead(txt);
    if (!parsed) return;
    e.preventDefault();
    setLastParsed(parsed);
    if (parsed.name) setName(parsed.name);
    if (parsed.phone) setPhone(parsed.phone);
    if (parsed.email) setEmail(parsed.email);
    if (parsed.areas?.length) setAreasText(parsed.areas.join(", "));
    else if (parsed.location) setAreasText(parsed.location);
    if (parsed.fullAddress) setFullAddress(parsed.fullAddress);
    if (parsed.budget) setBudget(parsed.budget);
    if (parsed.moveIn && /^\d{4}-\d{2}-\d{2}$/.test(parsed.moveIn)) setMoveIn(parsed.moveIn);
    if (parsed.type) setType(parsed.type);
    if (parsed.room) setRoom(parsed.room);
    if (parsed.need) setNeed(parsed.need.split(" / ")[0] ?? parsed.need);
    if (parsed.specialReqs) setSpecialReqs(parsed.specialReqs);
    if (parsed.inBLR !== null) setInBLR(parsed.inBLR);
    const dup = checkDup({ name: parsed.name, phone: parsed.phone, email: parsed.email, location: parsed.areas?.join(", ") || parsed.location });
    const existing = dup.candidates[0]?.lead;
    if (existing && (dup.type === "exact" || dup.type === "strong")) {
      toast.warning(`Existing lead found: ${existing.name}`, {
        action: { label: "Open Tour", onClick: () => scheduleExisting(existing, parsed) },
      });
      return;
    }
    toast.success("Auto-filled from paste · Tour action is ready");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(false); }
        }}
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Quick Add Lead
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">
            Paste a WhatsApp message into <strong>any</strong> field → auto-fills every column ·
            ⌘/Ctrl + Enter saves
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" onPaste={onAnyPaste}>
          {areaFit && (
            <div className="rounded-md border border-primary/25 bg-primary/5 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Area Inventory Fit</div>
          <div className="text-sm font-semibold text-foreground">{areaFit.zone.area} · {areaFit.fits[0]?.availableBeds ?? 0} Supply Hub beds live</div>
                </div>
                <Button type="button" size="sm" variant="secondary" className="h-7 text-[11px]" onClick={scheduleDraft} disabled={!areaFit.fits[0]}>
                  <CalendarPlus className="h-3 w-3 mr-1" /> Best Tour
                </Button>
              </div>
              <div className="grid gap-1.5">
                {areaFit.fits.slice(0, 2).map((fit, i) => (
                  <div key={fit.propertyId} className="rounded border border-border bg-background/70 px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{i === 0 ? 'Best' : 'Normal'} · {fit.propertyName}</span>
                    <span className="text-muted-foreground shrink-0">{fit.availableBeds} beds · {fit.distanceKm !== null ? `${fit.distanceKm} km` : fit.area} · ₹{(fit.basePrice / 1000).toFixed(0)}k · {fit.score}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Flow Ops: {areaFit.flowOps?.name ?? 'Auto'} · TCM: {areaFit.tcm?.name ?? 'Auto'} · {areaFit.fits[0]?.reason ?? 'No matching inventory yet'}
              </div>
            </div>
          )}

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="👤 Name *">
              <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" />
            </Field>
            <Field label="📱 Phone *">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" inputMode="tel" />
            </Field>
          </div>

          <Field label="✉️ Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" inputMode="email" />
          </Field>

          {/* Areas */}
          <Field label="📍 Areas (comma-separated)">
            <div className="relative">
              <Input
                value={areasText}
                onChange={(e) => setAreasText(e.target.value)}
                placeholder="HSR Layout, BTM, Koramangala"
              />
              {detectedZone && (
                <Badge variant="secondary" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]">
                  {detectedZone}
                </Badge>
              )}
            </div>
            {areasText.includes(",") && (
              <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> Multiple Areas Detected
              </p>
            )}
          </Field>

          {/* Full Address */}
          <Field label="🏠 Full Address / Map link">
            <Textarea
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              rows={2}
              placeholder="Door no, street, landmark or Google Maps URL"
              className="resize-none"
            />
          </Field>

          {/* Budget + Move-in */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="💰 Budget">
              <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="8-12k" />
            </Field>
            <Field label="📅 Move-in">
              <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            </Field>
          </div>

          {/* Type + Room + Need (chips) */}
          <Field label="💼 Type">
            <ChipGroup options={TYPE_OPTS} value={type} onChange={setType} />
          </Field>
          <Field label="🛏 Room">
            <ChipGroup options={ROOM_OPTS} value={room} onChange={setRoom} />
          </Field>
          <Field label="👥 Need">
            <ChipGroup options={NEED_OPTS} value={need} onChange={setNeed} />
          </Field>

          {/* Special requests */}
          <Field label="⭐ Special Requests">
            <Textarea
              value={specialReqs}
              onChange={(e) => setSpecialReqs(e.target.value)}
              rows={2}
              placeholder="Veg only · attached washroom · top floor…"
              className="resize-none"
            />
          </Field>

          {/* In-BLR */}
          <Field label="Currently in Bangalore?">
            <ChipGroup
              options={BLR_OPTS.map((o) => o.label)}
              value={BLR_OPTS.find((o) => o.v === inBLR)?.label ?? ""}
              onChange={(label) => setInBLR(BLR_OPTS.find((o) => o.label === label)?.v ?? null)}
            />
          </Field>

          {/* Quality */}
          <Field label="Lead Quality">
            <ChipGroup
              options={QUALITY_OPTS.map((o) => o.label)}
              value={QUALITY_OPTS.find((o) => o.v === quality)?.label ?? ""}
              onChange={(label) => setQuality(QUALITY_OPTS.find((o) => o.label === label)?.v ?? null)}
            />
          </Field>

          {/* Zone bucket */}
          <Field label="Zone *">
            <select
              value={zoneBucket}
              onChange={(e) => setZoneBucket(e.target.value)}
              className="w-full h-9 bg-background border border-border rounded-md px-2 text-xs"
            >
              <option value="">Select zone bucket…</option>
              {ZONE_BUCKETS.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>

          {/* Assignee */}
          <Field label="Assign Member">
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full h-9 bg-background border border-border rounded-md px-2 text-xs"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>

          {/* Stage */}
          <Field label="Lead Stage">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full h-9 bg-background border border-border rounded-md px-2 text-xs"
            >
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {/* Notes */}
          <Field label="📝 Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Free notes…"
              className="resize-none"
            />
          </Field>
        </div>

        <div className="border-t border-border px-5 py-3 flex flex-col gap-2 bg-background">
          <div className="flex gap-2">
            <Button onClick={() => save(true)} variant="outline" size="sm" className="flex-1 gap-1.5">
              <Repeat2 className="h-3.5 w-3.5" /> Save + Next
            </Button>
            <Button onClick={() => save(false)} size="sm" className="flex-1 gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const dup = checkDup({ name, phone, email, location: areasText });
                const existing = dup.candidates[0]?.lead;
                if (existing) scheduleExisting(existing);
                else scheduleDraft();
              }}
              className="gap-1.5"
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Tour
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Tip: paste a WhatsApp message anywhere → all fields auto-fill · ⌘/Ctrl + Enter to save
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function ChipGroup({ options, value, onChange }: {
  options: readonly string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={cn(
            "px-2 py-1 text-[11px] rounded-md border transition-colors",
            value === opt
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
