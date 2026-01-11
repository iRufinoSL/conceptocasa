import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
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

  // Create a phase lookup map
  const phaseMap = useMemo(() => {
    const map = new Map<string, Phase>();
    phases.forEach(p => map.set(p.id, p));
    return map;
  }, [phases]);

  // Get selected activities
  const selectedActivities = useMemo(() => {
    return activities.filter(a => selectedIds.includes(a.id));
  }, [activities, selectedIds]);

  // Filter activities based on search - use ActividadId format for search
  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return activities.filter(activity => {
      const phase = activity.phase_id ? phaseMap.get(activity.phase_id) : null;
      const phaseCode = phase?.code || '';
      const actividadId = formatActividadId({
        phaseCode,
        activityCode: activity.code,
        name: activity.name
      });
      return actividadId.toLowerCase().includes(query);
    });
  }, [activities, searchQuery, phaseMap]);

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

  const getActividadIdDisplay = (activity: Activity) => {
    const phase = activity.phase_id ? phaseMap.get(activity.phase_id) : null;
    return formatActividadId({
      phaseCode: phase?.code || '',
      activityCode: activity.code,
      name: activity.name
    });
  };

  return (
    <div className="space-y-3">
      <Label>Actividades relacionadas</Label>
      
      {/* Selected activities display */}
      {selectedActivities.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2 border rounded-md bg-muted/30">
          {selectedActivities.map(activity => (
            <Badge
              key={activity.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span className="text-xs truncate max-w-[200px]">
                {getActividadIdDisplay(activity)}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(activity.id)}
                className="ml-1 hover:bg-background/50 rounded p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

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

      {/* Search results */}
      {searchQuery.trim() && (
        <ScrollArea className="h-48 border rounded-md">
          {filteredActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">
              No se encontraron actividades
            </p>
          ) : (
            <div className="p-2 space-y-1">
              {filteredActivities.map(activity => {
                const isSelected = selectedIds.includes(activity.id);
                return (
                  <div
                    key={activity.id}
                    className={`flex items-center space-x-2 p-2 rounded hover:bg-accent/50 cursor-pointer ${
                      isSelected ? 'bg-accent' : ''
                    }`}
                    onClick={() => handleToggle(activity.id, !isSelected)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleToggle(activity.id, !!checked)}
                    />
                    <span className="text-sm flex-1">
                      {getActividadIdDisplay(activity)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      )}

      {!searchQuery.trim() && selectedActivities.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Escribe para buscar y añadir actividades
        </p>
      )}

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} {selectedIds.length === 1 ? 'actividad seleccionada' : 'actividades seleccionadas'}
        </p>
      )}
    </div>
  );
}