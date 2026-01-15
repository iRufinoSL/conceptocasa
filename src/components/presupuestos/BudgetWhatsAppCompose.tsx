import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageSquare, Send, Phone, User, ExternalLink, X, FileText, Building2 } from 'lucide-react';
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
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

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
          status: 'sent',
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', budgetId] });
      toast.success('Mensaje registrado');
    },
    onError: (error) => {
      console.error('Error saving WhatsApp message:', error);
      toast.error('Error al registrar el mensaje');
    },
  });

  const handleSendWhatsApp = async () => {
    if (!waUrl) {
      toast.error('Introduce un número y mensaje');
      return;
    }

    setIsSending(true);
    
    try {
      // Save message to database first
      await saveMessageMutation.mutateAsync();
      
      // Copy message to clipboard for easy pasting
      try {
        await navigator.clipboard.writeText(message);
        toast.success('Mensaje copiado al portapapeles');
      } catch (clipboardError) {
        console.warn('Could not copy to clipboard:', clipboardError);
      }
      
      // Open WhatsApp
      window.open(waUrl, '_blank');
      
      // Reset form
      setMessage('');
      setSelectedContactId('');
      setCustomPhone('');
      
      onSent?.();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSending(false);
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
            <Select value={selectedContactId} onValueChange={(value) => {
              setSelectedContactId(value);
              setCustomPhone('');
            }}>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-auto"
              onClick={() => setSelectedContactId('')}
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
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {message.length} caracteres
          </p>
        </div>

        {/* Info note */}
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Nota:</strong> Se abrirá WhatsApp con el mensaje preparado y el texto se copiará al portapapeles. 
            Puedes pegarlo directamente en WhatsApp si es necesario.
          </p>
        </div>

        {/* Send button */}
        <Button
          onClick={handleSendWhatsApp}
          disabled={!waUrl || isSending}
          className="w-full gap-2 bg-green-600 hover:bg-green-700"
        >
          <Send className="h-4 w-4" />
          {isSending ? 'Abriendo WhatsApp...' : 'Abrir WhatsApp y Enviar'}
          <ExternalLink className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
