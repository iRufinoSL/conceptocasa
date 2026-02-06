import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Search, Trash2, FileCode2, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
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
  created_at: string;
  updated_at: string;
}

interface ChiefMeasurementsViewProps {
  measurements: Measurement[];
  allMeasurements: Measurement[];
  isAdmin: boolean;
  onDataChanged: () => void;
}

export function ChiefMeasurementsView({
  measurements,
  allMeasurements,
  isAdmin,
  onDataChanged,
}: ChiefMeasurementsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'selected' | 'duplicates'>('selected');

  // Filter measurements from ChiefArchitect source
  const chiefMeasurements = useMemo(() => {
    return measurements.filter(m => m.source === 'chief_architect');
  }, [measurements]);

  // Detect duplicates: measurements with the same name (case-insensitive)
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

  // Get duplicate IDs for a measurement (excluding itself)
  const getDuplicateIds = useCallback((measurement: Measurement): string[] => {
    const key = measurement.name.toLowerCase().trim();
    const ids = duplicateMap.get(key) || [];
    return ids.filter(id => id !== measurement.id);
  }, [duplicateMap]);

  // Filter by search
  const filteredMeasurements = useMemo(() => {
    if (!searchTerm) return chiefMeasurements;
    return chiefMeasurements.filter(m =>
      searchMatch(m.name, searchTerm) ||
      searchMatch(m.source_classification, searchTerm) ||
      searchMatch(m.measurement_unit, searchTerm)
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

  // Stats
  const totalCount = chiefMeasurements.length;
  const duplicateCount = chiefMeasurements.filter(m => isDuplicate(m)).length;
  const classificationCount = new Set(chiefMeasurements.map(m => m.source_classification || 'Sin clasificación')).size;

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = filteredMeasurements.every(m => selectedIds.has(m.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMeasurements.map(m => m.id)));
    }
  };

  const selectDuplicates = () => {
    const duplicateIds = new Set<string>();
    chiefMeasurements.forEach(m => {
      if (isDuplicate(m)) {
        duplicateIds.add(m.id);
      }
    });
    setSelectedIds(duplicateIds);
  };

  // Delete handlers
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
          <div className="text-center space-y-2">
            <FileCode2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              No hay mediciones importadas desde ChiefArchitect
            </p>
            <p className="text-xs text-muted-foreground">
              Usa el botón "Mediciones Chief" para importar mediciones desde un archivo XML
            </p>
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
            placeholder="Buscar por nombre, clasificación..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {duplicateCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={selectDuplicates}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Seleccionar duplicadas ({duplicateCount})
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteMode('selected');
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar seleccionadas ({selectedIds.size})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <ScrollArea className="max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredMeasurements.length > 0 && filteredMeasurements.every(m => selectedIds.has(m.id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                )}
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Uds</TableHead>
                <TableHead>Ud Medida</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(groupedMeasurements.entries()).map(([classification, items]) => (
                <>
                  {/* Classification header */}
                  <TableRow key={`cls-${classification}`} className="bg-muted/50">
                    <TableCell colSpan={isAdmin ? 5 : 4} className="font-semibold text-sm py-2">
                      {classification}
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {items.length}
                      </Badge>
                    </TableCell>
                  </TableRow>

                  {/* Measurement rows */}
                  {items.map(m => {
                    const hasDuplicates = isDuplicate(m);
                    const dupeIds = getDuplicateIds(m);

                    return (
                      <TableRow
                        key={m.id}
                        className={hasDuplicates ? 'bg-orange-500/5' : undefined}
                      >
                        {isAdmin && (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(m.id)}
                              onCheckedChange={() => toggleSelection(m.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium text-sm max-w-[300px]">
                          <span className="truncate block" title={m.name}>{m.name}</span>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {m.manual_units !== null ? formatNumber(m.manual_units) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {m.measurement_unit || 'ud'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {hasDuplicates ? (
                            <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-700 border-orange-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Duplicada ({dupeIds.length + 1} apariciones)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Única
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteSelected}
        isDeleting={isDeleting}
        title={`¿Eliminar ${selectedIds.size} mediciones?`}
        description={`Se eliminarán permanentemente ${selectedIds.size} mediciones seleccionadas. Las actividades relacionadas serán desvinculadas. Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
