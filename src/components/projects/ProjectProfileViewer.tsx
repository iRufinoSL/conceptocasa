import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { 
  Home, MapPin, Calendar, Users, Grid3X3, Palette, MessageSquare, 
  Building2, ExternalLink, Bath, BedDouble, Sofa, UtensilsCrossed, 
  WashingMachine, Archive, Car, TreeDeciduous, Fence, DoorOpen,
  Layers, Euro, Ruler
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  poblacion: string | null;
  provincia: string | null;
  coordenadas_google_maps: string | null;
  google_maps_url: string | null;
  presupuesto_global: string | null;
  estilo_constructivo: string[] | null;
  mensaje_adicional: string | null;
  fecha_ideal_finalizacion: string | null;
  created_at: string;
}

interface ProjectProfileViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
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

export function ProjectProfileViewer({ open, onOpenChange, projectId, projectName }: ProjectProfileViewerProps) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!open || !projectId) return;
      
      setIsLoading(true);
      setError(null);
      
      console.log('Fetching profile for project:', projectId);
      
      const { data, error: fetchError } = await supabase
        .from('project_profiles')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      console.log('Profile fetch result:', { data, error: fetchError });

      if (fetchError) {
        console.error('Error fetching profile:', fetchError);
        setError(fetchError.message);
        setProfile(null);
      } else if (data) {
        setProfile(data);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [open, projectId]);

  // Parse m2_por_planta to get individual floor areas
  const parseFloorAreas = (m2PorPlanta: string | null): { floor: number; m2: string }[] => {
    if (!m2PorPlanta) return [];
    // Expected format: "Planta 1: 120 m², Planta 2: 80 m²" or "120, 80, 60"
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Perfil de Vivienda
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">
            <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Error al cargar el perfil de vivienda.</p>
            <p className="text-sm mt-2">{error}</p>
          </div>
        ) : !profile ? (
          <div className="py-12 text-center text-muted-foreground">
            <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Este proyecto no tiene un perfil de vivienda asociado.</p>
            <p className="text-sm mt-2">Los perfiles se crean automáticamente cuando un cliente envía el formulario desde la landing page.</p>
            <p className="text-xs mt-4 bg-muted p-2 rounded">Project ID: {projectId}</p>
          </div>
        ) : (
          <div className="space-y-6">
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
                      <Ruler className="h-5 w-5 mx-auto text-primary mb-1" />
                      <div className="text-sm font-medium">{profile.forma_geometrica}</div>
                    </div>
                  )}
                  {profile.tipo_tejado && (
                    <div className="text-center p-3 rounded-lg bg-muted/50 border">
                      <Home className="h-5 w-5 mx-auto text-primary mb-1" />
                      <div className="text-sm font-medium">{profile.tipo_tejado}</div>
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

            {/* Estilo constructivo */}
            {profile.estilo_constructivo && profile.estilo_constructivo.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Estilo Constructivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {profile.estilo_constructivo.map((style) => (
                      <Badge key={style} variant="secondary" className="text-sm py-1 px-3">
                        {styleLabels[style] || style}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mensaje adicional */}
            {profile.mensaje_adicional && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Mensaje del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg border">
                    {profile.mensaje_adicional}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}