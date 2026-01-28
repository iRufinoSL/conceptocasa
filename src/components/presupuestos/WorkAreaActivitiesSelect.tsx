import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { formatActividadId } from '@/lib/activity-id';

interface Activity {
  id: string;
  name: string;
  code: string;
  opciones: string[];
  phase_id: string | null;
}

interface Phase {
  id: string;
  code: string | null;
  name: string;
}

interface WorkAreaActivitiesSelectProps {
  activities: Activity[];
  phases: Phase[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function WorkAreaActivitiesSelect({
  activities,
  phases,
  selectedIds,
  onSelectionChange
}: WorkAreaActivitiesSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  // Create a phase lookup map
  const phaseMap = useMemo(() => {
    const map = new Map<string, Phase>();
    phases.forEach(p => map.set(p.id, p));
    return map;
  }, [phases]);

  // Get ActividadID for an activity
  const getActividadIdDisplay = (activity: Activity) => {
    const phase = activity.phase_id ? phaseMap.get(activity.phase_id) : null;
    return formatActividadId({
      phaseCode: phase?.code || '',
      activityCode: activity.code,
      name: activity.name
    });
  };

  // Sort all activities alphabetically by ActividadID
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      const idA = getActividadIdDisplay(a);
      const idB = getActividadIdDisplay(b);
      return idA.localeCompare(idB, 'es', { numeric: true });
    });
  }, [activities, phaseMap]);

  // Get selected activities
  const selectedActivities = useMemo(() => {
    return sortedActivities.filter(a => selectedIds.includes(a.id));
  }, [sortedActivities, selectedIds]);

  // Filter activities based on search
  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return sortedActivities;
    
    const query = searchQuery.toLowerCase();
    return sortedActivities.filter(activity => {
      const actividadId = getActividadIdDisplay(activity);
      return actividadId.toLowerCase().includes(query);
    });
  }, [sortedActivities, searchQuery, phaseMap]);

  const handleToggle = (activityId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, activityId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== activityId));
    }
  };

  const handleRemove = (activityId: string) => {
    onSelectionChange(selectedIds.filter(id => id !== activityId));
  };

  const handleSelectAll = () => {
    const allIds = filteredActivities.map(a => a.id);
    const newIds = Array.from(new Set([...selectedIds, ...allIds]));
    onSelectionChange(newIds);
  };

  const handleDeselectAll = () => {
    const filteredIds = new Set(filteredActivities.map(a => a.id));
    onSelectionChange(selectedIds.filter(id => !filteredIds.has(id)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Actividades relacionadas</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 px-2"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Colapsar
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Expandir ({selectedIds.length} seleccionadas)
            </>
          )}
        </Button>
      </div>
      
      {/* Selected activities display - always shown */}
      {selectedActivities.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2 border rounded-md bg-muted/30 max-h-32 overflow-y-auto">
          {selectedActivities.map(activity => (
            <Badge
              key={activity.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1 cursor-default"
            >
              <span className="text-xs truncate max-w-[200px]" title={getActividadIdDisplay(activity)}>
                {getActividadIdDisplay(activity)}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(activity.id)}
                className="ml-1 hover:bg-background/50 rounded p-0.5"
                title="Quitar actividad"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {isExpanded && (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar actividades por ActividadID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Bulk actions */}
          {filteredActivities.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs h-7"
              >
                Seleccionar todos ({filteredActivities.length})
              </Button>
              {selectedIds.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  className="text-xs h-7"
                >
                  Deseleccionar visibles
                </Button>
              )}
            </div>
          )}

          {/* Activity list - larger with better scroll */}
          <ScrollArea className="h-64 border rounded-md">
            {filteredActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3 text-center">
                {searchQuery ? 'No se encontraron actividades' : 'No hay actividades'}
              </p>
            ) : (
              <div className="p-2 space-y-1">
                {filteredActivities.map(activity => {
                  const isSelected = selectedIds.includes(activity.id);
                  const actividadId = getActividadIdDisplay(activity);
                  return (
                    <div
                      key={activity.id}
                      className={`flex items-center space-x-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent' : ''
                      }`}
                      onClick={() => handleToggle(activity.id, !isSelected)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleToggle(activity.id, !!checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span 
                        className="text-sm flex-1 truncate" 
                        title={actividadId}
                      >
                        {actividadId}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </>
      )}

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} {selectedIds.length === 1 ? 'actividad seleccionada' : 'actividades seleccionadas'}
        </p>
      )}
    </div>
  );
}
