import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Ticket, Search, Plus, Clock, CheckCircle, AlertCircle, 
  XCircle, User, Calendar, Mail, MessageSquare, ChevronRight
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type TicketWithRelations = Tables<'tickets'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  email_messages?: Tables<'email_messages'>[];
};

const statusConfig = {
  open: { label: 'Abierto', icon: AlertCircle, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  in_progress: { label: 'En progreso', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  resolved: { label: 'Resuelto', icon: CheckCircle, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  closed: { label: 'Cerrado', icon: XCircle, color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
};

const priorityConfig = {
  low: { label: 'Baja', color: 'bg-gray-500/10 text-gray-600' },
  medium: { label: 'Media', color: 'bg-yellow-500/10 text-yellow-600' },
  high: { label: 'Alta', color: 'bg-orange-500/10 text-orange-600' },
  urgent: { label: 'Urgente', color: 'bg-red-500/10 text-red-600' },
};

export function TicketsList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    subject: '',
    description: '',
    priority: 'medium',
    category: '',
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', statusFilter, priorityFilter],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          crm_contacts (
            id,
            name,
            surname,
            email
          ),
          email_messages (*)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data as TicketWithRelations[];
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (ticketData: typeof newTicket) => {
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          subject: ticketData.subject,
          description: ticketData.description,
          priority: ticketData.priority,
          category: ticketData.category || null,
          created_by: user?.id,
          status: 'open',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Ticket creado correctamente' });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setCreateDialogOpen(false);
      setNewTicket({ subject: '', description: '', priority: 'medium', category: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: Record<string, any> = { status };
      
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      } else if (status === 'closed') {
        updateData.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Estado actualizado' });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const filteredTickets = useMemo(() => {
    if (!search) return tickets;
    
    const searchLower = search.toLowerCase();
    return tickets.filter(ticket => {
      const contactName = ticket.crm_contacts 
        ? `${ticket.crm_contacts.name} ${ticket.crm_contacts.surname || ''}`.toLowerCase()
        : '';
      return (
        ticket.subject.toLowerCase().includes(searchLower) ||
        ticket.description?.toLowerCase().includes(searchLower) ||
        contactName.includes(searchLower) ||
        String(ticket.ticket_number).includes(search)
      );
    });
  }, [tickets, search]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress').length;
    const resolved = tickets.filter(t => t.status === 'resolved').length;
    const urgent = tickets.filter(t => t.priority === 'urgent').length;
    
    return { total, open, inProgress, resolved, urgent };
  }, [tickets]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold text-primary">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total tickets</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.open}</div>
          <div className="text-xs text-muted-foreground">Abiertos</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
          <div className="text-xs text-muted-foreground">En progreso</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          <div className="text-xs text-muted-foreground">Resueltos</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-red-600">{stats.urgent}</div>
          <div className="text-xs text-muted-foreground">Urgentes</div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por asunto, descripción o número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abierto</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="resolved">Resuelto</SelectItem>
                <SelectItem value="closed">Cerrado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Ticket
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Tickets de Soporte
            <Badge variant="secondary" className="ml-2">
              {filteredTickets.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay tickets</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTickets.map((ticket) => {
                const status = statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.open;
                const StatusIcon = status.icon;
                const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.medium;
                
                return (
                  <div
                    key={ticket.id}
                    className="py-3 px-2 hover:bg-accent/50 cursor-pointer transition-colors rounded-lg -mx-2"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 p-2 rounded-lg ${status.color}`}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            #{ticket.ticket_number}
                          </Badge>
                          <span className="font-medium text-sm truncate flex-1">
                            {ticket.subject}
                          </span>
                          <Badge className={`${priority.color} border-0 text-xs`}>
                            {priority.label}
                          </Badge>
                        </div>
                        {ticket.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {ticket.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(ticket.created_at), "d MMM, HH:mm", { locale: es })}
                          </span>
                          {ticket.crm_contacts && (
                            <span className="flex items-center gap-1 text-primary">
                              <User className="h-3 w-3" />
                              {ticket.crm_contacts.name}
                            </span>
                          )}
                          {ticket.email_messages && ticket.email_messages.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {ticket.email_messages.length} mensajes
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Ticket #{selectedTicket?.ticket_number}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Ticket info */}
              <div className="border-b pb-4 mb-4 space-y-3">
                <h3 className="font-medium text-lg">{selectedTicket.subject}</h3>
                
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const status = statusConfig[selectedTicket.status as keyof typeof statusConfig] || statusConfig.open;
                    return (
                      <Badge className={`${status.color} gap-1`}>
                        <status.icon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    );
                  })()}
                  {(() => {
                    const priority = priorityConfig[selectedTicket.priority as keyof typeof priorityConfig] || priorityConfig.medium;
                    return (
                      <Badge className={`${priority.color} border-0`}>
                        Prioridad: {priority.label}
                      </Badge>
                    );
                  })()}
                  {selectedTicket.category && (
                    <Badge variant="outline">{selectedTicket.category}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Creado: </span>
                    <span>{format(new Date(selectedTicket.created_at), "d MMM yyyy, HH:mm", { locale: es })}</span>
                  </div>
                  {selectedTicket.crm_contacts && (
                    <div>
                      <span className="text-muted-foreground">Contacto: </span>
                      <span className="text-primary">
                        {selectedTicket.crm_contacts.name} {selectedTicket.crm_contacts.surname}
                      </span>
                    </div>
                  )}
                </div>

                {selectedTicket.description && (
                  <div className="bg-muted/50 p-3 rounded-lg text-sm">
                    {selectedTicket.description}
                  </div>
                )}
              </div>

              {/* Email messages in this ticket */}
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground">
                    Mensajes ({selectedTicket.email_messages?.length || 0})
                  </h4>
                  {selectedTicket.email_messages && selectedTicket.email_messages.length > 0 ? (
                    selectedTicket.email_messages.map((email) => (
                      <div key={email.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{email.from_name || email.from_email}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(email.created_at), "d MMM, HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm">{email.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {email.body_text?.substring(0, 200)}...
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No hay mensajes asociados</p>
                  )}
                </div>
              </ScrollArea>

              {/* Actions */}
              <div className="border-t pt-4 mt-4 flex gap-2 flex-wrap">
                <Select 
                  value={selectedTicket.status} 
                  onValueChange={(status) => {
                    updateTicketStatus.mutate({ id: selectedTicket.id, status });
                    setSelectedTicket({ ...selectedTicket, status });
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="resolved">Resuelto</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Ticket Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Asunto *</Label>
              <Input
                value={newTicket.subject}
                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                placeholder="Resumen del problema o solicitud"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={newTicket.description}
                onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                placeholder="Descripción detallada..."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select 
                  value={newTicket.priority} 
                  onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Input
                  value={newTicket.category}
                  onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                  placeholder="Ej: Soporte, Ventas..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createTicketMutation.mutate(newTicket)}
              disabled={!newTicket.subject || createTicketMutation.isPending}
            >
              {createTicketMutation.isPending ? 'Creando...' : 'Crear Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
