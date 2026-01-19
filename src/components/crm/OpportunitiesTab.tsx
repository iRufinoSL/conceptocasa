import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Target, User, Calendar, MoreVertical, Pencil, Trash2, MapPin, Home, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { searchMatch } from '@/lib/search-utils';
import type { Opportunity, Contact } from '@/pages/CRM';
import { LandSearchCard } from '@/components/presupuestos/LandSearchCard';
import { useToast } from '@/hooks/use-toast';
import { ProjectProfileViewer } from '@/components/projects/ProjectProfileViewer';
import { ConvertToBudgetDialog } from './ConvertToBudgetDialog';

interface OpportunitiesTabProps {
  opportunities: Opportunity[];
  contacts: Contact[];
  searchTerm: string;
  onEdit: (opportunity: Opportunity) => void;
  onDelete: (opportunity: Opportunity) => void;
}

export function OpportunitiesTab({ opportunities, contacts, searchTerm, onEdit, onDelete }: OpportunitiesTabProps) {
  const { toast } = useToast();
  const [showLandSearch, setShowLandSearch] = useState(false);
  const [profileViewerOpen, setProfileViewerOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<{ projectId: string; name: string } | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [opportunityToConvert, setOpportunityToConvert] = useState<{ id: string; name: string; projectId: string } | null>(null);

  const filteredOpportunities = useMemo(() => {
    if (!searchTerm) return opportunities;
    return opportunities.filter(opp =>
      searchMatch(opp.name, searchTerm) ||
      searchMatch(opp.description, searchTerm)
    );
  }, [opportunities, searchTerm]);

  const getContact = (contactId: string | null) => {
    if (!contactId) return null;
    return contacts.find(c => c.id === contactId);
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const isHousingProfile = (opp: Opportunity) => {
    return opp.tags?.includes('Perfil de vivienda');
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
    <div className="space-y-6">
      {/* Marketing Actions Section */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Acciones de Marketing</CardTitle>
            </div>
          </div>
          <CardDescription>
            Herramientas para buscar terrenos y gestionar oportunidades comerciales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={showLandSearch ? "default" : "outline"}
              onClick={() => setShowLandSearch(!showLandSearch)}
              className="gap-2"
            >
              <MapPin className="h-4 w-4" />
              Buscador de Terrenos en Venta
            </Button>
          </div>
          
          {showLandSearch && (
            <LandSearchCard 
              onSelectListing={(listing) => {
                if (listing.cadastralReference) {
                  toast({
                    title: 'Terreno seleccionado',
                    description: `Referencia catastral: ${listing.cadastralReference}. Puedes crear una nueva oportunidad con este terreno.`,
                  });
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Opportunities Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredOpportunities.map((opportunity) => {
        const contact = getContact(opportunity.contact_id);
        return (
          <Card
            key={opportunity.id}
            className="group hover:shadow-lg hover:border-primary/50 transition-all duration-200"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {opportunity.tags && opportunity.tags.length > 0 ? (
                    opportunity.tags.map((tag, index) => (
                      <Badge 
                        key={index} 
                        variant={tag === 'Perfil de vivienda' ? 'default' : 'secondary'}
                        className={tag === 'Perfil de vivienda' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                      >
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary">Oportunidad</Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(opportunity)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(opportunity)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CardTitle className="text-base line-clamp-2 mt-2">
                {opportunity.name}
              </CardTitle>
              {isHousingProfile(opportunity) && opportunity.project_id && (
                <div className="mt-2 space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full gap-2 text-emerald-600 hover:text-emerald-700 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setSelectedOpportunity({ projectId: opportunity.project_id!, name: opportunity.name });
                      setProfileViewerOpen(true);
                    }}
                  >
                    <Home className="h-4 w-4" />
                    Ver Perfil de Vivienda
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="w-full gap-2"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setOpportunityToConvert({ 
                        id: opportunity.id, 
                        name: opportunity.name, 
                        projectId: opportunity.project_id! 
                      });
                      setConvertDialogOpen(true);
                    }}
                  >
                    <Calculator className="h-4 w-4" />
                    Convertir en Presupuesto
                  </Button>
                </div>
              )}
              {opportunity.description && !isHousingProfile(opportunity) && (
                <CardDescription className="line-clamp-2">
                  {opportunity.description}
                </CardDescription>
              )}
              {isHousingProfile(opportunity) && !opportunity.project_id && (
                <div className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                  Esta oportunidad no tiene un perfil de proyecto asociado.
                </div>
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

      {/* Profile Viewer Dialog */}
      {selectedOpportunity && (
        <ProjectProfileViewer
          open={profileViewerOpen}
          onOpenChange={setProfileViewerOpen}
          projectId={selectedOpportunity.projectId}
          projectName={selectedOpportunity.name}
        />
      )}

      {/* Convert to Budget Dialog */}
      {opportunityToConvert && (
        <ConvertToBudgetDialog
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          opportunityId={opportunityToConvert.id}
          opportunityName={opportunityToConvert.name}
          projectId={opportunityToConvert.projectId}
          onSuccess={() => {
            toast({
              title: 'Oportunidad convertida',
              description: 'Se ha creado el presupuesto y el proyecto está ahora activo.',
            });
          }}
        />
      )}
    </div>
  );
}
