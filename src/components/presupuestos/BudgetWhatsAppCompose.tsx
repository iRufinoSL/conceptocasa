import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageSquare, Send, Phone, User, ExternalLink, X, FileText, Building2, Save, CheckCircle, ListTodo } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

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

interface BudgetWhatsAppComposeProps {
  budgetId: string;
  budgetName?: string;
  projectId: string | null;
  budgetContacts: Contact[];
  onSent?: () => void;
}

export function BudgetWhatsAppCompose({ budgetId, budgetName, projectId, budgetContacts, onSent }: BudgetWhatsAppComposeProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  
  // New state for saved message and task creation
  const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
  const [createTask, setCreateTask] = useState(false);
  const [taskDescription, setTaskDescription] = useState('');

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

  // Filter contacts with phone numbers
  const contactsWithPhone = useMemo(() => 
    budgetContacts.filter(c => c.phone && c.phone.trim() !== ''),
    [budgetContacts]
  );

  const selectedContact = useMemo(() => 
    contactsWithPhone.find(c => c.id === selectedContactId),
    [contactsWithPhone, selectedContactId]
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
    // If starts with 0034 or 34, keep it; if starts with 6/7/9, add 34
    if (/^[679]/.test(clean) && clean.length <= 9) {
      clean = '34' + clean;
    }
    return clean;
  }, [phoneNumber]);

  const waUrl = useMemo(() => {
    if (!waPhoneNumber || !message.trim()) return null;
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${waPhoneNumber}?text=${encodedMessage}`;
  }, [waPhoneNumber, message]);

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      // Replace placeholders with actual values
      let content = template.content;
      content = content.replace(/\{\{empresa\}\}/g, companySettings?.name || 'Nuestra empresa');
      content = content.replace(/\{\{presupuesto\}\}/g, budgetName || budgetId);
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
          budget_id: budgetId,
          project_id: projectId,
          phone_number: phoneNumber,
          direction: 'outbound',
          message: message,
          status: 'pending', // Changed to pending until actually sent
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
      setSavedMessageId(data.id);
    },
    onError: (error) => {
      console.error('Error saving WhatsApp message:', error);
      toast.error('Error al registrar el mensaje');
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (whatsappMessageId: string) => {
      const contactName = selectedContact 
        ? `${selectedContact.name} ${selectedContact.surname || ''}`.trim()
        : phoneNumber;
      
      const { data, error } = await supabase
        .from('budget_tasks')
        .insert({
          budget_id: budgetId,
          name: `WhatsApp enviado a ${contactName}`,
          description: taskDescription || `Seguimiento del mensaje enviado por WhatsApp`,
          status: 'pendiente',
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // If there's a contact, link it to the task
      if (selectedContactId) {
        await supabase
          .from('budget_task_contacts')
          .insert({
            task_id: data.id,
            contact_id: selectedContactId,
          });
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-tasks', budgetId] });
      toast.success('Tarea creada');
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
        .update({ status: 'sent' })
        .eq('id', messageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
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
      // Save message to database
      const savedMessage = await saveMessageMutation.mutateAsync();
      
      // Create task if requested
      if (createTask) {
        await createTaskMutation.mutateAsync(savedMessage.id);
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
      // Copy message to clipboard
      try {
        await navigator.clipboard.writeText(message);
        toast.success('Mensaje copiado al portapapeles');
      } catch (clipboardError) {
        console.warn('Could not copy to clipboard:', clipboardError);
      }
      
      // Update status to sent
      await updateMessageStatusMutation.mutateAsync(savedMessageId);
      
      // Open WhatsApp
      window.open(waUrl, '_blank');
      
      // Reset form
      setMessage('');
      setSelectedContactId('');
      setCustomPhone('');
      setSavedMessageId(null);
      setCreateTask(false);
      setTaskDescription('');
      setSelectedTemplateId('');
      
      onSent?.();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Reset saved message when content changes
  const handleMessageChange = (newMessage: string) => {
    setMessage(newMessage);
    if (savedMessageId) {
      setSavedMessageId(null); // Invalidate saved message if content changes
    }
  };

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId);
    setCustomPhone('');
    if (savedMessageId) {
      setSavedMessageId(null); // Invalidate saved message if contact changes
    }
  };

  const handleCustomPhoneChange = (phone: string) => {
    setCustomPhone(phone);
    if (savedMessageId) {
      setSavedMessageId(null); // Invalidate saved message if phone changes
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
          {contactsWithPhone.length > 0 ? (
            <Select value={selectedContactId} onValueChange={handleContactChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar contacto..." />
              </SelectTrigger>
              <SelectContent>
                {contactsWithPhone.map(contact => (
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
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No hay contactos con teléfono vinculados al presupuesto
            </p>
          )}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-auto"
              onClick={() => handleContactChange('')}
            >
              <X className="h-3 w-3" />
            </Button>
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
                        <div className="flex items-center gap-2">
                          <span>{template.name}</span>
                        </div>
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

        {/* Task creation option - only show before saving */}
        {!savedMessageId && (
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-task"
                checked={createTask}
                onCheckedChange={(checked) => setCreateTask(checked === true)}
              />
              <Label htmlFor="create-task" className="flex items-center gap-2 cursor-pointer">
                <ListTodo className="h-4 w-4" />
                Crear tarea de seguimiento
              </Label>
            </div>
            
            {createTask && (
              <div className="space-y-2 pl-6">
                <Label className="text-sm">Descripción de la tarea (opcional)</Label>
                <Input
                  placeholder="Ej: Confirmar recepción del mensaje..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                />
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
              onClick={handleSaveMessage}
              disabled={!canSave || isSaving}
              className="flex-1 gap-2"
              variant="default"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : 'Guardar mensaje'}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSavedMessageId(null);
                  setCreateTask(false);
                  setTaskDescription('');
                }}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Editar
              </Button>
              <Button
                onClick={handleOpenWhatsApp}
                disabled={!canSend}
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4" />
                Abrir WhatsApp y Enviar
                <ExternalLink className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
