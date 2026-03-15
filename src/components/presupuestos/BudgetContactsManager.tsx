import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Users, Building2, UserPlus, ChevronDown, List, FolderOpen, Search, X, Mail, Pencil, MessageCircle, Smartphone } from 'lucide-react';
import { ContactForm } from '@/components/crm/ContactForm';
import { SendEmailDialog } from '@/components/crm/SendEmailDialog';
import { WhatsAppComposeDialog } from '@/components/crm/WhatsAppComposeDialog';
import { SMSComposeDialog } from '@/components/crm/SMSComposeDialog';
import { searchMatch } from '@/lib/search-utils';
import { PhoneLink } from '@/lib/contact-utils';

interface ProfessionalActivity {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  contact_type: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  professional_activities?: ProfessionalActivity[];
}

interface BudgetContact {
  id: string;
  contact_id: string;
  contact_role: 'cliente' | 'proveedor' | 'otros';
  contact?: Contact;
}

interface BudgetContactsManagerProps {
  budgetId: string;
  isAdmin: boolean;
}

export function BudgetContactsManager({ budgetId, isAdmin }: BudgetContactsManagerProps) {
  const { toast } = useToast();
  const [budgetContacts, setBudgetContacts] = useState<BudgetContact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [professionalActivities, setProfessionalActivities] = useState<ProfessionalActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedOtherId, setSelectedOtherId] = useState('');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [isAddingOther, setIsAddingOther] = useState(false);
  const [showNewContactDialog, setShowNewContactDialog] = useState(false);
  const [newContactRole, setNewContactRole] = useState<'cliente' | 'proveedor' | 'otros'>('otros');
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [othersSearchTerm, setOthersSearchTerm] = useState('');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailContact, setEmailContact] = useState<Contact | null>(null);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappContact, setWhatsappContact] = useState<Contact | null>(null);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsContact, setSmsContact] = useState<Contact | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    
    try {
      // Fetch all data in parallel for speed
      const [bcRes, contactsRes, activitiesRes, contactActivitiesRes] = await Promise.all([
        supabase.from('budget_contacts').select('id, contact_id, contact_role').eq('budget_id', budgetId),
        supabase.from('crm_contacts').select('id, name, surname, contact_type, email, phone, city').order('name'),
        supabase.from('crm_professional_activities').select('id, name').order('name'),
        supabase.from('crm_contact_professional_activities').select('contact_id, professional_activity_id'),
      ]);

      const bcData = bcRes.data;
      const contactsData = contactsRes.data;
      const activitiesData = activitiesRes.data;
      const contactActivitiesData = contactActivitiesRes.data;

      if (activitiesData) {
        setProfessionalActivities(activitiesData);
      }

      if (contactsData) {
        const enrichedContacts = contactsData.map(contact => {
          const activityIds = contactActivitiesData
            ?.filter(ca => ca.contact_id === contact.id)
            .map(ca => ca.professional_activity_id) || [];
          const activities = activitiesData?.filter(a => activityIds.includes(a.id)) || [];
          return { ...contact, professional_activities: activities };
        });
        setAllContacts(enrichedContacts);
      }

      if (bcData && contactsData) {
        const enrichedBudgetContacts = bcData.map(bc => {
          const contactData = contactsData.find(c => c.id === bc.contact_id);
          const activityIds = contactActivitiesData
            ?.filter(ca => ca.contact_id === bc.contact_id)
            .map(ca => ca.professional_activity_id) || [];
          const activities = activitiesData?.filter(a => activityIds.includes(a.id)) || [];
          
          return {
            ...bc,
            contact_role: bc.contact_role as 'cliente' | 'proveedor' | 'otros',
            contact: contactData ? { ...contactData, professional_activities: activities } : undefined
          };
        });
        setBudgetContacts(enrichedBudgetContacts);
      } else if (bcData) {
        // Budget contacts exist but crm_contacts query returned nothing (possible RLS issue)
        // Still show the budget contacts with missing contact info
        const fallbackContacts = bcData.map(bc => ({
          ...bc,
          contact_role: bc.contact_role as 'cliente' | 'proveedor' | 'otros',
          contact: undefined
        }));
        setBudgetContacts(fallbackContacts);
      }
    } catch (error) {
      console.error('Error fetching budget contacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (budgetId) {
      fetchData();
    }
  }, [budgetId]);

  const handleAddContact = async (role: 'cliente' | 'proveedor' | 'otros') => {
    const contactId = role === 'cliente' ? selectedClientId : role === 'proveedor' ? selectedProviderId : selectedOtherId;
    const setIsAdding = role === 'cliente' ? setIsAddingClient : role === 'proveedor' ? setIsAddingProvider : setIsAddingOther;
    const setSelectedId = role === 'cliente' ? setSelectedClientId : role === 'proveedor' ? setSelectedProviderId : setSelectedOtherId;
    
    if (!contactId) {
      toast({ title: 'Error', description: 'Selecciona un contacto', variant: 'destructive' });
      return;
    }

    // Check if already linked with same role
    if (budgetContacts.some(bc => bc.contact_id === contactId && bc.contact_role === role)) {
      const roleLabel = role === 'cliente' ? 'cliente' : role === 'proveedor' ? 'proveedor' : 'otro contacto';
      toast({ title: 'Error', description: `Este contacto ya está vinculado como ${roleLabel}`, variant: 'destructive' });
      return;
    }

    setIsAdding(true);

    try {
      const { error } = await supabase
        .from('budget_contacts')
        .insert({
          budget_id: budgetId,
          contact_id: contactId,
          contact_role: role
        });

      if (error) throw error;

      const roleLabel = role === 'cliente' ? 'Cliente' : role === 'proveedor' ? 'Proveedor' : 'Contacto';
      toast({ title: `${roleLabel} añadido correctamente` });
      setSelectedId('');
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveContact = async (budgetContactId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('budget_contacts')
        .delete()
        .eq('id', budgetContactId);

      if (error) throw error;

      const roleLabel = role === 'cliente' ? 'Cliente' : role === 'proveedor' ? 'Proveedor' : 'Contacto';
      toast({ title: `${roleLabel} eliminado` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleNewContactSaved = async (newContactId?: string) => {
    await fetchData();
    setShowNewContactDialog(false);
    
    // Auto-add the new contact to the budget with the selected role
    if (newContactId && newContactRole) {
      try {
        const { error } = await supabase
          .from('budget_contacts')
          .insert({
            budget_id: budgetId,
            contact_id: newContactId,
            contact_role: newContactRole
          });

        if (error) throw error;

        const roleLabel = newContactRole === 'cliente' ? 'Cliente' : newContactRole === 'proveedor' ? 'Proveedor' : 'Contacto';
        toast({ title: `${roleLabel} creado y añadido correctamente` });
        fetchData();
      } catch (error: any) {
        console.error('Error adding new contact to budget:', error);
      }
    }
  };

  const openNewContactDialog = (role: 'cliente' | 'proveedor' | 'otros') => {
    setNewContactRole(role);
    setShowNewContactDialog(true);
  };

  const toggleActivityExpanded = (activityId: string) => {
    setExpandedActivities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(activityId)) {
        newSet.delete(activityId);
      } else {
        newSet.add(activityId);
      }
      return newSet;
    });
  };

  const getInitials = (name: string, surname?: string | null) => {
    const first = name.charAt(0).toUpperCase();
    const second = surname ? surname.charAt(0).toUpperCase() : name.charAt(1)?.toUpperCase() || '';
    return first + second;
  };

  const handleSendWhatsApp = (contact: Contact) => {
    if (!contact.phone) return;
    setWhatsappContact(contact);
    setWhatsappDialogOpen(true);
  };

  const handleSendSMS = (contact: Contact) => {
    if (!contact.phone) return;
    setSmsContact(contact);
    setSmsDialogOpen(true);
  };

  const clients = budgetContacts.filter(bc => bc.contact_role === 'cliente');
  const providers = budgetContacts.filter(bc => bc.contact_role === 'proveedor');
  const others = budgetContacts.filter(bc => bc.contact_role === 'otros');

  // Filter others by search term
  const filteredOthers = others.filter(bc => {
    if (!othersSearchTerm.trim()) return true;
    if (!bc.contact) return false;
    const contact = bc.contact;
    const fullName = `${contact.name} ${contact.surname || ''}`;
    const activities = contact.professional_activities?.map(a => a.name).join(' ') || '';
    return (
      searchMatch(fullName, othersSearchTerm) ||
      searchMatch(contact.email, othersSearchTerm) ||
      searchMatch(contact.phone, othersSearchTerm) ||
      searchMatch(contact.city, othersSearchTerm) ||
      searchMatch(activities, othersSearchTerm)
    );
  });

  // Sort filtered others alphabetically by name
  const sortedOthers = [...filteredOthers].sort((a, b) => {
    const nameA = a.contact ? `${a.contact.name} ${a.contact.surname || ''}`.toLowerCase() : '';
    const nameB = b.contact ? `${b.contact.name} ${b.contact.surname || ''}`.toLowerCase() : '';
    return nameA.localeCompare(nameB);
  });

  // Group others by professional activity
  const othersGroupedByActivity = () => {
    const groups: { activity: ProfessionalActivity | null; contacts: BudgetContact[] }[] = [];
    const contactsWithActivity = new Set<string>();

    // First, group by each activity
    professionalActivities.forEach(activity => {
      const contactsInActivity = sortedOthers.filter(bc => 
        bc.contact?.professional_activities?.some(a => a.id === activity.id)
      );
      
      if (contactsInActivity.length > 0) {
        groups.push({ activity, contacts: contactsInActivity });
        contactsInActivity.forEach(bc => contactsWithActivity.add(bc.id));
      }
    });

    // Add contacts without any activity
    const contactsWithoutActivity = sortedOthers.filter(bc => !contactsWithActivity.has(bc.id) || bc.contact?.professional_activities?.length === 0);
    if (contactsWithoutActivity.length > 0) {
      groups.push({ activity: null, contacts: contactsWithoutActivity });
    }

    return groups;
  };

  // Available contacts (not already linked as client/provider/other respectively)
  const availableClients = allContacts.filter(
    c => !clients.some(bc => bc.contact_id === c.id)
  );
  const availableProviders = allContacts.filter(
    c => !providers.some(bc => bc.contact_id === c.id)
  );
  const availableOthers = allContacts.filter(
    c => !others.some(bc => bc.contact_id === c.id)
  );

  const ContactList = ({ contacts, role }: { contacts: BudgetContact[], role: 'cliente' | 'proveedor' | 'otros' }) => (
    <div className="space-y-2">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No hay {role === 'cliente' ? 'clientes' : role === 'proveedor' ? 'proveedores' : 'contactos'} asignados
        </p>
      ) : (
        contacts.map((bc) => (
          <ContactCard key={bc.id} bc={bc} role={role} />
        ))
      )}
    </div>
  );

  const ContactCard = ({ bc, role }: { bc: BudgetContact, role: 'cliente' | 'proveedor' | 'otros' }) => (
    <div 
      className="flex items-center gap-3 p-3 bg-card border rounded-lg group"
    >
      <Avatar className="h-9 w-9">
        <AvatarFallback className={`text-xs ${
          role === 'cliente' 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
            : role === 'proveedor'
              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        }`}>
          {bc.contact ? getInitials(bc.contact.name, bc.contact.surname) : '??'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {bc.contact ? `${bc.contact.name} ${bc.contact.surname || ''}` : 'Contacto no encontrado'}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {bc.contact?.professional_activities && bc.contact.professional_activities.length > 0 && (
            <span className="text-primary font-medium">
              {bc.contact.professional_activities.map(a => a.name).join(', ')}
            </span>
          )}
          {bc.contact?.email && (
            <>
              {bc.contact?.professional_activities && bc.contact.professional_activities.length > 0 && <span>•</span>}
              <span className="truncate max-w-[150px]">{bc.contact.email}</span>
            </>
          )}
          {bc.contact?.phone && (
            <>
              <span>•</span>
              <PhoneLink phone={bc.contact.phone} />
            </>
          )}
          {bc.contact?.city && <span>• {bc.contact.city}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {bc.contact?.phone && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-600 hover:text-green-700"
              onClick={(e) => {
                e.stopPropagation();
                if (bc.contact) {
                  handleSendWhatsApp(bc.contact);
                }
              }}
              title="Enviar WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-purple-600 hover:text-purple-700"
              onClick={(e) => {
                e.stopPropagation();
                if (bc.contact) {
                  handleSendSMS(bc.contact);
                }
              }}
              title="Enviar SMS"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </>
        )}
        {bc.contact?.email && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              if (bc.contact) {
                setEmailContact(bc.contact);
                setEmailDialogOpen(true);
              }
            }}
            title="Enviar email"
          >
            <Mail className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            if (bc.contact) {
              setEditContact(bc.contact);
              setEditDialogOpen(true);
            }
          }}
          title="Editar contacto"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => handleRemoveContact(bc.id, role)}
            title="Eliminar de presupuesto"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contactos del Presupuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Contactos del Presupuesto
          </CardTitle>
          <CardDescription>
            Vincula contactos del CRM a este presupuesto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Clients Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800">
                <Users className="h-3 w-3 mr-1" />
                Clientes ({clients.length})
              </Badge>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => openNewContactDialog('cliente')}
                  className="text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Nuevo Contacto
                </Button>
              )}
            </div>
            
            {isAdmin && (
              <div className="flex gap-2">
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClients.length === 0 ? (
                      <SelectItem value="none" disabled>No hay contactos disponibles</SelectItem>
                    ) : (
                      availableClients.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name} {contact.surname} ({contact.contact_type})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => handleAddContact('cliente')} 
                  disabled={isAddingClient || !selectedClientId}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Añadir
                </Button>
              </div>
            )}
            
            <ContactList contacts={clients} role="cliente" />
          </div>

          <Separator />

          {/* Providers Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
                <Building2 className="h-3 w-3 mr-1" />
                Proveedores ({providers.length})
              </Badge>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => openNewContactDialog('proveedor')}
                  className="text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Nuevo Contacto
                </Button>
              )}
            </div>
            
            {isAdmin && (
              <div className="flex gap-2">
                <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar proveedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.length === 0 ? (
                      <SelectItem value="none" disabled>No hay contactos disponibles</SelectItem>
                    ) : (
                      availableProviders.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name} {contact.surname} ({contact.contact_type})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => handleAddContact('proveedor')} 
                  disabled={isAddingProvider || !selectedProviderId}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Añadir
                </Button>
              </div>
            )}
            
            <ContactList contacts={providers} role="proveedor" />
          </div>

          <Separator />

          {/* Other Contacts Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                <UserPlus className="h-3 w-3 mr-1" />
                Otros Contactos ({others.length})
              </Badge>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => openNewContactDialog('otros')}
                  className="text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Nuevo Contacto
                </Button>
              )}
            </div>
            
            {isAdmin && (
              <div className="flex gap-2">
                <Select value={selectedOtherId} onValueChange={setSelectedOtherId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar contacto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOthers.length === 0 ? (
                      <SelectItem value="none" disabled>No hay contactos disponibles</SelectItem>
                    ) : (
                      availableOthers.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name} {contact.surname} ({contact.contact_type})
                          {contact.professional_activities && contact.professional_activities.length > 0 && (
                            <span className="text-muted-foreground ml-1">
                              - {contact.professional_activities.map(a => a.name).join(', ')}
                            </span>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => handleAddContact('otros')} 
                  disabled={isAddingOther || !selectedOtherId}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Añadir
                </Button>
              </div>
            )}
            
            {others.length > 0 && (
              <div className="space-y-3">
                {/* Search filter */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o actividad..."
                    value={othersSearchTerm}
                    onChange={(e) => setOthersSearchTerm(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {othersSearchTerm && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setOthersSearchTerm('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {filteredOthers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    No se encontraron contactos con "{othersSearchTerm}"
                  </p>
                ) : (
                  <Tabs defaultValue="alphabetical" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 h-8">
                      <TabsTrigger value="alphabetical" className="text-xs flex items-center gap-1">
                        <List className="h-3 w-3" />
                        Alfabético ({sortedOthers.length})
                      </TabsTrigger>
                      <TabsTrigger value="grouped" className="text-xs flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        Por Actividad
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="alphabetical" className="mt-3">
                      <ContactList contacts={sortedOthers} role="otros" />
                    </TabsContent>
                    
                    <TabsContent value="grouped" className="mt-3 space-y-2">
                      {othersGroupedByActivity().map((group) => (
                        <Collapsible 
                          key={group.activity?.id || 'no-activity'}
                          open={expandedActivities.has(group.activity?.id || 'no-activity')}
                          onOpenChange={() => toggleActivityExpanded(group.activity?.id || 'no-activity')}
                        >
                          <CollapsibleTrigger className="flex items-center justify-between w-full p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {group.contacts.length}
                              </Badge>
                              <span className="font-medium text-sm">
                                {group.activity?.name || 'Sin actividad profesional'}
                              </span>
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${
                              expandedActivities.has(group.activity?.id || 'no-activity') ? 'rotate-180' : ''
                            }`} />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 pl-2">
                            <ContactList contacts={group.contacts} role="otros" />
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            )}
            
            {others.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                No hay otros contactos asignados
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <ContactForm 
        open={showNewContactDialog} 
        onOpenChange={setShowNewContactDialog}
        contact={null}
        onSuccess={handleNewContactSaved}
      />

      {/* Send Email Dialog */}
      <SendEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        contact={emailContact ? {
          id: emailContact.id,
          name: emailContact.name,
          surname: emailContact.surname,
          email: emailContact.email
        } : undefined}
        budgetId={budgetId}
      />

      {/* Edit Contact Form */}
      <ContactForm
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditContact(null);
            fetchData(); // Refresh data after edit
          }
        }}
        contact={editContact ? {
          id: editContact.id,
          name: editContact.name,
          surname: editContact.surname,
          email: editContact.email,
          phone: editContact.phone,
          contact_type: editContact.contact_type,
          city: editContact.city,
          status: 'active',
          created_at: null,
          address: null,
          province: null,
          postal_code: null,
          country: null,
          nif_dni: null,
          website: null,
          observations: null,
          tags: null,
          professional_activity_id: null,
          secondary_phones: null,
          secondary_emails: null
        } : null}
        onSuccess={() => {
          setEditDialogOpen(false);
          setEditContact(null);
          fetchData();
        }}
      />

      {/* WhatsApp Compose Dialog */}
      <WhatsAppComposeDialog
        open={whatsappDialogOpen}
        onOpenChange={setWhatsappDialogOpen}
        contact={whatsappContact}
        budgetId={budgetId}
      />

      {/* SMS Compose Dialog */}
      <SMSComposeDialog
        open={smsDialogOpen}
        onOpenChange={setSmsDialogOpen}
        contact={smsContact}
        budgetId={budgetId}
      />
    </>
  );
}
