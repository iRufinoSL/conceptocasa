import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/format-utils';
import { Layers, ArrowDown, ArrowUp, Box } from 'lucide-react';

interface Measurement {
  id: string;
  name: string;
  manual_units: number | null;
  measurement_unit: string | null;
  source: string | null;
  source_classification: string | null;
}

interface MeasurementsSurfaceTypeViewProps {
  measurements: Measurement[];
  searchTerm: string;
}

const SURFACE_CATEGORIES = [
  { key: 'suelo', label: 'Suelos', icon: <ArrowDown className="h-4 w-4" />, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  { key: 'techo', label: 'Techos', icon: <ArrowUp className="h-4 w-4" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { key: 'ext', label: 'Paredes externas', icon: <Layers className="h-4 w-4" />, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { key: 'int', label: 'Paredes internas', icon: <Layers className="h-4 w-4" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { key: 'roof', label: 'Cubierta', icon: <ArrowUp className="h-4 w-4" />, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { key: 'volumen', label: 'Volumen', icon: <Box className="h-4 w-4" />, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
];

function getCategoryFromClassification(classification: string | null): string | null {
  if (!classification) return null;
  const match = classification.match(/^vol_(suelo|techo|ext|int|roof|volumen)_/);
  return match ? match[1] : null;
}

function getTier(classification: string | null): 'room' | 'level' | 'total' {
  if (!classification) return 'level';
  if (classification.endsWith('_total')) return 'total';
  if (classification.includes('_room_')) return 'room';
  return 'level';
}

const TIER_LABELS: Record<string, string> = {
  room: 'Estancia',
  level: 'Nivel',
  total: 'Total',
};

export function MeasurementsSurfaceTypeView({ measurements, searchTerm }: MeasurementsSurfaceTypeViewProps) {
  const volumeMeasurements = useMemo(() => {
    return measurements.filter(m => m.source === 'volumen_auto' && m.source_classification);
  }, [measurements]);

  const grouped = useMemo(() => {
    const result: Record<string, { rooms: Measurement[]; levels: Measurement[]; total: Measurement | null }> = {};
    
    for (const cat of SURFACE_CATEGORIES) {
      result[cat.key] = { rooms: [], levels: [], total: null };
    }

    for (const m of volumeMeasurements) {
      const catKey = getCategoryFromClassification(m.source_classification);
      if (!catKey || !result[catKey]) continue;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const nameMatch = m.name.toLowerCase().includes(term);
        const catLabel = SURFACE_CATEGORIES.find(c => c.key === catKey)?.label?.toLowerCase() || '';
        const catMatch = catLabel.includes(term);
        if (!nameMatch && !catMatch) continue;
      }

      const tier = getTier(m.source_classification);
      if (tier === 'total') {
        result[catKey].total = m;
      } else if (tier === 'room') {
        result[catKey].rooms.push(m);
      } else {
        result[catKey].levels.push(m);
      }
    }

    return result;
  }, [volumeMeasurements, searchTerm]);

  const hasAny = Object.values(grouped).some(g => g.rooms.length > 0 || g.levels.length > 0 || g.total);

  if (!hasAny) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Box className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p className="font-medium">No hay mediciones de volúmenes disponibles</p>
        <p className="text-sm mt-1">
          Accede a la pestaña <strong>Plano → Volúmenes</strong> para que se generen automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {SURFACE_CATEGORIES.map(cat => {
        const group = grouped[cat.key];
        if (!group || (group.rooms.length === 0 && group.levels.length === 0 && !group.total)) return null;

        const totalCount = group.rooms.length + group.levels.length + (group.total ? 1 : 0);

        return (
          <div key={cat.key} className="rounded-md border">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b">
              {cat.icon}
              <span className="font-semibold text-sm">{cat.label}</span>
              <Badge variant="secondary" className={`text-xs ${cat.color}`}>
                {totalCount}
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medición</TableHead>
                  <TableHead className="text-right w-[120px]">Valor</TableHead>
                  <TableHead className="w-[80px]">Unidad</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Per-room measurements */}
                {group.rooms.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6">{m.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {m.manual_units !== null ? formatNumber(m.manual_units) : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.measurement_unit || 'ud'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs bg-background">{TIER_LABELS.room}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Per-level measurements */}
                {group.levels.map(m => (
                  <TableRow key={m.id} className="bg-muted/20">
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {m.manual_units !== null ? formatNumber(m.manual_units) : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.measurement_unit || 'ud'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{TIER_LABELS.level}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total measurement */}
                {group.total && (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="font-bold">{group.total.name}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">
                      {group.total.manual_units !== null ? formatNumber(group.total.manual_units) : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{group.total.measurement_unit || 'ud'}</TableCell>
                    <TableCell>
                      <Badge className="text-xs">{TIER_LABELS.total}</Badge>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
