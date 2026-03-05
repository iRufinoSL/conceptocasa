import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Home, MapPin, Calendar, Users, Grid3X3, Palette, MessageSquare, 
  Building2, ExternalLink, Bath, BedDouble, Sofa, UtensilsCrossed, 
  WashingMachine, Archive, Car, TreeDeciduous, Fence, DoorOpen,
  Layers, Euro, Ruler, Mountain, AlertCircle, Settings2, Save, Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { HousingProfileEditor, SpaceDetail } from './HousingProfileEditor';
import { Json } from '@/integrations/supabase/types';

interface ProjectProfile {
  id: string;
  project_id: string;
  contact_name: string;
  contact_surname: string | null;
  contact_email: string;
  contact_phone: string | null;
  num_plantas: string | null;
  m2_por_planta: string | null;
  forma_geometrica: string | null;
  tipo_tejado: string | null;
  num_habitaciones_total: string | null;
  num_habitaciones_con_bano: string | null;
  num_banos_total: string | null;
  num_habitaciones_con_vestidor: string | null;
  tipo_salon: string | null;
  tipo_cocina: string | null;
  lavanderia: string | null;
  despensa: string | null;
  porche_cubierto: string | null;
  patio_descubierto: string | null;
  garaje: string | null;
  tiene_terreno: string | null;
  inclinacion_terreno?: string | null;
  poblacion: string | null;
  provincia: string | null;
  coordenadas_google_maps: string | null;
  google_maps_url: string | null;
  presupuesto_global: string | null;
  estilo_constructivo: string[] | null;
  mensaje_adicional: string | null;
  fecha_ideal_finalizacion: string | null;
  created_at: string;
  // New internal fields
  altura_habitaciones?: number | null;
  espesor_paredes_externas?: number | null;
  espesor_paredes_internas?: number | null;
  espacios_detalle?: SpaceDetail[] | null;
}

interface BudgetHousingProfileTabProps {
  budgetId: string;
  projectId: string | null;
}

const styleLabels: Record<string, string> = {
  moderno: 'Moderno',
  convencional: 'Convencional',
  rustico: 'Rústico',
  mediterraneo: 'Mediterráneo',
  madera: 'Madera',
  ecologica: 'Ecológica',
  otros: 'Otros'
};

function ProfileField({ label, value, isLink }: { label: string; value: string | null | undefined; isLink?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-muted/50 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      {isLink ? (
        <a 
          href={value} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1 max-w-[60%] text-right"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      ) : (
        <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
      )}
    </div>
  );
}

interface SpaceCardProps {
  icon: React.ReactNode;
  label: string;
  count?: number | string | null;
  detail?: string | null;
  className?: string;
}

function SpaceCard({ icon, label, count, detail, className = "" }: SpaceCardProps) {
  if (!count && count !== 0) return null;
  const displayCount = typeof count === 'string' ? count : count;
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg bg-muted/50 border ${className}`}>
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {detail && <div className="text-xs text-muted-foreground truncate">{detail}</div>}
      </div>
      {displayCount && (
        <div className="text-lg font-bold text-primary">{displayCount}</div>
      )}
    </div>
  );
}

function FloorCard({ floor, m2 }: { floor: number; m2: string | null }) {
  if (!m2 || m2 === '0') return null;
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border">
      <Layers className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm">Planta {floor}</span>
      <Badge variant="secondary" className="ml-auto">{m2} m²</Badge>
    </div>
  );
}

function HousingProfileInlineForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    contact_name: '',
    contact_surname: '',
    contact_email: '',
    contact_phone: '',
    num_plantas: '',
    m2_por_planta: '',
    forma_geometrica: '',
    tipo_tejado: '',
    num_habitaciones_total: '',
    num_habitaciones_con_bano: '',
    num_banos_total: '',
    num_habitaciones_con_vestidor: '',
    tipo_salon: '',
    tipo_cocina: '',
    lavanderia: '',
    despensa: '',
    porche_cubierto: '',
    patio_descubierto: '',
    garaje: '',
    tiene_terreno: '',
    inclinacion_terreno: '',
    poblacion: '',
    provincia: '',
    coordenadas_google_maps: '',
    google_maps_url: '',
    presupuesto_global: '',
    estilo_constructivo: [] as string[],
    fecha_ideal_finalizacion: '',
    mensaje_adicional: '',
  });

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleStyle = (id: string) => {
    setForm(prev => ({
      ...prev,
      estilo_constructivo: prev.estilo_constructivo.includes(id)
        ? prev.estilo_constructivo.filter(s => s !== id)
        : [...prev.estilo_constructivo, id]
    }));
  };

  const handleSave = async () => {
    if (!form.contact_name || !form.contact_email) {
      toast.error('Nombre y email son obligatorios');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from('project_profiles').insert({
        project_id: projectId,
        contact_name: form.contact_name,
        contact_surname: form.contact_surname || null,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone || null,
        num_plantas: form.num_plantas || null,
        m2_por_planta: form.m2_por_planta || null,
        forma_geometrica: form.forma_geometrica || null,
        tipo_tejado: form.tipo_tejado || null,
        num_habitaciones_total: form.num_habitaciones_total || null,
        num_habitaciones_con_bano: form.num_habitaciones_con_bano || null,
        num_banos_total: form.num_banos_total || null,
        num_habitaciones_con_vestidor: form.num_habitaciones_con_vestidor || null,
        tipo_salon: form.tipo_salon || null,
        tipo_cocina: form.tipo_cocina || null,
        lavanderia: form.lavanderia || null,
        despensa: form.despensa || null,
        porche_cubierto: form.porche_cubierto || null,
        patio_descubierto: form.patio_descubierto || null,
        garaje: form.garaje || null,
        tiene_terreno: form.tiene_terreno || null,
        inclinacion_terreno: form.inclinacion_terreno || null,
        poblacion: form.poblacion || null,
        provincia: form.provincia || null,
        coordenadas_google_maps: form.coordenadas_google_maps || null,
        google_maps_url: form.google_maps_url || null,
        presupuesto_global: form.presupuesto_global || null,
        estilo_constructivo: form.estilo_constructivo.length > 0 ? form.estilo_constructivo : null,
        fecha_ideal_finalizacion: form.fecha_ideal_finalizacion || null,
        mensaje_adicional: form.mensaje_adicional || null,
      });
      if (error) throw error;
      toast.success('Perfil de vivienda creado');
      onCreated();
    } catch (err: any) {
      console.error('Error creating profile:', err);
      toast.error('Error al crear el perfil');
    } finally {
      setIsSaving(false);
    }
  };

  const estilos = ['moderno', 'convencional', 'rustico', 'mediterraneo', 'madera', 'ecologica', 'otros'];
  const estiloLabels: Record<string, string> = {
    moderno: 'Moderno', convencional: 'Convencional', rustico: 'Rústico',
    mediterraneo: 'Mediterráneo', madera: 'Madera', ecologica: 'Ecológica', otros: 'Otros'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Registrar Perfil de Vivienda
          </h3>
          <p className="text-sm text-muted-foreground">Complete los datos del perfil de vivienda para este presupuesto</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {isSaving ? 'Guardando...' : 'Guardar Perfil'}
        </Button>
      </div>

      {/* Contacto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Datos de Contacto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Nombre *</Label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Apellidos</Label>
              <Input value={form.contact_surname} onChange={e => set('contact_surname', e.target.value)} placeholder="Apellidos" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email *</Label>
              <Input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="email@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Teléfono</Label>
              <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="+34 600 000 000" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estructura */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Estructura de la Vivienda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Nº Plantas</Label>
              <Select value={form.num_plantas} onValueChange={v => set('num_plantas', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 planta</SelectItem>
                  <SelectItem value="2">2 plantas</SelectItem>
                  <SelectItem value="3">3 plantas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">m² por planta</Label>
              <Input value={form.m2_por_planta} onChange={e => set('m2_por_planta', e.target.value)} placeholder="Ej: Planta 1: 80, Planta 2: 60" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Forma geométrica</Label>
              <Select value={form.forma_geometrica} onValueChange={v => set('forma_geometrica', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rectangular">Rectangular</SelectItem>
                  <SelectItem value="cuadrada">Cuadrada</SelectItem>
                  <SelectItem value="L">En L</SelectItem>
                  <SelectItem value="U">En U</SelectItem>
                  <SelectItem value="irregular">Irregular</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Tipo de tejado</Label>
              <Select value={form.tipo_tejado} onValueChange={v => set('tipo_tejado', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="plano">Plano</SelectItem>
                  <SelectItem value="2-caidas">2 caídas</SelectItem>
                  <SelectItem value="4-caidas">4 caídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Distribución interior */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="h-4 w-4 text-primary" />
            Distribución Interior
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Habitaciones total</Label>
              <Input type="number" min="0" value={form.num_habitaciones_total} onChange={e => set('num_habitaciones_total', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Hab. con baño</Label>
              <Input type="number" min="0" value={form.num_habitaciones_con_bano} onChange={e => set('num_habitaciones_con_bano', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Baños total</Label>
              <Input type="number" min="0" value={form.num_banos_total} onChange={e => set('num_banos_total', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Hab. con vestidor</Label>
              <Input type="number" min="0" value={form.num_habitaciones_con_vestidor} onChange={e => set('num_habitaciones_con_vestidor', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Tipo salón</Label>
              <Select value={form.tipo_salon} onValueChange={v => set('tipo_salon', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequeño">Pequeño</SelectItem>
                  <SelectItem value="mediano">Mediano</SelectItem>
                  <SelectItem value="grande">Grande</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Tipo cocina</Label>
              <Select value={form.tipo_cocina} onValueChange={v => set('tipo_cocina', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequeña">Pequeña</SelectItem>
                  <SelectItem value="mediana">Mediana</SelectItem>
                  <SelectItem value="grande">Grande</SelectItem>
                  <SelectItem value="americana">Americana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Lavandería</Label>
              <Select value={form.lavanderia} onValueChange={v => set('lavanderia', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Despensa</Label>
              <Select value={form.despensa} onValueChange={v => set('despensa', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exteriores */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TreeDeciduous className="h-4 w-4 text-primary" />
            Espacios Exteriores y Terreno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Porche cubierto</Label>
              <Select value={form.porche_cubierto} onValueChange={v => set('porche_cubierto', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Patio descubierto</Label>
              <Select value={form.patio_descubierto} onValueChange={v => set('patio_descubierto', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Garaje</Label>
              <Select value={form.garaje} onValueChange={v => set('garaje', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Tiene terreno</Label>
              <Select value={form.tiene_terreno} onValueChange={v => set('tiene_terreno', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Buscando">Buscando</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Inclinación terreno</Label>
              <Select value={form.inclinacion_terreno} onValueChange={v => set('inclinacion_terreno', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Plano">Plano</SelectItem>
                  <SelectItem value="Suave">Suave</SelectItem>
                  <SelectItem value="Media">Media</SelectItem>
                  <SelectItem value="Pronunciada">Pronunciada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ubicación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Ubicación y Presupuesto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Población</Label>
              <Input value={form.poblacion} onChange={e => set('poblacion', e.target.value)} placeholder="Población" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Provincia</Label>
              <Input value={form.provincia} onChange={e => set('provincia', e.target.value)} placeholder="Provincia" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Coordenadas Google Maps</Label>
              <Input value={form.coordenadas_google_maps} onChange={e => set('coordenadas_google_maps', e.target.value)} placeholder="Lat, Lng" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">URL Google Maps</Label>
              <Input value={form.google_maps_url} onChange={e => set('google_maps_url', e.target.value)} placeholder="https://maps.google.com/..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Presupuesto global</Label>
              <Input value={form.presupuesto_global} onChange={e => set('presupuesto_global', e.target.value)} placeholder="Ej: 200.000 - 250.000 €" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Fecha ideal finalización</Label>
              <Input type="date" value={form.fecha_ideal_finalizacion} onChange={e => set('fecha_ideal_finalizacion', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estilo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Estilo Constructivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {estilos.map(id => (
              <Badge
                key={id}
                variant={form.estilo_constructivo.includes(id) ? 'default' : 'outline'}
                className="cursor-pointer py-1.5 px-3 text-sm"
                onClick={() => toggleStyle(id)}
              >
                {estiloLabels[id]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mensaje */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Mensaje Adicional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.mensaje_adicional}
            onChange={e => set('mensaje_adicional', e.target.value)}
            placeholder="Observaciones, requisitos especiales..."
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg" className="gap-2">
          <Save className="h-4 w-4" />
          {isSaving ? 'Guardando...' : 'Guardar Perfil de Vivienda'}
        </Button>
      </div>
    </div>
  );
}

export function BudgetHousingProfileTab({ budgetId, projectId }: BudgetHousingProfileTabProps) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'detalle'>('resumen');

  const fetchProfile = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('project_profiles')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching profile:', fetchError);
        setError(fetchError.message);
        setProfile(null);
      } else if (data) {
        // Cast espacios_detalle from Json to SpaceDetail[]
        const profileData: ProjectProfile = {
          ...data,
          espacios_detalle: Array.isArray(data.espacios_detalle) 
            ? (data.espacios_detalle as unknown as SpaceDetail[])
            : null
        };
        setProfile(profileData);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error al cargar el perfil');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Parse m2_por_planta to get individual floor areas
  const parseFloorAreas = (m2PorPlanta: string | null): { floor: number; m2: string }[] => {
    if (!m2PorPlanta) return [];
    const floors: { floor: number; m2: string }[] = [];
    
    // Try to parse structured format first
    const matches = m2PorPlanta.matchAll(/Planta\s*(\d+):\s*([\d,.]+)/gi);
    for (const match of matches) {
      floors.push({ floor: parseInt(match[1]), m2: match[2] });
    }
    
    // If no structured format, try comma-separated values
    if (floors.length === 0) {
      const values = m2PorPlanta.split(',').map(v => v.trim().replace(/[^\d,.]/g, ''));
      values.forEach((v, i) => {
        if (v) floors.push({ floor: i + 1, m2: v });
      });
    }
    
    return floors;
  };

  const floorAreas = profile ? parseFloorAreas(profile.m2_por_planta) : [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">Sin proyecto asociado</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Este presupuesto no está vinculado a un proyecto.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
        <h3 className="text-lg font-medium text-destructive">Error al cargar el perfil</h3>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <HousingProfileInlineForm projectId={projectId} onCreated={fetchProfile} />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con fecha y presupuesto */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Recibido el {format(new Date(profile.created_at), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
        </div>
        {profile.presupuesto_global && (
          <div className="flex items-center gap-2">
            <Euro className="h-4 w-4 text-primary" />
            <span className="font-semibold text-primary">{profile.presupuesto_global}</span>
          </div>
        )}
        {profile.fecha_ideal_finalizacion && (
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            Finalización: {format(new Date(profile.fecha_ideal_finalizacion), "MMM yyyy", { locale: es })}
          </Badge>
        )}
      </div>

      {/* Tabs for summary vs detailed */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'resumen' | 'detalle')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="resumen" className="gap-2">
            <Home className="h-4 w-4" />
            Resumen del Cliente
          </TabsTrigger>
          <TabsTrigger value="detalle" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Detalle Técnico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4 space-y-6">
      {profile.estilo_constructivo && profile.estilo_constructivo.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Estilo Constructivo Preferido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.estilo_constructivo.map((style, index) => (
                <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                  {styleLabels[style] || style}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contacto y Ubicación en una fila */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <ProfileField label="Nombre" value={`${profile.contact_name} ${profile.contact_surname || ''}`} />
            <ProfileField label="Email" value={profile.contact_email} />
            <ProfileField label="Teléfono" value={profile.contact_phone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Ubicación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <ProfileField 
              label="Localización" 
              value={[profile.poblacion, profile.provincia].filter(Boolean).join(', ') || null} 
            />
            <ProfileField label="Tiene terreno" value={profile.tiene_terreno} />
            <ProfileField label="Planeidad del terreno" value={profile.inclinacion_terreno} />
            {profile.coordenadas_google_maps && (
              <ProfileField label="Coordenadas" value={profile.coordenadas_google_maps} />
            )}
            {profile.google_maps_url && (
              <div className="pt-2">
                <a 
                  href={profile.google_maps_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <MapPin className="h-4 w-4" />
                  Ver en Google Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Estructura de la vivienda */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Estructura de la Vivienda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {profile.num_plantas && (
              <div className="text-center p-3 rounded-lg bg-muted/50 border">
                <div className="text-2xl font-bold text-primary">{profile.num_plantas}</div>
                <div className="text-xs text-muted-foreground">Plantas</div>
              </div>
            )}
            {profile.forma_geometrica && (
              <div className="text-center p-3 rounded-lg bg-muted/50 border">
                <Grid3X3 className="h-5 w-5 mx-auto text-primary mb-1" />
                <div className="text-sm font-medium">{profile.forma_geometrica}</div>
                <div className="text-xs text-muted-foreground">Forma</div>
              </div>
            )}
            {profile.tipo_tejado && (
              <div className="text-center p-3 rounded-lg bg-muted/50 border">
                <Home className="h-5 w-5 mx-auto text-primary mb-1" />
                <div className="text-sm font-medium">{profile.tipo_tejado}</div>
                <div className="text-xs text-muted-foreground">Tejado</div>
              </div>
            )}
            {profile.inclinacion_terreno && (
              <div className="text-center p-3 rounded-lg bg-muted/50 border">
                <Mountain className="h-5 w-5 mx-auto text-primary mb-1" />
                <div className="text-sm font-medium">{profile.inclinacion_terreno}</div>
                <div className="text-xs text-muted-foreground">Terreno</div>
              </div>
            )}
          </div>
          
          {/* M² por planta */}
          {profile.m2_por_planta && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Superficie por planta</div>
              {floorAreas.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {floorAreas.map(({ floor, m2 }) => (
                    <FloorCard key={floor} floor={floor} m2={m2} />
                  ))}
                </div>
              ) : (
                <div className="p-2 rounded-md bg-muted/30 border text-sm">
                  {profile.m2_por_planta}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Espacios interiores - Grid visual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="h-4 w-4 text-primary" />
            Espacios Interiores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <SpaceCard
              icon={<BedDouble className="h-5 w-5" />}
              label="Habitaciones"
              count={profile.num_habitaciones_total}
              detail={profile.num_habitaciones_con_bano ? `${profile.num_habitaciones_con_bano} con baño` : undefined}
            />
            <SpaceCard
              icon={<Bath className="h-5 w-5" />}
              label="Baños"
              count={profile.num_banos_total}
            />
            {profile.num_habitaciones_con_vestidor && profile.num_habitaciones_con_vestidor !== '0' && (
              <SpaceCard
                icon={<DoorOpen className="h-5 w-5" />}
                label="Vestidores"
                count={profile.num_habitaciones_con_vestidor}
              />
            )}
            <SpaceCard
              icon={<Sofa className="h-5 w-5" />}
              label="Salón"
              count="1"
              detail={profile.tipo_salon}
            />
            <SpaceCard
              icon={<UtensilsCrossed className="h-5 w-5" />}
              label="Cocina"
              count="1"
              detail={profile.tipo_cocina}
            />
            {profile.lavanderia && profile.lavanderia.toLowerCase() !== 'no' && (
              <SpaceCard
                icon={<WashingMachine className="h-5 w-5" />}
                label="Lavandería"
                count="1"
                detail={profile.lavanderia !== 'Sí' ? profile.lavanderia : undefined}
              />
            )}
            {profile.despensa && profile.despensa.toLowerCase() !== 'no' && (
              <SpaceCard
                icon={<Archive className="h-5 w-5" />}
                label="Despensa"
                count="1"
                detail={profile.despensa !== 'Sí' ? profile.despensa : undefined}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Espacios exteriores */}
      {(profile.porche_cubierto || profile.patio_descubierto || profile.garaje) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TreeDeciduous className="h-4 w-4 text-primary" />
              Espacios Exteriores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.porche_cubierto && profile.porche_cubierto.toLowerCase() !== 'no' && (
                <SpaceCard
                  icon={<Home className="h-5 w-5" />}
                  label="Porche Cubierto"
                  count="1"
                  detail={profile.porche_cubierto !== 'Sí' ? profile.porche_cubierto : undefined}
                />
              )}
              {profile.patio_descubierto && profile.patio_descubierto.toLowerCase() !== 'no' && (
                <SpaceCard
                  icon={<Fence className="h-5 w-5" />}
                  label="Patio Descubierto"
                  count="1"
                  detail={profile.patio_descubierto !== 'Sí' ? profile.patio_descubierto : undefined}
                />
              )}
              {profile.garaje && profile.garaje.toLowerCase() !== 'no' && (
                <SpaceCard
                  icon={<Car className="h-5 w-5" />}
                  label="Garaje"
                  count="1"
                  detail={profile.garaje !== 'Sí' ? profile.garaje : undefined}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mensaje adicional */}
      {profile.mensaje_adicional && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Mensaje Adicional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted/30 border text-sm whitespace-pre-wrap">
              {profile.mensaje_adicional}
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="detalle" className="mt-4">
          <HousingProfileEditor
            projectId={projectId}
            profile={profile}
            onUpdate={fetchProfile}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
