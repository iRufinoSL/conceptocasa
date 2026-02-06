import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, MapPin, Ruler, Edit, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatNumber } from '@/lib/format-utils';
import { MoreHorizontal } from 'lucide-react';
import { ResourceInlineEdit } from '@/components/presupuestos/ResourceInlineEdit';

const LEVELS = [
  'Cota 0 terreno',
  'Nivel 1',
  'Nivel 2',
  'Nivel 3',
  'Terrazas',
  'Cubiertas',
  'Vivienda'
];

interface Measurement {
  id: string;
  budget_id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
  source?: string | null;
  source_classification?: string | null;
  created_at: string;
  updated_at: string;
}

interface MeasurementRelation {
  id: string;
  measurement_id: string;
  related_measurement_id: string;
}

interface WorkArea {
  id: string;
  name: string;
  level: string;
  work_area: string;
}

interface WorkAreaMeasurement {
  work_area_id: string;
  measurement_id: string;
}

interface Activity {
  id: string;
  name: string;
  code: string;
  phase_id: string | null;
  measurement_id: string | null;
}

interface MeasurementsWorkAreaGroupedViewProps {
  measurements: Measurement[];
  relations: MeasurementRelation[];
  workAreas: WorkArea[];
  workAreaMeasurements: WorkAreaMeasurement[];
  activities: Activity[];
  isAdmin: boolean;
  onEdit: (measurement: Measurement) => void;
  onDuplicate: (measurement: Measurement) => void;
  onDelete: (measurement: Measurement) => void;
  /** Optional inline update for manual_units (used to enable safe inline editing) */
  onUpdateManualUnits?: (measurementId: string, newValue: number | null) => Promise<void>;
  getRelatedUnits: (measurementId: string) => number;
  getCalculatedUnits: (measurement: Measurement) => number;
  getRelatedMeasurements: (measurementId: string) => Measurement[];
  getRelatedActivities: (measurementId: string) => Activity[];
  generateMedicionId: (measurement: Measurement) => string;
}

export function MeasurementsWorkAreaGroupedView({
  measurements,
  relations,
  workAreas,
  workAreaMeasurements,
  activities,
  isAdmin,
  onEdit,
  onDuplicate,
  onDelete,
  onUpdateManualUnits,
  getRelatedUnits,
  getCalculatedUnits,
  getRelatedMeasurements,
  getRelatedActivities,
  generateMedicionId
}: MeasurementsWorkAreaGroupedViewProps) {
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(LEVELS));
  const [expandedWorkAreas, setExpandedWorkAreas] = useState<Set<string>>(new Set());

  // Group measurements by level -> work area (nested)
  const nestedGroupedData = useMemo(() => {
    // First, build a map: level -> workArea -> measurements
    const levelMap = new Map<string, Map<string, {
      workArea: WorkArea | null;
      measurements: Measurement[];
    }>>();

    // Initialize levels
    LEVELS.forEach(level => {
      levelMap.set(level, new Map());
    });
    levelMap.set('__no_level__', new Map());

    // Group work areas by level and map measurements
    workAreas.forEach(wa => {
      const level = LEVELS.includes(wa.level) ? wa.level : '__no_level__';
      const levelAreas = levelMap.get(level)!;
      
      const measurementIds = workAreaMeasurements
        .filter(r => r.work_area_id === wa.id)
        .map(r => r.measurement_id);
      
      const areaMeasurements = measurements.filter(m => measurementIds.includes(m.id));

      if (areaMeasurements.length > 0 || !levelAreas.has(wa.id)) {
        levelAreas.set(wa.id, {
          workArea: wa,
          measurements: areaMeasurements.sort((a, b) => a.name.localeCompare(b.name))
        });
      }
    });

    // Find measurements without work area
    const allLinkedMeasurementIds = new Set(workAreaMeasurements.map(r => r.measurement_id));
    const unassigned = measurements.filter(m => !allLinkedMeasurementIds.has(m.id));

    if (unassigned.length > 0) {
      const noLevelMap = levelMap.get('__no_level__')!;
      noLevelMap.set('__no_area__', {
        workArea: null,
        measurements: unassigned.sort((a, b) => a.name.localeCompare(b.name))
      });
    }

    // Convert to array format with level info
    const result: {
      level: string;
      levelCount: number;
      workAreas: Array<{
        waId: string;
        workArea: WorkArea | null;
        measurements: Measurement[];
      }>;
    }[] = [];

    [...LEVELS, '__no_level__'].forEach(level => {
      const levelAreas = levelMap.get(level);
      if (!levelAreas || levelAreas.size === 0) return;

      const workAreasArray = Array.from(levelAreas.entries())
        .map(([waId, data]) => ({ waId, ...data }))
        .filter(wa => wa.measurements.length > 0)
        .sort((a, b) => {
          if (a.waId === '__no_area__') return 1;
          if (b.waId === '__no_area__') return -1;
          return (a.workArea?.name || '').localeCompare(b.workArea?.name || '');
        });

      if (workAreasArray.length === 0) return;

      const levelCount = workAreasArray.reduce((sum, wa) => sum + wa.measurements.length, 0);
      
      result.push({
        level: level === '__no_level__' ? 'Sin nivel' : level,
        levelCount,
        workAreas: workAreasArray
      });
    });

    return result;
  }, [measurements, workAreas, workAreaMeasurements]);

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const toggleWorkArea = (waId: string) => {
    setExpandedWorkAreas(prev => {
      const next = new Set(prev);
      if (next.has(waId)) {
        next.delete(waId);
      } else {
        next.add(waId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedLevels(new Set([...LEVELS, 'Sin nivel']));
    const allWaIds = nestedGroupedData.flatMap(g => g.workAreas.map(wa => wa.waId));
    setExpandedWorkAreas(new Set(allWaIds));
  };

  const collapseAll = () => {
    setExpandedLevels(new Set());
    setExpandedWorkAreas(new Set());
  };

  // Calculate total
  const totalMeasurements = measurements.length;

  if (nestedGroupedData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay mediciones asignadas a áreas de trabajo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expandir todo
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Colapsar todo
          </Button>
        </div>
        <Badge variant="secondary" className="text-lg px-3 py-1">
          Total: {totalMeasurements} mediciones
        </Badge>
      </div>

      {/* Nested grouped content: Level -> Work Area -> Measurements */}
      <div className="space-y-4">
        {nestedGroupedData.map(({ level, levelCount, workAreas: levelWorkAreas }) => {
          const isLevelExpanded = expandedLevels.has(level);

          return (
            <div key={level} className="border rounded-lg overflow-hidden">
              {/* Level Header */}
              <button
                className="w-full bg-muted/30 px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                onClick={() => toggleLevel(level)}
              >
                <div className="flex items-center gap-3">
                  {isLevelExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  <Layers className="h-5 w-5 text-primary" />
                  <span className="font-bold text-lg">{level}</span>
                  <Badge variant="outline">
                    {levelCount} mediciones
                  </Badge>
                </div>
              </button>

              {/* Work Areas within Level */}
              {isLevelExpanded && (
                <div className="pl-6 space-y-2 py-2">
                  {levelWorkAreas.map(({ waId, workArea, measurements: waMeasurements }) => {
                    const isWaExpanded = expandedWorkAreas.has(waId);

                    return (
                      <div key={waId} className="border rounded-lg overflow-hidden bg-background">
                        {/* Work Area Header */}
                        <button
                          className="w-full bg-muted/50 px-4 py-2 flex items-center justify-between hover:bg-muted/70 transition-colors"
                          onClick={() => toggleWorkArea(waId)}
                        >
                          <div className="flex items-center gap-3">
                            {isWaExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {workArea ? `${workArea.work_area} - ${workArea.name}` : 'Sin área asignada'}
                            </span>
                            <Badge variant="secondary" className="ml-2">
                              {waMeasurements.length} mediciones
                            </Badge>
                          </div>
                        </button>

                        {/* Measurements Table within Work Area */}
                        {isWaExpanded && (
                          <div className="p-2">
                            <div className="rounded-md border overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead className="text-right">Uds Manual</TableHead>
                                    <TableHead>Ud Medida</TableHead>
                                    <TableHead>Mediciones Relacionadas</TableHead>
                                    <TableHead className="text-right">Uds Relacionadas</TableHead>
                                    <TableHead className="text-right">Uds Cálculo</TableHead>
                                    <TableHead>Actividades</TableHead>
                                    <TableHead>MediciónID</TableHead>
                                    {isAdmin && <TableHead className="w-[80px]">Acciones</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {waMeasurements.map((measurement) => {
                                    const relatedUnits = getRelatedUnits(measurement.id);
                                    const calculatedUnits = getCalculatedUnits(measurement);
                                    const relatedMeasurements = getRelatedMeasurements(measurement.id);
                                    const medicionId = generateMedicionId(measurement);
                                    const relatedActs = getRelatedActivities(measurement.id);

                                    return (
                                      <TableRow key={measurement.id}>
                                        <TableCell className="font-medium max-w-[200px] truncate">
                                          {measurement.name}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {isAdmin && onUpdateManualUnits ? (
                                            <ResourceInlineEdit
                                              value={measurement.manual_units}
                                              onSave={(val) => onUpdateManualUnits(measurement.id, val)}
                                              type="number"
                                              decimals={2}
                                              allowNull={true}
                                              numericInputMode="raw"
                                              clearOnEdit={true}
                                              displayValue={
                                                measurement.manual_units !== null
                                                  ? formatNumber(measurement.manual_units)
                                                  : '-'
                                              }
                                              className="text-right"
                                            />
                                          ) : (
                                            measurement.manual_units !== null
                                              ? formatNumber(measurement.manual_units)
                                              : '-'
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline">
                                            {measurement.measurement_unit || 'ud'}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          {relatedMeasurements.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {relatedMeasurements.slice(0, 2).map(rm => (
                                                <Badge key={rm.id} variant="secondary" className="text-xs">
                                                  {rm.name.substring(0, 15)}{rm.name.length > 15 ? '...' : ''}
                                                </Badge>
                                              ))}
                                              {relatedMeasurements.length > 2 && (
                                                <Badge variant="secondary" className="text-xs">
                                                  +{relatedMeasurements.length - 2}
                                                </Badge>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-muted-foreground text-sm">-</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {relatedUnits > 0 ? formatNumber(relatedUnits) : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                          {formatNumber(calculatedUnits)}
                                        </TableCell>
                                        <TableCell>
                                          {relatedActs.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {relatedActs.slice(0, 2).map(act => (
                                                <Badge key={act.id} variant="outline" className="text-xs">
                                                  {act.code}
                                                </Badge>
                                              ))}
                                              {relatedActs.length > 2 && (
                                                <Badge variant="outline" className="text-xs">
                                                  +{relatedActs.length - 2}
                                                </Badge>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-muted-foreground text-sm">-</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                            {medicionId}
                                          </code>
                                        </TableCell>
                                        {isAdmin && (
                                          <TableCell>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                  <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(measurement)}>
                                                  <Edit className="h-4 w-4 mr-2" />
                                                  Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onDuplicate(measurement)}>
                                                  <Copy className="h-4 w-4 mr-2" />
                                                  Duplicar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                  onClick={() => onDelete(measurement)}
                                                  className="text-destructive"
                                                >
                                                  <Trash2 className="h-4 w-4 mr-2" />
                                                  Eliminar
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
