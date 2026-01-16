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
import { MessageSquare, Send, Phone, User, ExternalLink, FileText, Building2, Save, CheckCircle, ListTodo, CalendarIcon, Clock, Repeat } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  phone: string | null;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
}

export function CRMWhatsAppCompose() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  
  // Task creation state
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [createTask, setCreateTask] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskDate, setTaskDate] = useState<Date | undefined>(undefined);
  const [taskTime, setTaskTime] = useState('');
  const [taskRepeatDaily, setTaskRepeatDaily] = useState(false);

  // Generate time options (every 30 minutes)
  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour = h.toString().padStart(2, '0');
        const minute = m.toString().padStart(2, '0');
        options.push(`${hour}:${minute}`);
      }
    }
    return options;
  }, []);

  // Fetch company settings for the organization WhatsApp phone
  const { data: companySettings } = useQuery({
    queryKey: ['company-settings-whatsapp'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('name, phone, whatsapp_phone')
        .limit(1)
        .single();
      return data;
    },
  });

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

  // Fetch WhatsApp templates
  const { data: templates = [] } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('id, name, category, content')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return (data || []) as WhatsAppTemplate[];
    },
  });

  const selectedContact = useMemo(() => 
    contacts.find(c => c.id === selectedContactId),
    [contacts, selectedContactId]
  );

  const phoneNumber = useMemo(() => {
    if (selectedContact?.phone) {
      return selectedContact.phone.replace(/\s+/g, '').replace(/^(\+)?/, '+');
    }
    return customPhone.replace(/\s+/g, '').replace(/^(\+)?/, '+');
  }, [selectedContact, customPhone]);

  // Format phone for wa.me (remove + and spaces)
  const waPhoneNumber = useMemo(() => {
    let clean = phoneNumber.replace(/\s+/g, '').replace(/^\+/, '');
    if (clean.startsWith('00')) clean = clean.slice(2);
    if (/^[6789]\d{8}$/.test(clean)) clean = '34' + clean;
    return clean;
  }, [phoneNumber]);

  const waUrl = useMemo(() => {
    if (!waPhoneNumber || !message.trim()) return null;
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${waPhoneNumber}?text=${encodedMessage}`;
  }, [waPhoneNumber, message]);

  // Auto-generate task name when contact is selected
  useEffect(() => {
    if (selectedContact && createTask && !taskName) {
      const contactFullName = `${selectedContact.name}${selectedContact.surname ? ' ' + selectedContact.surname : ''}`;
      setTaskName(`Seguimiento WhatsApp - ${contactFullName}`);
    }
  }, [selectedContact, createTask, taskName]);

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      let content = template.content;
      content = content.replace(/\{\{empresa\}\}/g, companySettings?.name || 'Nuestra empresa');
      content = content.replace(/\{\{contacto\}\}/g, selectedContact ? `${selectedContact.name}` : '');
      content = content.replace(/\{\{fecha\}\}/g, new Date().toLocaleDateString('es-ES'));
      setMessage(content);
    }
  };

  // Save message mutation
  const saveMessageMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert({
          contact_id: selectedContactId || null,
          phone_number: phoneNumber,
          direction: 'outbound',
          message: message,
          status: 'pending',
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
      setSavedMessageId(data.id);
    },
    onError: (error) => {
      console.error('Error saving WhatsApp message:', error);
      toast.error('Error al registrar el mensaje');
    },
  });

  // Create task mutation (uses crm_managements for CRM tasks without budget)
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const contactFullName = selectedContact 
        ? `${selectedContact.name} ${selectedContact.surname || ''}`.trim()
        : phoneNumber;
      
      const description = `Seguimiento de WhatsApp enviado a ${contactFullName}${taskRepeatDaily ? '\n🔄 Repetir diariamente hasta completar' : ''}`;
      
      const taskData: any = {
        title: taskName || `Seguimiento WhatsApp - ${contactFullName}`,
        description,
        management_type: 'Tarea',
        status: 'Pendiente',
        created_by: user?.id,
      };

      // Add date and time if specified
      if (taskDate) {
        taskData.target_date = format(taskDate, 'yyyy-MM-dd');
      }
      if (taskTime) {
        taskData.start_time = taskTime;
      }

      const { data, error } = await supabase
        .from('crm_managements')
        .insert(taskData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Link contact to the management if selected
      if (selectedContactId) {
        await supabase
          .from('crm_management_contacts')
          .insert({
            management_id: data.id,
            contact_id: selectedContactId,
          });
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-managements'] });
      toast.success('Tarea de seguimiento creada');
    },
    onError: (error) => {
      console.error('Error creating task:', error);
      toast.error('Error al crear la tarea');
    },
  });

  // Update message status to sent
  const updateMessageStatusMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', messageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['crm-communications'] });
    },
  });

  // Step 1: Save message and optionally create task
  const handleSaveMessage = async () => {
    if (!phoneNumber || !message.trim()) {
      toast.error('Introduce un número y mensaje');
      return;
    }

    setIsSaving(true);
    
    try {
      await saveMessageMutation.mutateAsync();
      
      if (createTask) {
        await createTaskMutation.mutateAsync();
      }
      
      toast.success('Mensaje guardado. Ahora puedes enviarlo por WhatsApp.');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Step 2: Open WhatsApp and mark as sent
  const handleOpenWhatsApp = async () => {
    if (!waUrl || !savedMessageId) {
      toast.error('Primero guarda el mensaje');
      return;
    }

    try {
      try {
        await navigator.clipboard.writeText(message);
        toast.success('Mensaje copiado al portapapeles');
      } catch (clipboardError) {
        console.warn('Could not copy to clipboard:', clipboardError);
      }
      
      await updateMessageStatusMutation.mutateAsync(savedMessageId);
      window.open(waUrl, '_blank');
      
      // Reset form
      setMessage('');
      setSelectedContactId('');
      setCustomPhone('');
      setSavedMessageId(null);
      setCreateTask(false);
      setTaskName('');
      setTaskDate(undefined);
      setTaskTime('');
      setTaskRepeatDaily(false);
      setSelectedTemplateId('');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Reset saved message when content changes
  const handleMessageChange = (newMessage: string) => {
    setMessage(newMessage);
    if (savedMessageId) {
      setSavedMessageId(null);
    }
  };

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId);
    setCustomPhone('');
    if (savedMessageId) {
      setSavedMessageId(null);
    }
    // Reset task name to regenerate with new contact
    if (createTask) {
      setTaskName('');
    }
  };

  const handleCustomPhoneChange = (phone: string) => {
    setCustomPhone(phone);
    if (savedMessageId) {
      setSavedMessageId(null);
    }
  };

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    const grouped: Record<string, WhatsAppTemplate[]> = {};
    templates.forEach(t => {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    });
    return grouped;
  }, [templates]);

  const canSave = phoneNumber && message.trim() && !savedMessageId;
  const canSend = savedMessageId && waUrl;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-green-600" />
              Enviar WhatsApp
            </CardTitle>
            {companySettings?.whatsapp_phone && (
              <Badge variant="outline" className="gap-1 text-green-600">
                <Building2 className="h-3 w-3" />
                Desde: {companySettings.whatsapp_phone}
              </Badge>
            )}
          </div>
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
                  onChange={(e) => handleCustomPhoneChange(e.target.value)}
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

          {/* Template selection */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Plantilla de mensaje
              </Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Usar plantilla predefinida..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                    <div key={category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {category}
                      </div>
                      {categoryTemplates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <Textarea
              placeholder="Escribe tu mensaje..."
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              rows={4}
              disabled={!!savedMessageId}
            />
            <p className="text-xs text-muted-foreground">
              {message.length} caracteres
            </p>
          </div>

          {/* Task creation option */}
          {!savedMessageId && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create-task-crm"
                  checked={createTask}
                  onCheckedChange={(checked) => setCreateTask(checked === true)}
                />
                <Label htmlFor="create-task-crm" className="flex items-center gap-2 cursor-pointer">
                  <ListTodo className="h-4 w-4" />
                  Crear tarea de seguimiento
                </Label>
              </div>
              
              {createTask && (
                <div className="space-y-3 pl-6">
                  <div className="space-y-2">
                    <Label className="text-sm">Nombre de la tarea</Label>
                    <Input
                      placeholder="Seguimiento WhatsApp - ..."
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                    />
                  </div>
                  
                  {/* Date and Time */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fecha objetivo</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-full justify-start text-left font-normal h-8",
                              !taskDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-3 w-3" />
                            {taskDate ? format(taskDate, "d MMM yyyy", { locale: es }) : "Seleccionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={taskDate}
                            onSelect={setTaskDate}
                            initialFocus
                            locale={es}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hora</Label>
                      <Select value={taskTime} onValueChange={setTaskTime}>
                        <SelectTrigger className="h-8">
                          <Clock className="mr-2 h-3 w-3" />
                          <SelectValue placeholder="HH:MM" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Repeat daily option */}
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="repeatDaily-crm"
                      checked={taskRepeatDaily}
                      onCheckedChange={(checked) => setTaskRepeatDaily(checked === true)}
                    />
                    <Label htmlFor="repeatDaily-crm" className="cursor-pointer text-sm flex items-center gap-1">
                      <Repeat className="h-3 w-3" />
                      Repetir aviso diariamente hasta completar
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved message indicator */}
          {savedMessageId && (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Mensaje guardado correctamente</span>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Ahora puedes abrir WhatsApp para enviarlo. El mensaje se copiará al portapapeles.
              </p>
            </div>
          )}

          {/* Info note */}
          {!savedMessageId && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Paso 1:</strong> Primero guarda el mensaje en el sistema. 
                <strong> Paso 2:</strong> Después podrás abrir WhatsApp para enviarlo.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {!savedMessageId ? (
              <Button
                className="flex-1 gap-2"
                onClick={handleSaveMessage}
                disabled={!canSave || isSaving}
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Guardando...' : 'Guardar mensaje'}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSavedMessageId(null)}
                >
                  Editar mensaje
                </Button>
                <Button
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                  onClick={handleOpenWhatsApp}
                >
                  <Send className="h-4 w-4" />
                  <ExternalLink className="h-4 w-4" />
                  Abrir WhatsApp
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
