import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Mail, Phone, MapPin, Users, MoreVertical, Pencil, Trash2, LayoutGrid, List, FolderOpen, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ContactDetailDialog } from './ContactDetailDialog';
import type { Contact } from '@/pages/CRM';

type ViewMode = 'cards' | 'list' | 'grouped';

interface ProfessionalActivity {
  id: string;
  name: string;
}

interface ContactsTabProps {
  contacts: Contact[];
  searchTerm: string;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

export function ContactsTab({ contacts, searchTerm, onEdit, onDelete }: ContactsTabProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('crm-contacts-view') as ViewMode) || 'cards';
  });
  const [activities, setActivities] = useState<ProfessionalActivity[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem('crm-contacts-view', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const fetchActivities = async () => {
      const { data } = await supabase
        .from('crm_professional_activities')
        .select('*')
        .order('name');
      if (data) setActivities(data);
    };
    fetchActivities();
  }, []);

  const filteredContacts = useMemo(() => {
    let result = [...contacts];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(contact =>
        contact.name.toLowerCase().includes(term) ||
        contact.surname?.toLowerCase().includes(term) ||
        contact.email?.toLowerCase().includes(term) ||
        contact.city?.toLowerCase().includes(term) ||
        contact.tags?.some(tag => tag.toLowerCase().includes(term))
      );
    }
    
    result.sort((a, b) => {
      const nameA = `${a.name} ${a.surname || ''}`.toLowerCase().trim();
      const nameB = `${b.name} ${b.surname || ''}`.toLowerCase().trim();
      return nameA.localeCompare(nameB, 'es');
    });
    
    return result;
  }, [contacts, searchTerm]);

  const groupedContacts = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    const noActivity: Contact[] = [];

    filteredContacts.forEach(contact => {
      if (contact.professional_activity_id) {
        const activity = activities.find(a => a.id === contact.professional_activity_id);
        const activityName = activity?.name || 'Sin actividad';
        if (!groups[activityName]) groups[activityName] = [];
        groups[activityName].push(contact);
      } else {
        noActivity.push(contact);
      }
    });

    // Sort groups alphabetically
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'es'));
    
    // Add "Sin actividad" at the end if there are contacts without activity
    if (noActivity.length > 0) {
      sortedGroups.push(['Sin actividad', noActivity]);
    }

    return sortedGroups;
  }, [filteredContacts, activities]);

  const toggleGroup = (group: string) => {
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

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Cliente': return 'default';
      case 'Prospecto': return 'secondary';
      case 'Inactivo': return 'outline';
      default: return 'secondary';
    }
  };

  const getTypeVariant = (type: string) => {
    return type === 'Empresa' ? 'default' : 'outline';
  };

  const getInitials = (name: string, surname?: string | null) => {
    const first = name.charAt(0).toUpperCase();
    const second = surname ? surname.charAt(0).toUpperCase() : name.charAt(1)?.toUpperCase() || '';
    return first + second;
  };

  const getActivityName = (activityId: string | null) => {
    if (!activityId) return null;
    return activities.find(a => a.id === activityId)?.name || null;
  };

  if (filteredContacts.length === 0) {
    return (
      <Card className="py-16">
        <CardContent className="text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No se encontraron contactos' : 'No hay contactos registrados'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex justify-end gap-1">
        <Button
          variant={viewMode === 'cards' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('cards')}
          className="gap-2"
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">Tarjetas</span>
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('list')}
          className="gap-2"
        >
          <List className="h-4 w-4" />
          <span className="hidden sm:inline">Lista</span>
        </Button>
        <Button
          variant={viewMode === 'grouped' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('grouped')}
          className="gap-2"
        >
          <FolderOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Por Actividad</span>
        </Button>
      </div>

      {/* Contact Detail Dialog */}
      <ContactDetailDialog
        contact={selectedContact}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewDetail={(c) => {
                setSelectedContact(c);
                setDetailOpen(true);
              }}
              getInitials={getInitials}
              getTypeVariant={getTypeVariant}
              getStatusVariant={getStatusVariant}
              getActivityName={getActivityName}
            />
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contacto</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Actividad</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {getInitials(contact.name, contact.surname)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{contact.name} {contact.surname}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.email || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.phone || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.city || '-'}</TableCell>
                  <TableCell>
                    {getActivityName(contact.professional_activity_id) ? (
                      <Badge variant="outline" className="text-xs">
                        {getActivityName(contact.professional_activity_id)}
                      </Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeVariant(contact.contact_type)} className="text-xs">
                      {contact.contact_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(contact.status)} className="text-xs">
                      {contact.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(contact)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(contact)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Grouped by Activity View */}
      {viewMode === 'grouped' && (
        <div className="space-y-2">
          {groupedContacts.map(([activityName, groupContacts]) => (
            <Collapsible
              key={activityName}
              open={expandedGroups.has(activityName)}
              onOpenChange={() => toggleGroup(activityName)}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ChevronRight 
                          className={`h-5 w-5 transition-transform ${
                            expandedGroups.has(activityName) ? 'rotate-90' : ''
                          }`}
                        />
                        <CardTitle className="text-base">{activityName}</CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          {groupContacts.length}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contacto</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Teléfono</TableHead>
                          <TableHead>Ciudad</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupContacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                    {getInitials(contact.name, contact.surname)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{contact.name} {contact.surname}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{contact.email || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{contact.phone || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{contact.city || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={getTypeVariant(contact.contact_type)} className="text-xs">
                                {contact.contact_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusVariant(contact.status)} className="text-xs">
                                {contact.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => onEdit(contact)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => onDelete(contact)} className="text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

// Card component extracted for reuse
function ContactCard({
  contact,
  onEdit,
  onDelete,
  onViewDetail,
  getInitials,
  getTypeVariant,
  getStatusVariant,
  getActivityName
}: {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onViewDetail: (contact: Contact) => void;
  getInitials: (name: string, surname?: string | null) => string;
  getTypeVariant: (type: string) => "default" | "outline";
  getStatusVariant: (status: string) => "default" | "secondary" | "outline";
  getActivityName: (activityId: string | null) => string | null;
}) {
  const activityName = getActivityName(contact.professional_activity_id);

  return (
    <Card 
      className="group hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer"
      onClick={() => onViewDetail(contact)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {getInitials(contact.name, contact.surname)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <CardTitle className="text-base line-clamp-1">
                {contact.name} {contact.surname}
              </CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(contact); }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(contact); }} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <Badge variant={getTypeVariant(contact.contact_type)} className="text-xs">
                {contact.contact_type}
              </Badge>
              <Badge variant={getStatusVariant(contact.status)} className="text-xs">
                {contact.status}
              </Badge>
              {activityName && (
                <Badge variant="outline" className="text-xs bg-primary/5">
                  {activityName}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {contact.email && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0" />
            <span>{contact.phone}</span>
          </div>
        )}
        {contact.city && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{contact.city}</span>
          </div>
        )}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{contact.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
