import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useEmailService } from '@/hooks/useEmailService';
import { ExternalResource } from '@/types/resource';
import { formatCurrency } from '@/lib/format-utils';
import { Mail, Send, X, Plus, Paperclip, FileText, Search, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ContactForm } from '@/components/crm/ContactForm';
import { normalizeSearchText } from '@/lib/search-utils';

interface CrmContact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
}

interface Recipient {
  type: 'contact' | 'manual';
  contactId?: string;
  contactName?: string;
  email: string;
}

interface ResourceEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: ExternalResource[];
  headerText: string;
  pdfBlob: Blob | null;
  getEffectiveCost: (resource: ExternalResource) => number;
}

export function ResourceEmailDialog({
  open,
  onOpenChange,
  resources,
  headerText,
  pdfBlob,
  getEffectiveCost,
}: ResourceEmailDialogProps) {
  const { sendEmail, sending } = useEmailService();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState(headerText || 'Listado de Recursos');
  const [body, setBody] = useState('');
  const [pdfMode, setPdfMode] = useState<'inline' | 'attach'>('attach');
  const [extraAttachments, setExtraAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contact search state
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [manualEmail, setManualEmail] = useState('');

  useEffect(() => {
    if (open) {
      supabase
        .from('crm_contacts')
        .select('id, name, surname, email, phone')
        .order('name')
        .then(({ data }) => setContacts(data || []));
    }
  }, [open]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.filter(c => c.email);
    const norm = normalizeSearchText(contactSearch);
    return contacts.filter(c => {
      if (!c.email) return false;
      const text = `${c.name} ${c.surname || ''} ${c.email} ${c.phone || ''}`;
      return normalizeSearchText(text).includes(norm);
    });
  }, [contacts, contactSearch]);

  const addContactRecipient = (contact: CrmContact) => {
    if (!contact.email) return;
    if (recipients.some(r => r.email === contact.email)) return;
    setRecipients(prev => [...prev, {
      type: 'contact',
      contactId: contact.id,
      contactName: contact.surname ? `${contact.name} ${contact.surname}` : contact.name,
      email: contact.email,
    }]);
    setContactSearch('');
    setShowContactSearch(false);
  };

  const addManualRecipient = () => {
    const email = manualEmail.trim();
    if (!email || recipients.some(r => r.email === email)) return;
    setRecipients(prev => [...prev, { type: 'manual', email }]);
    setManualEmail('');
  };

  const removeRecipient = (index: number) => {
    setRecipients(prev => prev.filter((_, i) => i !== index));
  };

  const handleNewContactSaved = async (newContactId?: string) => {
    setShowNewContactForm(false);
    const { data } = await supabase
      .from('crm_contacts')
      .select('id, name, surname, email, phone')
      .order('name');
    setContacts(data || []);
    if (newContactId) {
      const newContact = (data || []).find(c => c.id === newContactId);
      if (newContact?.email) addContactRecipient(newContact);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setExtraAttachments((prev) => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExtraAttachment = (index: number) => {
    setExtraAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const buildInlineHtml = (): string => {
    const rows = resources
      .map(
        (r) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.description || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(getEffectiveCost(r))}</td>
      </tr>`
      )
      .join('');

    return `
      <div style="font-family:Arial,sans-serif;max-width:700px">
        ${body ? `<p>${body.replace(/\n/g, '<br>')}</p><hr style="border:none;border-top:1px solid #ddd;margin:16px 0">` : ''}
        <h2 style="margin:0 0 12px">${headerText || 'Listado de Recursos'}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ccc">Nombre</th>
              <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ccc">Descripción</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ccc">Coste</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:11px;color:#999;margin-top:16px">${resources.length} recurso(s)</p>
      </div>`;
  };

  const fileToBase64 = (file: File | Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSend = async () => {
    const validRecipients = recipients.map((r) => r.email.trim()).filter(Boolean);
    if (validRecipients.length === 0) return;
    if (!subject.trim()) return;

    const attachments: { filename: string; content: string; content_type: string }[] = [];

    // PDF attachment or inline
    if (pdfMode === 'attach' && pdfBlob) {
      const base64 = await fileToBase64(pdfBlob);
      const fileName = (headerText || 'Listado_Recursos').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').replace(/\s+/g, '_');
      attachments.push({
        filename: `${fileName}.pdf`,
        content: base64,
        content_type: 'application/pdf',
      });
    }

    // Extra attachments
    for (const file of extraAttachments) {
      const base64 = await fileToBase64(file);
      attachments.push({
        filename: file.name,
        content: base64,
        content_type: file.type || 'application/octet-stream',
      });
    }

    const bodyHtml =
      pdfMode === 'inline'
        ? buildInlineHtml()
        : body
          ? `<div style="font-family:Arial,sans-serif"><p>${body.replace(/\n/g, '<br>')}</p></div>`
          : `<p>Adjunto encontrará el listado de recursos: ${headerText || 'Listado de Recursos'}</p>`;

    const result = await sendEmail({
      to: validRecipients,
      subject: subject.trim(),
      body_html: bodyHtml,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (result.success) {
      onOpenChange(false);
      setRecipients([]);
      setBody('');
      setExtraAttachments([]);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar Listado por Email
          </DialogTitle>
          <DialogDescription>
            Envía el listado de {resources.length} recurso(s) seleccionado(s).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
          {/* Recipients */}
          <div className="space-y-2">
            <Label>Destinatarios *</Label>
            {/* List of added recipients */}
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((r, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1 py-1">
                    {r.type === 'contact' && <User className="h-3 w-3 text-primary" />}
                    <span className="text-xs">
                      {r.contactName ? `${r.contactName} (${r.email})` : r.email}
                    </span>
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-1" onClick={() => removeRecipient(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Contact search */}
            <div className="border rounded-lg p-2 space-y-2 bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={(e) => {
                      setContactSearch(e.target.value);
                      setShowContactSearch(true);
                    }}
                    onFocus={() => setShowContactSearch(true)}
                    placeholder="Buscar contacto por nombre, email..."
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs flex-shrink-0"
                  onClick={() => setShowNewContactForm(true)}
                >
                  <Plus className="h-3 w-3" />
                  Nuevo
                </Button>
              </div>

              {showContactSearch && contactSearch.trim() && (
                <div className="border rounded bg-popover max-h-[150px] overflow-y-auto">
                  {filteredContacts.length === 0 ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      No se encontraron contactos.{' '}
                      <button className="text-primary underline" onClick={() => setShowNewContactForm(true)}>
                        Crear nuevo
                      </button>
                    </div>
                  ) : (
                    filteredContacts.map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                        onClick={() => addContactRecipient(c)}
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="truncate block">
                            {c.surname ? `${c.name} ${c.surname}` : c.name}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">{c.email}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Manual email entry */}
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualRecipient(); } }}
                  placeholder="O escribe un email directo..."
                  className="flex-1 h-8 text-sm"
                />
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addManualRecipient} disabled={!manualEmail.trim()}>
                  Añadir
                </Button>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Asunto *</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del email..."
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="email-body">Mensaje</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="min-h-[80px]"
            />
          </div>

          {/* PDF mode */}
          <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
            <Label className="text-sm font-medium">Listado de recursos</Label>
            <RadioGroup value={pdfMode} onValueChange={(v) => setPdfMode(v as 'inline' | 'attach')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="attach" id="pdf-attach" />
                <Label htmlFor="pdf-attach" className="cursor-pointer flex items-center gap-1.5 text-sm">
                  <Paperclip className="h-3.5 w-3.5" />
                  Adjuntar como PDF
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="inline" id="pdf-inline" />
                <Label htmlFor="pdf-inline" className="cursor-pointer flex items-center gap-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5" />
                  Insertar en el cuerpo del email
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Extra attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Archivos adicionales</Label>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" />
                Añadir
              </Button>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            {extraAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {extraAttachments.map((file, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1">
                    {file.name}
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-1" onClick={() => removeExtraAttachment(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || recipients.length === 0 || !subject.trim()}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ContactForm
        open={showNewContactForm}
        onOpenChange={setShowNewContactForm}
        contact={null}
        onSuccess={handleNewContactSaved}
      />
    </>
  );
}
