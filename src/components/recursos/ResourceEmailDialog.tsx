import { useState, useRef } from 'react';
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
import { Mail, Send, X, Plus, Paperclip, FileText } from 'lucide-react';

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
  const [recipients, setRecipients] = useState<string[]>(['']);
  const [subject, setSubject] = useState(headerText || 'Listado de Recursos');
  const [body, setBody] = useState('');
  const [pdfMode, setPdfMode] = useState<'inline' | 'attach'>('attach');
  const [extraAttachments, setExtraAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addRecipient = () => setRecipients((prev) => [...prev, '']);

  const updateRecipient = (index: number, value: string) => {
    setRecipients((prev) => prev.map((r, i) => (i === index ? value : r)));
  };

  const removeRecipient = (index: number) => {
    if (recipients.length <= 1) return;
    setRecipients((prev) => prev.filter((_, i) => i !== index));
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
    const validRecipients = recipients.map((r) => r.trim()).filter(Boolean);
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
      // Reset
      setRecipients(['']);
      setBody('');
      setExtraAttachments([]);
    }
  };

  return (
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
            {recipients.map((email, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => updateRecipient(i, e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="flex-1"
                />
                {recipients.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeRecipient(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRecipient} className="gap-1">
              <Plus className="h-3 w-3" />
              Añadir destinatario
            </Button>
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
            disabled={sending || recipients.every((r) => !r.trim()) || !subject.trim()}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
