import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Search, CheckCircle, Clock, XCircle, Eye, Send, Mail, Forward, FileText } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useEmailService } from '@/hooks/useEmailService';
import { toast } from 'sonner';

const deliveryStatusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  pending: { label: 'Pendiente', icon: Clock, className: 'text-yellow-600' },
  sent: { label: 'Enviado', icon: Send, className: 'text-blue-600' },
  delivered: { label: 'Entregado', icon: CheckCircle, className: 'text-green-600' },
  opened: { label: 'Abierto', icon: Eye, className: 'text-purple-600' },
  failed: { label: 'Fallido', icon: XCircle, className: 'text-destructive' },
};

interface EmailDetail {
  id: string;
  subject: string | null;
  to_emails: string[] | null;
  from_email: string | null;
  from_name: string | null;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string | null;
  created_at: string;
  delivery_status: string | null;
  delivery_updated_at: string | null;
  read_receipt_at: string | null;
  contact_id: string | null;
  budget_id: string | null;
  crm_contacts: { name: string; surname: string | null; email: string | null } | null;
  email_attachments: { id: string; file_name: string; file_size: number | null }[] | null;
}

export function EmailTrackingTab() {
  const [search, setSearch] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { sendEmail } = useEmailService();

  const { data: sentEmails = [], isLoading } = useQuery({
    queryKey: ['email-tracking-sent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_messages')
        .select(`
          id, subject, to_emails, from_email, from_name, cc_emails, bcc_emails,
          body_html, body_text, sent_at, created_at,
          delivery_status, delivery_updated_at, read_receipt_at,
          contact_id, budget_id,
          crm_contacts (name, surname, email),
          email_attachments (id, file_name, file_size)
        `)
        .eq('direction', 'outbound')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as EmailDetail[];
    },
  });

  const selectedEmail = useMemo(() => {
    if (!selectedEmailId) return null;
    return sentEmails.find(e => e.id === selectedEmailId) || null;
  }, [sentEmails, selectedEmailId]);

  const filtered = useMemo(() => {
    if (!search) return sentEmails;
    const q = search.toLowerCase();
    return sentEmails.filter((e) => {
      const contactName = e.crm_contacts
        ? `${e.crm_contacts.name} ${e.crm_contacts.surname || ''}`.toLowerCase()
        : '';
      const toEmail = (e.to_emails?.[0] || '').toLowerCase();
      const subject = (e.subject || '').toLowerCase();
      return contactName.includes(q) || toEmail.includes(q) || subject.includes(q);
    });
  }, [sentEmails, search]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return format(new Date(dateStr), "d MMM yyyy, HH:mm", { locale: es });
  };

  const handleResend = async () => {
    if (!selectedEmail) return;
    setResending(true);
    try {
      const result = await sendEmail({
        to: selectedEmail.to_emails || [],
        subject: selectedEmail.subject || '(Sin asunto)',
        body_html: selectedEmail.body_html || undefined,
        body_text: selectedEmail.body_text || undefined,
        contact_id: selectedEmail.contact_id || undefined,
        budget_id: selectedEmail.budget_id || undefined,
        cc: selectedEmail.cc_emails || undefined,
      });
      if (result.success) {
        toast.success('Email reenviado correctamente');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-lg">Seguimiento de Emails Enviados</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o asunto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No hay emails enviados</p>
          ) : (
            <ScrollArea className="max-h-[70vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha Envío</TableHead>
                    <TableHead>Asunto</TableHead>
                    <TableHead>Email Receptor</TableHead>
                    <TableHead>Nombre Receptor</TableHead>
                    <TableHead>Recepción Servidor</TableHead>
                    <TableHead>Apertura Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((email) => {
                    const contactName = email.crm_contacts
                      ? `${email.crm_contacts.name} ${email.crm_contacts.surname || ''}`.trim()
                      : '—';
                    const toEmail = email.to_emails?.[0] || '—';

                    const isDelivered = ['delivered', 'opened'].includes(email.delivery_status || '');
                    const deliveryDate = isDelivered ? email.delivery_updated_at : null;

                    const ds = email.delivery_status || 'pending';
                    const config = deliveryStatusConfig[ds] || deliveryStatusConfig.pending;
                    const StatusIcon = config.icon;

                    return (
                      <TableRow key={email.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(email.sent_at || email.created_at)}
                        </TableCell>
                        <TableCell className="text-sm max-w-[250px]">
                          <button
                            type="button"
                            onClick={() => setSelectedEmailId(email.id)}
                            className="text-left text-primary hover:underline cursor-pointer truncate block max-w-full font-medium"
                            title={email.subject || '(Sin asunto)'}
                          >
                            {email.subject || '(Sin asunto)'}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={toEmail}>
                          {toEmail}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contactName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={`h-4 w-4 ${config.className}`} />
                            {deliveryDate ? (
                              <span className={config.className}>
                                {formatDate(deliveryDate)}
                              </span>
                            ) : (
                              <span className={config.className}>{config.label}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {email.read_receipt_at ? (
                            <div className="flex items-center gap-1.5">
                              <Eye className="h-4 w-4 text-purple-600" />
                              <span className="text-purple-600">
                                {formatDate(email.read_receipt_at)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {filtered.length} email{filtered.length !== 1 ? 's' : ''} enviado{filtered.length !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>

      {/* Email Detail Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmailId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {selectedEmail?.subject || '(Sin asunto)'}
            </DialogTitle>
          </DialogHeader>

          {selectedEmail && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Metadata */}
              <div className="space-y-1.5 bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Para:</span>
                  <span className="font-medium">{selectedEmail.to_emails?.join(', ') || '—'}</span>
                </div>
                {selectedEmail.cc_emails && selectedEmail.cc_emails.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">CC:</span>
                    <span>{selectedEmail.cc_emails.join(', ')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span>{format(new Date(selectedEmail.sent_at || selectedEmail.created_at), "d MMMM yyyy 'a las' HH:mm", { locale: es })}</span>
                </div>
                {selectedEmail.crm_contacts && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Contacto:</span>
                    <span>{selectedEmail.crm_contacts.name} {selectedEmail.crm_contacts.surname || ''}</span>
                  </div>
                )}

                {/* Tracking info */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Estado entrega:</span>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const ds = selectedEmail.delivery_status || 'pending';
                      const cfg = deliveryStatusConfig[ds] || deliveryStatusConfig.pending;
                      const Icon = cfg.icon;
                      return (
                        <>
                          <Icon className={`h-4 w-4 ${cfg.className}`} />
                          <span className={cfg.className}>{cfg.label}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {selectedEmail.delivery_updated_at && ['delivered', 'opened'].includes(selectedEmail.delivery_status || '') && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Recibido servidor:</span>
                    <span className="text-green-600">{formatDate(selectedEmail.delivery_updated_at)}</span>
                  </div>
                )}
                {selectedEmail.read_receipt_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Abierto:</span>
                    <span className="text-purple-600">{formatDate(selectedEmail.read_receipt_at)}</span>
                  </div>
                )}
              </div>

              {/* Attachments */}
              {selectedEmail.email_attachments && selectedEmail.email_attachments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground text-xs">Adjuntos:</span>
                  {selectedEmail.email_attachments.map(att => (
                    <Badge key={att.id} variant="secondary" className="text-xs gap-1">
                      <FileText className="h-3 w-3" />
                      {att.file_name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Body */}
              <ScrollArea className="flex-1 border rounded-md">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none p-4 break-words [word-break:break-word] [overflow-wrap:anywhere] [&_*]:max-w-full [&_img]:max-w-full [&_table]:max-w-full [&_table]:block [&_table]:overflow-x-auto"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      selectedEmail.body_html || selectedEmail.body_text?.replace(/\n/g, '<br>') || '<p class="text-muted-foreground">(Sin contenido)</p>',
                      { ADD_TAGS: ['style'], ADD_ATTR: ['target'] }
                    ),
                  }}
                />
              </ScrollArea>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={resending}
                  className="gap-1.5"
                >
                  <Forward className="h-4 w-4" />
                  {resending ? 'Reenviando...' : 'Reenviar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
