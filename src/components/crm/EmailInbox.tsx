import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Mail, Search, ArrowUpRight, ArrowDownLeft, 
  CheckCircle, XCircle, Clock, Eye, Inbox,
  Trash2, Reply, Forward, MailOpen, Paperclip, UserPlus, AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Tables, Json } from '@/integrations/supabase/types';

type EmailMessage = Tables<'email_messages'> & {
  crm_contacts?: { id: string; name: string; surname: string | null; email: string | null } | null;
  tickets?: { id: string; subject: string; ticket_number: number } | null;
};

interface EmailMetadata {
  unknown_sender?: boolean;
  headers?: Record<string, string>;
  has_attachments?: boolean;
}

const statusConfig = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  failed: { label: 'Fallido', icon: XCircle, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  read: { label: 'Leído', icon: Eye, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  received: { label: 'Recibido', icon: Inbox, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
};

interface EmailInboxProps {
  onComposeReply?: (email: EmailMessage) => void;
}

export function EmailInbox({ onComposeReply }: EmailInboxProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    contact_type: 'Persona',
  });

  const { data: emails = [], isLoading, refetch } = useQuery({
    queryKey: ['email-messages', directionFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('email_messages')
        .select(`
          *,
          crm_contacts (
            id,
            name,
            surname,
            email
          ),
          tickets (
            id,
            subject,
            ticket_number
          )
        `)
        .order('created_at', { ascending: false });

      if (directionFilter !== 'all') {
        query = query.eq('direction', directionFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data as EmailMessage[];
    },
  });

  const filteredEmails = useMemo(() => {
    if (!search) return emails;
    
    const searchLower = search.toLowerCase();
    return emails.filter(email => {
      const contactName = email.crm_contacts 
        ? `${email.crm_contacts.name} ${email.crm_contacts.surname || ''}`.toLowerCase()
        : '';
      return (
        contactName.includes(searchLower) ||
        email.from_email?.toLowerCase().includes(searchLower) ||
        email.to_emails?.some(e => e.toLowerCase().includes(searchLower)) ||
        email.subject?.toLowerCase().includes(searchLower) ||
        email.body_text?.toLowerCase().includes(searchLower)
      );
    });
  }, [emails, search]);

  const stats = useMemo(() => {
    const total = emails.length;
    const inbox = emails.filter(e => e.direction === 'inbound').length;
    const sent = emails.filter(e => e.direction === 'outbound').length;
    const pending = emails.filter(e => e.status === 'pending').length;
    const failed = emails.filter(e => e.status === 'failed').length;
    
    return { total, inbox, sent, pending, failed };
  }, [emails]);

  const handleEmailClick = (email: EmailMessage) => {
    setSelectedEmail(email);
  };

  const isUnknownSender = (email: EmailMessage): boolean => {
    if (email.crm_contacts) return false;
    if (email.direction !== 'inbound') return false;
    const metadata = email.metadata as EmailMetadata | null;
    return metadata?.unknown_sender === true || !email.contact_id;
  };

  const openCreateContactDialog = (email: EmailMessage) => {
    // Pre-fill form with email data
    const nameParts = (email.from_name || '').split(' ');
    setContactFormData({
      name: nameParts[0] || '',
      surname: nameParts.slice(1).join(' ') || '',
      email: email.from_email,
      phone: '',
      contact_type: 'Persona',
    });
    setShowCreateContact(true);
  };

  const handleCreateContact = async () => {
    if (!contactFormData.name || !contactFormData.email) {
      toast({ 
        title: 'Error', 
        description: 'Nombre y email son obligatorios',
        variant: 'destructive' 
      });
      return;
    }

    setCreatingContact(true);
    try {
      // Create the contact
      const { data: newContact, error: contactError } = await supabase
        .from('crm_contacts')
        .insert({
          name: contactFormData.name,
          surname: contactFormData.surname || null,
          email: contactFormData.email,
          phone: contactFormData.phone || null,
          contact_type: contactFormData.contact_type,
          status: 'Prospecto',
        })
        .select()
        .single();

      if (contactError) throw contactError;

      // Update the email to link it to the new contact
      if (selectedEmail) {
        await supabase
          .from('email_messages')
          .update({ contact_id: newContact.id })
          .eq('id', selectedEmail.id);

        // Also update any tickets created from this email
        if (selectedEmail.ticket_id) {
          await supabase
            .from('tickets')
            .update({ contact_id: newContact.id })
            .eq('id', selectedEmail.ticket_id);
        }
      }

      toast({ title: 'Contacto creado correctamente' });
      setShowCreateContact(false);
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['email-messages'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      refetch();
    } catch (error: any) {
      console.error('Error creating contact:', error);
      toast({ 
        title: 'Error al crear contacto', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setCreatingContact(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold text-primary">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total emails</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">{stats.inbox}</div>
          <div className="text-xs text-muted-foreground">Recibidos</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
          <div className="text-xs text-muted-foreground">Enviados</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pendientes</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-muted-foreground">Fallidos</div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por remitente, destinatario o asunto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Dirección" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="inbound">Recibidos</SelectItem>
                <SelectItem value="outbound">Enviados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="delivered">Entregado</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="read">Leído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Email List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Bandeja de Entrada
            <Badge variant="secondary" className="ml-2">
              {filteredEmails.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay emails</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredEmails.map((email) => {
                const status = statusConfig[email.status as keyof typeof statusConfig] || statusConfig.pending;
                const StatusIcon = status.icon;
                const isInbound = email.direction === 'inbound';
                
                return (
                  <div
                    key={email.id}
                    className="py-3 px-2 hover:bg-accent/50 cursor-pointer transition-colors rounded-lg -mx-2"
                    onClick={() => handleEmailClick(email)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 p-2 rounded-lg ${isInbound ? 'bg-green-500/10' : 'bg-blue-500/10'}`}>
                        {isInbound ? (
                          <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {isInbound 
                              ? (email.from_name || email.from_email)
                              : email.to_emails?.[0]}
                          </span>
                          <Badge variant="outline" className={`${status.color} gap-1 text-xs`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                          {email.tickets && (
                            <Badge variant="secondary" className="text-xs">
                              Ticket #{email.tickets.ticket_number}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium mt-0.5 truncate">
                          {email.subject || '(Sin asunto)'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {email.body_text?.substring(0, 100) || 'Sin contenido'}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>
                            {format(new Date(email.created_at), "d MMM, HH:mm", { locale: es })}
                          </span>
                          {email.crm_contacts ? (
                            <span className="text-primary">
                              {email.crm_contacts.name}
                            </span>
                          ) : isUnknownSender(email) ? (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertCircle className="h-3 w-3" />
                              Remitente desconocido
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Detail Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {selectedEmail?.subject || '(Sin asunto)'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedEmail && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Email metadata */}
              <div className="border-b pb-4 mb-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">De: </span>
                    <span className="font-medium">{selectedEmail.from_name || selectedEmail.from_email}</span>
                    {selectedEmail.from_name && (
                      <span className="text-muted-foreground ml-1">&lt;{selectedEmail.from_email}&gt;</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(selectedEmail.created_at), "d MMMM yyyy 'a las' HH:mm", { locale: es })}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Para: </span>
                  <span>{selectedEmail.to_emails?.join(', ')}</span>
                </div>
                {selectedEmail.cc_emails && selectedEmail.cc_emails.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">CC: </span>
                    <span>{selectedEmail.cc_emails.join(', ')}</span>
                  </div>
                )}
                {selectedEmail.tickets && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Ticket: </span>
                    <Badge variant="outline">#{selectedEmail.tickets.ticket_number} - {selectedEmail.tickets.subject}</Badge>
                  </div>
                )}
                {selectedEmail.crm_contacts ? (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Contacto CRM: </span>
                    <span className="text-primary font-medium">
                      {selectedEmail.crm_contacts.name} {selectedEmail.crm_contacts.surname}
                    </span>
                  </div>
                ) : isUnknownSender(selectedEmail) ? (
                  <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-700 dark:text-amber-400">
                      Remitente no registrado como contacto
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="ml-auto gap-1"
                      onClick={() => openCreateContactDialog(selectedEmail)}
                    >
                      <UserPlus className="h-4 w-4" />
                      Registrar como contacto
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Email body */}
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(
                      selectedEmail.body_html || selectedEmail.body_text?.replace(/\n/g, '<br>') || 'Sin contenido'
                    )
                  }}
                />
              </ScrollArea>

              {/* Actions */}
              <div className="border-t pt-4 mt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (onComposeReply) {
                      onComposeReply(selectedEmail);
                      setSelectedEmail(null);
                    }
                  }}
                >
                  <Reply className="h-4 w-4 mr-2" />
                  Responder
                </Button>
                <Button variant="outline" size="sm">
                  <Forward className="h-4 w-4 mr-2" />
                  Reenviar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Contact Dialog */}
      <Dialog open={showCreateContact} onOpenChange={setShowCreateContact}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Registrar como Contacto
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={contactFormData.name}
                  onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surname">Apellidos</Label>
                <Input
                  id="surname"
                  value={contactFormData.surname}
                  onChange={(e) => setContactFormData({ ...contactFormData, surname: e.target.value })}
                  placeholder="Apellidos"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                placeholder="email@ejemplo.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                placeholder="+34 600 000 000"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Tipo de contacto</Label>
              <Select 
                value={contactFormData.contact_type} 
                onValueChange={(v) => setContactFormData({ ...contactFormData, contact_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Persona">Persona</SelectItem>
                  <SelectItem value="Empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContact(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContact} disabled={creatingContact}>
              {creatingContact ? 'Creando...' : 'Crear Contacto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
