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
import { EmailInbox } from './EmailInbox';
import { TicketsList } from './TicketsList';
import { ComposeEmail } from './ComposeEmail';

type Communication = Tables<'crm_communications'> & {
  crm_contacts?: { name: string; surname: string | null; email: string | null } | null;
};

type ViewMode = 'list' | 'grouped';

const typeIcons = {
  email: Mail,
  whatsapp: MessageSquare,
  call: Phone,
  meeting: Calendar,
};

const typeLabels = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  meeting: 'Reunión',
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
  const [activeSubTab, setActiveSubTab] = useState('inbox');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [replyToEmail, setReplyToEmail] = useState<any>(null);

  const { data: communications = [], isLoading } = useQuery({
    queryKey: ['crm-communications', typeFilter, statusFilter, directionFilter],
    queryFn: async () => {
      let query = supabase
        .from('crm_communications')
        .select(`
          *,
          crm_contacts (
            name,
            surname,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('communication_type', typeFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (directionFilter !== 'all') {
        query = query.eq('direction', directionFilter);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data as Communication[];
    },
  });

  // Filter by date
  const dateFilteredCommunications = useMemo(() => {
    if (dateFilter === 'all') return communications;
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return communications.filter(comm => {
      const commDate = new Date(comm.created_at);
      switch (dateFilter) {
        case 'today':
          return commDate >= startOfToday;
        case 'week':
          const weekAgo = new Date(startOfToday);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return commDate >= weekAgo;
        case 'month':
          const monthAgo = new Date(startOfToday);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return commDate >= monthAgo;
        case 'quarter':
          const quarterAgo = new Date(startOfToday);
          quarterAgo.setMonth(quarterAgo.getMonth() - 3);
          return commDate >= quarterAgo;
        default:
          return true;
      }
    });
  }, [communications, dateFilter]);

  // Filter by search
  const filteredCommunications = useMemo(() => {
    if (!search) return dateFilteredCommunications;
    
    const searchLower = search.toLowerCase();
    return dateFilteredCommunications.filter(comm => {
      const contactName = comm.crm_contacts 
        ? `${comm.crm_contacts.name} ${comm.crm_contacts.surname || ''}`.toLowerCase()
        : '';
      const contactEmail = comm.crm_contacts?.email?.toLowerCase() || '';
      return (
        contactName.includes(searchLower) ||
        contactEmail.includes(searchLower) ||
        comm.subject?.toLowerCase().includes(searchLower) ||
        comm.content.toLowerCase().includes(searchLower)
      );
    });
  }, [dateFilteredCommunications, search]);

  // Group by contact
  const groupedByContact = useMemo(() => {
    const groups: Record<string, { 
      contactId: string | null;
      contactName: string; 
      contactEmail: string | null;
      communications: Communication[];
      sentCount: number;
      receivedCount: number;
      lastCommunication: Date;
    }> = {};

    filteredCommunications.forEach(comm => {
      const contactId = comm.contact_id || 'unknown';
      const contactName = comm.crm_contacts 
        ? `${comm.crm_contacts.name} ${comm.crm_contacts.surname || ''}`.trim()
        : 'Contacto eliminado';
      
      if (!groups[contactId]) {
        groups[contactId] = {
          contactId: comm.contact_id,
          contactName,
          contactEmail: comm.crm_contacts?.email || null,
          communications: [],
          sentCount: 0,
          receivedCount: 0,
          lastCommunication: new Date(comm.created_at),
        };
      }
      
      groups[contactId].communications.push(comm);
      
      if (comm.direction === 'outbound') {
        groups[contactId].sentCount++;
      } else {
        groups[contactId].receivedCount++;
      }
      
      const commDate = new Date(comm.created_at);
      if (commDate > groups[contactId].lastCommunication) {
        groups[contactId].lastCommunication = commDate;
      }
    });

    // Sort by last communication date
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.lastCommunication.getTime() - a.lastCommunication.getTime());
  }, [filteredCommunications]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredCommunications.length;
    const sent = filteredCommunications.filter(c => c.direction === 'outbound').length;
    const received = filteredCommunications.filter(c => c.direction === 'inbound').length;
    const failed = filteredCommunications.filter(c => c.status === 'failed').length;
    const opened = filteredCommunications.filter(c => c.status === 'opened').length;
    const contacts = new Set(filteredCommunications.map(c => c.contact_id).filter(Boolean)).size;
    
    return { total, sent, received, failed, opened, contacts };
  }, [filteredCommunications]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleComposeReply = (email: any) => {
    setReplyToEmail({
      email: email.direction === 'inbound' ? email.from_email : email.to_emails?.[0],
      subject: email.subject,
      contactId: email.contact_id,
      ticketId: email.ticket_id,
    });
    setActiveSubTab('compose');
  };

  const handleComposeForward = (email: any) => {
    setReplyToEmail({
      email: '',
      subject: email.subject ? `Fwd: ${email.subject}` : 'Fwd:',
      contactId: email.contact_id,
      ticketId: email.ticket_id,
    });
    setActiveSubTab('compose');
  };

  const CommunicationItem = ({ comm }: { comm: Communication }) => {
    const TypeIcon = typeIcons[comm.communication_type as keyof typeof typeIcons] || Mail;
    const status = statusConfig[comm.status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = status.icon;
    const direction = directionConfig[comm.direction as keyof typeof directionConfig] || directionConfig.outbound;
    const DirectionIcon = direction.icon;

    return (
      <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
            <TypeIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">
                {comm.crm_contacts 
                  ? `${comm.crm_contacts.name} ${comm.crm_contacts.surname || ''}`
                  : 'Contacto eliminado'}
              </span>
              <Badge variant="outline" className={`${status.color} gap-1`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
              <span className={`flex items-center gap-1 text-xs ${direction.color}`}>
                <DirectionIcon className="h-3 w-3" />
                {direction.label}
              </span>
            </div>
            {comm.subject && (
              <p className="text-sm font-medium mt-1">{comm.subject}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {comm.content.replace(/<[^>]*>/g, '')}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>
                {format(new Date(comm.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
              </span>
              {comm.sent_at && (
                <span>
                  Enviado: {format(new Date(comm.sent_at), 'HH:mm', { locale: es })}
                </span>
              )}
              {comm.error_message && (
                <span className="text-red-500">Error: {comm.error_message}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs navigation */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-xl grid-cols-4">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Bandeja</span>
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2">
            <Ticket className="h-4 w-4" />
            <span className="hidden sm:inline">Tickets</span>
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Redactar</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Historial</span>
          </TabsTrigger>
        </TabsList>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="mt-4">
          <EmailInbox onComposeReply={handleComposeReply} onComposeForward={handleComposeForward} />
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets" className="mt-4">
          <TicketsList />
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="mt-4">
          <ComposeEmail 
            replyTo={replyToEmail} 
            onSent={() => {
              setReplyToEmail(null);
              setActiveSubTab('inbox');
            }} 
          />
        </TabsContent>

        {/* History Tab - Original CRM Communications */}
        <TabsContent value="history" className="mt-4">
          <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Card className="p-3">
                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </Card>
              <Card className="p-3">
                <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
                <div className="text-xs text-muted-foreground">Enviados</div>
              </Card>
              <Card className="p-3">
                <div className="text-2xl font-bold text-green-600">{stats.received}</div>
                <div className="text-xs text-muted-foreground">Recibidos</div>
              </Card>
              <Card className="p-3">
                <div className="text-2xl font-bold text-purple-600">{stats.opened}</div>
                <div className="text-xs text-muted-foreground">Abiertos</div>
              </Card>
              <Card className="p-3">
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-xs text-muted-foreground">Fallidos</div>
              </Card>
              <Card className="p-3">
                <div className="text-2xl font-bold text-amber-600">{stats.contacts}</div>
                <div className="text-xs text-muted-foreground">Contactos</div>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por contacto, email, asunto o contenido..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[130px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="call">Llamada</SelectItem>
                      <SelectItem value="meeting">Reunión</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={directionFilter} onValueChange={setDirectionFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Dirección" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="outbound">Enviados</SelectItem>
                      <SelectItem value="inbound">Recibidos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="sent">Enviado</SelectItem>
                      <SelectItem value="delivered">Entregado</SelectItem>
                      <SelectItem value="failed">Fallido</SelectItem>
                      <SelectItem value="opened">Abierto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-[130px]">
                      <Calendar className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Fecha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo el tiempo</SelectItem>
                      <SelectItem value="today">Hoy</SelectItem>
                      <SelectItem value="week">Última semana</SelectItem>
                      <SelectItem value="month">Último mes</SelectItem>
                      <SelectItem value="quarter">Último trimestre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* View Mode Toggle */}
            <div className="flex justify-end gap-1">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="gap-2"
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Lista</span>
              </Button>
              <Button
                variant={viewMode === 'grouped' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grouped')}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Por Contacto</span>
              </Button>
            </div>

            {/* List View */}
            {viewMode === 'list' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Historial de Comunicaciones
                    <Badge variant="secondary" className="ml-2">
                      {filteredCommunications.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                  ) : filteredCommunications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay comunicaciones registradas
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredCommunications.map((comm) => (
                        <CommunicationItem key={comm.id} comm={comm} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Grouped by Contact View */}
            {viewMode === 'grouped' && (
              <div className="space-y-2">
                {isLoading ? (
                  <Card className="p-8 text-center text-muted-foreground">Cargando...</Card>
                ) : groupedByContact.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    No hay comunicaciones registradas
                  </Card>
                ) : (
                  groupedByContact.map(([contactId, group]) => (
                    <Collapsible
                      key={contactId}
                      open={expandedGroups.has(contactId)}
                      onOpenChange={() => toggleGroup(contactId)}
                    >
                      <Card>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <ChevronRight 
                                  className={`h-5 w-5 transition-transform ${
                                    expandedGroups.has(contactId) ? 'rotate-90' : ''
                                  }`}
                                />
                                <div className="flex flex-col">
                                  <CardTitle className="text-base">{group.contactName}</CardTitle>
                                  {group.contactEmail && (
                                    <span className="text-xs text-muted-foreground">{group.contactEmail}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-blue-600">↑{group.sentCount}</span>
                                  <span className="text-green-600">↓{group.receivedCount}</span>
                                </div>
                                <Badge variant="secondary">
                                  {group.communications.length}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-3">
                            {group.communications.map((comm) => (
                              <CommunicationItem key={comm.id} comm={comm} />
                            ))}
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  ))
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
