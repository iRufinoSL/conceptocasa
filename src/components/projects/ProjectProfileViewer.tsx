import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Home, MapPin, Calendar, DollarSign, Users, Grid3X3, Palette, MessageSquare, Building2, ExternalLink } from 'lucide-react';
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

export function ProjectProfileViewer({ open, onOpenChange, projectId, projectName }: ProjectProfileViewerProps) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!open || !projectId) return;
      
      setIsLoading(true);
      const { data, error } = await supabase
        .from('project_profiles')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [open, projectId]);

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
        ) : !profile ? (
          <div className="py-12 text-center text-muted-foreground">
            <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Este proyecto no tiene un perfil de vivienda asociado.</p>
            <p className="text-sm mt-2">Los perfiles se crean automáticamente cuando un cliente envía el formulario desde la landing page.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Fecha de creación */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Recibido el {format(new Date(profile.created_at), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Datos de contacto */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Datos de Contacto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <ProfileField label="Nombre" value={`${profile.contact_name} ${profile.contact_surname || ''}`} />
                  <ProfileField label="Email" value={profile.contact_email} />
                  <ProfileField label="Teléfono" value={profile.contact_phone} />
                </CardContent>
              </Card>

              {/* Ubicación y presupuesto */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Ubicación y Presupuesto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <ProfileField label="Población" value={profile.poblacion} />
                  <ProfileField label="Provincia" value={profile.provincia} />
                  <ProfileField label="Coordenadas Google Maps" value={profile.coordenadas_google_maps} />
                  <ProfileField label="URL Google Maps" value={profile.google_maps_url} isLink />
                  <ProfileField label="Presupuesto global" value={profile.presupuesto_global} />
                  <ProfileField 
                    label="Fecha ideal finalización" 
                    value={profile.fecha_ideal_finalizacion ? format(new Date(profile.fecha_ideal_finalizacion), "d 'de' MMMM 'de' yyyy", { locale: es }) : null} 
                  />
                </CardContent>
              </Card>

              {/* Estructura de la vivienda */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Estructura de la Vivienda
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <ProfileField label="Nº de plantas" value={profile.num_plantas} />
                  <ProfileField label="M² por planta" value={profile.m2_por_planta} />
                  <ProfileField label="Forma geométrica" value={profile.forma_geometrica} />
                  <ProfileField label="Tipo de tejado" value={profile.tipo_tejado} />
                </CardContent>
              </Card>

              {/* Distribución */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4 text-primary" />
                    Distribución
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <ProfileField label="Habitaciones totales" value={profile.num_habitaciones_total} />
                  <ProfileField label="Habitaciones con baño" value={profile.num_habitaciones_con_bano} />
                  <ProfileField label="Baños totales" value={profile.num_banos_total} />
                  <ProfileField label="Habitaciones con vestidor" value={profile.num_habitaciones_con_vestidor} />
                  <ProfileField label="Salón" value={profile.tipo_salon} />
                  <ProfileField label="Cocina" value={profile.tipo_cocina} />
                  <ProfileField label="Lavandería" value={profile.lavanderia} />
                  <ProfileField label="Despensa" value={profile.despensa} />
                </CardContent>
              </Card>

              {/* Espacios exteriores */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Home className="h-4 w-4 text-primary" />
                    Espacios Exteriores
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <ProfileField label="Porche cubierto" value={profile.porche_cubierto} />
                  <ProfileField label="Patio descubierto" value={profile.patio_descubierto} />
                  <ProfileField label="Garaje" value={profile.garaje} />
                  <ProfileField label="Tiene terreno" value={profile.tiene_terreno} />
                </CardContent>
              </Card>

              {/* Estilo constructivo */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Estilo Constructivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.estilo_constructivo && profile.estilo_constructivo.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.estilo_constructivo.map((style) => (
                        <Badge key={style} variant="secondary">
                          {styleLabels[style] || style}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">No especificado</span>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Mensaje adicional */}
            {profile.mensaje_adicional && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Mensaje Adicional
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{profile.mensaje_adicional}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}