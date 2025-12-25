import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Edit2, Trash2, MapPin } from 'lucide-react';
import { formatCurrency } from '@/lib/format-utils';
import { OPTION_COLORS } from '@/lib/options-utils';
import { calcResourceSubtotal } from '@/lib/budget-pricing';
import { supabase } from '@/integrations/supabase/client';

interface WorkArea {
  id: string;
  budget_id: string;
  name: string;
  level: string;
  work_area: string;
  area_id: string;
  resources_subtotal?: number;
}

interface Activity {
  id: string;
  opciones: string[];
}

interface WorkAreasOptionsGroupedViewProps {
  workAreas: WorkArea[];
  activities: Activity[];
  activityLinks: { work_area_id: string; activity_id: string }[];
  isAdmin: boolean;
  expandedOptions: Set<string>;
  onToggleExpanded: (option: string) => void;
  onEdit: (area: WorkArea) => void;
  onDelete: (id: string) => void;
}

const OPCIONES = ['A', 'B', 'C'];

export function WorkAreasOptionsGroupedView({
  workAreas,
  activities,
  activityLinks,
  isAdmin,
  expandedOptions,
  onToggleExpanded,
  onEdit,
  onDelete,
}: WorkAreasOptionsGroupedViewProps) {
  // Get activities linked to a work area
  const getWorkAreaActivities = (workAreaId: string): Activity[] => {
    const linkedActivityIds = activityLinks
      .filter(link => link.work_area_id === workAreaId)
      .map(link => link.activity_id);
    return activities.filter(a => linkedActivityIds.includes(a.id));
  };

  // Calculate which options a work area belongs to based on its linked activities
  const getWorkAreaOptions = (workAreaId: string): string[] => {
    const linkedActivities = getWorkAreaActivities(workAreaId);
    if (linkedActivities.length === 0) return ['A', 'B', 'C']; // Default to all options if no activities linked
    
    const allOptions = new Set<string>();
    linkedActivities.forEach(activity => {
      (activity.opciones || ['A', 'B', 'C']).forEach(opt => allOptions.add(opt));
    });
    
    return Array.from(allOptions).sort();
  };

  // Group work areas by option
  const workAreasByOption = useMemo(() => {
    const groups: Record<string, WorkArea[]> = { A: [], B: [], C: [] };
    
    workAreas.forEach(area => {
      const options = getWorkAreaOptions(area.id);
      options.forEach(opcion => {
        if (groups[opcion]) {
          groups[opcion].push(area);
        }
      });
    });
    
    // Sort alphabetically within each group
    Object.values(groups).forEach(group => {
      group.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return groups;
  }, [workAreas, activities, activityLinks]);

  // Calculate subtotals per option
  const optionSubtotals = useMemo(() => {
    const result: Record<string, number> = {};
    OPCIONES.forEach(opcion => {
      // Sum unique work area subtotals (avoid double counting)
      const uniqueAreas = new Set<string>();
      let total = 0;
      workAreasByOption[opcion]?.forEach(area => {
        if (!uniqueAreas.has(area.id)) {
          uniqueAreas.add(area.id);
          total += area.resources_subtotal || 0;
        }
      });
      result[opcion] = total;
    });
    return result;
  }, [workAreasByOption]);

  return (
    <div className="space-y-2">
      {OPCIONES.map(opcion => {
        const areasInOption = workAreasByOption[opcion] || [];
        const isExpanded = expandedOptions.has(opcion);
        const subtotal = optionSubtotals[opcion];
        const colors = OPTION_COLORS[opcion];

        return (
          <Collapsible 
            key={opcion} 
            open={isExpanded} 
            onOpenChange={() => onToggleExpanded(opcion)}
          >
            <div className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Badge 
                      variant="default" 
                      className={`text-lg px-3 py-1 ${colors.bg} hover:opacity-80`}
                    >
                      Opción {opcion}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {areasInOption.length} áreas
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">SubTotal Opción {opcion}</p>
                      <p className={`text-lg font-bold font-mono ${colors.text}`}>
                        {formatCurrency(subtotal)}
                      </p>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t">
                  {areasInOption.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Nivel</TableHead>
                          <TableHead>Área de Trabajo</TableHead>
                          <TableHead>AreaID</TableHead>
                          <TableHead className="text-right">€ SubTotal</TableHead>
                          {isAdmin && <TableHead className="w-20">Acciones</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {areasInOption.map(area => (
                          <TableRow key={area.id}>
                            <TableCell className="font-medium">{area.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{area.level}</Badge>
                            </TableCell>
                            <TableCell>{area.work_area}</TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-2 py-1 rounded">{area.area_id}</code>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-primary">
                              {formatCurrency(area.resources_subtotal || 0)}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onEdit(area)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => onDelete(area.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No hay áreas con opción {opcion}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}