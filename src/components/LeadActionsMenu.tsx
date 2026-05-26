// Single action menu used everywhere a lead appears. Same actions, same order, same icons.
// Replaces ad-hoc dropdowns scattered across pages.

import { useApp } from '@/lib/store';
import { tourMessageLink, sendTourMessage } from '@/owner/messaging';
import { Button } from '@/components/ui/button';
import { waLink } from '@/supply-hub/lib/wa';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MessageCircle, Phone, CalendarPlus, BellRing, MoreVertical, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Lead } from '@/lib/types';

interface Props {
  lead: Lead;
  size?: 'sm' | 'md';
}

export function LeadActionsMenu({ lead, size = 'sm' }: Props) {
  const { selectLead, logCall, sendMessage, tours, properties, tcms } = useApp();
  const tour = tours.find((t) => t.leadId === lead.id);
  const property = tour ? properties.find((p) => p.id === tour.propertyId) : undefined;
  const tcm = tcms.find((t) => t.id === lead.assignedTcmId);

  const canSendTourMsg = !!tour && !!property;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size === 'sm' ? 'sm' : 'default'}
          className="h-8 w-8 p-0"
          aria-label={`Actions for ${lead.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px]">{lead.name} · next step</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => selectLead(lead.id)}>
          <Sparkles className="h-3.5 w-3.5 mr-2" /> Open control panel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { logCall(lead.id); toast.success(`Call logged for ${lead.name}`); }}>
          <Phone className="h-3.5 w-3.5 mr-2" /> Log call
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { window.open(waLink(lead.phone, `Hi ${lead.name}, quick check-in from Gharpayy — any update on your PG search?`), '_blank'); toast.success('WhatsApp opened'); }}>
          <MessageCircle className="h-3.5 w-3.5 mr-2" /> Send check-in
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => selectLead(lead.id)}>
          <CalendarPlus className="h-3.5 w-3.5 mr-2" /> Schedule / reschedule tour
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => selectLead(lead.id)}>
          <BellRing className="h-3.5 w-3.5 mr-2" /> Set follow-up
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px]">Tour messages</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!canSendTourMsg}
          onClick={() => {
            if (!tour || !property) return;
            sendTourMessage('confirmation', {
              tourId: tour.id, leadName: lead.name, phone: lead.phone,
              propertyName: property.name, area: property.area,
              tourDate: tour.scheduledAt.slice(0, 10),
              tourTime: tour.scheduledAt.slice(11, 16),
              tcmName: tcm?.name,
            });
            toast.success('WhatsApp confirmation opened');
          }}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Send confirmation
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canSendTourMsg}
          onClick={() => {
            if (!tour || !property) return;
            sendTourMessage('reminder_2h', {
              tourId: tour.id, leadName: lead.name, phone: lead.phone,
              propertyName: property.name, area: property.area,
              tourDate: tour.scheduledAt.slice(0, 10),
              tourTime: tour.scheduledAt.slice(11, 16),
              tcmName: tcm?.name,
            });
            toast.success('2h reminder opened');
          }}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Send 2h reminder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
