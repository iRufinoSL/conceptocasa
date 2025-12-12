import { ExternalResource, ResourceType } from '@/types/resource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, ExternalLink, Package, Users, Clock, Wrench, Boxes, Cog } from 'lucide-react';

interface ResourceListProps {
  resources: ExternalResource[];
  onEdit: (resource: ExternalResource) => void;
  onDelete: (id: string) => void;
}

const resourceTypeVariants: Record<ResourceType, "producto" | "manoDeObra" | "alquiler" | "servicio" | "material" | "equipo"> = {
  'Producto': 'producto',
  'Mano de obra': 'manoDeObra',
  'Alquiler': 'alquiler',
  'Servicio': 'servicio',
  'Material': 'material',
  'Equipo': 'equipo',
};

const resourceTypeIcons: Record<ResourceType, React.ReactNode> = {
  'Producto': <Package className="h-3.5 w-3.5" />,
  'Mano de obra': <Users className="h-3.5 w-3.5" />,
  'Alquiler': <Clock className="h-3.5 w-3.5" />,
  'Servicio': <Wrench className="h-3.5 w-3.5" />,
  'Material': <Boxes className="h-3.5 w-3.5" />,
  'Equipo': <Cog className="h-3.5 w-3.5" />,
};

export function ResourceList({ resources, onEdit, onDelete }: ResourceListProps) {
  // Sort alphabetically by name
  const sortedResources = [...resources].sort((a, b) => 
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[80px]">ID</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden md:table-cell">Descripción</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Coste</TableHead>
            <TableHead className="hidden sm:table-cell">Ud.</TableHead>
            <TableHead className="w-[120px] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedResources.map((resource, index) => (
            <TableRow 
              key={resource.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {resource.id}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  {resource.imageUrl ? (
                    <img
                      src={resource.imageUrl}
                      alt={resource.name}
                      className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      {resourceTypeIcons[resource.resourceType]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{resource.name}</p>
                    {resource.website && (
                      <a
                        href={resource.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Web
                      </a>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <p className="text-sm text-muted-foreground line-clamp-2 max-w-[300px]">
                  {resource.description}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={resourceTypeVariants[resource.resourceType]} className="gap-1 whitespace-nowrap">
                  {resourceTypeIcons[resource.resourceType]}
                  <span className="hidden lg:inline">{resource.resourceType}</span>
                </Badge>
              </TableCell>
              <TableCell className="text-right font-semibold whitespace-nowrap">
                {resource.unitCost.toLocaleString('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground">
                {resource.unitMeasure}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(resource)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(resource.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sortedResources.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No se encontraron recursos
        </div>
      )}
    </div>
  );
}
