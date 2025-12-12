import { ExternalResource, ResourceType, getResourceComposition } from '@/types/resource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pencil, Trash2, ExternalLink, Package, Users, Clock, Wrench, Boxes, Cog, Layers, Square } from 'lucide-react';
import { openSafeUrl } from '@/lib/url-utils';

interface ResourceCardProps {
  resource: ExternalResource;
  onEdit: (resource: ExternalResource) => void;
  onDelete: (id: string) => void;
  effectiveCost: number;
  allResources: ExternalResource[];
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

export function ResourceCard({ resource, onEdit, onDelete, effectiveCost, allResources }: ResourceCardProps) {
  const composition = getResourceComposition(resource);
  const isComposite = composition === 'Compuesto';

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-card-hover animate-fade-in">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Image Section */}
          <div className="relative h-40 sm:h-auto sm:w-40 flex-shrink-0 bg-muted overflow-hidden">
            {resource.imageUrl ? (
              <img
                src={resource.imageUrl}
                alt={resource.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-muted to-secondary">
                {resourceTypeIcons[resource.resourceType]}
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="flex-1 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant={resourceTypeVariants[resource.resourceType]} className="gap-1">
                    {resourceTypeIcons[resource.resourceType]}
                    {resource.resourceType}
                  </Badge>
                  <Badge variant={isComposite ? "default" : "secondary"} className="gap-1">
                    {isComposite ? <Layers className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                    {composition}
                  </Badge>
                  <span className="text-xs text-muted-foreground">ID: {resource.id}</span>
                </div>
                <h3 className="font-semibold text-foreground truncate">{resource.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {resource.description}
                </p>
                
                {/* Related resources info */}
                {isComposite && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">Componentes:</span>{' '}
                    {resource.relatedResources.map((rel, idx) => {
                      const relatedResource = allResources.find(r => r.id === rel.resourceId);
                      return relatedResource ? (
                        <span key={rel.resourceId}>
                          {idx > 0 && ', '}
                          {rel.quantity}x {relatedResource.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold text-foreground">
                  {effectiveCost.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </div>
                <div className="text-sm text-muted-foreground">/{resource.unitMeasure}</div>
                {isComposite && (
                  <div className="text-xs text-accent mt-1">Calculado</div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                {resource.website && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-accent"
                    onClick={() => openSafeUrl(resource.website)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Web
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
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
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
