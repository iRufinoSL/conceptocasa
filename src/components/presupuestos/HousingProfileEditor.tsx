import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { 
  Ruler, Layers, Square, Calculator, Save, Plus, Trash2,
  BedDouble, Bath, Sofa, UtensilsCrossed, WashingMachine, 
  Archive, Home, Fence, Car, DoorOpen, LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/lib/format-utils';

export type SpaceType = 'habitacion' | 'bano' | 'salon' | 'cocina' | 'lavanderia' | 'despensa' | 'porche' | 'patio' | 'garaje' | 'vestidor' | 'otro';
export type WindowSize = 'pequeña' | 'mediana' | 'grande' | 'balconera';

export interface SpaceDetail {
  id: string;
  name: string;
  type: SpaceType;
  m2: number | null;
  num_ventanas: number;
  tamano_ventanas: WindowSize | null;
  tiene_puerta: boolean;
}

interface ConstructionParams {
  altura_habitaciones: number | null;
  espesor_paredes_externas: number | null;
  espesor_paredes_internas: number | null;
}

interface HousingProfileEditorProps {
  projectId: string;
  profile: {
    num_habitaciones_total: string | null;
    num_banos_total: string | null;
    tipo_salon: string | null;
    tipo_cocina: string | null;
    lavanderia: string | null;
    despensa: string | null;
    porche_cubierto: string | null;
    patio_descubierto: string | null;
    garaje: string | null;
    num_habitaciones_con_vestidor: string | null;
    m2_por_planta: string | null;
    altura_habitaciones?: number | null;
    espesor_paredes_externas?: number | null;
    espesor_paredes_internas?: number | null;
    espacios_detalle?: SpaceDetail[] | null;
  };
  onUpdate: () => void;
}

const spaceTypeLabels: Record<SpaceDetail['type'], string> = {
  habitacion: 'Habitación',
  bano: 'Baño',
  salon: 'Salón',
  cocina: 'Cocina',
  lavanderia: 'Lavandería',
  despensa: 'Despensa',
  porche: 'Porche',
  patio: 'Patio',
  garaje: 'Garaje',
  vestidor: 'Vestidor',
  otro: 'Otro'
};

const spaceTypeIcons: Record<SpaceDetail['type'], React.ReactNode> = {
  habitacion: <BedDouble className="h-4 w-4" />,
  bano: <Bath className="h-4 w-4" />,
  salon: <Sofa className="h-4 w-4" />,
  cocina: <UtensilsCrossed className="h-4 w-4" />,
  lavanderia: <WashingMachine className="h-4 w-4" />,
  despensa: <Archive className="h-4 w-4" />,
  porche: <Home className="h-4 w-4" />,
  patio: <Fence className="h-4 w-4" />,
  garaje: <Car className="h-4 w-4" />,
  vestidor: <DoorOpen className="h-4 w-4" />,
  otro: <LayoutGrid className="h-4 w-4" />
};

const windowSizeLabels: Record<string, string> = {
  pequeña: 'Pequeña',
  mediana: 'Mediana',
  grande: 'Grande',
  balconera: 'Balconera'
};

// Window size in m² for calculations
const windowSizeM2: Record<string, number> = {
  pequeña: 0.5,
  mediana: 1.0,
  grande: 1.5,
  balconera: 2.5
};

const EXTERNAL_DOOR_M2 = 2.0; // Standard external door size

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function HousingProfileEditor({ projectId, profile, onUpdate }: HousingProfileEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  // Construction parameters
  const [constructionParams, setConstructionParams] = useState<ConstructionParams>({
    altura_habitaciones: profile.altura_habitaciones ?? null,
    espesor_paredes_externas: profile.espesor_paredes_externas ?? null,
    espesor_paredes_internas: profile.espesor_paredes_internas ?? null
  });
  
  // Space details
  const [spaces, setSpaces] = useState<SpaceDetail[]>(() => {
    if (profile.espacios_detalle && Array.isArray(profile.espacios_detalle)) {
      return profile.espacios_detalle;
    }
    // Initialize from profile data
    return generateInitialSpaces(profile);
  });

  // Parse m2_por_planta for calculations
  const floorAreas = useMemo(() => {
    if (!profile.m2_por_planta) return [];
    const floors: { floor: number; m2: number }[] = [];
    
    const matches = profile.m2_por_planta.matchAll(/Planta\s*(\d+):\s*([\d,.]+)/gi);
    for (const match of matches) {
      const m2Value = parseFloat(match[2].replace(',', '.'));
      if (!isNaN(m2Value)) {
        floors.push({ floor: parseInt(match[1]), m2: m2Value });
      }
    }
    
    if (floors.length === 0) {
      const values = profile.m2_por_planta.split(',').map(v => v.trim().replace(/[^\d,.]/g, ''));
      values.forEach((v, i) => {
        const m2Value = parseFloat(v.replace(',', '.'));
        if (!isNaN(m2Value) && m2Value > 0) {
          floors.push({ floor: i + 1, m2: m2Value });
        }
      });
    }
    
    return floors;
  }, [profile.m2_por_planta]);

  // Calculate external wall area
  const externalWallCalculation = useMemo(() => {
    const { altura_habitaciones, espesor_paredes_externas } = constructionParams;
    
    if (!altura_habitaciones || !espesor_paredes_externas || floorAreas.length === 0) {
      return null;
    }

    const wallThicknessM = espesor_paredes_externas / 100; // cm to meters
    
    let totalWallArea = 0;
    const perFloorData: { floor: number; m2Habitables: number; perimeter: number; wallArea: number }[] = [];
    
    for (const { floor, m2 } of floorAreas) {
      // Calculate perimeter from m² (assuming square-ish shape)
      const sideLength = Math.sqrt(m2);
      const perimeter = sideLength * 4;
      
      // External perimeter includes wall thickness
      const externalPerimeter = perimeter + (wallThicknessM * 8); // 4 corners, 2 sides each
      
      // Wall area = perimeter × height
      const wallArea = externalPerimeter * altura_habitaciones;
      
      totalWallArea += wallArea;
      perFloorData.push({
        floor,
        m2Habitables: m2,
        perimeter: externalPerimeter,
        wallArea
      });
    }
    
    // Calculate window area to subtract
    let totalWindowArea = 0;
    for (const space of spaces) {
      if (space.num_ventanas > 0 && space.tamano_ventanas) {
        totalWindowArea += space.num_ventanas * (windowSizeM2[space.tamano_ventanas] || 0);
      }
    }
    
    // Subtract one external door per floor
    const externalDoorArea = floorAreas.length * EXTERNAL_DOOR_M2;
    
    const netWallArea = totalWallArea - totalWindowArea - externalDoorArea;
    
    return {
      perFloorData,
      totalGrossWallArea: totalWallArea,
      totalWindowArea,
      externalDoorArea,
      netWallArea: Math.max(0, netWallArea)
    };
  }, [constructionParams, floorAreas, spaces]);

  const handleParamChange = (field: keyof ConstructionParams, value: string) => {
    const numValue = value === '' ? null : parseFloat(value.replace(',', '.'));
    setConstructionParams(prev => ({
      ...prev,
      [field]: isNaN(numValue as number) ? null : numValue
    }));
  };

  const handleSpaceChange = (id: string, field: keyof SpaceDetail, value: any) => {
    setSpaces(prev => prev.map(space => 
      space.id === id ? { ...space, [field]: value } : space
    ));
  };

  const addSpace = (type: SpaceDetail['type']) => {
    const existingOfType = spaces.filter(s => s.type === type).length;
    const newSpace: SpaceDetail = {
      id: generateId(),
      name: `${spaceTypeLabels[type]} ${existingOfType + 1}`,
      type,
      m2: null,
      num_ventanas: 0,
      tamano_ventanas: null,
      tiene_puerta: true
    };
    setSpaces(prev => [...prev, newSpace]);
  };

  const removeSpace = (id: string) => {
    setSpaces(prev => prev.filter(s => s.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('project_profiles')
        .update({
          altura_habitaciones: constructionParams.altura_habitaciones,
          espesor_paredes_externas: constructionParams.espesor_paredes_externas,
          espesor_paredes_internas: constructionParams.espesor_paredes_internas,
          espacios_detalle: spaces as any,
          updated_at: new Date().toISOString()
        })
        .eq('project_id', projectId);

      if (error) throw error;
      
      toast.success('Perfil de vivienda actualizado');
      onUpdate();
    } catch (err) {
      console.error('Error saving profile:', err);
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Construction Parameters - Distinguished with accent color */}
      <Card className="border-accent bg-accent/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Ruler className="h-4 w-4 text-accent-foreground" />
                Parámetros Constructivos
              </CardTitle>
              <CardDescription>
                Datos técnicos añadidos por el equipo
              </CardDescription>
            </div>
            <Badge variant="accent" className="text-xs">Interno</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="altura" className="text-sm">
                Altura promedio habitaciones (m)
              </Label>
              <Input
                id="altura"
                type="number"
                step="0.1"
                placeholder="2.5"
                value={constructionParams.altura_habitaciones ?? ''}
                onChange={(e) => handleParamChange('altura_habitaciones', e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="espesor_ext" className="text-sm">
                Espesor paredes externas (cm)
              </Label>
              <Input
                id="espesor_ext"
                type="number"
                step="1"
                placeholder="30"
                value={constructionParams.espesor_paredes_externas ?? ''}
                onChange={(e) => handleParamChange('espesor_paredes_externas', e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="espesor_int" className="text-sm">
                Espesor paredes internas (cm)
              </Label>
              <Input
                id="espesor_int"
                type="number"
                step="1"
                placeholder="10"
                value={constructionParams.espesor_paredes_internas ?? ''}
                onChange={(e) => handleParamChange('espesor_paredes_internas', e.target.value)}
                className="bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Spaces */}
      <Card className="border-accent bg-accent/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Square className="h-4 w-4 text-accent-foreground" />
                Detalle de Espacios
              </CardTitle>
              <CardDescription>
                m² y características de cada espacio
              </CardDescription>
            </div>
            <Badge variant="accent" className="text-xs">Interno</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add space buttons */}
          <div className="flex flex-wrap gap-2 pb-2">
            {(['habitacion', 'bano', 'salon', 'cocina', 'lavanderia', 'despensa', 'porche', 'patio', 'garaje', 'vestidor'] as SpaceDetail['type'][]).map(type => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => addSpace(type)}
                className="gap-1 h-7 text-xs"
              >
                <Plus className="h-3 w-3" />
                {spaceTypeLabels[type]}
              </Button>
            ))}
          </div>
          
          <Separator />
          
          {/* Space list */}
          {spaces.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <LayoutGrid className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay espacios definidos</p>
              <p className="text-xs">Usa los botones de arriba para añadir espacios</p>
            </div>
          ) : (
            <div className="space-y-3">
              {spaces.map((space) => (
                <div
                  key={space.id}
                  className="p-3 rounded-lg border bg-background flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      {spaceTypeIcons[space.type]}
                    </div>
                    <Input
                      value={space.name}
                      onChange={(e) => handleSpaceChange(space.id, 'name', e.target.value)}
                      className="h-8 text-sm font-medium max-w-[150px]"
                    />
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="m²"
                        value={space.m2 ?? ''}
                        onChange={(e) => handleSpaceChange(space.id, 'm2', e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-8 w-16 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">m²</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        placeholder="0"
                        value={space.num_ventanas}
                        onChange={(e) => handleSpaceChange(space.id, 'num_ventanas', parseInt(e.target.value) || 0)}
                        className="h-8 w-12 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">ventanas</span>
                    </div>
                    
                    {space.num_ventanas > 0 && (
                      <Select
                        value={space.tamano_ventanas || ''}
                        onValueChange={(v) => handleSpaceChange(space.id, 'tamano_ventanas', v || null)}
                      >
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue placeholder="Tamaño" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(windowSizeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value} className="text-xs">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={space.tiene_puerta}
                        onCheckedChange={(v) => handleSpaceChange(space.id, 'tiene_puerta', v)}
                        className="h-4 w-8"
                      />
                      <span className="text-xs text-muted-foreground">Puerta</span>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSpace(space.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculated External Wall Area */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            m² Paredes Externas (Calculado)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!externalWallCalculation ? (
            <div className="text-sm text-muted-foreground">
              Completa los parámetros constructivos para ver el cálculo
            </div>
          ) : (
            <div className="space-y-4">
              {/* Per floor breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {externalWallCalculation.perFloorData.map(({ floor, m2Habitables, perimeter, wallArea }) => (
                  <div key={floor} className="p-3 rounded-lg bg-background border">
                    <div className="text-sm font-medium mb-2">Planta {floor}</div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>m² habitables:</span>
                        <span className="font-medium text-foreground">{formatNumber(m2Habitables, 1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Perímetro ext.:</span>
                        <span className="font-medium text-foreground">{formatNumber(perimeter, 2)} ml</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Superficie bruta:</span>
                        <span className="font-medium text-foreground">{formatNumber(wallArea, 2)} m²</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <Separator />
              
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-background border">
                  <div className="text-lg font-bold text-primary">
                    {formatNumber(externalWallCalculation.totalGrossWallArea, 2)}
                  </div>
                  <div className="text-xs text-muted-foreground">m² brutos paredes</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <div className="text-lg font-bold text-warning">
                    -{formatNumber(externalWallCalculation.totalWindowArea, 2)}
                  </div>
                  <div className="text-xs text-muted-foreground">m² ventanas</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <div className="text-lg font-bold text-warning">
                    -{formatNumber(externalWallCalculation.externalDoorArea, 2)}
                  </div>
                  <div className="text-xs text-muted-foreground">m² puertas ext.</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-primary/10 border-primary border">
                  <div className="text-xl font-bold text-primary">
                    {formatNumber(externalWallCalculation.netWallArea, 2)}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">m² netos paredes ext.</div>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <strong>Cálculo:</strong> √(m² habitables) × 4 + ancho paredes × 8 = perímetro exterior → × altura = m² brutos
                <br />
                Se resta: superficie de ventanas + 1 puerta externa ({EXTERNAL_DOOR_M2} m²) por planta
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}

// Generate initial spaces from profile data
function generateInitialSpaces(profile: HousingProfileEditorProps['profile']): SpaceDetail[] {
  const spaces: SpaceDetail[] = [];
  
  // Habitaciones
  const numHabitaciones = parseInt(profile.num_habitaciones_total || '0') || 0;
  for (let i = 1; i <= numHabitaciones; i++) {
    spaces.push({
      id: generateId(),
      name: `Habitación ${i}`,
      type: 'habitacion',
      m2: null,
      num_ventanas: 1,
      tamano_ventanas: 'mediana',
      tiene_puerta: true
    });
  }
  
  // Baños
  const numBanos = parseInt(profile.num_banos_total || '0') || 0;
  for (let i = 1; i <= numBanos; i++) {
    spaces.push({
      id: generateId(),
      name: `Baño ${i}`,
      type: 'bano',
      m2: null,
      num_ventanas: 1,
      tamano_ventanas: 'pequeña',
      tiene_puerta: true
    });
  }
  
  // Vestidores
  const numVestidores = parseInt(profile.num_habitaciones_con_vestidor || '0') || 0;
  for (let i = 1; i <= numVestidores; i++) {
    spaces.push({
      id: generateId(),
      name: `Vestidor ${i}`,
      type: 'vestidor',
      m2: null,
      num_ventanas: 0,
      tamano_ventanas: null,
      tiene_puerta: true
    });
  }
  
  // Salón
  if (profile.tipo_salon) {
    spaces.push({
      id: generateId(),
      name: 'Salón',
      type: 'salon',
      m2: null,
      num_ventanas: 2,
      tamano_ventanas: 'grande',
      tiene_puerta: true
    });
  }
  
  // Cocina
  if (profile.tipo_cocina) {
    spaces.push({
      id: generateId(),
      name: 'Cocina',
      type: 'cocina',
      m2: null,
      num_ventanas: 1,
      tamano_ventanas: 'mediana',
      tiene_puerta: true
    });
  }
  
  // Lavandería
  if (profile.lavanderia && profile.lavanderia.toLowerCase() !== 'no') {
    spaces.push({
      id: generateId(),
      name: 'Lavandería',
      type: 'lavanderia',
      m2: null,
      num_ventanas: 1,
      tamano_ventanas: 'pequeña',
      tiene_puerta: true
    });
  }
  
  // Despensa
  if (profile.despensa && profile.despensa.toLowerCase() !== 'no') {
    spaces.push({
      id: generateId(),
      name: 'Despensa',
      type: 'despensa',
      m2: null,
      num_ventanas: 0,
      tamano_ventanas: null,
      tiene_puerta: true
    });
  }
  
  // Porche
  if (profile.porche_cubierto && profile.porche_cubierto.toLowerCase() !== 'no') {
    spaces.push({
      id: generateId(),
      name: 'Porche Cubierto',
      type: 'porche',
      m2: null,
      num_ventanas: 0,
      tamano_ventanas: null,
      tiene_puerta: false
    });
  }
  
  // Patio
  if (profile.patio_descubierto && profile.patio_descubierto.toLowerCase() !== 'no') {
    spaces.push({
      id: generateId(),
      name: 'Patio Descubierto',
      type: 'patio',
      m2: null,
      num_ventanas: 0,
      tamano_ventanas: null,
      tiene_puerta: false
    });
  }
  
  // Garaje
  if (profile.garaje && profile.garaje.toLowerCase() !== 'no') {
    spaces.push({
      id: generateId(),
      name: 'Garaje',
      type: 'garaje',
      m2: null,
      num_ventanas: 0,
      tamano_ventanas: null,
      tiene_puerta: true
    });
  }
  
  return spaces;
}
