import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Mail, Phone, MessageSquare, Calendar, Search, Filter, ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Communication = Tables<'crm_communications'> & {
  crm_contacts?: { name: string; surname: string | null; email: string | null } | null;
};

const typeIcons = {
  email: Mail,
  whatsapp: MessageSquare,
  call: Phone,
  meeting: Calendar,
};

const typeLabels = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  meeting: 'Reunión',
};

const statusConfig = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-500/10 text-yellow-600' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'bg-blue-500/10 text-blue-600' },
  delivered: { label: 'Entregado', icon: CheckCircle, color: 'bg-green-500/10 text-green-600' },
  failed: { label: 'Fallido', icon: XCircle, color: 'bg-red-500/10 text-red-600' },
  opened: { label: 'Abierto', icon: Eye, color: 'bg-purple-500/10 text-purple-600' },
};

const directionConfig = {
  inbound: { label: 'Entrante', icon: ArrowDownLeft, color: 'text-green-600' },
  outbound: { label: 'Saliente', icon: ArrowUpRight, color: 'text-blue-600' },
};

export function CommunicationsTab() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: communications = [], isLoading } = useQuery({
    queryKey: ['crm-communications', typeFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('crm_communications')
        .select(`
          *,
          crm_contacts (
            name,
            surname,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('communication_type', typeFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as Communication[];
    },
  });

  const filteredCommunications = communications.filter(comm => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const contactName = comm.crm_contacts 
      ? `${comm.crm_contacts.name} ${comm.crm_contacts.surname || ''}`.toLowerCase()
      : '';
    return (
      contactName.includes(searchLower) ||
      comm.subject?.toLowerCase().includes(searchLower) ||
      comm.content.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en comunicaciones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="call">Llamada</SelectItem>
                <SelectItem value="meeting">Reunión</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="delivered">Entregado</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="opened">Abierto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Communications List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Historial de Comunicaciones
            <Badge variant="secondary" className="ml-2">
              {filteredCommunications.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : filteredCommunications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay comunicaciones registradas
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCommunications.map((comm) => {
                const TypeIcon = typeIcons[comm.communication_type as keyof typeof typeIcons] || Mail;
                const status = statusConfig[comm.status as keyof typeof statusConfig] || statusConfig.pending;
                const StatusIcon = status.icon;
                const direction = directionConfig[comm.direction as keyof typeof directionConfig] || directionConfig.outbound;
                const DirectionIcon = direction.icon;

                return (
                  <div
                    key={comm.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                        <TypeIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {comm.crm_contacts 
                              ? `${comm.crm_contacts.name} ${comm.crm_contacts.surname || ''}`
                              : 'Contacto eliminado'}
                          </span>
                          <Badge variant="outline" className={`${status.color} gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                          <span className={`flex items-center gap-1 text-xs ${direction.color}`}>
                            <DirectionIcon className="h-3 w-3" />
                            {direction.label}
                          </span>
                        </div>
                        {comm.subject && (
                          <p className="text-sm font-medium mt-1">{comm.subject}</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {comm.content.replace(/<[^>]*>/g, '')}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>
                            {format(new Date(comm.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                          </span>
                          {comm.sent_at && (
                            <span>
                              Enviado: {format(new Date(comm.sent_at), 'HH:mm', { locale: es })}
                            </span>
                          )}
                          {comm.error_message && (
                            <span className="text-red-500">Error: {comm.error_message}</span>
                          )}
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
    </div>
  );
}
