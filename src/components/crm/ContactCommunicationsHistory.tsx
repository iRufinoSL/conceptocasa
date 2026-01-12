import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Mail, MessageSquare, Search, ArrowUpRight, ArrowDownLeft, 
  Phone, Calendar, Clock, Eye
} from 'lucide-react';

interface ContactCommunicationsHistoryProps {
  contactId: string;
  contactPhone?: string | null;
}

interface EmailMessage {
  id: string;
  direction: string;
  from_email: string;
  to_emails: string[];
  subject: string | null;
  body_text: string | null;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  is_read: boolean | null;
}

interface WhatsAppMessage {
  id: string;
  direction: string;
  phone_number: string;
  message: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export function ContactCommunicationsHistory({ contactId, contactPhone }: ContactCommunicationsHistoryProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Fetch emails for this contact
  const { data: emails = [], isLoading: loadingEmails } = useQuery({
    queryKey: ['contact-emails', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_messages')
        .select('id, direction, from_email, to_emails, subject, body_text, status, sent_at, received_at, created_at, is_read')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as EmailMessage[];
    },
  });

  // Fetch WhatsApp messages for this contact
  const { data: whatsappMessages = [], isLoading: loadingWhatsApp } = useQuery({
    queryKey: ['contact-whatsapp', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, direction, phone_number, message, status, notes, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as WhatsAppMessage[];
    },
  });

  const isLoading = loadingEmails || loadingWhatsApp;

  // Filter messages based on search
  const filteredEmails = emails.filter(email => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(searchLower) ||
      email.body_text?.toLowerCase().includes(searchLower) ||
      email.from_email.toLowerCase().includes(searchLower)
    );
  });

  const filteredWhatsApp = whatsappMessages.filter(msg => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      msg.message.toLowerCase().includes(searchLower) ||
      msg.phone_number.includes(searchLower) ||
      msg.notes?.toLowerCase().includes(searchLower)
    );
  });

  // Combine all messages for timeline view
  const allMessages = [
    ...filteredEmails.map(e => ({ ...e, type: 'email' as const })),
    ...filteredWhatsApp.map(w => ({ ...w, type: 'whatsapp' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredAll = activeTab === 'all' 
    ? allMessages 
    : activeTab === 'email' 
      ? allMessages.filter(m => m.type === 'email')
      : allMessages.filter(m => m.type === 'whatsapp');

  // Stats
  const stats = {
    totalEmails: emails.length,
    sentEmails: emails.filter(e => e.direction === 'outbound').length,
    receivedEmails: emails.filter(e => e.direction === 'inbound').length,
    totalWhatsApp: whatsappMessages.length,
    sentWhatsApp: whatsappMessages.filter(w => w.direction === 'outbound').length,
    receivedWhatsApp: whatsappMessages.filter(w => w.direction === 'inbound').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'delivered': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'read': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'replied': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Cargando comunicaciones...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Historial de Comunicaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 py-0 pb-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-center">
            <div className="flex items-center justify-center gap-1 text-blue-600">
              <Mail className="h-3 w-3" />
              <span className="text-sm font-bold">{stats.totalEmails}</span>
            </div>
            <p className="text-xs text-muted-foreground">Emails</p>
            <p className="text-xs text-muted-foreground">
              ↑{stats.sentEmails} ↓{stats.receivedEmails}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
            <div className="flex items-center justify-center gap-1 text-green-600">
              <MessageSquare className="h-3 w-3" />
              <span className="text-sm font-bold">{stats.totalWhatsApp}</span>
            </div>
            <p className="text-xs text-muted-foreground">WhatsApp</p>
            <p className="text-xs text-muted-foreground">
              ↑{stats.sentWhatsApp} ↓{stats.receivedWhatsApp}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en comunicaciones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="all" className="text-xs">Todo ({allMessages.length})</TabsTrigger>
            <TabsTrigger value="email" className="text-xs gap-1">
              <Mail className="h-3 w-3" /> Email
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="text-xs gap-1">
              <MessageSquare className="h-3 w-3" /> WA
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Messages list */}
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 pr-4">
            {filteredAll.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay comunicaciones registradas
              </p>
            ) : (
              filteredAll.map((item) => {
                const isEmail = item.type === 'email';
                const isInbound = item.direction === 'inbound';
                
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`p-2 rounded-lg border ${isInbound ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-blue-500'} bg-card`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded-full ${isEmail ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                        {isEmail ? (
                          <Mail className="h-3 w-3 text-blue-600" />
                        ) : (
                          <MessageSquare className="h-3 w-3 text-green-600" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isInbound ? (
                            <ArrowDownLeft className="h-3 w-3 text-green-600" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3 text-blue-600" />
                          )}
                          <span className="text-xs font-medium">
                            {isInbound ? 'Recibido' : 'Enviado'}
                          </span>
                          <Badge className={`text-[10px] h-4 ${getStatusColor(item.status)}`}>
                            {item.status}
                          </Badge>
                        </div>
                        
                        {isEmail ? (
                          <p className="text-xs mt-1 truncate font-medium">
                            {(item as EmailMessage).subject || '(Sin asunto)'}
                          </p>
                        ) : (
                          <p className="text-xs mt-1 line-clamp-2">
                            {(item as WhatsAppMessage).message}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-2.5 w-2.5" />
                            {format(new Date(item.created_at), 'd MMM yy', { locale: es })}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {format(new Date(item.created_at), 'HH:mm')}
                          </span>
                          {isEmail && (item as EmailMessage).is_read && (
                            <Eye className="h-2.5 w-2.5" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}