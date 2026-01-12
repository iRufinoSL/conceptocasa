import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  Mail, Phone, MapPin, Globe, Building2, User, 
  Calendar, FileText, Tag, Briefcase, ClipboardList, Plus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { SendEmailDialog } from './SendEmailDialog';
import { ManagementForm } from './ManagementForm';
import { ContactCommunicationsHistory } from './ContactCommunicationsHistory';
import type { Contact } from '@/pages/CRM';

interface Management {
  id: string;
  title: string;
  description: string | null;
  management_type: string;
  status: string;
  target_date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

interface ProfessionalActivity {
  id: string;
  name: string;
}

interface RelatedContact {
  id: string;
  name: string;
  surname: string | null;
  contact_type: string;
}

interface ContactDetailDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailDialog({ contact, open, onOpenChange }: ContactDetailDialogProps) {
  const [managements, setManagements] = useState<Management[]>([]);
  const [activityNames, setActivityNames] = useState<string[]>([]);
  const [relatedContacts, setRelatedContacts] = useState<RelatedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [managementFormOpen, setManagementFormOpen] = useState(false);

  const fetchManagements = async () => {
    if (!contact) return;
    
    const { data: managementLinks } = await supabase
      .from('crm_management_contacts')
      .select('management_id')
      .eq('contact_id', contact.id);
    
    if (managementLinks && managementLinks.length > 0) {
      const managementIds = managementLinks.map(link => link.management_id);
      const { data: managementsData } = await supabase
        .from('crm_managements')
        .select('*')
        .in('id', managementIds)
        .order('created_at', { ascending: false });
      
      if (managementsData) {
        setManagements(managementsData);
      }
    } else {
      setManagements([]);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!contact || !open) return;
      
      setLoading(true);
      
      // Fetch related managements
      const { data: managementLinks } = await supabase
        .from('crm_management_contacts')
        .select('management_id')
        .eq('contact_id', contact.id);
      
      if (managementLinks && managementLinks.length > 0) {
        const managementIds = managementLinks.map(link => link.management_id);
        const { data: managementsData } = await supabase
          .from('crm_managements')
          .select('*')
          .in('id', managementIds)
          .order('created_at', { ascending: false });
        
        if (managementsData) {
          setManagements(managementsData);
        }
      } else {
        setManagements([]);
      }
      
      // Fetch professional activities (many-to-many)
      const { data: contactActivities } = await supabase
        .from('crm_contact_professional_activities')
        .select('professional_activity_id')
        .eq('contact_id', contact.id);
      
      if (contactActivities && contactActivities.length > 0) {
        const activityIds = contactActivities.map(ca => ca.professional_activity_id);
        const { data: activities } = await supabase
          .from('crm_professional_activities')
          .select('name')
          .in('id', activityIds)
          .order('name');
        
        if (activities) {
          setActivityNames(activities.map(a => a.name));
        }
      } else {
        setActivityNames([]);
      }

      // Fetch related contacts (bidirectional)
      const { data: relationsA } = await supabase
        .from('crm_contact_relations')
        .select('contact_id_b')
        .eq('contact_id_a', contact.id);
      
      const { data: relationsB } = await supabase
        .from('crm_contact_relations')
        .select('contact_id_a')
        .eq('contact_id_b', contact.id);
      
      const relatedIds = [
        ...(relationsA?.map(r => r.contact_id_b) || []),
        ...(relationsB?.map(r => r.contact_id_a) || [])
      ];
      const uniqueRelatedIds = [...new Set(relatedIds)];

      if (uniqueRelatedIds.length > 0) {
        const { data: relatedContactsData } = await supabase
          .from('crm_contacts')
          .select('id, name, surname, contact_type')
          .in('id', uniqueRelatedIds)
          .order('name');
        
        if (relatedContactsData) {
          setRelatedContacts(relatedContactsData);
        }
      } else {
        setRelatedContacts([]);
      }
      
      setLoading(false);
    };
    
    fetchData();
  }, [contact, open]);

  if (!contact) return null;

  const getInitials = (name: string, surname?: string | null) => {
    const first = name.charAt(0).toUpperCase();
    const second = surname ? surname.charAt(0).toUpperCase() : name.charAt(1)?.toUpperCase() || '';
    return first + second;
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Cliente': return 'default';
      case 'Prospecto': return 'secondary';
      case 'Proveedor': return 'outline';
      case 'Inactivo': return 'outline';
      case 'Completada': return 'default';
      case 'Pendiente': return 'secondary';
      case 'Cancelada': return 'destructive';
      default: return 'secondary';
    }
  };

  const getManagementTypeIcon = (type: string) => {
    switch (type) {
      case 'Reunión': return '📅';
      case 'Llamada': return '📞';
      case 'Email': return '📧';
      case 'Tarea': return '✓';
      default: return '📋';
    }
  };

  const InfoRow = ({ icon: Icon, label, value, type }: { icon: any; label: string; value: string | null | undefined; type?: 'email' | 'phone' | 'website' | 'text' }) => {
    if (!value) return null;
    
    const renderValue = () => {
      switch (type) {
        case 'email':
          return (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm break-words justify-start"
              onClick={(e) => {
                e.stopPropagation();
                setEmailDialogOpen(true);
              }}
            >
              {value}
            </Button>
          );
        case 'phone':
          return (
            <a 
              href={`tel:${value.replace(/[^\d+]/g, '')}`}
              className="text-sm break-words hover:underline hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {value}
            </a>
          );
        case 'website':
          const fullUrl = value.startsWith('http') ? value : `https://${value}`;
          return (
            <a 
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm break-words hover:underline hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {value}
            </a>
          );
        default:
          return <p className="text-sm break-words">{value}</p>;
      }
    };
    
    return (
      <div className="flex items-start gap-3 py-2">
        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {renderValue()}
        </div>
      </div>
    );
  };

  return (
    <>
      <SendEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        contact={{ id: contact.id, name: contact.name, surname: contact.surname, email: contact.email }}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {getInitials(contact.name, contact.surname)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold">
                {contact.name} {contact.surname}
              </DialogTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant={contact.contact_type === 'Empresa' ? 'default' : 'outline'}>
                  {contact.contact_type}
                </Badge>
                <Badge variant={getStatusVariant(contact.status)}>
                  {contact.status}
                </Badge>
                {activityNames.map((name, index) => (
                  <Badge key={index} variant="outline" className="bg-primary/5">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Contact Information */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Basic Info */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Información de Contacto
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-4">
                  <InfoRow icon={Mail} label="Email" value={contact.email} type="email" />
                  <InfoRow icon={Phone} label="Teléfono" value={contact.phone} type="phone" />
                  <InfoRow icon={Globe} label="Sitio Web" value={contact.website} type="website" />
                  <InfoRow icon={FileText} label="NIF/DNI" value={contact.nif_dni} />
                </CardContent>
              </Card>

              {/* Address Info */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Dirección
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-4">
                  <InfoRow icon={Building2} label="Dirección" value={contact.address} />
                  <InfoRow icon={MapPin} label="Ciudad" value={contact.city} />
                  <InfoRow icon={MapPin} label="Provincia" value={contact.province} />
                  <InfoRow icon={MapPin} label="Código Postal" value={contact.postal_code} />
                  <InfoRow icon={Globe} label="País" value={contact.country} />
                </CardContent>
              </Card>
            </div>

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Etiquetas
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Observations */}
            {contact.observations && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Observaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-4">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {contact.observations}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Related Contacts */}
            {relatedContacts.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Contactos Relacionados ({relatedContacts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {relatedContacts.map((relContact) => (
                      <Badge key={relContact.id} variant="secondary" className="gap-1">
                        {relContact.name} {relContact.surname}
                        <span className="text-xs opacity-70">({relContact.contact_type})</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Management History */}
            <Card>
              <CardHeader className="py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Historial de Gestiones ({managements.length})
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setManagementFormOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nueva Cita/Tarea
                </Button>
              </CardHeader>
              <CardContent className="py-0 pb-4">
                {loading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Cargando gestiones...
                  </p>
                ) : managements.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay gestiones registradas para este contacto
                  </p>
                ) : (
                  <div className="space-y-3">
                    {managements.map((management) => (
                      <div
                        key={management.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-lg mt-0.5">
                          {getManagementTypeIcon(management.management_type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-medium truncate">
                              {management.title}
                            </h4>
                            <Badge variant={getStatusVariant(management.status)} className="text-xs shrink-0">
                              {management.status}
                            </Badge>
                          </div>
                          {management.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {management.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              {management.management_type}
                            </span>
                            {management.target_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(management.target_date), 'dd MMM yyyy', { locale: es })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Communications History */}
            <ContactCommunicationsHistory 
              contactId={contact.id} 
              contactPhone={contact.phone}
            />

            {/* Creation Info */}
            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              Creado el {contact.created_at ? format(new Date(contact.created_at), 'dd MMMM yyyy', { locale: es }) : '-'}
            </div>
          </div>
        </ScrollArea>
        </DialogContent>
      </Dialog>
      
      {/* Management Form for creating new appointments/tasks */}
      <ManagementForm
        open={managementFormOpen}
        onOpenChange={setManagementFormOpen}
        management={null}
        onSuccess={fetchManagements}
        prefillContactId={contact.id}
        prefillContactName={`${contact.name} ${contact.surname || ''}`.trim()}
      />
    </>
  );
}
