import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Layers, List, Search, Box, ChevronRight, Package, Plus, Trash2, Edit2, Save, X, Archive, Tag, ImageIcon, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WallObjectsPanel } from './WallObjectsPanel';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* ── Resizable column table ── */
interface ColDef {
  key: string;
  header: string;
  defaultWidth: number;
  minWidth: number;
}

interface TableRow<T> {
  face: T;
  cells: Record<string, string>;
}

function ResizableTable<T>({
  columns,
  rows,
  onRowClick,
  className,
}: {
  columns: ColDef[];
  rows: TableRow<T>[];
  onRowClick: (row: TableRow<T>) => void;
  className?: string;
}) {
  const [widths, setWidths] = useState<number[]>(() => columns.map(c => c.defaultWidth));
  const dragRef = useRef<{ colIdx: number; startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback(
    (colIdx: number, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { colIdx, startX: e.clientX, startW: widths[colIdx] };
      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const newW = Math.max(columns[dragRef.current.colIdx].minWidth, dragRef.current.startW + delta);
        setWidths(prev => {
          const next = [...prev];
          next[dragRef.current!.colIdx] = newW;
          return next;
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths, columns],
  );

  return (
    <div className={cn('border rounded overflow-auto', className)}>
      <table className="border-collapse" style={{ tableLayout: 'fixed', width: widths.reduce((a, b) => a + b, 0) + columns.length * 1 }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-muted/50">
            {columns.map((col, ci) => (
              <th
                key={col.key}
                className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5 relative select-none"
              >
                {col.header}
                <span
                  onPointerDown={e => onPointerDown(ci, e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              onClick={() => onRowClick(row)}
              className="border-t hover:bg-accent/30 transition-colors cursor-pointer"
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className="text-left text-sm px-2 py-1 break-words align-top"
                >
                  {row.cells[col.key] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Types ── */
interface WallObjectsListProps {
  budgetId: string;
}

interface PolygonVertex { x: number; y: number }

function polygonArea(vertices: PolygonVertex[]): number {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

function edgeLength(a: PolygonVertex, b: PolygonVertex): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

interface AutoFace {
  workspace: string;
  roomId: string;
  faceName: string;
  m2: number | null;
  m3: number | null;
  sortKey: number;
  wallIndex: number;
}

interface ObjectTemplate {
  id: string;
  budget_id: string;
  name: string;
  material_type: string | null;
  technical_description: string | null;
  width_mm: number | null;
  height_mm: number | null;
  thickness_mm: number | null;
  purchase_price_vat_included: number | null;
  vat_included_percent: number | null;
  safety_margin_percent: number | null;
  sales_margin_percent: number | null;
  object_type: string;
  unit_measure: string | null;
  image_url: string | null;
}

const UNIT_MEASURES = ['m2', 'm3', 'ml', 'ud', 'kg', 'hora', 'día', 'mes'];

/* ── Object Type Manager (inline) ── */
function ObjectTypeManager({ budgetId, types, onRefresh }: {
  budgetId: string;
  types: { id: string; name: string }[];
  onRefresh: () => void;
}) {
  const [newType, setNewType] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = newType.trim();
    if (!trimmed) return;
    if (types.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Ese tipo ya existe');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('budget_object_type_catalog').insert({ budget_id: budgetId, name: trimmed });
    setAdding(false);
    if (error) { toast.error('Error al crear tipo'); return; }
    setNewType('');
    toast.success('Tipo creado');
    onRefresh();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el tipo "${name}"?`)) return;
    const { error } = await supabase.from('budget_object_type_catalog').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar tipo'); return; }
    toast.success('Tipo eliminado');
    onRefresh();
  };

  return (
    <div className="border rounded-lg p-2 space-y-2 bg-muted/20">
      <p className="text-xs font-semibold text-muted-foreground">Gestionar tipos de objeto</p>
      <div className="flex gap-1">
        <Input className="h-7 text-sm flex-1" placeholder="Nuevo tipo..." value={newType} onChange={e => setNewType(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <Button size="sm" className="h-7 text-xs px-2" onClick={handleAdd} disabled={adding || !newType.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {types.map(t => (
          <Badge key={t.id} variant="secondary" className="text-xs h-6 gap-1 pr-1">
            {t.name}
            <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.name); }}
              className="ml-0.5 hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

/* ── Template form ── */
function TemplateForm({ budgetId, template, objectTypes, onSaved, onCancel }: {
  budgetId: string;
  template?: ObjectTemplate | null;
  objectTypes: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [materialType, setMaterialType] = useState(template?.material_type || '');
  const [techDesc, setTechDesc] = useState(template?.technical_description || '');
  const [widthMm, setWidthMm] = useState(template?.width_mm?.toString() || '');
  const [heightMm, setHeightMm] = useState(template?.height_mm?.toString() || '');
  const [thicknessMm, setThicknessMm] = useState(template?.thickness_mm?.toString() || '');
  const [price, setPrice] = useState(template?.purchase_price_vat_included?.toString() || '0');
  const [vatPct, setVatPct] = useState(template?.vat_included_percent?.toString() || '21');
  const [safetyPct, setSafetyPct] = useState(template?.safety_margin_percent?.toString() || '0');
  const [salesPct, setSalesPct] = useState(template?.sales_margin_percent?.toString() || '0');
  const [objectType, setObjectType] = useState(template?.object_type || (objectTypes[0]?.name || 'Material'));
  const [unitMeasure, setUnitMeasure] = useState(template?.unit_measure || 'ud');
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(template?.image_url || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `object-templates/${budgetId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('resource-images').upload(path, file);
    if (error) { toast.error('Error subiendo imagen'); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('resource-images').getPublicUrl(path);
    setImageUrl(urlData.publicUrl);
    setUploading(false);
    toast.success('Imagen subida');
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    const payload = {
      budget_id: budgetId,
      name: name.trim(),
      material_type: materialType || null,
      technical_description: techDesc || null,
      width_mm: widthMm ? parseFloat(widthMm) : null,
      height_mm: heightMm ? parseFloat(heightMm) : null,
      thickness_mm: thicknessMm ? parseFloat(thicknessMm) : null,
      purchase_price_vat_included: parseFloat(price) || 0,
      vat_included_percent: parseFloat(vatPct) || 0,
      safety_margin_percent: parseFloat(safetyPct) || 0,
      sales_margin_percent: parseFloat(salesPct) || 0,
      object_type: objectType,
      unit_measure: unitMeasure,
    };
    let error;
    if (template) {
      ({ error } = await supabase.from('budget_object_templates').update(payload).eq('id', template.id));
    } else {
      ({ error } = await supabase.from('budget_object_templates').insert(payload));
    }
    setSaving(false);
    if (error) { toast.error('Error guardando objeto modelo'); return; }
    toast.success(template ? 'Objeto modelo actualizado' : 'Objeto modelo creado');
    onSaved();
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
          <Input className="h-8 text-sm" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo de objeto</label>
          <Select value={objectType} onValueChange={setObjectType}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {objectTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo de material</label>
          <Input className="h-8 text-sm" value={materialType} onChange={e => setMaterialType(e.target.value)} placeholder="Ej: Cerámica, Madera..." />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo de unidad</label>
          <Select value={unitMeasure} onValueChange={setUnitMeasure}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNIT_MEASURES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Ficha técnica / Descripción</label>
          <textarea className="w-full border rounded px-2 py-1 text-sm min-h-[50px] bg-background" value={techDesc} onChange={e => setTechDesc(e.target.value)} />
        </div>
      </div>

      <div className="border-t pt-2">
        <p className="text-xs font-semibold text-muted-foreground mb-1">Descripción Espacial (mm)</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Ancho</label>
            <Input className="h-7 text-sm" type="number" value={widthMm} onChange={e => setWidthMm(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Alto</label>
            <Input className="h-7 text-sm" type="number" value={heightMm} onChange={e => setHeightMm(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Espesor</label>
            <Input className="h-7 text-sm" type="number" value={thicknessMm} onChange={e => setThicknessMm(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="border-t pt-2">
        <p className="text-xs font-semibold text-muted-foreground mb-1">Precios y Márgenes</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Precio Compra/Ud (IVA incl.)</label>
            <Input className="h-7 text-sm" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">% IVA incluido</label>
            <Input className="h-7 text-sm" type="number" value={vatPct} onChange={e => setVatPct(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">% Margen seguridad</label>
            <Input className="h-7 text-sm" type="number" value={safetyPct} onChange={e => setSafetyPct(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">% Margen venta</label>
            <Input className="h-7 text-sm" type="number" value={salesPct} onChange={e => setSalesPct(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}><X className="h-3 w-3 mr-1" />Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}><Save className="h-3 w-3 mr-1" />{template ? 'Actualizar' : 'Crear'}</Button>
      </div>
    </div>
  );
}

/* ── Main component ── */
export function WallObjectsList({ budgetId }: WallObjectsListProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [mainTab, setMainTab] = useState<'modelos' | 'espacios'>('modelos');

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWallId, setPanelWallId] = useState<string | null>(null);
  const [panelWallIndex, setPanelWallIndex] = useState(0);
  const [panelWallType, setPanelWallType] = useState('exterior');
  const [panelWallLabel, setPanelWallLabel] = useState('');
  const [panelRoomName, setPanelRoomName] = useState('');

  // Template state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ObjectTemplate | null>(null);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [modelView, setModelView] = useState<'alpha' | 'type'>('alpha');

  /* ── Object type catalog query ── */
  const { data: objectTypes = [], refetch: refetchTypes } = useQuery({
    queryKey: ['budget-object-type-catalog', budgetId],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_object_type_catalog')
        .select('id, name')
        .eq('budget_id', budgetId)
        .order('name', { ascending: true });
      if (!data || data.length === 0) {
        // Seed defaults if none exist
        const defaults = ['Material', 'Aislamiento', 'Revestimiento', 'Estructura', 'Instalación', 'Acabado', 'Otro'];
        const inserts = defaults.map(name => ({ budget_id: budgetId, name }));
        await supabase.from('budget_object_type_catalog').insert(inserts);
        const { data: seeded } = await supabase.from('budget_object_type_catalog').select('id, name').eq('budget_id', budgetId).order('name');
        return (seeded || []) as { id: string; name: string }[];
      }
      return data as { id: string; name: string }[];
    },
  });

  /* ── Objetos modelo query ── */
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['budget-object-templates', budgetId],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_object_templates')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name', { ascending: true });
      return (data || []) as ObjectTemplate[];
    },
  });

  /* ── Auto faces query ── */
  const { data: autoFaces = [], isLoading } = useQuery({
    queryKey: ['budget-auto-faces', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id, scale_mode, block_length_mm')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];

      const cellSizeM = fp.scale_mode === 'bloque' ? (fp.block_length_mm || 625) / 1000 : 1;

      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name, length, width, height, floor_polygon, is_base, has_floor, has_ceiling')
        .eq('floor_plan_id', fp.id)
        .order('name', { ascending: true });
      if (!rooms) return [];

      const faces: AutoFace[] = [];

      for (const room of rooms) {
        if (room.is_base) continue;

        const poly = Array.isArray(room.floor_polygon) ? (room.floor_polygon as unknown as PolygonVertex[]) : null;
        const heightM = room.height || 2.5;

        let floorArea: number;
        if (poly && poly.length >= 3) {
          floorArea = polygonArea(poly) * cellSizeM * cellSizeM;
        } else {
          floorArea = (room.length || 0) * (room.width || 0);
        }

        faces.push({ workspace: room.name, roomId: room.id, faceName: 'Suelo', m2: Math.round(floorArea * 100) / 100, m3: null, sortKey: 0, wallIndex: -1 });

        const edgeCount = poly && poly.length >= 3 ? poly.length : 4;
        for (let i = 0; i < edgeCount; i++) {
          let wallLengthM: number;
          if (poly && poly.length >= 3) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            wallLengthM = edgeLength(a, b) * cellSizeM;
          } else {
            wallLengthM = i % 2 === 0 ? (room.length || 0) : (room.width || 0);
          }
          const wallArea = Math.round(wallLengthM * heightM * 100) / 100;
          faces.push({ workspace: room.name, roomId: room.id, faceName: `Pared ${i + 1}`, m2: wallArea, m3: null, sortKey: i + 1, wallIndex: i + 1 });
        }

        faces.push({ workspace: room.name, roomId: room.id, faceName: 'Techo', m2: Math.round(floorArea * 100) / 100, m3: null, sortKey: edgeCount + 1, wallIndex: -2 });

        const vol = Math.round(floorArea * heightM * 1000) / 1000;
        faces.push({ workspace: room.name, roomId: room.id, faceName: 'Espacio', m2: null, m3: vol, sortKey: edgeCount + 2, wallIndex: 0 });
      }

      return faces;
    },
  });

  // Fetch walls for panel opening
  const { data: allWalls = [] } = useQuery({
    queryKey: ['budget-walls-for-panel', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];
      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id')
        .eq('floor_plan_id', fp.id);
      if (!rooms?.length) return [];
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index, wall_type')
        .in('room_id', rooms.map(r => r.id));
      return walls || [];
    },
  });

  /* ── Placed objects (Objetos del espacio) ── */
  const { data: allObjects = [] } = useQuery({
    queryKey: ['budget-wall-objects-all', budgetId],
    queryFn: async () => {
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('id')
        .eq('budget_id', budgetId)
        .maybeSingle();
      if (!fp) return [];
      const { data: rooms } = await supabase
        .from('budget_floor_plan_rooms')
        .select('id, name')
        .eq('floor_plan_id', fp.id);
      if (!rooms?.length) return [];
      const roomMap = new Map(rooms.map(r => [r.id, r.name]));
      const { data: walls } = await supabase
        .from('budget_floor_plan_walls')
        .select('id, room_id, wall_index')
        .in('room_id', rooms.map(r => r.id));
      if (!walls?.length) return [];
      const wallRoomMap = new Map(walls.map(w => [w.id, { roomId: w.room_id, wallIndex: w.wall_index }]));
      const { data: objects } = await supabase
        .from('budget_wall_objects')
        .select('*')
        .in('wall_id', walls.map(w => w.id))
        .order('layer_order', { ascending: true });
      if (!objects?.length) return [];
      return objects.map((obj: any) => {
        const wallInfo = wallRoomMap.get(obj.wall_id);
        const workspace = wallInfo ? (roomMap.get(wallInfo.roomId) || '—') : '—';
        const wi = wallInfo?.wallIndex ?? 0;
        const faceName = wi === 0 ? 'Espacio' : wi === -1 ? 'Suelo' : wi === -2 ? 'Techo' : `Pared ${wi}`;
        return { ...obj, workspace, faceName };
      });
    },
  });

  const [placedView, setPlacedView] = useState<'alpha' | 'workspace' | 'type'>('alpha');
  const [resourceOpenGroups, setResourceOpenGroups] = useState<Set<string>>(new Set());

  const toggleResourceGroup = (name: string) => {
    setResourceOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredObjects = useMemo(() => {
    if (!search.trim()) return allObjects;
    const q = search.toLowerCase();
    return allObjects.filter((o: any) =>
      o.name.toLowerCase().includes(q) || o.workspace.toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q)
    );
  }, [allObjects, search]);

  const objectsAlpha = useMemo(() =>
    [...filteredObjects].sort((a: any, b: any) => a.name.localeCompare(b.name, 'es')),
  [filteredObjects]);

  const objectsByWorkspace = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const o of filteredObjects) {
      if (!groups.has(o.workspace)) groups.set(o.workspace, []);
      groups.get(o.workspace)!.push(o);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([name, objs]) => ({ name, objects: objs.sort((a: any, b: any) => a.layer_order - b.layer_order) }));
  }, [filteredObjects]);

  const objectsByType = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const o of filteredObjects) {
      const type = o.object_type || 'Sin tipo';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(o);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([name, objs]) => ({ name, objects: objs.sort((a: any, b: any) => a.name.localeCompare(b.name, 'es')) }));
  }, [filteredObjects]);

  /* ── Templates by type ── */
  const templatesByType = useMemo(() => {
    const groups = new Map<string, ObjectTemplate[]>();
    const src = search.trim()
      ? templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || (t.material_type || '').toLowerCase().includes(search.toLowerCase()))
      : templates;
    for (const t of src) {
      const type = t.object_type || 'Sin tipo';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(t);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name, 'es')) }));
  }, [templates, search]);

  const ensureSuperficieObject = async (wallId: string, face: AutoFace) => {
    const { data: existing } = await supabase
      .from('budget_wall_objects')
      .select('id')
      .eq('wall_id', wallId)
      .eq('layer_order', 0)
      .maybeSingle();
    if (existing) return;

    const surfaceM2 = face.m2 ?? null;
    const volumeM3 = face.m3 ?? null;
    const faceLabel = face.faceName;

    await supabase.from('budget_wall_objects').insert({
      wall_id: wallId,
      layer_order: 0,
      name: 'Superficie',
      description: `${faceLabel}/${face.workspace}`,
      object_type: 'material',
      is_core: false,
      surface_m2: surfaceM2,
      volume_m3: volumeM3,
    });
  };

  const handleFaceClick = async (face: AutoFace) => {
    let wall = allWalls.find(w => w.room_id === face.roomId && w.wall_index === face.wallIndex);
    if (!wall) {
      const wallType = face.wallIndex === 0 ? 'espacio' : face.wallIndex === -1 ? 'suelo_basico' : face.wallIndex === -2 ? 'techo_basico' : 'exterior';
      const { data: newWall, error } = await supabase
        .from('budget_floor_plan_walls')
        .insert({ room_id: face.roomId, wall_index: face.wallIndex, wall_type: wallType })
        .select()
        .single();
      if (error || !newWall) {
        toast.error('Error al abrir el ámbito');
        return;
      }
      wall = newWall;
    }
    await ensureSuperficieObject(wall.id, face);
    setPanelWallId(wall.id);
    setPanelWallIndex(face.wallIndex);
    setPanelWallType(wall.wall_type);
    setPanelWallLabel(face.faceName);
    setPanelRoomName(face.workspace);
    setPanelOpen(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('budget_object_templates').delete().eq('id', id);
    if (error) { toast.error('Error eliminando'); return; }
    toast.success('Objeto modelo eliminado');
    queryClient.invalidateQueries({ queryKey: ['budget-object-templates', budgetId] });
  };

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(t => t.name.toLowerCase().includes(q) || (t.material_type || '').toLowerCase().includes(q) || (t.object_type || '').toLowerCase().includes(q));
  }, [templates, search]);

  const faceIcon = (name: string) =>
    name === 'Espacio' ? '🔷' : name === 'Suelo' ? '⬛' : name === 'Techo' ? '⬜' : '🧱';

  const placedColumns: ColDef[] = [
    { key: 'order', header: '#', defaultWidth: 36, minWidth: 30 },
    { key: 'name', header: 'Objeto', defaultWidth: 150, minWidth: 80 },
    { key: 'face', header: 'Cara', defaultWidth: 80, minWidth: 50 },
    { key: 'workspace', header: 'Espacio', defaultWidth: 110, minWidth: 60 },
    { key: 'type', header: 'Tipo', defaultWidth: 80, minWidth: 50 },
    { key: 'thickness', header: 'Espesor', defaultWidth: 65, minWidth: 45 },
    { key: 'm2', header: 'm²', defaultWidth: 65, minWidth: 45 },
    { key: 'm3', header: 'm³', defaultWidth: 65, minWidth: 45 },
  ];

  const modelColumns: ColDef[] = [
    { key: 'name', header: 'Nombre', defaultWidth: 140, minWidth: 80 },
    { key: 'type', header: 'Tipo', defaultWidth: 90, minWidth: 50 },
    { key: 'unit', header: 'Ud', defaultWidth: 50, minWidth: 35 },
    { key: 'material', header: 'Material', defaultWidth: 100, minWidth: 50 },
    { key: 'dims', header: 'Dimensiones (mm)', defaultWidth: 130, minWidth: 70 },
    { key: 'price', header: 'Precio', defaultWidth: 80, minWidth: 50 },
  ];

  const templateToRow = (t: ObjectTemplate) => ({
    face: t as any,
    cells: {
      name: t.name,
      type: t.object_type || '',
      unit: t.unit_measure || 'ud',
      material: t.material_type || '',
      dims: [t.width_mm && `A:${t.width_mm}`, t.height_mm && `H:${t.height_mm}`, t.thickness_mm && `E:${t.thickness_mm}`].filter(Boolean).join(' '),
      price: t.purchase_price_vat_included ? `${t.purchase_price_vat_included}€` : '',
    },
  });

  const placedRow = (o: any) => ({
    face: { workspace: o.workspace, roomId: '', faceName: o.faceName, m2: o.surface_m2, m3: o.volume_m3, sortKey: 0, wallIndex: 0 } as AutoFace,
    cells: {
      order: String(o.layer_order),
      name: o.layer_order === 0 ? `⭐ ${o.name}` : o.name,
      face: o.faceName,
      workspace: o.workspace,
      type: o.object_type || '',
      thickness: o.thickness_mm ? `${o.thickness_mm} mm` : '',
      m2: o.surface_m2 != null ? o.surface_m2.toFixed(2) : '',
      m3: o.volume_m3 != null ? o.volume_m3.toFixed(3) : '',
    },
  });

  if (isLoading || templatesLoading) return <p className="text-sm text-muted-foreground py-2">Cargando objetos...</p>;

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-9 text-sm pl-8"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Tabs value={mainTab} onValueChange={v => setMainTab(v as any)} className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="modelos" className="text-xs h-7 gap-1">
            <Archive className="h-3.5 w-3.5" /> Objetos modelo
          </TabsTrigger>
          <TabsTrigger value="espacios" className="text-xs h-7 gap-1">
            <Box className="h-3.5 w-3.5" /> Objetos del espacio
          </TabsTrigger>
        </TabsList>

        {/* ── Objetos modelo ── */}
        <TabsContent value="modelos" className="mt-2 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs h-6 gap-1">
              <Package className="h-3.5 w-3.5" /> {filteredTemplates.length} modelos
            </Badge>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowTypeManager(!showTypeManager)}>
                <Tag className="h-3 w-3" /> Tipos
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditingTemplate(null); setShowTemplateForm(true); }}>
                <Plus className="h-3 w-3" /> Nuevo modelo
              </Button>
            </div>
          </div>

          {showTypeManager && (
            <ObjectTypeManager
              budgetId={budgetId}
              types={objectTypes}
              onRefresh={() => {
                refetchTypes();
                queryClient.invalidateQueries({ queryKey: ['budget-object-type-catalog', budgetId] });
              }}
            />
          )}

          {showTemplateForm && (
            <TemplateForm
              budgetId={budgetId}
              template={editingTemplate}
              objectTypes={objectTypes}
              onSaved={() => {
                setShowTemplateForm(false);
                setEditingTemplate(null);
                queryClient.invalidateQueries({ queryKey: ['budget-object-templates', budgetId] });
              }}
              onCancel={() => { setShowTemplateForm(false); setEditingTemplate(null); }}
            />
          )}

          {/* View toggle for models */}
          <div className="flex gap-1">
            <Button variant={modelView === 'alpha' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setModelView('alpha')}>
              <List className="h-3 w-3" /> Alfabético
            </Button>
            <Button variant={modelView === 'type' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setModelView('type')}>
              <Package className="h-3 w-3" /> Por tipo
            </Button>
          </div>

          {filteredTemplates.length === 0 && !showTemplateForm ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No hay objetos modelo definidos</p>
          ) : modelView === 'alpha' ? (
            <ResizableTable
              columns={modelColumns}
              rows={filteredTemplates.map(templateToRow)}
              onRowClick={(row) => {
                const t = row.face as unknown as ObjectTemplate;
                setEditingTemplate(t);
                setShowTemplateForm(true);
              }}
            />
          ) : (
            <div className="space-y-1.5">
              {templatesByType.map(group => {
                const isOpen = resourceOpenGroups.has(`mt-${group.name}`);
                return (
                  <Collapsible key={group.name} open={isOpen} onOpenChange={() => toggleResourceGroup(`mt-${group.name}`)}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 bg-accent/30 hover:bg-accent/50 transition-colors text-left">
                      <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')} />
                      <span className="text-sm font-semibold flex-1">{group.name}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{group.items.length}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ResizableTable
                        columns={modelColumns.filter(c => c.key !== 'type')}
                        rows={group.items.map(templateToRow)}
                        onRowClick={(row) => {
                          const t = row.face as unknown as ObjectTemplate;
                          setEditingTemplate(t);
                          setShowTemplateForm(true);
                        }}
                        className="ml-6 mt-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Objetos del espacio ── */}
        <TabsContent value="espacios" className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary" className="text-xs h-6 gap-1">
              <Layers className="h-3.5 w-3.5" /> {filteredObjects.length} objetos colocados
            </Badge>
          </div>

          <div className="flex gap-1">
            <Button variant={placedView === 'alpha' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setPlacedView('alpha')}>
              <List className="h-3 w-3" /> Alfabético
            </Button>
            <Button variant={placedView === 'workspace' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setPlacedView('workspace')}>
              <Layers className="h-3 w-3" /> Por espacio
            </Button>
            <Button variant={placedView === 'type' ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setPlacedView('type')}>
              <Package className="h-3 w-3" /> Por tipo
            </Button>
          </div>

          {filteredObjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No hay objetos colocados en espacios</p>
          ) : placedView === 'alpha' ? (
            <ResizableTable columns={placedColumns} rows={objectsAlpha.map(placedRow)} onRowClick={() => {}} />
          ) : placedView === 'workspace' ? (
            <div className="space-y-1.5">
              {objectsByWorkspace.map(group => {
                const isOpen = resourceOpenGroups.has(`ws-${group.name}`);
                return (
                  <Collapsible key={group.name} open={isOpen} onOpenChange={() => toggleResourceGroup(`ws-${group.name}`)}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 bg-accent/30 hover:bg-accent/50 transition-colors text-left">
                      <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')} />
                      <span className="text-sm font-semibold flex-1">{group.name}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{group.objects.length}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ResizableTable
                        columns={placedColumns.filter(c => c.key !== 'workspace')}
                        rows={group.objects.map((o: any) => ({
                          ...placedRow(o),
                          cells: { ...placedRow(o).cells },
                        }))}
                        onRowClick={() => {}}
                        className="ml-6 mt-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            /* By type */
            <div className="space-y-1.5">
              {objectsByType.map(group => {
                const isOpen = resourceOpenGroups.has(`tp-${group.name}`);
                return (
                  <Collapsible key={group.name} open={isOpen} onOpenChange={() => toggleResourceGroup(`tp-${group.name}`)}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 bg-accent/30 hover:bg-accent/50 transition-colors text-left">
                      <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')} />
                      <span className="text-sm font-semibold flex-1">{group.name}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{group.objects.length}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ResizableTable
                        columns={placedColumns.filter(c => c.key !== 'type')}
                        rows={group.objects.map((o: any) => ({
                          ...placedRow(o),
                          cells: { ...placedRow(o).cells },
                        }))}
                        onRowClick={() => {}}
                        className="ml-6 mt-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Panel for editing wall objects */}
      <WallObjectsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        wallId={panelWallId}
        wallIndex={panelWallIndex}
        wallType={panelWallType}
        wallLabel={panelWallLabel}
        roomName={panelRoomName}
        onWallTypeChange={(newType) => setPanelWallType(newType)}
      />
    </div>
  );
}
