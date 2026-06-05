import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useApp } from "@/lib/store";
import { ConfidenceBar, IntentChip, StageBadge } from "@/components/atoms";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import type { LeadStage } from "@/lib/types";
import { useMountedNow } from "@/hooks/use-now";
import { QuickAddLeadPanel } from "@/components/leads/QuickAddLeadPanel";
import { LeadActionsMenu } from "@/components/LeadActionsMenu";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [{ title: "Leads — Gharpayy" }, { name: "description", content: "Every lead, ranked by deal probability, one click into the control panel." }],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const { leads, tcms, selectLead, setLeadStage } = useApp();
  const [, mounted] = useMountedNow();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"confidence" | "moveIn" | "updated">("confidence");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const list = leads.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q.toLowerCase()) && !l.phone.includes(q)) return false;
      if (stage !== "all" && l.stage !== stage) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === "confidence") return b.confidence - a.confidence;
      if (sortBy === "moveIn") return +new Date(a.moveInDate) - +new Date(b.moveInDate);
      return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    });
    return list;
  }, [leads, q, stage, sortBy]);

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} of {leads.length} · ranked by deal probability</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Lead
            </Button>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" className="h-9 w-56 text-sm" />
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {(["new","contacted","tour-scheduled","tour-done","negotiation","booked","dropped"] as LeadStage[]).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace("-", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confidence">Sort: Confidence</SelectItem>
                <SelectItem value="moveIn">Sort: Move-in date</SelectItem>
                <SelectItem value="updated">Sort: Last updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        <QuickAddLeadPanel open={addOpen} onClose={() => setAddOpen(false)} />

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border bg-muted/40">
            <div className="col-span-3">Lead</div>
            <div className="col-span-2">Stage</div>
            <div className="col-span-2">Intent · score</div>
            <div className="col-span-2">Area · budget</div>
            <div className="col-span-2">Assigned</div>
            <div className="col-span-1 text-right">Updated</div>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((l) => {
              const tcm = tcms.find((t) => t.id === l.assignedTcmId);
              return (
                <div key={l.id}>
                  <button
                    onClick={() => selectLead(l.id)}
                    className="w-full text-left grid grid-cols-12 px-4 py-3 items-center hover:bg-accent/5 transition-colors"
                  >
                    <div className="col-span-3">
                      <div className="font-medium text-sm">{l.name}</div>
                      <div className="text-[11px] text-muted-foreground">{l.phone} · {l.source}</div>
                    </div>
                    <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={l.stage}
                        onValueChange={(v) => {
                          setLeadStage(l.id, v as LeadStage);
                          toast.success(`${l.name} → ${v.replace("-", " ")}`);
                        }}
                      >
                        <SelectTrigger className="h-7 w-auto min-w-0 border-none bg-transparent shadow-none px-0 py-0 gap-1 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-0 hover:[&>svg]:opacity-100 focus:[&>svg]:opacity-100 transition-all">
                          <StageBadge stage={l.stage} />
                        </SelectTrigger>
                        <SelectContent align="start">
                          {(["new","contacted","tour-scheduled","tour-done","negotiation","booked","dropped"] as LeadStage[]).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs capitalize">
                              {s.replace("-", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <IntentChip intent={l.intent} />
                      <ConfidenceBar value={l.confidence} />
                    </div>
                    <div className="col-span-2 text-xs">
                      <div>{l.preferredArea}</div>
                      <div className="text-muted-foreground">₹{(l.budget / 1000).toFixed(0)}k</div>
                    </div>
                    <div className="col-span-2 text-xs">
                      <div>{tcm?.name ?? "—"}</div>
                      <div className="text-muted-foreground">{tcm?.zone ?? "—"}</div>
                    </div>
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {mounted ? formatDistanceToNow(new Date(l.updatedAt), { addSuffix: true }) : "—"}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <LeadActionsMenu lead={l} />
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">No leads match.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
