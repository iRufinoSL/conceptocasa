import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Target, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Opportunity, Contact } from '@/pages/CRM';

interface OpportunitiesTabProps {
  opportunities: Opportunity[];
  contacts: Contact[];
  searchTerm: string;
}

export function OpportunitiesTab({ opportunities, contacts, searchTerm }: OpportunitiesTabProps) {
  const filteredOpportunities = useMemo(() => {
    if (!searchTerm) return opportunities;
    const term = searchTerm.toLowerCase();
    return opportunities.filter(opp =>
      opp.name.toLowerCase().includes(term) ||
      opp.description?.toLowerCase().includes(term)
    );
  }, [opportunities, searchTerm]);

  const getContact = (contactId: string | null) => {
    if (!contactId) return null;
    return contacts.find(c => c.id === contactId);
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  if (filteredOpportunities.length === 0) {
    return (
      <Card className="py-16">
        <CardContent className="text-center">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No se encontraron oportunidades' : 'No hay oportunidades registradas'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredOpportunities.map((opportunity) => {
        const contact = getContact(opportunity.contact_id);
        return (
          <Card
            key={opportunity.id}
            className="group cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all duration-200"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <Badge variant="secondary">Oportunidad</Badge>
              </div>
              <CardTitle className="text-base line-clamp-2 mt-2">
                {opportunity.name}
              </CardTitle>
              {opportunity.description && (
                <CardDescription className="line-clamp-2">
                  {opportunity.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {contact && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {contact.name} {contact.surname}
                    </p>
                    <p className="text-xs text-muted-foreground">{contact.contact_type}</p>
                  </div>
                </div>
              )}
              {!contact && opportunity.contact_id && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Contacto no encontrado</span>
                </div>
              )}
              {opportunity.created_at && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {format(new Date(opportunity.created_at), 'dd MMM yyyy', { locale: es })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
