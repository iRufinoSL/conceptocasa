import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Mail, Phone, MapPin, Users, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { Contact } from '@/pages/CRM';

interface ContactsTabProps {
  contacts: Contact[];
  searchTerm: string;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

export function ContactsTab({ contacts, searchTerm, onEdit, onDelete }: ContactsTabProps) {
  const filteredContacts = useMemo(() => {
    let result = [...contacts];
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(contact =>
        contact.name.toLowerCase().includes(term) ||
        contact.surname?.toLowerCase().includes(term) ||
        contact.email?.toLowerCase().includes(term) ||
        contact.city?.toLowerCase().includes(term)
      );
    }
    
    // Sort alphabetically by name + surname
    result.sort((a, b) => {
      const nameA = `${a.name} ${a.surname || ''}`.toLowerCase().trim();
      const nameB = `${b.name} ${b.surname || ''}`.toLowerCase().trim();
      return nameA.localeCompare(nameB, 'es');
    });
    
    return result;
  }, [contacts, searchTerm]);

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredContacts.map((contact) => (
        <Card
          key={contact.id}
          className="group hover:shadow-lg hover:border-primary/50 transition-all duration-200"
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
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
                </div>
                <div className="flex gap-2 mt-1">
                  <Badge variant={getTypeVariant(contact.contact_type)} className="text-xs">
                    {contact.contact_type}
                  </Badge>
                  <Badge variant={getStatusVariant(contact.status)} className="text-xs">
                    {contact.status}
                  </Badge>
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
      ))}
    </div>
  );
}
