import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Mail, Phone, MessageSquare, Calendar, Search, Filter, 
  ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle, Clock, Eye,
  List, Users, ChevronRight, Inbox, Ticket, Send, History
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { TicketsList } from './TicketsList';
import { ComposeEmail } from './ComposeEmail';
import { CRMWhatsAppCompose } from './CRMWhatsAppCompose';
import { UnifiedCommunicationsList } from '@/components/communications/UnifiedCommunicationsList';
import { CRMSMSCompose } from './CRMSMSCompose';

type Communication = Tables<'crm_communications'> & {
  crm_contacts?: { name: string; surname: string | null; email: string | null } | null;
};

const typeIcons = {
  email: Mail,
  whatsapp: MessageSquare,
  call: Phone,
  meeting: Calendar,
};

const statusConfig = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'bg-blue-500/10 text-blue-600' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'bg-green-500/10 text-green-600' },
  failed: { label: 'Fallido', icon: XCircle, color: 'bg-red-500/10 text-red-600' },
  opened: { label: 'Abierto', icon: Eye, color: 'bg-purple-500/10 text-purple-600' },
};

const directionConfig = {
  inbound: { label: 'Entrante', icon: ArrowDownLeft, color: 'text-green-600' },
  outbound: { label: 'Saliente', icon: ArrowUpRight, color: 'text-blue-600' },
};

export function CommunicationsTab() {
  const [activeSubTab, setActiveSubTab] = useState('communications');
  const [replyToEmail, setReplyToEmail] = useState<any>(null);

  const handleComposeReply = (communication: any) => {
    if (communication.type === 'email') {
      const email = communication.originalData;
      // Build quoted original message
      const originalBody = email.body_html || email.body_text || '';
      const quotedMessage = originalBody 
        ? `<br><br>---------- Mensaje original ----------<br>De: ${email.from_email}<br>Fecha: ${email.created_at}<br>Asunto: ${email.subject || ''}<br><br>${originalBody}`
        : '';
      
      setReplyToEmail({
        email: email.direction === 'inbound' ? email.from_email : email.to_emails?.[0],
        subject: email.subject,
        contactId: email.contact_id,
        ticketId: email.ticket_id,
        forwardEmailId: email.id, // Include to load attachments
        originalBody: quotedMessage,
      });
      setActiveSubTab('compose');
    }
  };

  const handleComposeForward = (communication: any) => {
    if (communication.type === 'email') {
      const email = communication.originalData;
      setReplyToEmail({
        email: '',
        subject: email.subject ? `Fwd: ${email.subject}` : 'Fwd:',
        contactId: email.contact_id,
        ticketId: email.ticket_id,
        forwardEmailId: email.id,
        originalBody: email.body_html || email.body_text,
      });
      setActiveSubTab('compose');
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs navigation */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="communications" className="gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Comunicaciones</span>
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2">
            <Ticket className="h-4 w-4" />
            <span className="hidden sm:inline">Tickets</span>
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Redactar Email</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-2">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar SMS</span>
          </TabsTrigger>
        </TabsList>

        {/* Unified Communications Tab */}
        <TabsContent value="communications" className="mt-4">
          <UnifiedCommunicationsList 
            isAdmin={true}
            onComposeReply={handleComposeReply} 
            onComposeForward={handleComposeForward} 
          />
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets" className="mt-4">
          <TicketsList />
        </TabsContent>

        {/* Compose Email Tab */}
        <TabsContent value="compose" className="mt-4">
          <ComposeEmail 
            replyTo={replyToEmail} 
            onSent={() => {
              setReplyToEmail(null);
              setActiveSubTab('communications');
            }}
            onCancel={() => {
              setReplyToEmail(null);
              setActiveSubTab('communications');
            }}
          />
        </TabsContent>

        {/* WhatsApp Compose Tab */}
        <TabsContent value="whatsapp" className="mt-4">
          <CRMWhatsAppCompose />
        </TabsContent>

        {/* SMS Compose Tab */}
        <TabsContent value="sms" className="mt-4">
          <CRMSMSCompose />
        </TabsContent>
      </Tabs>
    </div>
  );
}
