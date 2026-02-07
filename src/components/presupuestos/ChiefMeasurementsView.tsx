import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Search, Trash2, FileCode2, AlertTriangle, CheckCircle2, Layers, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

interface Measurement {
  id: string;
  budget_id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
  source: string | null;
  source_classification: string | null;
  floor: string | null;
  size_text: string | null;
  count_raw: number | null;
  created_at: string;
  updated_at: string;
}

interface ChiefMeasurementsViewProps {
  measurements: Measurement[];
  allMeasurements: Measurement[];
  isAdmin: boolean;
  onDataChanged: () => void;
  onOpenImport?: () => void;
}

export function ChiefMeasurementsView({
  measurements,
  allMeasurements,
  isAdmin,
  onDataChanged,
  onOpenImport,
}: ChiefMeasurementsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__all__']));

  // Filter measurements from ChiefArchitect source
  const chiefMeasurements = useMemo(() => {
    return measurements.filter(m => m.source === 'chief_architect');
  }, [measurements]);

  // Detect duplicates
  const duplicateMap = useMemo(() => {
    const nameCount = new Map<string, string[]>();
    allMeasurements.forEach(m => {
      const key = m.name.toLowerCase().trim();
      if (!nameCount.has(key)) {
        nameCount.set(key, []);
      }
      nameCount.get(key)!.push(m.id);
    });
    return nameCount;
  }, [allMeasurements]);

  const isDuplicate = useCallback((measurement: Measurement): boolean => {
    const key = measurement.name.toLowerCase().trim();
    const ids = duplicateMap.get(key) || [];
    return ids.length > 1;
  }, [duplicateMap]);

  const getDuplicateCount = useCallback((measurement: Measurement): number => {
    const key = measurement.name.toLowerCase().trim();
    return (duplicateMap.get(key) || []).length;
  }, [duplicateMap]);

  // Filter by search
  const filteredMeasurements = useMemo(() => {
    if (!searchTerm) return chiefMeasurements;
    return chiefMeasurements.filter(m =>
      searchMatch(m.name, searchTerm) ||
      searchMatch(m.source_classification, searchTerm) ||
      searchMatch(m.measurement_unit, searchTerm) ||
      searchMatch(m.size_text, searchTerm) ||
      searchMatch(m.floor, searchTerm)
    );
  }, [chiefMeasurements, searchTerm]);

  // Group by classification
  const groupedMeasurements = useMemo(() => {
    const groups = new Map<string, Measurement[]>();
    filteredMeasurements.forEach(m => {
      const key = m.source_classification || 'Sin clasificación';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(m);
    });
    return groups;
  }, [filteredMeasurements]);

  // Auto-expand all groups on first load
  useMemo(() => {
    if (expandedGroups.has('__all__')) {
      const allKeys = new Set(Array.from(groupedMeasurements.keys()));
      allKeys.add('__all__');
      setExpandedGroups(allKeys);
    }
  }, [groupedMeasurements]);

  // Stats
  const totalCount = chiefMeasurements.length;
  const duplicateCount = chiefMeasurements.filter(m => isDuplicate(m)).length;
  const classificationCount = new Set(chiefMeasurements.map(m => m.source_classification || 'Sin clasificación')).size;

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectDuplicates = () => {
    const duplicateIds = new Set<string>();
    chiefMeasurements.forEach(m => {
      if (isDuplicate(m)) duplicateIds.add(m.id);
    });
    setSelectedIds(duplicateIds);
  };

  const selectAll = () => {
    const allSelected = filteredMeasurements.every(m => selectedIds.has(m.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMeasurements.map(m => m.id)));
    }
  };

  const toggleGroup = (classification: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(classification)) next.delete(classification);
      else next.add(classification);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set(Array.from(groupedMeasurements.keys()));
    allKeys.add('__all__');
    setExpandedGroups(allKeys);
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  // Delete handler
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('budget_measurements')
        .delete()
        .in('id', Array.from(selectedIds));
      if (error) throw error;
      toast.success(`${selectedIds.size} mediciones eliminadas`);
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      onDataChanged();
    } catch (error) {
      console.error('Error deleting measurements:', error);
      toast.error('Error al eliminar las mediciones');
    } finally {
      setIsDeleting(false);
    }
  };

  if (chiefMeasurements.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center space-y-4">
            <FileCode2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              No hay mediciones importadas desde ChiefArchitect
            </p>
            <p className="text-xs text-muted-foreground">
              Usa el botón "Importar Mediciones Chief" para importar desde un archivo XML
            </p>
            {isAdmin && onOpenImport && (
              <Button onClick={onOpenImport} variant="outline">
                <FileCode2 className="h-4 w-4 mr-2" />
                Importar Mediciones Chief
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          <FileCode2 className="h-3 w-3 mr-1" />
          {totalCount} mediciones Chief
        </Badge>
        <Badge variant="outline">
          <Layers className="h-3 w-3 mr-1" />
          {classificationCount} clasificaciones
        </Badge>
        {duplicateCount > 0 && (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {duplicateCount} duplicadas
          </Badge>
        )}
        {selectedIds.size > 0 && (
          <Badge variant="outline" className="bg-primary/10">
            {selectedIds.size} seleccionadas
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripción, clasificación, planta, medida..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expandir todo
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Contraer todo
          </Button>
          {isAdmin && duplicateCount > 0 && (
            <Button variant="outline" size="sm" onClick={selectDuplicates}>
              <AlertTriangle className="h-4 w-4 mr-1" />
              Seleccionar duplicadas ({duplicateCount})
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={selectAll}>
              {filteredMeasurements.every(m => selectedIds.has(m.id)) ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </Button>
          )}
          {isAdmin && selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Hierarchical list */}
      <ScrollArea className="max-h-[600px]">
        <div className="space-y-2">
          {Array.from(groupedMeasurements.entries()).map(([classification, items]) => {
            const isExpanded = expandedGroups.has(classification);
            const groupDuplicates = items.filter(m => isDuplicate(m)).length;
            const groupSelectedCount = items.filter(m => selectedIds.has(m.id)).length;

            return (
              <Collapsible
                key={classification}
                open={isExpanded}
                onOpenChange={() => toggleGroup(classification)}
              >
                {/* Classification Header */}
                <CollapsibleTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/60 rounded-md cursor-pointer hover:bg-muted/80 transition-colors border">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm flex-1">{classification}</span>
                    <Badge variant="secondary" className="text-xs">
                      {items.length} mediciones
                    </Badge>
                    {groupDuplicates > 0 && (
                      <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-700 border-orange-300">
                        {groupDuplicates} dup.
                      </Badge>
                    )}
                    {groupSelectedCount > 0 && (
                      <Badge variant="outline" className="text-xs bg-primary/10">
                        {groupSelectedCount} sel.
                      </Badge>
                    )}
                  </div>
                </CollapsibleTrigger>

                {/* Measurement Items */}
                <CollapsibleContent>
                  <div className="ml-2 mt-1 border rounded-md overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[auto_1fr_80px_1fr_80px_80px_80px] gap-1 px-3 py-2 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
                      {isAdmin && <div className="w-6" />}
                      <div>Descripción</div>
                      <div>Planta</div>
                      <div>Medida (Size)</div>
                      <div className="text-right">Uds (Count)</div>
                      <div className="text-right">Valor</div>
                      <div className="text-center">Ud Medida</div>
                    </div>

                    {/* Data rows */}
                    {items.map((m, idx) => {
                      const hasDuplicates = isDuplicate(m);
                      const dupeCount = getDuplicateCount(m);

                      return (
                        <div
                          key={m.id}
                          className={`grid grid-cols-[auto_1fr_80px_1fr_80px_80px_80px] gap-1 px-3 py-2 text-sm items-center border-b last:border-b-0 ${
                            hasDuplicates ? 'bg-orange-500/5' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                          } hover:bg-accent/30 transition-colors`}
                        >
                          {isAdmin && (
                            <div className="w-6">
                              <Checkbox
                                checked={selectedIds.has(m.id)}
                                onCheckedChange={() => toggleSelection(m.id)}
                              />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium" title={m.name}>
                              {m.name}
                            </div>
                            {hasDuplicates && (
                              <span className="text-xs text-orange-600 flex items-center gap-0.5 mt-0.5">
                                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                Duplicada ({dupeCount} apariciones)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.floor || '-'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate min-w-0" title={m.size_text || ''}>
                            {m.size_text || '-'}
                          </div>
                          <div className="text-right text-xs">
                            {m.count_raw !== null ? formatNumber(m.count_raw) : '-'}
                          </div>
                          <div className="text-right font-medium text-xs">
                            {m.manual_units !== null ? formatNumber(m.manual_units) : '-'}
                          </div>
                          <div className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {m.measurement_unit || 'ud'}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteSelected}
        isDeleting={isDeleting}
        title={`¿Eliminar ${selectedIds.size} mediciones?`}
        description={`Se eliminarán permanentemente ${selectedIds.size} mediciones seleccionadas. Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
