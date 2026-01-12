import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { X, Plus, Briefcase, Users, FileText, Search, Mail, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Contact } from '@/pages/CRM';

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

interface RelatedBudget {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
  contact_role: string;
}

interface AvailableBudget {
  id: string;
  nombre: string;
  codigo_correlativo: number;
  version: string;
  poblacion: string;
}

interface ContactCommunication {
  id: string;
  subject: string | null;
  direction: string;
  status: string;
  created_at: string;
  from_email: string;
  to_emails: string[];
  body_html: string | null;
  body_text: string | null;
  presupuestos?: {
    id: string;
    nombre: string;
    codigo_correlativo: number;
  } | null;
  email_attachments?: {
    id: string;
    file_name: string;
    file_type: string | null;
  }[];
}

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess: (newContactId?: string) => void;
}

export function ContactForm({ open, onOpenChange, contact, onSuccess }: ContactFormProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [activities, setActivities] = useState<ProfessionalActivity[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [allContacts, setAllContacts] = useState<RelatedContact[]>([]);
  const [selectedRelatedContactIds, setSelectedRelatedContactIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newActivityName, setNewActivityName] = useState('');
  const [showNewActivity, setShowNewActivity] = useState(false);
  
  // Search terms for related sections
  const [activitySearchTerm, setActivitySearchTerm] = useState('');
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  
  // Budgets
  const [relatedBudgets, setRelatedBudgets] = useState<RelatedBudget[]>([]);
  const [availableBudgets, setAvailableBudgets] = useState<AvailableBudget[]>([]);
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [budgetSearchTerm, setBudgetSearchTerm] = useState('');
  
  // Communications
  const [contactCommunications, setContactCommunications] = useState<ContactCommunication[]>([]);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<ContactCommunication | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '+34 ',
    contact_type: 'Persona',
    status: 'Prospecto',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'España',
    nif_dni: '',
    website: '',
    observations: '',
    tags: [] as string[]
  });

  useEffect(() => {
    const fetchData = async () => {
      // Fetch professional activities
      const { data: activitiesData } = await supabase
        .from('crm_professional_activities')
        .select('*')
        .order('name');
      if (activitiesData) setActivities(activitiesData);
      
      // Fetch all contacts for related contacts selection
      const { data: contactsData } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, contact_type')
        .order('name');
      if (contactsData) setAllContacts(contactsData);

      // Fetch all budgets for selection
      const { data: budgetsData } = await supabase
        .from('presupuestos')
        .select('id, nombre, codigo_correlativo, version, poblacion')
        .eq('archived', false)
        .order('codigo_correlativo', { ascending: false });
      if (budgetsData) setAvailableBudgets(budgetsData);
    };
    if (open) fetchData();
  }, [open]);

  useEffect(() => {
    if (contact && open) {
      // Fetch full contact data, activities, and related contacts
      const fetchContactData = async () => {
        const { data: fullContact } = await supabase
          .from('crm_contacts')
          .select('*')
          .eq('id', contact.id)
          .single();
        
        if (fullContact) {
          setFormData({
            name: fullContact.name || '',
            surname: fullContact.surname || '',
            email: fullContact.email || '',
            phone: fullContact.phone || '+34 ',
            contact_type: fullContact.contact_type || 'Persona',
            status: fullContact.status || 'Prospecto',
            address: fullContact.address || '',
            city: fullContact.city || '',
            province: fullContact.province || '',
            postal_code: fullContact.postal_code || '',
            country: fullContact.country || 'España',
            nif_dni: fullContact.nif_dni || '',
            website: fullContact.website || '',
            observations: fullContact.observations || '',
            tags: fullContact.tags || []
          });
        }

        // Fetch contact's professional activities
        const { data: contactActivities } = await supabase
          .from('crm_contact_professional_activities')
          .select('professional_activity_id')
          .eq('contact_id', contact.id);
        
        if (contactActivities) {
          setSelectedActivityIds(contactActivities.map(ca => ca.professional_activity_id));
        }

        // Fetch contact's related contacts (bidirectional)
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
        setSelectedRelatedContactIds([...new Set(relatedIds)]);

        // Fetch related budgets
        const { data: budgetContacts } = await supabase
          .from('budget_contacts')
          .select(`
            contact_role,
            presupuestos:budget_id (
              id,
              nombre,
              codigo_correlativo,
              version,
              poblacion
            )
          `)
          .eq('contact_id', contact.id);

        if (budgetContacts) {
          const budgets: RelatedBudget[] = budgetContacts
            .filter(bc => bc.presupuestos)
            .map(bc => ({
              id: (bc.presupuestos as any).id,
              nombre: (bc.presupuestos as any).nombre,
              codigo_correlativo: (bc.presupuestos as any).codigo_correlativo,
              version: (bc.presupuestos as any).version,
              poblacion: (bc.presupuestos as any).poblacion,
              contact_role: bc.contact_role
            }));
          setRelatedBudgets(budgets);
          setSelectedBudgetIds(budgets.map(b => b.id));
        }

        // Fetch communications related to this contact
        const { data: communications } = await supabase
          .from('email_messages')
          .select(`
            id, subject, direction, status, created_at, from_email, to_emails, body_html, body_text,
            presupuestos (id, nombre, codigo_correlativo),
            email_attachments (id, file_name, file_type)
          `)
          .eq('contact_id', contact.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (communications) {
          setContactCommunications(communications as ContactCommunication[]);
        }
      };
      fetchContactData();
    } else if (!contact && open) {
      setFormData({
        name: '',
        surname: '',
        email: '',
        phone: '+34 ',
        contact_type: 'Persona',
        status: 'Prospecto',
        address: '',
        city: '',
        province: '',
        postal_code: '',
        country: 'España',
        nif_dni: '',
        website: '',
        observations: '',
        tags: []
      });
      setSelectedActivityIds([]);
      setSelectedRelatedContactIds([]);
      setRelatedBudgets([]);
      setSelectedBudgetIds([]);
      setActivitySearchTerm('');
      setContactSearchTerm('');
      setBudgetSearchTerm('');
      setContactCommunications([]);
    }
  }, [contact, open]);

  const toggleActivity = (activityId: string) => {
    setSelectedActivityIds(prev => 
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    );
  };

  const toggleRelatedContact = (contactId: string) => {
    setSelectedRelatedContactIds(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const toggleBudget = (budgetId: string) => {
    setSelectedBudgetIds(prev =>
      prev.includes(budgetId)
        ? prev.filter(id => id !== budgetId)
        : [...prev, budgetId]
    );
  };

  // Filter out current contact from available contacts
  const availableRelatedContacts = allContacts.filter(c => c.id !== contact?.id);
  
  // Filter activities by search term (only unselected for adding)
  const filteredActivities = activities.filter(a => {
    const searchLower = activitySearchTerm.toLowerCase().trim();
    return a.name.toLowerCase().includes(searchLower) && !selectedActivityIds.includes(a.id);
  });
  
  // Selected activities
  const selectedActivities = activities.filter(a => selectedActivityIds.includes(a.id));
  
  // Filter contacts by search term (only unselected for adding)
  const filteredContacts = availableRelatedContacts.filter(c => {
    const searchLower = contactSearchTerm.toLowerCase().trim();
    const fullName = `${c.name} ${c.surname || ''}`.toLowerCase();
    return fullName.includes(searchLower) && !selectedRelatedContactIds.includes(c.id);
  });
  
  // Selected contacts
  const selectedContacts = allContacts.filter(c => selectedRelatedContactIds.includes(c.id));
  
  // Filter budgets by search term (only unselected for adding)
  const filteredBudgets = availableBudgets.filter(b => {
    const searchLower = budgetSearchTerm.toLowerCase();
    const matchesSearch = (
      b.nombre.toLowerCase().includes(searchLower) ||
      b.poblacion.toLowerCase().includes(searchLower) ||
      `${b.codigo_correlativo}`.includes(searchLower)
    );
    return matchesSearch && !selectedBudgetIds.includes(b.id);
  });
  
  // Selected budgets
  const selectedBudgetsData = availableBudgets.filter(b => selectedBudgetIds.includes(b.id));

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  const handleAddNewActivity = async () => {
    const name = newActivityName.trim();
    if (!name) return;

    try {
      const { data, error } = await supabase
        .from('crm_professional_activities')
        .insert({ name })
        .select()
        .single();

      if (error) throw error;

      setActivities([...activities, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedActivityIds([...selectedActivityIds, data.id]);
      setNewActivityName('');
      setShowNewActivity(false);
      toast({ title: 'Actividad profesional creada' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const dataToSave = {
        name: formData.name.trim(),
        surname: formData.surname.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        contact_type: formData.contact_type,
        status: formData.status,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        province: formData.province.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        country: formData.country.trim() || null,
        nif_dni: formData.nif_dni.trim() || null,
        website: formData.website.trim() || null,
        observations: formData.observations.trim() || null,
        tags: formData.tags.length > 0 ? formData.tags : null
      };

      let contactId = contact?.id;

      if (contact) {
        const { error } = await supabase
          .from('crm_contacts')
          .update(dataToSave)
          .eq('id', contact.id);

        if (error) throw error;
      } else {
        const { data: newContact, error } = await supabase
          .from('crm_contacts')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        contactId = newContact.id;
      }

      // Update professional activities (many-to-many)
      if (contactId) {
        // Delete existing activity links
        await supabase
          .from('crm_contact_professional_activities')
          .delete()
          .eq('contact_id', contactId);

        // Insert new activity links
        if (selectedActivityIds.length > 0) {
          const activityLinks = selectedActivityIds.map(activityId => ({
            contact_id: contactId!,
            professional_activity_id: activityId
          }));

          const { error: linkError } = await supabase
            .from('crm_contact_professional_activities')
            .insert(activityLinks);

          if (linkError) throw linkError;
        }

        // Update contact relations (bidirectional)
        // First delete all existing relations for this contact
        await supabase
          .from('crm_contact_relations')
          .delete()
          .eq('contact_id_a', contactId);
        
        await supabase
          .from('crm_contact_relations')
          .delete()
          .eq('contact_id_b', contactId);

        // Insert new relations (only in one direction to avoid duplicates)
        if (selectedRelatedContactIds.length > 0) {
          const relationLinks = selectedRelatedContactIds.map(relatedId => ({
            contact_id_a: contactId!,
            contact_id_b: relatedId
          }));

          const { error: relationError } = await supabase
            .from('crm_contact_relations')
            .insert(relationLinks);

          if (relationError) throw relationError;
        }

        // Update budget relations
        // Delete existing budget_contacts for this contact with 'otros' role
        await supabase
          .from('budget_contacts')
          .delete()
          .eq('contact_id', contactId)
          .eq('contact_role', 'otros');

        // Insert new budget relations with 'otros' role
        if (selectedBudgetIds.length > 0) {
          const budgetLinks = selectedBudgetIds.map(budgetId => ({
            budget_id: budgetId,
            contact_id: contactId!,
            contact_role: 'otros'
          }));

          const { error: budgetError } = await supabase
            .from('budget_contacts')
            .insert(budgetLinks);

          if (budgetError) throw budgetError;
        }
      }

      toast({ title: contact ? 'Contacto actualizado correctamente' : 'Contacto creado correctamente' });
      onSuccess(contactId);
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname">Apellidos</Label>
              <Input
                id="surname"
                value={formData.surname}
                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                placeholder="Apellidos"
                maxLength={100}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_type">Tipo</Label>
              <Select value={formData.contact_type} onValueChange={(v) => setFormData({ ...formData, contact_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Persona">Persona</SelectItem>
                  <SelectItem value="Empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Prospecto">Prospecto</SelectItem>
                  <SelectItem value="Cliente">Cliente</SelectItem>
                  <SelectItem value="Proveedor">Proveedor</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Professional Activities (Multiple) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Actividades Profesionales
              {selectedActivityIds.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{selectedActivityIds.length}</Badge>
              )}
            </Label>
            {!showNewActivity ? (
              <div className="space-y-3">
                {/* Selected activities */}
                {selectedActivities.length > 0 && (
                  <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-md">
                    {selectedActivities.map(activity => (
                      <Badge key={activity.id} variant="secondary" className="gap-1">
                        {activity.name}
                        <button
                          type="button"
                          onClick={() => toggleActivity(activity.id)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                
                {/* Search to add activities */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar actividad profesional..."
                    value={activitySearchTerm}
                    onChange={(e) => setActivitySearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                {activitySearchTerm && (
                  <ScrollArea className="h-28 rounded-md border p-2">
                    {filteredActivities.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">No se encontraron actividades</p>
                    ) : (
                      <div className="space-y-1">
                        {filteredActivities.map(activity => (
                          <div 
                            key={activity.id} 
                            className="flex items-center space-x-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                            onClick={() => {
                              toggleActivity(activity.id);
                              setActivitySearchTerm('');
                            }}
                          >
                            <Plus className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{activity.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
                
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewActivity(true)} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Actividad
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                  placeholder="Nueva actividad (ej: Arquitecto, Almacén...)"
                  maxLength={100}
                />
                <Button type="button" variant="default" onClick={handleAddNewActivity}>
                  Añadir
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowNewActivity(false); setNewActivityName(''); }}>
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          {/* Related Contacts */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contactos Relacionados
              {selectedRelatedContactIds.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{selectedRelatedContactIds.length}</Badge>
              )}
            </Label>
            <div className="space-y-3">
              {/* Selected contacts */}
              {selectedContacts.length > 0 && (
                <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-md">
                  {selectedContacts.map(relContact => (
                    <Badge key={relContact.id} variant="secondary" className="gap-1">
                      {relContact.name} {relContact.surname}
                      <button
                        type="button"
                        onClick={() => toggleRelatedContact(relContact.id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Search to add contacts */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar contacto por nombre..."
                  value={contactSearchTerm}
                  onChange={(e) => setContactSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {contactSearchTerm && (
                <ScrollArea className="h-28 rounded-md border p-2">
                  {filteredContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">No se encontraron contactos</p>
                  ) : (
                    <div className="space-y-1">
                      {filteredContacts.map(relContact => (
                        <div 
                          key={relContact.id} 
                          className="flex items-center space-x-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                          onClick={() => {
                            toggleRelatedContact(relContact.id);
                            setContactSearchTerm('');
                          }}
                        >
                          <Plus className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{relContact.name} {relContact.surname}</span>
                          <Badge variant="outline" className="text-xs ml-auto">
                            {relContact.contact_type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Related Budgets */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Presupuestos Relacionados
              {selectedBudgetIds.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{selectedBudgetIds.length}</Badge>
              )}
            </Label>
            <div className="space-y-3">
              {/* Selected budgets */}
              {selectedBudgetsData.length > 0 && (
                <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-md">
                  {selectedBudgetsData.map(budget => (
                    <Badge 
                      key={budget.id} 
                      variant="secondary" 
                      className="gap-1 cursor-pointer hover:bg-secondary/80"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/presupuestos/${budget.id}`);
                      }}
                    >
                      {budget.codigo_correlativo} - {budget.nombre}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBudget(budget.id);
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Search to add budgets */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar presupuesto por nombre, población o código..."
                  value={budgetSearchTerm}
                  onChange={(e) => setBudgetSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {budgetSearchTerm && (
                <ScrollArea className="h-28 rounded-md border p-2">
                  {filteredBudgets.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">No se encontraron presupuestos</p>
                  ) : (
                    <div className="space-y-1">
                      {filteredBudgets.map(budget => (
                        <div 
                          key={budget.id} 
                          className="flex items-center space-x-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                          onClick={() => {
                            toggleBudget(budget.id);
                            setBudgetSearchTerm('');
                          }}
                        >
                          <Plus className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground text-sm">{budget.codigo_correlativo}</span>
                          <span className="text-sm">{budget.nombre}</span>
                          <Badge variant="outline" className="text-xs ml-auto">
                            {budget.poblacion}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Communications - only shown when editing an existing contact */}
          {contact && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Comunicaciones
                {contactCommunications.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{contactCommunications.length}</Badge>
                )}
              </Label>
              {contactCommunications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No hay comunicaciones registradas con este contacto.
                </p>
              ) : (
                <ScrollArea className="h-48 rounded-md border">
                  <div className="p-2 space-y-2">
                    {contactCommunications.map(comm => (
                      <button 
                        key={comm.id}
                        type="button"
                        onClick={() => setSelectedEmailDetail(comm)}
                        className="w-full flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer text-left transition-colors"
                      >
                        <div className={`mt-0.5 ${comm.direction === 'inbound' ? 'text-green-600' : 'text-blue-600'}`}>
                          {comm.direction === 'inbound' ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {comm.subject || '(Sin asunto)'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {comm.direction === 'inbound' 
                              ? `De: ${comm.from_email}`
                              : `Para: ${comm.to_emails?.join(', ') || 'Desconocido'}`
                            }
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{format(new Date(comm.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}</span>
                            {comm.presupuestos && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                P{comm.presupuestos.codigo_correlativo}
                              </Badge>
                            )}
                            {comm.email_attachments && comm.email_attachments.length > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {comm.email_attachments.length} adj.
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs shrink-0 ${
                            comm.status === 'sent' ? 'text-blue-600' :
                            comm.status === 'received' ? 'text-green-600' :
                            comm.status === 'failed' ? 'text-red-600' :
                            'text-muted-foreground'
                          }`}
                        >
                          {comm.status === 'sent' ? 'Enviado' :
                           comm.status === 'received' ? 'Recibido' :
                           comm.status === 'failed' ? 'Fallido' :
                           comm.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="space-y-2">
            <Label>Etiquetas</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Nueva etiqueta..."
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@ejemplo.com"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+34 600 000 000"
                maxLength={20}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Calle, número, piso..."
              maxLength={255}
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Ciudad"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Provincia</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="Provincia"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">C.P.</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="28001"
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="España"
                maxLength={100}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nif_dni">NIF/DNI</Label>
              <Input
                id="nif_dni"
                value={formData.nif_dni}
                onChange={(e) => setFormData({ ...formData, nif_dni: e.target.value })}
                placeholder="12345678A"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Web</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://..."
                maxLength={255}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observations">Observaciones</Label>
            <Textarea
              id="observations"
              value={formData.observations}
              onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              placeholder="Notas adicionales..."
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : contact ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    
    {/* Email Detail Dialog */}
    <Dialog open={!!selectedEmailDetail} onOpenChange={(open) => !open && setSelectedEmailDetail(null)}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {selectedEmailDetail?.subject || '(Sin asunto)'}
          </DialogTitle>
        </DialogHeader>
        
        {selectedEmailDetail && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Email metadata */}
            <div className="space-y-2 text-sm border-b pb-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {selectedEmailDetail.direction === 'inbound' ? 'De:' : 'Para:'}
                </span>
                <span className="font-medium">
                  {selectedEmailDetail.direction === 'inbound' 
                    ? selectedEmailDetail.from_email 
                    : selectedEmailDetail.to_emails?.join(', ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fecha:</span>
                <span>{format(new Date(selectedEmailDetail.created_at), "d MMMM yyyy 'a las' HH:mm", { locale: es })}</span>
              </div>
              {selectedEmailDetail.presupuestos && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Presupuesto:</span>
                  <Badge variant="outline" className="bg-primary/10">
                    P{selectedEmailDetail.presupuestos.codigo_correlativo} - {selectedEmailDetail.presupuestos.nombre}
                  </Badge>
                </div>
              )}
              {selectedEmailDetail.email_attachments && selectedEmailDetail.email_attachments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <span className="text-muted-foreground text-xs">Adjuntos:</span>
                  {selectedEmailDetail.email_attachments.map(att => (
                    <Badge key={att.id} variant="secondary" className="text-xs gap-1">
                      <FileText className="h-3 w-3" />
                      {att.file_name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            {/* Email body */}
            <ScrollArea className="flex-1 min-h-0">
              <div 
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ 
                  __html: selectedEmailDetail.body_html || selectedEmailDetail.body_text?.replace(/\n/g, '<br>') || '<p class="text-muted-foreground">(Sin contenido)</p>' 
                }}
              />
            </ScrollArea>
            
            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setSelectedEmailDetail(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
