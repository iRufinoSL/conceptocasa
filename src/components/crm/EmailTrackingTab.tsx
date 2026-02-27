import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Search, CheckCircle, Clock, XCircle, Eye, Send } from 'lucide-react';

const deliveryStatusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  pending: { label: 'Pendiente', icon: Clock, className: 'text-yellow-600' },
  sent: { label: 'Enviado', icon: Send, className: 'text-blue-600' },
  delivered: { label: 'Entregado', icon: CheckCircle, className: 'text-green-600' },
  opened: { label: 'Abierto', icon: Eye, className: 'text-purple-600' },
  failed: { label: 'Fallido', icon: XCircle, className: 'text-destructive' },
};

export function EmailTrackingTab() {
  const [search, setSearch] = useState('');

  const { data: sentEmails = [], isLoading } = useQuery({
    queryKey: ['email-tracking-sent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_messages')
        .select(`
          id, subject, to_emails, sent_at, created_at,
          delivery_status, delivery_updated_at, read_receipt_at,
          crm_contacts (name, surname, email)
        `)
        .eq('direction', 'outbound')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!search) return sentEmails;
    const q = search.toLowerCase();
    return sentEmails.filter((e: any) => {
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

  return (
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
                  <TableHead>Email Receptor</TableHead>
                  <TableHead>Nombre Receptor</TableHead>
                  <TableHead>Recepción Servidor</TableHead>
                  <TableHead>Apertura Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((email: any) => {
                  const contactName = email.crm_contacts
                    ? `${email.crm_contacts.name} ${email.crm_contacts.surname || ''}`.trim()
                    : '—';
                  const toEmail = email.to_emails?.[0] || '—';

                  // Determine server delivery date
                  const isDelivered = ['delivered', 'opened'].includes(email.delivery_status || '');
                  const deliveryDate = isDelivered ? email.delivery_updated_at : null;

                  // Delivery status badge
                  const ds = email.delivery_status || 'pending';
                  const config = deliveryStatusConfig[ds] || deliveryStatusConfig.pending;
                  const StatusIcon = config.icon;

                  return (
                    <TableRow key={email.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(email.sent_at || email.created_at)}
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
  );
}
