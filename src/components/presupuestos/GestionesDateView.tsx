import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Calendar, Clock, User, Mail, MessageSquare, Send, CheckSquare, Package, Wrench, Truck, Briefcase, Pencil, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, addDays, isToday, isTomorrow, isThisWeek, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatActividadId } from '@/lib/activity-id';

interface Gestion {
  id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  start_date: string | null;
  type: 'tarea' | 'recurso';
  resource_type?: string | null;
  activity_id: string | null;
  activity_code?: string | null;
  activity_name?: string | null;
  phase_code?: string | null;
  supplier_id: string | null;
  supplier_name?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  contacts: { id: string; name: string; surname: string | null; email: string | null; phone: string | null }[];
  task_status?: string | null;
}

interface GestionesDateViewProps {
  budgetId: string;
  budgetName: string;
  isAdmin: boolean;
  onEditTask?: (taskId: string) => void;
  onEditActivity?: (activityId: string) => void;
}

const resourceTypeIcons: Record<string, React.ReactNode> = {
  'Producto': <Package className="h-4 w-4" />,
  'Mano de obra': <Wrench className="h-4 w-4" />,
  'Alquiler': <Truck className="h-4 w-4" />,
  'Servicio': <Briefcase className="h-4 w-4" />,
  'Tarea': <CheckSquare className="h-4 w-4" />,
  'Herramienta': <Wrench className="h-4 w-4" />,
};

type DateGroup = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_date';

export function GestionesDateView({
  budgetId,
  budgetName,
  isAdmin,
  onEditTask,
  onEditActivity,
}: GestionesDateViewProps) {
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<DateGroup>>(new Set(['overdue', 'today', 'tomorrow']));
  const [selectedGestiones, setSelectedGestiones] = useState<Set<string>>(new Set());
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendMode, setSendMode] = useState<'email' | 'whatsapp'>('email');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchGestiones = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch tasks (resource_type = 'Tarea')
      const { data: tasksData, error: tasksError } = await supabase
        .from('budget_activity_resources')
        .select(`
          id,
          name,
          description,
          start_date,
          resource_type,
          activity_id,
          supplier_id,
          task_status
        `)
        .eq('budget_id', budgetId)
        .eq('resource_type', 'Tarea');

      if (tasksError) throw tasksError;

      // Fetch resources with start dates (excluding tasks)
      const { data: resourcesData, error: resourcesError } = await supabase
        .from('budget_activity_resources')
        .select(`
          id,
          name,
          description,
          start_date,
          resource_type,
          activity_id,
          supplier_id
        `)
        .eq('budget_id', budgetId)
        .neq('resource_type', 'Tarea')
        .not('start_date', 'is', null);

      if (resourcesError) throw resourcesError;

      // Fetch activities for all items
      const activityIds = [...new Set([
        ...(tasksData || []).map(t => t.activity_id),
        ...(resourcesData || []).map(r => r.activity_id)
      ].filter(Boolean))] as string[];

      let activitiesMap: Record<string, { code: string; name: string; phase_code: string | null }> = {};
      if (activityIds.length > 0) {
        const { data: activitiesData } = await supabase
          .from('budget_activities')
          .select('id, code, name, phase_id, budget_phases(code)')
          .in('id', activityIds);

        if (activitiesData) {
          activitiesData.forEach((a: any) => {
            activitiesMap[a.id] = {
              code: a.code,
              name: a.name,
              phase_code: a.budget_phases?.code || null
            };
          });
        }
      }

      // Fetch suppliers
      const supplierIds = [...new Set([
        ...(tasksData || []).map(t => t.supplier_id),
        ...(resourcesData || []).map(r => r.supplier_id)
      ].filter(Boolean))] as string[];

      let suppliersMap: Record<string, { name: string; surname: string | null; email: string | null; phone: string | null }> = {};
      if (supplierIds.length > 0) {
        const { data: suppliersData } = await supabase
          .from('crm_contacts')
          .select('id, name, surname, email, phone')
          .in('id', supplierIds);

        if (suppliersData) {
          suppliersData.forEach(s => {
            suppliersMap[s.id] = {
              name: s.name,
              surname: s.surname,
              email: s.email,
              phone: s.phone
            };
          });
        }
      }

      // Fetch contacts for tasks
      const taskIds = (tasksData || []).map(t => t.id);
      let taskContactsMap: Record<string, Gestion['contacts']> = {};
      if (taskIds.length > 0) {
        const { data: contactsData } = await supabase
          .from('budget_resource_contacts')
          .select('resource_id, contact:crm_contacts(id, name, surname, email, phone)')
          .in('resource_id', taskIds);

        if (contactsData) {
          contactsData.forEach((c: any) => {
            if (!taskContactsMap[c.resource_id]) taskContactsMap[c.resource_id] = [];
            if (c.contact) {
              taskContactsMap[c.resource_id].push(c.contact);
            }
          });
        }
      }

      // Map tasks to gestiones
      const gestionesList: Gestion[] = [];

      (tasksData || []).forEach(task => {
        const activity = task.activity_id ? activitiesMap[task.activity_id] : null;
        const supplier = task.supplier_id ? suppliersMap[task.supplier_id] : null;

        gestionesList.push({
          id: task.id,
          name: task.name,
          description: task.description,
          target_date: task.start_date,
          start_date: task.start_date,
          type: 'tarea',
          resource_type: task.resource_type,
          activity_id: task.activity_id,
          activity_code: activity?.code,
          activity_name: activity?.name,
          phase_code: activity?.phase_code,
          supplier_id: task.supplier_id,
          supplier_name: supplier ? (supplier.surname ? `${supplier.name} ${supplier.surname}` : supplier.name) : null,
          supplier_email: supplier?.email,
          supplier_phone: supplier?.phone,
          contacts: taskContactsMap[task.id] || [],
          task_status: task.task_status,
        });
      });

      // Map resources to gestiones (resources with start dates that represent scheduled items)
      (resourcesData || []).forEach(resource => {
        const activity = resource.activity_id ? activitiesMap[resource.activity_id] : null;
        const supplier = resource.supplier_id ? suppliersMap[resource.supplier_id] : null;

        gestionesList.push({
          id: resource.id,
          name: resource.name,
          description: resource.description,
          target_date: resource.start_date,
          start_date: resource.start_date,
          type: 'recurso',
          resource_type: resource.resource_type,
          activity_id: resource.activity_id,
          activity_code: activity?.code,
          activity_name: activity?.name,
          phase_code: activity?.phase_code,
          supplier_id: resource.supplier_id,
          supplier_name: supplier ? (supplier.surname ? `${supplier.name} ${supplier.surname}` : supplier.name) : null,
          supplier_email: supplier?.email,
          supplier_phone: supplier?.phone,
          contacts: [],
        });
      });

      setGestiones(gestionesList);
    } catch (error) {
      console.error('Error fetching gestiones:', error);
      toast.error('Error al cargar las gestiones');
    } finally {
      setIsLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchGestiones();
  }, [fetchGestiones]);

  const getDateGroup = (dateStr: string | null): DateGroup => {
    if (!dateStr) return 'no_date';
    const date = parseISO(dateStr);
    const today = startOfDay(new Date());

    if (isBefore(date, today)) return 'overdue';
    if (isToday(date)) return 'today';
    if (isTomorrow(date)) return 'tomorrow';
    if (isThisWeek(date, { weekStartsOn: 1 })) return 'this_week';
    return 'later';
  };

  const groupedGestiones = useMemo(() => {
    const groups: Record<DateGroup, Gestion[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      this_week: [],
      later: [],
      no_date: [],
    };

    gestiones.forEach(g => {
      const group = getDateGroup(g.target_date);
      groups[group].push(g);
    });

    // Sort each group by date
    Object.keys(groups).forEach(key => {
      groups[key as DateGroup].sort((a, b) => {
        const dateA = a.target_date || '9999-12-31';
        const dateB = b.target_date || '9999-12-31';
        return dateA.localeCompare(dateB);
      });
    });

    return groups;
  }, [gestiones]);

  const groupLabels: Record<DateGroup, { label: string; color: string; bgColor: string }> = {
    overdue: { label: '⚠️ Vencidas', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
    today: { label: '📅 Hoy', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
    tomorrow: { label: '📆 Mañana', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200' },
    this_week: { label: '🗓️ Esta semana', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
    later: { label: '📋 Próximas', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200' },
    no_date: { label: '❓ Sin fecha', color: 'text-muted-foreground', bgColor: 'bg-muted/30 border-muted' },
  };

  const toggleGroup = (group: DateGroup) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(group)) {
        newSet.delete(group);
      } else {
        newSet.add(group);
      }
      return newSet;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedGestiones(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllInGroup = (group: DateGroup) => {
    const groupItems = groupedGestiones[group];
    const allSelected = groupItems.every(g => selectedGestiones.has(g.id));
    
    setSelectedGestiones(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        groupItems.forEach(g => newSet.delete(g.id));
      } else {
        groupItems.forEach(g => newSet.add(g.id));
      }
      return newSet;
    });
  };

  // Get unique suppliers from selected gestiones
  const selectedSuppliers = useMemo(() => {
    const suppliersMap = new Map<string, { name: string; email: string | null; phone: string | null; gestiones: Gestion[] }>();
    
    gestiones
      .filter(g => selectedGestiones.has(g.id))
      .forEach(g => {
        // Add main supplier
        if (g.supplier_id && g.supplier_name) {
          if (!suppliersMap.has(g.supplier_id)) {
            suppliersMap.set(g.supplier_id, {
              name: g.supplier_name,
              email: g.supplier_email || null,
              phone: g.supplier_phone || null,
              gestiones: []
            });
          }
          suppliersMap.get(g.supplier_id)!.gestiones.push(g);
        }
        
        // Add contacts from task
        g.contacts.forEach(contact => {
          if (!suppliersMap.has(contact.id)) {
            suppliersMap.set(contact.id, {
              name: contact.surname ? `${contact.name} ${contact.surname}` : contact.name,
              email: contact.email,
              phone: contact.phone,
              gestiones: []
            });
          }
          suppliersMap.get(contact.id)!.gestiones.push(g);
        });
      });

    return Array.from(suppliersMap.entries()).map(([id, data]) => ({ id, ...data }));
  }, [gestiones, selectedGestiones]);

  const generateMessageContent = () => {
    const selectedItems = gestiones.filter(g => selectedGestiones.has(g.id));
    const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
    
    let message = `📋 *Gestiones - ${budgetName}*\n`;
    message += `📅 ${today}\n\n`;

    selectedItems.forEach(g => {
      const dateStr = g.target_date ? format(parseISO(g.target_date), 'dd/MM/yyyy', { locale: es }) : 'Sin fecha';
      const activityLabel = g.activity_code 
        ? formatActividadId({ phaseCode: g.phase_code, activityCode: g.activity_code, name: g.activity_name || '' })
        : null;

      message += `• *${g.name}*\n`;
      message += `  📅 ${dateStr}\n`;
      if (activityLabel) message += `  🔗 ${activityLabel}\n`;
      if (g.description) message += `  📝 ${g.description}\n`;
      message += '\n';
    });

    if (customMessage) {
      message += `\n💬 ${customMessage}`;
    }

    return message;
  };

  const handleSendEmail = async (supplier: { id: string; name: string; email: string | null; gestiones: Gestion[] }) => {
    if (!supplier.email) {
      toast.error(`${supplier.name} no tiene email configurado`);
      return;
    }

    setIsSending(true);
    try {
      const content = generateMessageContent();
      
      const { error } = await supabase.functions.invoke('send-crm-email', {
        body: {
          to: supplier.email,
          subject: `Gestiones pendientes - ${budgetName}`,
          htmlContent: content.replace(/\n/g, '<br>').replace(/\*/g, ''),
          textContent: content.replace(/\*/g, ''),
        }
      });

      if (error) throw error;
      toast.success(`Email enviado a ${supplier.name}`);
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(`Error al enviar email a ${supplier.name}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenWhatsApp = (supplier: { id: string; name: string; phone: string | null }) => {
    if (!supplier.phone) {
      toast.error(`${supplier.name} no tiene teléfono configurado`);
      return;
    }

    const content = generateMessageContent();
    const phone = supplier.phone.replace(/\D/g, '');
    const phoneWithCountry = phone.startsWith('34') ? phone : `34${phone}`;
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(content)}`;
    window.open(url, '_blank');
  };

  const renderGestionRow = (gestion: Gestion) => {
    const activityLabel = gestion.activity_code 
      ? formatActividadId({ phaseCode: gestion.phase_code, activityCode: gestion.activity_code, name: gestion.activity_name || '' })
      : null;

    return (
      <div
        key={gestion.id}
        className={cn(
          "flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-accent/50 transition-colors",
          gestion.task_status === 'realizada' && "opacity-60 bg-green-50/50"
        )}
      >
        <Checkbox
          checked={selectedGestiones.has(gestion.id)}
          onCheckedChange={() => toggleSelection(gestion.id)}
          className="mt-1"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1 text-xs shrink-0">
              {resourceTypeIcons[gestion.resource_type || 'Tarea']}
              {gestion.type === 'tarea' ? 'Tarea' : gestion.resource_type}
            </Badge>
            
            <span className="font-medium truncate">{gestion.name}</span>
            
            {gestion.task_status === 'realizada' && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">Realizada</Badge>
            )}
          </div>
          
          {gestion.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{gestion.description}</p>
          )}
          
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            {gestion.target_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(parseISO(gestion.target_date), 'dd/MM/yyyy', { locale: es })}
              </span>
            )}
            
            {activityLabel && (
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs text-primary"
                onClick={() => gestion.activity_id && onEditActivity?.(gestion.activity_id)}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {activityLabel}
              </Button>
            )}
            
            {gestion.supplier_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {gestion.supplier_name}
              </span>
            )}
            
            {gestion.contacts.length > 0 && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {gestion.contacts.map(c => c.surname ? `${c.name} ${c.surname}` : c.name).join(', ')}
              </span>
            )}
          </div>
        </div>

        {isAdmin && gestion.type === 'tarea' && onEditTask && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onEditTask(gestion.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (gestiones.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay gestiones programadas
      </div>
    );
  }

  const orderedGroups: DateGroup[] = ['overdue', 'today', 'tomorrow', 'this_week', 'later', 'no_date'];

  return (
    <div className="space-y-4">
      {/* Selection actions */}
      {selectedGestiones.size > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span className="text-sm font-medium">
                {selectedGestiones.size} gestión(es) seleccionada(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGestiones(new Set())}
                >
                  Deseleccionar todo
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSendDialogOpen(true)}
                  className="gap-1.5"
                >
                  <Send className="h-4 w-4" />
                  Enviar a suministradores
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date groups */}
      {orderedGroups.map(group => {
        const items = groupedGestiones[group];
        if (items.length === 0) return null;

        const isExpanded = expandedGroups.has(group);
        const groupConfig = groupLabels[group];
        const allSelected = items.every(g => selectedGestiones.has(g.id));
        const someSelected = items.some(g => selectedGestiones.has(g.id));

        return (
          <Card key={group} className={cn("overflow-hidden border", groupConfig.bgColor)}>
            <CardHeader
              className="py-3 px-4 cursor-pointer"
              onClick={() => toggleGroup(group)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allSelected}
                    className={someSelected && !allSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectAllInGroup(group);
                    }}
                  />
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                  <CardTitle className={cn("text-base font-semibold", groupConfig.color)}>
                    {groupConfig.label}
                  </CardTitle>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="p-0 bg-background">
                {items.map(renderGestionRow)}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Send dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar gestiones a suministradores</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Se enviarán {selectedGestiones.size} gestión(es) a los siguientes contactos:
            </div>

            <Tabs value={sendMode} onValueChange={(v) => setSendMode(v as 'email' | 'whatsapp')}>
              <TabsList className="w-full">
                <TabsTrigger value="email" className="flex-1 gap-1.5">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex-1 gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 space-y-3">
                <Textarea
                  placeholder="Mensaje adicional (opcional)..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={2}
                />

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedSuppliers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Las gestiones seleccionadas no tienen suministradores asignados
                    </p>
                  ) : (
                    selectedSuppliers.map(supplier => (
                      <div
                        key={supplier.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {sendMode === 'email' ? supplier.email || 'Sin email' : supplier.phone || 'Sin teléfono'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {supplier.gestiones.length} gestión(es)
                          </p>
                        </div>
                        <Button
                          size="sm"
                          disabled={
                            isSending ||
                            (sendMode === 'email' && !supplier.email) ||
                            (sendMode === 'whatsapp' && !supplier.phone)
                          }
                          onClick={() => {
                            if (sendMode === 'email') {
                              handleSendEmail(supplier);
                            } else {
                              handleOpenWhatsApp(supplier);
                            }
                          }}
                        >
                          {sendMode === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
