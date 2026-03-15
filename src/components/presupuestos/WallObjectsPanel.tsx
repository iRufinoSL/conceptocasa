import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, GripVertical, Star, Paintbrush, Layers, Link2 } from 'lucide-react';
import { VISUAL_PATTERNS, PATTERN_CATEGORIES, SUPERFICIE_PATTERNS, getPatternById, patternPreviewDataUri } from '@/lib/visual-patterns';
import { toast } from 'sonner';

interface WallObjectsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallId: string | null;
  wallIndex: number;
  wallType: string;
  wallLabel: string;
  roomName: string;
  onWallTypeChange: (newType: string) => void;
}

const WALL_TYPES = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'exterior_invisible', label: 'Ext. invisible' },
  { value: 'exterior_compartida', label: 'Ext. compartida' },
  { value: 'interior_compartida', label: 'Int. compartida' },
  { value: 'interior_invisible', label: 'Int. invisible' },
];

const FLOOR_TYPES = [
  { value: 'suelo_basico', label: 'Suelo básico' },
  { value: 'suelo_compartido', label: 'Suelo compartido' },
  { value: 'suelo_invisible', label: 'Suelo invisible' },
];

const CEILING_TYPES = [
  { value: 'techo_basico', label: 'Techo básico' },
  { value: 'techo_compartido', label: 'Techo compartido' },
  { value: 'techo_invisible', label: 'Techo invisible' },
];

const OBJECT_TYPES = [
  { value: 'hueco', label: 'Hueco (ventana/puerta)' },
  { value: 'material', label: 'Material' },
  { value: 'bloque', label: 'Bloque' },
  { value: 'aislamiento', label: 'Aislamiento' },
  { value: 'revestimiento', label: 'Revestimiento' },
  { value: 'estructura', label: 'Estructura' },
  { value: 'instalacion', label: 'Instalación' },
  { value: 'otro', label: 'Otro' },
];

interface ExternalResourceOption {
  id: string;
  name: string;
}

interface WallObject {
  id: string;
  wall_id: string;
  layer_order: number;
  name: string;
  description: string | null;
  object_type: string;
  is_core: boolean;
  surface_m2: number | null;
  volume_m3: number | null;
  length_ml: number | null;
  visual_pattern: string | null;
  thickness_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  position_x: number | null;
  sill_height: number | null;
  distance_to_wall: number | null;
  resource_id: string | null;
}

export function WallObjectsPanel({
  open,
  onOpenChange,
  wallId,
  wallIndex,
  wallType,
  wallLabel,
  roomName,
  onWallTypeChange,
}: WallObjectsPanelProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingObj, setEditingObj] = useState<string | null>(null);
  const [editingSuperficiePattern, setEditingSuperficiePattern] = useState<string | null>(null);
  const [editingSuperficieMetrics, setEditingSuperficieMetrics] = useState<string | null>(null);
  const [manualSurfaceM2, setManualSurfaceM2] = useState('');
  const [manualVolumeM3, setManualVolumeM3] = useState('');
  const [savingSuperficieMetrics, setSavingSuperficieMetrics] = useState(false);
  // Quick "Superficie" layer form
  const [showSuperficieForm, setShowSuperficieForm] = useState(false);
  const [supName, setSupName] = useState('');
  const [supLayerOrder, setSupLayerOrder] = useState(1);
  const [supVisualPattern, setSupVisualPattern] = useState('');

  // Full form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formObjectType, setFormObjectType] = useState('material');
  const [formIsCore, setFormIsCore] = useState(false);
  const [formLayerOrder, setFormLayerOrder] = useState(1);
  const [formSurfaceM2, setFormSurfaceM2] = useState('');
  const [formVolumeM3, setFormVolumeM3] = useState('');
  const [formLengthMl, setFormLengthMl] = useState('');
  const [formThicknessMm, setFormThicknessMm] = useState('');
  const [formVisualPattern, setFormVisualPattern] = useState('');

  const { data: objects = [], isLoading } = useQuery({
    queryKey: ['wall-objects', wallId],
    enabled: !!wallId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_wall_objects')
        .select('*')
        .eq('wall_id', wallId!)
        .order('layer_order', { ascending: true });
      return (data || []) as WallObject[];
    },
  });

  // The face's base surface comes from the auto Superficie object (order 0)
  const superficieObj = objects.find(o => o.layer_order === 0);
  const faceSurfaceM2 = superficieObj?.surface_m2 ?? 0;
  const faceVolumeM3 = superficieObj?.volume_m3 ?? null;

  // Auto-create Superficie (layer_order=0) when panel opens and it doesn't exist
  // Use a ref to avoid duplicate inserts from re-renders
  const creatingSuperficieRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !wallId || isLoading) return;
    if (objects.some(o => o.layer_order === 0)) return;
    if (creatingSuperficieRef.current[wallId]) return;
    creatingSuperficieRef.current[wallId] = true;

    const faceLabel = wallLabel || (wallIndex === 0 ? 'Espacio' : wallIndex === -1 ? 'Suelo' : wallIndex === -2 ? 'Techo' : `Pared ${wallIndex}`);
    const desc = `${roomName} / ${faceLabel}`;

    (async () => {
      // Double-check in DB to prevent duplicates
      const { data: existing } = await supabase
        .from('budget_wall_objects')
        .select('id')
        .eq('wall_id', wallId)
        .eq('layer_order', 0)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('budget_wall_objects').insert({
          wall_id: wallId,
          layer_order: 0,
          name: 'Superficie',
          description: desc,
          object_type: 'material',
          is_core: false,
          surface_m2: null,
          volume_m3: null,
        });
        if (error) {
          console.error('Error creating Superficie:', error);
        }
      }
      creatingSuperficieRef.current[wallId] = false;
      queryClient.invalidateQueries({ queryKey: ['wall-objects', wallId] });
    })();
  }, [open, wallId, isLoading, objects, wallLabel, wallIndex, roomName, queryClient]);

  useEffect(() => {
    if (!open) {
      setEditingSuperficiePattern(null);
      setEditingSuperficieMetrics(null);
      setManualSurfaceM2('');
      setManualVolumeM3('');
    }
  }, [open, wallId]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormObjectType('material');
    setFormIsCore(false);
    setFormLayerOrder(objects.length > 0 ? Math.max(...objects.map(o => o.layer_order)) + 1 : 1);
    setFormSurfaceM2('');
    setFormVolumeM3('');
    setFormLengthMl('');
    setFormThicknessMm('');
    setFormVisualPattern('');
    setShowAddForm(false);
    setEditingObj(null);
  };

  const startEdit = (obj: WallObject) => {
    setFormName(obj.name);
    setFormDescription(obj.description || '');
    setFormObjectType(obj.object_type);
    setFormIsCore(obj.is_core);
    setFormLayerOrder(obj.layer_order);
    setFormSurfaceM2(obj.surface_m2?.toString() || '');
    setFormVolumeM3(obj.volume_m3?.toString() || '');
    setFormLengthMl(obj.length_ml?.toString() || '');
    setFormThicknessMm((obj as any).thickness_mm?.toString() || '');
    setFormVisualPattern(obj.visual_pattern || '');
    setEditingObj(obj.id);
    setShowAddForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !wallId) return;
    // Auto-calculate surface and volume when no manual length
    const hasManualLength = !!formLengthMl;
    const effectiveSurface = hasManualLength
      ? (formSurfaceM2 ? parseFloat(formSurfaceM2) : null)
      : faceSurfaceM2 || null;
    const effectiveThickness = formThicknessMm ? parseFloat(formThicknessMm) : null;
    const effectiveVolume = hasManualLength
      ? (formVolumeM3 ? parseFloat(formVolumeM3) : null)
      : (effectiveSurface && effectiveThickness
          ? Math.round(effectiveSurface * effectiveThickness / 1000 * 1000) / 1000
          : null);

    const payload = {
      wall_id: wallId,
      name: formName.trim(),
      description: formDescription.trim() || null,
      object_type: formObjectType,
      is_core: formIsCore,
      layer_order: formLayerOrder,
      surface_m2: effectiveSurface,
      volume_m3: effectiveVolume,
      length_ml: formLengthMl ? parseFloat(formLengthMl) : null,
      thickness_mm: effectiveThickness,
      visual_pattern: formVisualPattern.trim() || null,
    };

    if (editingObj) {
      const { error } = await supabase.from('budget_wall_objects').update(payload).eq('id', editingObj);
      if (error) { toast.error('Error al actualizar objeto'); return; }
      toast.success('Objeto actualizado');
    } else {
      const { error } = await supabase.from('budget_wall_objects').insert(payload);
      if (error) { toast.error('Error al crear objeto'); return; }
      toast.success('Objeto creado');
    }
    resetForm();
    queryClient.invalidateQueries({ queryKey: ['wall-objects', wallId] });
  };

  const handleDelete = async (objId: string) => {
    // Prevent deleting automatic Superficie (order 0)
    const obj = objects.find(o => o.id === objId);
    if (obj && obj.layer_order === 0) {
      toast.error('La capa Superficie (orden 0) es automática y no se puede eliminar');
      return;
    }
    const { error } = await supabase.from('budget_wall_objects').delete().eq('id', objId);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Objeto eliminado');
    queryClient.invalidateQueries({ queryKey: ['wall-objects', wallId] });
  };

  const stripMetricFromDescription = (description: string | null) => {
    if (!description) return `${roomName} / ${wallLabel}`;
    return description.replace(/\s+—\s+[-\d.,]+\s*(m²|m³|ml)\s*$/u, '').trim();
  };

  const openSuperficieMetricsEditor = (obj: WallObject) => {
    setEditingSuperficieMetrics(obj.id);
    setManualSurfaceM2(obj.surface_m2 != null ? String(obj.surface_m2) : '');
    setManualVolumeM3(obj.volume_m3 != null ? String(obj.volume_m3) : '');
  };

  const saveSuperficieMetrics = async (obj: WallObject) => {
    const parseMaybeNumber = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number.parseFloat(trimmed.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : NaN;
    };

    const parsedM2 = parseMaybeNumber(manualSurfaceM2);
    const parsedM3 = parseMaybeNumber(manualVolumeM3);

    if (Number.isNaN(parsedM2) || Number.isNaN(parsedM3)) {
      toast.error('Introduce valores numéricos válidos');
      return;
    }

    const metricLabel = parsedM2 != null
      ? `${parsedM2} m²`
      : parsedM3 != null
        ? `${parsedM3} m³`
        : null;

    const baseDescription = stripMetricFromDescription(obj.description);
    const nextDescription = metricLabel ? `${baseDescription} — ${metricLabel}` : baseDescription;

    setSavingSuperficieMetrics(true);
    const { error } = await supabase
      .from('budget_wall_objects')
      .update({
        surface_m2: parsedM2,
        volume_m3: parsedM3,
        description: nextDescription,
      })
      .eq('id', obj.id);
    setSavingSuperficieMetrics(false);

    if (error) {
      toast.error('No se pudo guardar la medida manual');
      return;
    }

    setEditingSuperficieMetrics(null);
    toast.success('Medida de superficie actualizada');
    queryClient.invalidateQueries({ queryKey: ['wall-objects', wallId] });
    queryClient.invalidateQueries({ queryKey: ['budget-wall-objects-all'] });
  };

  const isExterior = wallType.startsWith('exterior');
  const isInvisible = wallType.includes('invisible');
  const isEspacio = wallType === 'espacio';
  const isSuelo = wallIndex === -1;
  const isTecho = wallIndex === -2;
  const isWall = !isEspacio && !isSuelo && !isTecho;

  // Pick the right type list and label
  const typeOptions = isSuelo ? FLOOR_TYPES : isTecho ? CEILING_TYPES : WALL_TYPES;
  const typeLabel = isSuelo ? 'Tipo de suelo' : isTecho ? 'Tipo de techo' : 'Tipo de pared';
  const faceIcon = isEspacio ? '🔷' : isSuelo ? '⬛' : isTecho ? '⬜' : '🧱';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">
            {faceIcon} {wallLabel} — {roomName}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Type selector — shown for walls, floors and ceilings; hidden for Espacio */}
          {!isEspacio && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{typeLabel}</Label>
              <Select value={wallType} onValueChange={onWallTypeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1.5">
                {isWall && <Badge variant="outline" className="text-[9px] h-4">{isExterior ? 'Exterior' : 'Interior'}</Badge>}
                {isInvisible && <Badge variant="secondary" className="text-[9px] h-4">Invisible — sin representación</Badge>}
                {wallType.includes('compartid') && <Badge variant="secondary" className="text-[9px] h-4">Compartido con otro espacio</Badge>}
              </div>
            </div>
          )}
          {isEspacio && (
            <p className="text-[10px] text-muted-foreground">
              Volumen interior del espacio de trabajo. Añade objetos como mobiliario, instalaciones, etc.
            </p>
          )}

          {/* Objects/Layers section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Objetos / Capas</Label>
              <Badge variant="secondary" className="text-[9px] h-4">{objects.length}</Badge>
            </div>

            {isInvisible && (
              <p className="text-[10px] text-muted-foreground italic">
                Pared invisible — los objetos no se representan visualmente
              </p>
            )}

            <p className="text-[10px] text-muted-foreground">
              {isExterior
                ? 'Orden: del exterior (1) al interior (N)'
                : 'Orden: por capas constructivas'}
            </p>

            {isLoading ? (
              <p className="text-xs text-muted-foreground">Cargando...</p>
            ) : objects.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3 border rounded bg-muted/20">
                Sin objetos definidos
              </p>
            ) : (
              <div className="space-y-1">
                {objects.map(obj => {
                  const isAutoSuperficie = obj.layer_order === 0;
                  return (
                  <div
                    key={obj.id}
                    className={`flex items-start gap-2 p-2 rounded border text-xs transition-colors cursor-pointer ${isAutoSuperficie ? 'border-accent bg-accent/10 hover:bg-accent/20' : obj.is_core ? 'border-primary/30 bg-primary/5' : 'hover:bg-accent/30'}`}
                    onClick={() => {
                      if (isAutoSuperficie) {
                        // Allow editing pattern on Superficie
                        setEditingSuperficiePattern(obj.id);
                      } else {
                        startEdit(obj);
                      }
                    }}
                  >
                    <span className="text-muted-foreground font-mono w-5 text-center shrink-0 mt-0.5">
                      {obj.layer_order}
                    </span>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{obj.name}</span>
                        {isAutoSuperficie && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 gap-0.5 border-accent">
                            Auto
                          </Badge>
                        )}
                        {isAutoSuperficie && obj.surface_m2 != null && (
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                            📐 {obj.surface_m2} m²
                          </Badge>
                        )}
                        {obj.is_core && (
                          <Badge variant="default" className="text-[8px] h-3.5 px-1 gap-0.5">
                            <Star className="h-2 w-2" /> Núcleo
                          </Badge>
                        )}
                        {!isAutoSuperficie && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                            {OBJECT_TYPES.find(t => t.value === obj.object_type)?.label || obj.object_type}
                          </Badge>
                        )}
                      </div>
                      {obj.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{obj.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {obj.visual_pattern && getPatternById(obj.visual_pattern) && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1 gap-0.5">
                            <img src={patternPreviewDataUri(getPatternById(obj.visual_pattern)!)} className="w-3 h-3 rounded" alt="" />
                            {getPatternById(obj.visual_pattern)!.label}
                          </Badge>
                        )}
                        {(obj as any).thickness_mm != null && (
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">🧱 {(obj as any).thickness_mm} mm</Badge>
                        )}
                        {obj.surface_m2 != null && (
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📐 {obj.surface_m2} m²</Badge>
                        )}
                        {obj.volume_m3 != null && (
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📦 {obj.volume_m3} m³</Badge>
                        )}
                        {obj.length_ml != null && (
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">📏 {obj.length_ml} ml</Badge>
                        )}
                      </div>
                      {/* Inline pattern selector for Superficie */}
                      {isAutoSuperficie && editingSuperficiePattern === obj.id && (
                        <div className="mt-1" onClick={e => e.stopPropagation()}>
                          <Select
                            value={obj.visual_pattern || '_none'}
                            onValueChange={async (v) => {
                              const pat = v === '_none' ? null : v;
                              await supabase.from('budget_wall_objects').update({ visual_pattern: pat }).eq('id', obj.id);
                              queryClient.invalidateQueries({ queryKey: ['wall-objects', wallId] });
                              setEditingSuperficiePattern(null);
                              toast.success('Patrón actualizado');
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <div className="flex items-center gap-1.5">
                                {obj.visual_pattern && getPatternById(obj.visual_pattern) ? (
                                  <>
                                    <img src={patternPreviewDataUri(getPatternById(obj.visual_pattern)!)} className="w-4 h-4 rounded border" alt="" />
                                    <span>{getPatternById(obj.visual_pattern)!.label}</span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">Sin patrón — elegir</span>
                                )}
                              </div>
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="_none" className="text-xs">
                                <span className="text-muted-foreground">Vacío — sin patrón</span>
                              </SelectItem>
                              {SUPERFICIE_PATTERNS.filter(p => p.id !== 'vacio').map(p => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <img src={patternPreviewDataUri(p)} className="w-4 h-4 rounded border" alt="" />
                                    <span>{p.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {isAutoSuperficie && editingSuperficiePattern !== obj.id && (
                        <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Paintbrush className="h-2.5 w-2.5" />
                          {obj.visual_pattern && getPatternById(obj.visual_pattern)
                            ? `Patrón: ${getPatternById(obj.visual_pattern)!.label}`
                            : 'Clic para asignar patrón visual'}
                        </p>
                      )}

                      {isAutoSuperficie && (
                        <div className="mt-1" onClick={e => e.stopPropagation()}>
                          {editingSuperficieMetrics === obj.id ? (
                            <div className="space-y-1.5 border rounded p-1.5 bg-background">
                              <div className="flex items-center gap-1 flex-wrap">
                                <Label className="text-[9px]">m² manual</Label>
                                <Input
                                  className="h-6 w-24 text-[10px]"
                                  type="number"
                                  step="0.01"
                                  value={manualSurfaceM2}
                                  onChange={e => setManualSurfaceM2(e.target.value)}
                                  placeholder="Ej: 0"
                                />
                                <Label className="text-[9px]">m³</Label>
                                <Input
                                  className="h-6 w-24 text-[10px]"
                                  type="number"
                                  step="0.001"
                                  value={manualVolumeM3}
                                  onChange={e => setManualVolumeM3(e.target.value)}
                                  placeholder="Opcional"
                                />
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  className="h-6 text-[10px] px-2"
                                  disabled={savingSuperficieMetrics}
                                  onClick={() => void saveSuperficieMetrics(obj)}
                                >
                                  {savingSuperficieMetrics ? 'Guardando...' : 'Guardar medida'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setEditingSuperficieMetrics(null)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => openSuperficieMetricsEditor(obj)}
                            >
                              Editar medida manual
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    {!isAutoSuperficie && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(obj.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Quick Superficie layer form */}
            {showSuperficieForm && !showAddForm && (
              <div className="space-y-2 border rounded p-2.5 bg-accent/10 border-accent">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold">Nueva capa Superficie</Label>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setShowSuperficieForm(false)}>✕</Button>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  Hereda automáticamente los m² de la cara ({faceSurfaceM2 || '—'} m²). Solo indica nombre y posición.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">Nombre *</Label>
                    <Input className="h-7 text-xs" value={supName} onChange={e => setSupName(e.target.value)} placeholder="Ej: Enfoscado, Alicatado..." />
                  </div>
                  <div>
                    <Label className="text-[10px]">Orden capa</Label>
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      value={supLayerOrder}
                      onChange={e => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        setSupLayerOrder(Number.isNaN(parsed) ? 1 : parsed);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Patrón visual</Label>
                    <Select value={supVisualPattern || '_none'} onValueChange={v => setSupVisualPattern(v === '_none' ? '' : v)}>
                      <SelectTrigger className="h-7 text-xs">
                        <div className="flex items-center gap-1.5">
                          {supVisualPattern && getPatternById(supVisualPattern) ? (
                            <>
                              <img src={patternPreviewDataUri(getPatternById(supVisualPattern)!)} className="w-4 h-4 rounded border" alt="" />
                              <span>{getPatternById(supVisualPattern)!.label}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sin patrón</span>
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="_none" className="text-xs">
                          <span className="text-muted-foreground">Sin patrón</span>
                        </SelectItem>
                        {SUPERFICIE_PATTERNS.map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <img src={patternPreviewDataUri(p)} className="w-4 h-4 rounded border" alt="" />
                              <span>{p.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowSuperficieForm(false)}>Cancelar</Button>
                  <Button size="sm" className="h-6 text-[10px] gap-1" disabled={!supName.trim()} onClick={async () => {
                    if (!supName.trim() || !wallId) return;
                    const faceLabel = wallLabel || (wallIndex === 0 ? 'Espacio' : wallIndex === -1 ? 'Suelo' : wallIndex === -2 ? 'Techo' : `Pared ${wallIndex}`);
                    const { error } = await supabase.from('budget_wall_objects').insert({
                      wall_id: wallId,
                      layer_order: supLayerOrder,
                      name: supName.trim(),
                      description: `${roomName} / ${faceLabel} — ${faceSurfaceM2 || 0} m²`,
                      object_type: 'material',
                      is_core: false,
                      surface_m2: faceSurfaceM2 || null,
                      volume_m3: null,
                      visual_pattern: supVisualPattern.trim() || null,
                    });
                    if (error) { toast.error('Error al crear superficie'); return; }
                    toast.success('Capa Superficie creada');
                    setShowSuperficieForm(false);
                    setSupName('');
                    setSupVisualPattern('');
                    queryClient.invalidateQueries({ queryKey: ['wall-objects', wallId] });
                  }}>
                    <Save className="h-3 w-3" /> Crear
                  </Button>
                </div>
              </div>
            )}

            {/* Add/Edit full object form */}
            {showAddForm ? (
              <div className="space-y-2 border rounded p-2.5 bg-muted/10">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold">
                    {editingObj ? 'Editar objeto' : 'Nuevo objeto'}
                  </Label>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={resetForm}>✕</Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">Nombre *</Label>
                    <Input className="h-7 text-xs" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Bloque 625x250x300" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Tipo</Label>
                    <Select value={formObjectType} onValueChange={setFormObjectType}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OBJECT_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Orden capa</Label>
                    <Input
                      className="h-7 text-xs"
                      type="number"
                      value={formLayerOrder}
                      onChange={e => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        setFormLayerOrder(Number.isNaN(parsed) ? 1 : parsed);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Espesor (mm)</Label>
                    <Input className="h-7 text-xs" type="number" step="1" min={0} value={formThicknessMm} onChange={e => setFormThicknessMm(e.target.value)} placeholder="Ej: 300" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Longitud ml</Label>
                    <Input className="h-7 text-xs" type="number" step="0.01" value={formLengthMl} onChange={e => setFormLengthMl(e.target.value)} placeholder="Solo si lineal" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Superficie m²</Label>
                    {!formLengthMl ? (
                      <>
                        <Input className="h-7 text-xs bg-muted/30" type="number" value={faceSurfaceM2 || ''} disabled />
                        <p className="text-[8px] text-muted-foreground mt-0.5">Auto: hereda de la cara</p>
                      </>
                    ) : (
                      <Input className="h-7 text-xs" type="number" step="0.01" value={formSurfaceM2} onChange={e => setFormSurfaceM2(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px]">Volumen m³</Label>
                    {!formLengthMl ? (
                      <>
                        <Input
                          className="h-7 text-xs bg-muted/30"
                          type="number"
                          value={faceSurfaceM2 && formThicknessMm
                            ? (Math.round(faceSurfaceM2 * parseFloat(formThicknessMm) / 1000 * 1000) / 1000)
                            : ''}
                          disabled
                        />
                        <p className="text-[8px] text-muted-foreground mt-0.5">
                          {formThicknessMm ? `Auto: ${faceSurfaceM2} m² × ${formThicknessMm} mm` : 'Rellena espesor para calcular'}
                        </p>
                      </>
                    ) : (
                      <Input className="h-7 text-xs" type="number" step="0.001" value={formVolumeM3} onChange={e => setFormVolumeM3(e.target.value)} />
                    )}
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Patrón visual</Label>
                    <Select value={formVisualPattern || '_none'} onValueChange={v => setFormVisualPattern(v === '_none' ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <div className="flex items-center gap-2">
                          {formVisualPattern && getPatternById(formVisualPattern) ? (
                            <>
                              <img src={patternPreviewDataUri(getPatternById(formVisualPattern)!)} className="w-5 h-5 rounded border" alt="" />
                              <span>{getPatternById(formVisualPattern)!.label}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sin patrón</span>
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="_none" className="text-xs">
                          <span className="text-muted-foreground">Sin patrón</span>
                        </SelectItem>
                        {PATTERN_CATEGORIES.map(cat => (
                          <div key={cat.id}>
                            <div className="px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground tracking-wider">{cat.label}</div>
                            {VISUAL_PATTERNS.filter(p => p.category === cat.id).map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <img src={patternPreviewDataUri(p)} className="w-5 h-5 rounded border" alt="" />
                                  <span>{p.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Descripción</Label>
                    <Textarea className="text-xs min-h-[40px]" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Material, composición..." />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={formIsCore} onCheckedChange={(v) => setFormIsCore(!!v)} />
                      <span className="text-[10px] font-medium">Es núcleo estructural</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={resetForm}>Cancelar</Button>
                  <Button size="sm" className="h-6 text-[10px] gap-1" onClick={handleSave} disabled={!formName.trim()}>
                    <Save className="h-3 w-3" /> {editingObj ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </div>
            ) : !showSuperficieForm && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => {
                  const nextOrder = objects.length > 0 ? Math.max(...objects.map(o => o.layer_order)) + 1 : 1;
                  setSupLayerOrder(nextOrder);
                  setSupName('');
                  setSupVisualPattern('');
                  setShowSuperficieForm(true);
                }}>
                  <Layers className="h-3 w-3" /> Superficie
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1" onClick={() => {
                  resetForm();
                  setFormLayerOrder(objects.length > 0 ? Math.max(...objects.map(o => o.layer_order)) + 1 : 1);
                  setShowAddForm(true);
                }}>
                  <Plus className="h-3 w-3" /> Objeto/capa
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
