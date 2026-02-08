import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Smartphone, Send, Phone, User, ListTodo, CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  phone: string | null;
}

export function CRMSMSCompose() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // Task creation state
  const [createTask, setCreateTask] = useState(true);
  const [taskName, setTaskName] = useState('');
  const [taskDate, setTaskDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [taskTime, setTaskTime] = useState(format(new Date(), 'HH:mm'));

  // Generate time options (every 30 minutes)
  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        options.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return options;
  }, []);

  // Fetch all contacts with phone numbers
  const { data: contacts = [] } = useQuery({
    queryKey: ['crm-contacts-with-phone'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, phone')
        .not('phone', 'is', null)
        .neq('phone', '')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Contact[];
    },
  });

  const selectedContact = useMemo(() => 
    contacts.find(c => c.id === selectedContactId),
    [contacts, selectedContactId]
  );

  const phoneNumber = useMemo(() => {
    const raw = selectedContact?.phone || customPhone;
    if (!raw) return '';
    let clean = raw.replace(/[\s\-\(\)\.]/g, '');
    if (clean.startsWith('00')) clean = '+' + clean.slice(2);
    if (/^[6789]\d{8}$/.test(clean)) clean = '+34' + clean;
    if (!clean.startsWith('+') && /^\d{10,15}$/.test(clean)) clean = '+' + clean;
    return clean;
  }, [selectedContact, customPhone]);

  // Auto-generate task name when contact is selected
  useEffect(() => {
    if (selectedContact && createTask && !taskName) {
      const contactFullName = `${selectedContact.name}${selectedContact.surname ? ' ' + selectedContact.surname : ''}`;
      setTaskName(`Seguimiento SMS - ${contactFullName}`);
    }
  }, [selectedContact, createTask, taskName]);

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId);
    setCustomPhone('');
    setTaskName('');
  };

  const handleSendSMS = async () => {
    if (!phoneNumber || !message.trim()) {
      toast.error('Introduce un número y mensaje');
      return;
    }

    setIsSending(true);

    try {
      // Send SMS via edge function
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          to: phoneNumber,
          message: message.trim(),
          contact_id: selectedContactId || undefined,
        },
      });

      if (error) throw error;

      if (data?.success === false) {
        toast.error(`Error al enviar SMS: ${data.error || 'Error desconocido'}`);
        return;
      }

      // Create follow-up task if enabled
      if (createTask) {
        const contactFullName = selectedContact
          ? `${selectedContact.name} ${selectedContact.surname || ''}`.trim()
          : phoneNumber;

        const taskData: any = {
          title: taskName || `Seguimiento SMS - ${contactFullName}`,
          description: `Seguimiento del SMS enviado a ${contactFullName} (${phoneNumber}).\n\nContenido:\n"${message.trim()}"`,
          management_type: 'Tarea',
          status: 'Pendiente',
          created_by: user?.id,
        };

        if (taskDate) {
          taskData.target_date = format(taskDate, 'yyyy-MM-dd');
        }
        if (taskTime) {
          taskData.start_time = taskTime;
        }

        const { data: mgmt, error: mgmtError } = await supabase
          .from('crm_managements')
          .insert(taskData)
          .select()
          .single();

        if (!mgmtError && mgmt && selectedContactId) {
          await supabase.from('crm_management_contacts').insert({
            management_id: mgmt.id,
            contact_id: selectedContactId,
          });
        }
      }

      toast.success('SMS enviado correctamente');

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['unified-sms'] });
      queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
      queryClient.invalidateQueries({ queryKey: ['crm-managements'] });

      // Reset form
      setMessage('');
      setSelectedContactId('');
      setCustomPhone('');
      setTaskName('');
      setTaskDate(addDays(new Date(), 1));
      setTaskTime(format(new Date(), 'HH:mm'));

    } catch (error: any) {
      console.error('Error sending SMS:', error);
      toast.error(error.message || 'Error al enviar el SMS');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-purple-600" />
            Enviar SMS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contact selection */}
          <div className="space-y-2">
            <Label>Contacto</Label>
            <Select value={selectedContactId} onValueChange={handleContactChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar contacto..." />
              </SelectTrigger>
              <SelectContent>
                {contacts.map(contact => (
                  <SelectItem key={contact.id} value={contact.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      <span>{contact.name} {contact.surname || ''}</span>
                      <span className="text-xs text-muted-foreground">({contact.phone})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom phone input */}
          {!selectedContactId && (
            <div className="space-y-2">
              <Label>O introduce un número manualmente</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="+34 600 000 000"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Selected contact info */}
          {selectedContact && (
            <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-lg">
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedContact.name} {selectedContact.surname || ''}</span>
              <Badge variant="outline" className="gap-1">
                <Phone className="h-3 w-3" />
                {selectedContact.phone}
              </Badge>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <Textarea
              placeholder="Escribe tu mensaje SMS..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={isSending}
            />
            <p className="text-xs text-muted-foreground text-right">
              {charCount} caracteres • {smsCount} SMS
            </p>
          </div>

          {/* Task creation option */}
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-sms-task"
                checked={createTask}
                onCheckedChange={(checked) => setCreateTask(checked === true)}
              />
              <Label htmlFor="create-sms-task" className="flex items-center gap-2 cursor-pointer">
                <ListTodo className="h-4 w-4" />
                Crear tarea de seguimiento
              </Label>
            </div>
            
            {createTask && (
              <div className="space-y-3 pl-6">
                <div className="space-y-2">
                  <Label className="text-sm">Nombre de la tarea</Label>
                  <Input
                    placeholder="Seguimiento SMS - ..."
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    disabled={isSending}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fecha</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal h-8 text-sm',
                            !taskDate && 'text-muted-foreground'
                          )}
                          disabled={isSending}
                        >
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {taskDate ? format(taskDate, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={taskDate}
                          onSelect={setTaskDate}
                          locale={es}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Hora
                    </Label>
                    <Select value={taskTime} onValueChange={setTaskTime} disabled={isSending}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeOptions.map(time => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Send button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSendSMS}
              disabled={!phoneNumber || !message.trim() || isSending}
              className="gap-2"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar SMS
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}