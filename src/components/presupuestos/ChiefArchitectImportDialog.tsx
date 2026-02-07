import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { FileUp, X, AlertTriangle, CheckCircle2, ArrowRightLeft, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/lib/format-utils';
import { parseChiefArchitectXML, type ChiefArchitectMeasurement, type ChiefArchitectParseResult } from '@/lib/chiefarchitect-xml-parser';

interface ChiefArchitectImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  existingMeasurementNames: Set<string>;
  onImportComplete: () => void;
}

export function ChiefArchitectImportDialog({
  open,
  onOpenChange,
  budgetId,
  existingMeasurementNames,
  onImportComplete,
}: ChiefArchitectImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ChiefArchitectParseResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.xml')) {
      toast.error('Por favor selecciona un archivo XML');
      return;
    }

    setFile(selectedFile);

    try {
      const content = await selectedFile.text();
      const result = parseChiefArchitectXML(content);
      setParseResult(result);

      if (result.errors.length > 0) {
        result.errors.forEach(err => toast.error(err));
      }

      // Auto-select all non-duplicate measurements
      const newSelected = new Set<string>();
      result.measurements.forEach(m => {
        const isDuplicate = existingMeasurementNames.has(m.description.toLowerCase().trim());
        if (!isDuplicate) {
          newSelected.add(m.id);
        }
      });
      setSelectedIds(newSelected);

      if (result.measurements.length > 0) {
        toast.success(`${result.measurements.length} mediciones encontradas en ${result.classifications.length} clasificaciones`);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Error al leer el archivo XML');
    }
  };

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
    if (!parseResult) return;
    const filtered = filteredMeasurements;
    const allSelected = filtered.every(m => selectedIds.has(m.id));
    
    const next = new Set(selectedIds);
    if (allSelected) {
      filtered.forEach(m => next.delete(m.id));
    } else {
      filtered.forEach(m => next.add(m.id));
    }
    setSelectedIds(next);
  };

  // Group measurements by classification
  const groupedMeasurements = useMemo(() => {
    if (!parseResult) return new Map<string, ChiefArchitectMeasurement[]>();
    
    const groups = new Map<string, ChiefArchitectMeasurement[]>();
    parseResult.measurements.forEach(m => {
      const key = m.classificationEs;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(m);
    });
    return groups;
  }, [parseResult]);

  // Filter measurements
  const filteredMeasurements = useMemo(() => {
    if (!parseResult) return [];
    if (!searchTerm) return parseResult.measurements;
    const term = searchTerm.toLowerCase();
    return parseResult.measurements.filter(m =>
      m.description.toLowerCase().includes(term) ||
      m.classificationEs.toLowerCase().includes(term) ||
      m.id.toLowerCase().includes(term) ||
      m.size.toLowerCase().includes(term)
    );
  }, [parseResult, searchTerm]);

  // Filtered and grouped
  const filteredGrouped = useMemo(() => {
    const groups = new Map<string, ChiefArchitectMeasurement[]>();
    filteredMeasurements.forEach(m => {
      const key = m.classificationEs;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(m);
    });
    return groups;
  }, [filteredMeasurements]);

  const handleImport = async () => {
    if (!parseResult || selectedIds.size === 0) return;

    setIsImporting(true);
    try {
      const toImport = parseResult.measurements.filter(m => selectedIds.has(m.id));
      
      // Create measurements in the database with source metadata
      const measurementsToInsert = toImport.map(m => ({
        budget_id: budgetId,
        name: m.description,
        manual_units: m.convertedValue,
        measurement_unit: m.finalUnit,
        source: 'chief_architect' as string,
        source_classification: m.classificationEs,
        floor: m.floor !== null ? String(m.floor) : null,
        size_text: m.size || null,
        count_raw: m.countRaw,
      }));

      const { data: inserted, error } = await supabase
        .from('budget_measurements')
        .insert(measurementsToInsert)
        .select('id, name');

      if (error) throw error;

      const importedCount = inserted?.length || 0;
      const convertedCount = toImport.filter(m => m.wasConverted).length;

      let message = `${importedCount} mediciones importadas`;
      if (convertedCount > 0) {
        message += ` (${convertedCount} con conversión de unidades)`;
      }
      
      toast.success(message);
      onImportComplete();
      handleClose();
    } catch (error) {
      console.error('Error importing:', error);
      toast.error('Error al importar las mediciones');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParseResult(null);
    setSelectedIds(new Set());
    setSearchTerm('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const duplicateCount = parseResult?.measurements.filter(
    m => existingMeasurementNames.has(m.description.toLowerCase().trim())
  ).length || 0;

  const convertedCount = parseResult?.measurements.filter(m => m.wasConverted).length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Importar Mediciones desde ChiefArchitect
          </DialogTitle>
          <DialogDescription>
            Sube un archivo XML exportado desde ChiefArchitect. Las mediciones se analizarán y convertirán automáticamente a las unidades correctas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
          {/* File Input */}
          <div className="flex items-center gap-2">
            <Label className="sr-only">Archivo XML</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="flex-1"
            />
            {file && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setFile(null);
                  setParseResult(null);
                  setSelectedIds(new Set());
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Summary badges */}
          {parseResult && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {parseResult.measurements.length} mediciones encontradas
              </Badge>
              <Badge variant="outline">
                {parseResult.classifications.length} clasificaciones
              </Badge>
              <Badge variant="outline" className="bg-primary/10">
                {selectedIds.size} seleccionadas
              </Badge>
              {convertedCount > 0 && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300">
                  <ArrowRightLeft className="h-3 w-3 mr-1" />
                  {convertedCount} convertidas
                </Badge>
              )}
              {duplicateCount > 0 && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {duplicateCount} duplicadas
                </Badge>
              )}
            </div>
          )}

          {/* Search */}
          {parseResult && parseResult.measurements.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descripción, clasificación, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* Measurements table */}
          {parseResult && parseResult.measurements.length > 0 && (
            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredMeasurements.length > 0 && filteredMeasurements.every(m => selectedIds.has(m.id))}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="w-14">ID</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Valor Final</TableHead>
                    <TableHead>Ud</TableHead>
                    <TableHead>Conversión</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(filteredGrouped.entries()).map(([classification, measurements]) => (
                    <>
                      {/* Classification header row */}
                      <TableRow key={`cls-${classification}`} className="bg-muted/50">
                        <TableCell colSpan={9} className="font-semibold text-sm py-2">
                          {classification}
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {measurements.length}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {/* Measurement rows */}
                      {measurements.map(m => {
                        const isDuplicate = existingMeasurementNames.has(m.description.toLowerCase().trim());
                        return (
                          <TableRow
                            key={m.id}
                            className={isDuplicate ? 'opacity-50' : undefined}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(m.id)}
                                onCheckedChange={() => toggleSelection(m.id)}
                                disabled={isDuplicate}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{m.id}</TableCell>
                            <TableCell className="font-medium text-sm max-w-[200px] truncate" title={m.description}>
                              {m.description}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate" title={m.size}>
                              {m.size || '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatNumber(m.countRaw)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              {formatNumber(m.convertedValue)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {m.finalUnit}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {m.wasConverted ? (
                                <span className="text-amber-600 flex items-center gap-1" title={m.conversionNote}>
                                  <ArrowRightLeft className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate max-w-[150px]">{m.conversionNote}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{m.conversionNote}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isDuplicate ? (
                                <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-700 border-orange-300">
                                  Duplicada
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-300">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Nueva
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
          )}

          {/* No file yet */}
          {!parseResult && (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg p-8">
              <div className="text-center space-y-2">
                <FileUp className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Selecciona un archivo XML exportado desde ChiefArchitect
                </p>
                <p className="text-xs text-muted-foreground">
                  El sistema detectará automáticamente las unidades (m², ml, m³) y aplicará conversiones cuando sea necesario
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parseResult || selectedIds.size === 0 || isImporting}
          >
            {isImporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Importando...
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4 mr-2" />
                Importar {selectedIds.size} mediciones
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
