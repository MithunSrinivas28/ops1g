import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Target, CalendarPlus, ClipboardList, Boxes, Activity,
  Building2, Search, Sun, Command, Trophy, Sparkles, MessageSquare,
  IndianRupee, MapPin, Zap, Users, Home, Calendar, Store, Swords, Settings, AlertTriangle,
  ShieldCheck, Inbox, Camera, HelpCircle, Layers, HeartPulse,
} from "lucide-react";
import { NotificationCenter } from "./NotificationCenter";
import { ProfileMenu } from "./ProfileMenu";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReactNode } from "react";
import { LeadControlPanel } from "./LeadControlPanel";
import { CommandPalette } from "./CommandPalette";
import { CoachWidget } from "./CoachWidget";
import { useNow, useMountedNow } from "@/hooks/use-now";
import { buildDoNextQueue } from "@/lib/engine";
import { useGame, whoKey } from "@/lib/gamification";
import { useCRM10x } from "@/lib/crm10x/store";
import { useEffect, useMemo } from "react";
import { PictureInPictureProvider, PipMount, usePip } from "./pip/PipProvider";
import { PipButton } from "./pip/PipButton";
import { usePipRouteSync } from "./pip/usePipSync";
import { activePersona } from "@/lib/personas";

function PipRouteSyncBridge() {
  const { active } = usePip();
  usePipRouteSync(active);
  return null;
}

type NavItem = { to: string; label: string; icon: typeof Target; badge?: number; accent?: boolean };

function PersonaPulse({ role, persona, queueCount, overdueCount, bookingsCount }: {
  role: string;
  persona: ReturnType<typeof activePersona>;
  queueCount: number;
  overdueCount: number;
  bookingsCount: number;
}) {
  const roleCopy = role === "hr"
    ? `People watch: ${persona.arc}`
    : role === "flow-ops"
      ? `Flow control: ${queueCount} actions waiting · ${persona.signature}`
      : role === "tcm"
        ? `Next best action: ${persona.weakSpots[0] ? `protect against ${persona.weakSpots[0]}` : persona.signature}`
        : `Owner control: approve what is blocking sellable inventory.`;
  const metric = role === "hr" ? `${bookingsCount} bookings` : role === "tcm" ? `${overdueCount} overdue` : `${queueCount} live tasks`;
  return (
    <div className="border-b border-border bg-card/35 px-4 md:px-6 py-2">
      <div className="mx-auto max-w-[1400px] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="min-w-0">
          <span className="font-medium text-foreground">{persona.name.split(" ")[0]}</span>
          <span className="text-muted-foreground"> · {roleCopy}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{persona.focus}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{metric}</span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole, currentTcmId, setCurrentTcmId, tcms, leads, tours, followUps, handoffs, bookings } = useApp();
  const router = useRouterState();
  const path = router.location.pathname;
  const [now, mounted] = useMountedNow();

  const filterTcm = role === "tcm" ? currentTcmId : undefined;
  const queue = useMemo(
    () => (mounted ? buildDoNextQueue(leads, tours, followUps, now, filterTcm) : []),
    [leads, tours, followUps, now, filterTcm, mounted],
  );
  const overdueCount = mounted ? followUps.filter((f) => !f.done && +new Date(f.dueAt) <= now).length : 0;
  const incompletePostTour = tours.filter((t) => t.status === "completed" && !t.postTour.filledAt).length;
  const unreadHandoffs = handoffs.filter((h) => !h.read && h.to === role).length;

  // Booking XP awarder — credit the TCM once per booking id.
  // Both awardXp and registerBooking are idempotent via persisted dedupe keys,
  // so safe to re-run across remounts.
  const awardXp = useGame((s) => s.awardXp);
  const registerBooking = useGame((s) => s.registerBooking);
  const rolloverIfNeeded = useGame((s) => s.rolloverIfNeeded);
  useEffect(() => {
    if (!mounted) return;
    bookings.forEach((b) => {
      const who = whoKey("tcm", b.tcmId);
      awardXp(who, 100, `booking:${b.id}`);
      registerBooking(who, b.id);
    });
  }, [bookings, mounted, awardXp, registerBooking]);

  // Daily rollover for the active user.
  useEffect(() => {
    if (!mounted) return;
    rolloverIfNeeded(whoKey(role, currentTcmId));
  }, [mounted, role, currentTcmId, rolloverIfNeeded]);

  // Attribute prior WhatsApp sends to bookings (ROI for templates).
  // Guard: only matching leadId, only sends BEFORE the booking, only within 14d
  // window — the store enforces this and never re-credits a message twice.
  const markMessageBookedAfter = useCRM10x((s) => s.markMessageBookedAfter);
  useEffect(() => {
    if (!mounted) return;
    bookings.forEach((b) => markMessageBookedAfter(b.leadId, b.id, b.ts));
  }, [bookings, mounted, markMessageBookedAfter]);

  const navByRole: Record<typeof role, NavItem[]> = {
    hr: [
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/myt/war-room", label: "War Room", icon: Swords, accent: true },
      { to: "/myt/team", label: "Team", icon: Users },
      { to: "/revenue", label: "Revenue", icon: IndianRupee },
      { to: "/myt/funnel", label: "Funnel", icon: Activity },
      { to: "/myt/zones", label: "Zones", icon: MapPin },
      { to: "/myt/owners-compare", label: "Owners", icon: ShieldCheck },
      { to: "/supply-hub", label: "Supply Hub", icon: Layers },
    ],
    "flow-ops": [
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/inbox", label: "Inbox", icon: Inbox },
      { to: "/myt/leads", label: "Leads", icon: Target, accent: true },
      { to: "/queue", label: "Action Queue", icon: Zap, accent: true },
      { to: "/myt/schedule", label: "Schedule", icon: CalendarPlus },
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/revival", label: "Revival", icon: Sparkles },
      { to: "/myt/marketplace", label: "Marketplace", icon: Store },
      { to: "/supply-hub", label: "Supply Hub", icon: Layers },
      { to: "/sequences", label: "Outreach", icon: HeartPulse },
    ],
    tcm: [
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/myt/tcm", label: "TCM Desk", icon: Target, accent: true },
      { to: "/tours", label: "My Tours", icon: CalendarPlus, badge: incompletePostTour },
      { to: "/follow-ups", label: "Follow-ups", icon: ClipboardList, badge: overdueCount },
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/handoffs", label: "Handoffs", icon: MessageSquare, badge: unreadHandoffs },
      { to: "/myt/marketplace", label: "Marketplace", icon: Store },
      { to: "/myt/tcm/performance", label: "My Stats", icon: Activity },
    ],
    owner: [
      { to: "/owner", label: "Owner Home", icon: ShieldCheck, accent: true },
      { to: "/owner/blocks", label: "Approvals", icon: Inbox },
      { to: "/owner/rooms", label: "Rooms", icon: Building2 },
      { to: "/owner/inventory", label: "Inventory", icon: Layers },
      { to: "/owner/visits", label: "Tours", icon: Camera },
      { to: "/owner/insights", label: "Insights", icon: IndianRupee },
    ],
  };
  const items = navByRole[role];
  const persona = activePersona(role, role === "tcm" ? currentTcmId : undefined);

  const isActive = (to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(to + "/"));

  return (
    <PictureInPictureProvider>
      <PipRouteSyncBridge />
      <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[240px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
            <Building2 className="h-4 w-4 text-accent-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sidebar-accent-foreground font-display font-semibold text-sm">Gharpayy</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground">Arena Infrastructure</div>
          </div>
        </div>

        {(() => {
          const roleMeta = {
            "flow-ops": { label: "Flow Ops", dot: "bg-info" },
            tcm: { label: "TCM Desk", dot: "bg-accent" },
            hr: { label: "HR / Leadership", dot: "bg-success" },
            owner: { label: "Owner Portal", dot: "bg-warning" },
          } as const;
          const meta = roleMeta[role];
          const userName = role === "tcm" ? tcms.find((t) => t.id === currentTcmId)?.name : null;
          return (
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/70 font-semibold">
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                <span>{meta.label}</span>
                {userName && <span className="text-sidebar-foreground/50 normal-case tracking-normal">· {userName.split(" ")[0]} {userName.split(" ")[1]?.[0] ?? ""}.</span>}
              </div>
            </div>
          );
        })()}

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {items.map((it) => {
            const Icon = it.icon;
            const active = isActive(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  it.accent && !active && "text-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{it.label}</span>
                {it.badge !== undefined && it.badge > 0 && mounted && (
                  <span className={cn(
                    "ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-mono",
                    it.accent
                      ? "bg-accent text-accent-foreground"
                      : "bg-destructive text-destructive-foreground",
                  )}>
                    {it.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="text-[10px] text-sidebar-foreground/70 flex items-center justify-between px-1">
            <span>Quick jump</span>
            <kbd className="inline-flex items-center gap-0.5 rounded border border-sidebar-border bg-sidebar-accent px-1.5 py-0.5 font-mono text-sidebar-accent-foreground">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground px-1">View as</div>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flow-ops">Flow Ops</SelectItem>
              <SelectItem value="tcm">TCM</SelectItem>
              <SelectItem value="hr">HR / Leadership</SelectItem>
              <SelectItem value="owner">Property Owner</SelectItem>
            </SelectContent>
          </Select>
          {role === "tcm" && (
            <Select value={currentTcmId} onValueChange={setCurrentTcmId}>
              <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tcms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-background/85 backdrop-blur border-b border-border flex items-center gap-3 px-4 md:px-6">
          <div className="md:hidden font-display font-semibold">Gharpayy</div>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-card hover:bg-muted/60 text-xs text-muted-foreground w-full max-w-md transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Jump to lead, page or action…</span>
            <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <PipButton mode="capture" label="PiP Add" className="hidden sm:inline-flex" />
            <PipButton mode="manage" label="PiP Manage" className="hidden sm:inline-flex" />
            <PipButton />
            <NotificationCenter role={role} />
            <ProfileMenu />
          </div>
        </header>

        <PersonaPulse role={role} persona={persona} queueCount={queue.length} overdueCount={overdueCount} bookingsCount={bookings.length} />

        <PipMount>
          <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 pb-24 md:p-6 md:pb-6">{children}</main>
        </PipMount>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch gap-1 overflow-x-auto px-2 py-2 scrollbar-thin scroll-smooth snap-x">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors min-w-[64px] min-h-[44px]",
                  active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && mounted && (
                  <span className="absolute right-1 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-mono text-destructive-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Overlays */}
      <LeadControlPanel />
      <CommandPalette />
      <CoachWidget />
      </div>
    </PictureInPictureProvider>
  );
}
