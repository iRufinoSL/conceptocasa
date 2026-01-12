import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { 
  MessageSquare, Phone, ArrowUpRight, ArrowDownLeft, 
  Search, Plus, Pencil, Trash2, Upload, FileText, 
  Check, Clock, Eye, MessageCircle, Download, X
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface WhatsAppMessage {
  id: string;
  contact_id: string | null;
  phone_number: string;
  direction: string;
  message: string;
  status: string;
  notes: string | null;
  created_at: string;
  crm_contacts?: {
    name: string;
    surname: string | null;
  } | null;
  attachments?: {
    id: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    is_from_contact: boolean;
  }[];
}

interface BudgetWhatsAppListProps {
  budgetId: string;
  isAdmin: boolean;
}

const statusConfig = {
  sent: { label: 'Enviado', icon: Check, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Entregado', icon: Check, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  read: { label: 'Leído', icon: Eye, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  replied: { label: 'Respondido', icon: MessageCircle, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export function BudgetWhatsAppList({ budgetId, isAdmin }: BudgetWhatsAppListProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingMessage, setEditingMessage] = useState<WhatsAppMessage | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [addingInbound, setAddingInbound] = useState(false);
  const [inboundPhone, setInboundPhone] = useState('');
  const [inboundMessage, setInboundMessage] = useState('');
  const [inboundNotes, setInboundNotes] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['whatsapp-messages', budgetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(`
          *,
          crm_contacts (
            name,
            surname
          )
        `)
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch attachments for each message
      const messagesWithAttachments = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: attachments } = await supabase
            .from('whatsapp_attachments')
            .select('*')
            .eq('message_id', msg.id);
          return { ...msg, attachments: attachments || [] };
        })
      );
      
      return messagesWithAttachments as WhatsAppMessage[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ status, notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
      toast.success('Mensaje actualizado');
      setEditingMessage(null);
    },
    onError: () => {
      toast.error('Error al actualizar');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
      toast.success('Mensaje eliminado');
    },
    onError: () => {
      toast.error('Error al eliminar');
    },
  });

  const addInboundMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert({
          budget_id: budgetId,
          phone_number: inboundPhone,
          direction: 'inbound',
          message: inboundMessage,
          status: 'delivered',
          notes: inboundNotes || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
      toast.success('Mensaje recibido registrado');
      setAddingInbound(false);
      setInboundPhone('');
      setInboundMessage('');
      setInboundNotes('');
    },
    onError: () => {
      toast.error('Error al registrar mensaje');
    },
  });

  const handleFileUpload = async (messageId: string, file: File, isFromContact: boolean) => {
    setUploadingFile(true);
    try {
      const filePath = `${budgetId}/${messageId}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-attachments')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { error: dbError } = await supabase
        .from('whatsapp_attachments')
        .insert({
          message_id: messageId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          is_from_contact: isFromContact,
        });
      
      if (dbError) throw dbError;
      
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
      toast.success('Archivo adjuntado');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir archivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDownloadAttachment = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('whatsapp-attachments')
        .download(filePath);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading:', error);
      toast.error('Error al descargar');
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const contactName = msg.crm_contacts 
      ? `${msg.crm_contacts.name} ${msg.crm_contacts.surname || ''}`.toLowerCase()
      : '';
    return (
      contactName.includes(searchLower) ||
      msg.phone_number.includes(searchLower) ||
      msg.message.toLowerCase().includes(searchLower) ||
      msg.notes?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: messages.length,
    sent: messages.filter(m => m.direction === 'outbound').length,
    received: messages.filter(m => m.direction === 'inbound').length,
    replied: messages.filter(m => m.status === 'replied').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3">
          <div className="text-xl font-bold text-primary">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-blue-600">{stats.sent}</div>
          <div className="text-xs text-muted-foreground">Enviados</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-green-600">{stats.received}</div>
          <div className="text-xs text-muted-foreground">Recibidos</div>
        </Card>
        <Card className="p-3">
          <div className="text-xl font-bold text-emerald-600">{stats.replied}</div>
          <div className="text-xs text-muted-foreground">Respondidos</div>
        </Card>
      </div>

      {/* Search and Add button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por contacto, teléfono, mensaje..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && (
          <Button onClick={() => setAddingInbound(true)} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Registrar Recibido
          </Button>
        )}
      </div>

      {/* Messages list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay mensajes de WhatsApp
          </div>
        ) : (
          filteredMessages.map(msg => {
            const status = statusConfig[msg.status as keyof typeof statusConfig] || statusConfig.sent;
            const StatusIcon = status.icon;
            const isInbound = msg.direction === 'inbound';
            
            return (
              <Card key={msg.id} className={`${isInbound ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-blue-500'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${isInbound ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                      {isInbound ? (
                        <ArrowDownLeft className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {msg.crm_contacts 
                            ? `${msg.crm_contacts.name} ${msg.crm_contacts.surname || ''}`
                            : 'Número externo'}
                        </span>
                        <Badge variant="outline" className="gap-1">
                          <Phone className="h-3 w-3" />
                          {msg.phone_number}
                        </Badge>
                        <Badge className={status.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                      
                      <p className="text-sm mt-2 whitespace-pre-wrap">{msg.message}</p>
                      
                      {msg.notes && (
                        <div className="mt-2 p-2 bg-accent/50 rounded text-sm">
                          <span className="font-medium text-xs text-muted-foreground">Notas: </span>
                          {msg.notes}
                        </div>
                      )}
                      
                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map(att => (
                            <Badge 
                              key={att.id} 
                              variant="secondary" 
                              className="gap-1 cursor-pointer hover:bg-secondary/80"
                              onClick={() => handleDownloadAttachment(att.file_path, att.file_name)}
                            >
                              <FileText className="h-3 w-3" />
                              {att.file_name}
                              {att.is_from_contact && (
                                <span className="text-xs">(del contacto)</span>
                              )}
                              <Download className="h-3 w-3" />
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </span>
                        
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(msg.id, file, isInbound);
                                }}
                                disabled={uploadingFile}
                              />
                              <Button variant="ghost" size="sm" className="gap-1" asChild>
                                <span>
                                  <Upload className="h-3 w-3" />
                                  Adjuntar
                                </span>
                              </Button>
                            </label>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setEditingMessage(msg);
                                setEditNotes(msg.notes || '');
                                setEditStatus(msg.status);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm('¿Eliminar este mensaje?')) {
                                  deleteMutation.mutate(msg.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingMessage} onOpenChange={(open) => !open && setEditingMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar mensaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Añade notas sobre la respuesta recibida..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMessage(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (editingMessage) {
                  updateMutation.mutate({ 
                    id: editingMessage.id, 
                    status: editStatus, 
                    notes: editNotes 
                  });
                }
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Inbound Dialog */}
      <Dialog open={addingInbound} onOpenChange={setAddingInbound}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-green-600" />
              Registrar mensaje recibido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Teléfono del remitente</Label>
              <Input
                placeholder="+34 600 000 000"
                value={inboundPhone}
                onChange={(e) => setInboundPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensaje recibido</Label>
              <Textarea
                placeholder="Contenido del mensaje..."
                value={inboundMessage}
                onChange={(e) => setInboundMessage(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Notas adicionales..."
                value={inboundNotes}
                onChange={(e) => setInboundNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingInbound(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => addInboundMutation.mutate()}
              disabled={!inboundPhone || !inboundMessage}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
