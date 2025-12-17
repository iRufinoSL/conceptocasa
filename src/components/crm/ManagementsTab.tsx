import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, Clock, ClipboardList, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { searchMatch } from '@/lib/search-utils';
import type { Management } from '@/pages/CRM';

interface ManagementsTabProps {
  managements: Management[];
  searchTerm: string;
  onEdit: (management: Management) => void;
  onDelete: (management: Management) => void;
}

export function ManagementsTab({ managements, searchTerm, onEdit, onDelete }: ManagementsTabProps) {
  const filteredManagements = useMemo(() => {
    if (!searchTerm) return managements;
    return managements.filter(management =>
      searchMatch(management.title, searchTerm) ||
      searchMatch(management.description, searchTerm)
    );
  }, [managements, searchTerm]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Completado': return 'default';
      case 'En progreso': return 'secondary';
      case 'Pendiente': return 'outline';
      case 'Cancelado': return 'destructive';
      default: return 'secondary';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Reunión': return '🤝';
      case 'Llamada': return '📞';
      case 'Email': return '📧';
      case 'Visita': return '🏠';
      case 'Tarea': return '✅';
      default: return '📋';
    }
  };

  if (filteredManagements.length === 0) {
    return (
      <Card className="py-16">
        <CardContent className="text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No se encontraron gestiones' : 'No hay gestiones registradas'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredManagements.map((management) => (
        <Card
          key={management.id}
          className="group hover:shadow-lg hover:border-primary/50 transition-all duration-200"
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getTypeIcon(management.management_type)}</span>
                <Badge variant="outline" className="text-xs">
                  {management.management_type}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={getStatusVariant(management.status)}>
                  {management.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(management)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(management)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <CardTitle className="text-base line-clamp-2 mt-2">
              {management.title}
            </CardTitle>
            {management.description && (
              <CardDescription className="line-clamp-2">
                {management.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {management.target_date && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(new Date(management.target_date), 'dd MMM yyyy', { locale: es })}
                </span>
              </div>
            )}
            {management.start_time && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {management.start_time.slice(0, 5)}
                  {management.end_time && ` - ${management.end_time.slice(0, 5)}`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
