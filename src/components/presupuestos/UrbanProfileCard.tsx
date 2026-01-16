import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  MapPin, 
  Building2, 
  Ruler, 
  Search, 
  Loader2, 
  RefreshCw,
  TreePine,
  Mountain,
  Home,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Navigation,
  ArrowLeftRight,
  MoveVertical,
  Landmark,
  Plus,
  Trash2,
  Upload,
  Map,
  Globe,
  Zap,
  Droplets,
  Train,
  Fuel,
  Cross,
  Fence,
  Car
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import * as pdfjsLib from 'pdfjs-dist';
import { openSafeUrl, isSafeUrl } from '@/lib/url-utils';
import { LargeDocumentUploader } from './LargeDocumentUploader';

interface AdditionalRestriction {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  source: string;
}

interface UrbanProfile {
  id: string;
  budget_id: string;
  cadastral_reference: string;
  municipality: string | null;
  province: string | null;
  autonomous_community: string | null;
  locality: string | null;
  address: string | null;
  surface_area: number | null;
  land_use: string | null;
  land_class: string | null;
  cadastral_value: number | null;
  construction_year: number | null;
  urban_classification: string | null;
  urban_qualification: string | null;
  buildability_index: number | null;
  buildability_index_source: string | null;
  max_height: number | null;
  max_height_source: string | null;
  max_floors: number | null;
  max_floors_source: string | null;
  min_plot_area: number | null;
  front_setback: number | null;
  front_setback_source: string | null;
  side_setback: number | null;
  side_setback_source: string | null;
  rear_setback: number | null;
  rear_setback_source: string | null;
  max_occupation_percent: number | null;
  max_occupation_source: string | null;
  climatic_zone: string | null;
  wind_zone: string | null;
  seismic_zone: string | null;
  snow_zone: string | null;
  analysis_status: string | null;
  analysis_notes: string | null;
  last_analyzed_at: string | null;
  created_at: string;
  // Existing extended fields
  google_maps_lat: number | null;
  google_maps_lng: number | null;
  coordinates_source: string | null;
  max_buildable_volume: number | null;
  max_buildable_volume_source: string | null;
  min_distance_neighbors: number | null;
  min_distance_neighbors_source: string | null;
  min_distance_roads: number | null;
  min_distance_roads_source: string | null;
  min_distance_slopes: number | null;
  min_distance_slopes_source: string | null;
  additional_restrictions: AdditionalRestriction[] | null;
  // New sectoral restrictions fields
  min_distance_cemetery: number | null;
  min_distance_cemetery_source: string | null;
  min_distance_power_lines: number | null;
  min_distance_power_lines_source: string | null;
  min_distance_water_courses: number | null;
  min_distance_water_courses_source: string | null;
  min_distance_railway: number | null;
  min_distance_railway_source: string | null;
  min_distance_pipeline: number | null;
  min_distance_pipeline_source: string | null;
  max_built_surface: number | null;
  max_built_surface_source: string | null;
  fence_setback: number | null;
  fence_setback_source: string | null;
  access_width: number | null;
  access_width_source: string | null;
  is_divisible: boolean | null;
  is_divisible_source: string | null;
  affected_by_power_lines: boolean | null;
  affected_by_cemetery: boolean | null;
  affected_by_water_courses: boolean | null;
  sectoral_restrictions: Json | null;
}

interface CatastroData {
  cadastralReference: string;
  province: string;
  municipality: string;
  locality?: string;
  address?: string;
  surfaceArea?: number;
  landUse?: string;
  landClass?: string;
  landClassDescription?: string;
  landClassSource?: string;
  canBuild?: boolean;
  constructionYear?: number;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

interface UrbanProfileCardProps {
  budgetId: string;
  cadastralReference?: string;
  isAdmin: boolean;
}

const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pendiente', color: 'bg-muted text-muted-foreground', icon: AlertCircle },
  catastro_loaded: { label: 'Catastro cargado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Search },
  regulations_loaded: { label: 'Normativa cargada', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: FileText },
  pgou_loaded: { label: 'Normativa analizada', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: FileText },
  cte_loaded: { label: 'CTE analizado', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: Building2 },
  complete: { label: 'Completo', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', icon: CheckCircle2 },
};

// Component to render analysis notes with clickable links
function AnalysisNotesRenderer({ notes }: { notes: string }) {
  // Parse markdown-style links [text](url) and convert to clickable links
  const renderWithLinks = (text: string) => {
    const parts: React.ReactNode[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = linkRegex.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${keyIndex++}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      
      const linkText = match[1];
      const url = match[2];
      
      // Validate URL is safe before rendering
      if (isSafeUrl(url)) {
        parts.push(
          <a
            key={`link-${keyIndex++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
            onClick={(e) => {
              e.preventDefault();
              openSafeUrl(url);
            }}
          >
            {linkText}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      } else {
        parts.push(<span key={`text-${keyIndex++}`}>{linkText}</span>);
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(<span key={`text-${keyIndex++}`}>{text.slice(lastIndex)}</span>);
    }
    
    return parts.length > 0 ? parts : text;
  };

  // Split by lines and render each with proper formatting
  const lines = notes.split('\n');
  
  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const trimmedLine = line.trim();
        
        // Headers with **text**
        if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
          return (
            <p key={idx} className="font-semibold text-foreground mt-3 first:mt-0">
              {trimmedLine.replace(/\*\*/g, '')}
            </p>
          );
        }
        
        // Bullet points
        if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-')) {
          const content = trimmedLine.replace(/^[•-]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-2 ml-2">
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">{renderWithLinks(content)}</span>
            </div>
          );
        }
        
        // Empty lines
        if (!trimmedLine) {
          return <div key={idx} className="h-1" />;
        }
        
        // Regular text
        return (
          <p key={idx} className="text-muted-foreground">
            {renderWithLinks(line)}
          </p>
        );
      })}
    </div>
  );
}

// Component for editable field with source
function EditableFieldWithSource({
  label,
  value,
  source,
  unit,
  onSave,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  source: string | null;
  unit: string;
  onSave: (value: number | null, source: string | null) => Promise<void>;
  icon?: React.ElementType;
}) {
  const [editValue, setEditValue] = useState<number | undefined>(value ?? undefined);
  const [editSource, setEditSource] = useState(source || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = editValue !== (value ?? undefined) || editSource !== (source || '');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editValue ?? null, editSource || null);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value ?? undefined);
    setEditSource(source || '');
    setIsEditing(false);
  };

  return (
    <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon className="h-4 w-4 text-primary" />}
          <span>{label}</span>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              className="h-6 px-2"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 text-green-600" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-6 px-2"
            >
              ✕
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <NumericInput
          value={editValue}
          onChange={(v) => {
            setEditValue(v);
            setIsEditing(true);
          }}
          placeholder="Valor"
          className="w-24 h-8"
          min={0}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" />
          Fuente legal
        </Label>
        <Input
          value={editSource}
          onChange={(e) => {
            setEditSource(e.target.value);
            setIsEditing(true);
          }}
          placeholder="Ej: Normativa Urbanística Art. 45, BOE 123/2024"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

export function UrbanProfileCard({ budgetId, cadastralReference: initialRef, isAdmin }: UrbanProfileCardProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<UrbanProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingRegulations, setIsSearchingRegulations] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isSavingSurface, setIsSavingSurface] = useState(false);
  const [searchRef, setSearchRef] = useState(initialRef || '');
  const [isExpanded, setIsExpanded] = useState(true);
  const [manualSurface, setManualSurface] = useState<number | undefined>(undefined);
  const [isEditingSurface, setIsEditingSurface] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  
  // Coordinates state
  const [coordLat, setCoordLat] = useState<number | undefined>(undefined);
  const [coordLng, setCoordLng] = useState<number | undefined>(undefined);
  const [coordSource, setCoordSource] = useState('');
  const [isSavingCoords, setIsSavingCoords] = useState(false);
  const [isEditingCoords, setIsEditingCoords] = useState(false);

  // Initialize PDF.js worker
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('urban_profiles')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      // Cast to handle the additional_restrictions field - parse JSONB
      if (data) {
        const profileData: UrbanProfile = {
          ...data,
          additional_restrictions: Array.isArray(data.additional_restrictions) 
            ? data.additional_restrictions as unknown as AdditionalRestriction[]
            : null,
        };
        setProfile(profileData);
        
        if (profileData.cadastral_reference) {
          setSearchRef(profileData.cadastral_reference);
        }
        if (profileData.surface_area) {
          setManualSurface(profileData.surface_area);
        }
        if (profileData.google_maps_lat) {
          setCoordLat(profileData.google_maps_lat);
        }
        if (profileData.google_maps_lng) {
          setCoordLng(profileData.google_maps_lng);
        }
        if (profileData.coordinates_source) {
          setCoordSource(profileData.coordinates_source);
        }
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Error fetching urban profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSurface = async () => {
    if (!profile?.id || manualSurface === undefined) return;
    
    setIsSavingSurface(true);
    try {
      const { error } = await supabase
        .from('urban_profiles')
        .update({ surface_area: manualSurface })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfile(prev => prev ? { ...prev, surface_area: manualSurface } : prev);
      setIsEditingSurface(false);
      toast({
        title: 'Superficie actualizada',
        description: `Superficie gráfica: ${manualSurface} m²`,
      });
    } catch (error) {
      console.error('Error saving surface:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar la superficie',
      });
    } finally {
      setIsSavingSurface(false);
    }
  };

  const handleSaveCoordinates = async () => {
    if (!profile?.id) return;
    
    setIsSavingCoords(true);
    try {
      const { error } = await supabase
        .from('urban_profiles')
        .update({
          google_maps_lat: coordLat ?? null,
          google_maps_lng: coordLng ?? null,
          coordinates_source: coordSource || null,
        })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfile(prev => prev ? {
        ...prev,
        google_maps_lat: coordLat ?? null,
        google_maps_lng: coordLng ?? null,
        coordinates_source: coordSource || null,
      } : prev);
      setIsEditingCoords(false);
      toast({
        title: 'Coordenadas actualizadas',
        description: coordLat && coordLng ? `Lat: ${coordLat}, Lng: ${coordLng}` : 'Coordenadas eliminadas',
      });
    } catch (error) {
      console.error('Error saving coordinates:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar las coordenadas',
      });
    } finally {
      setIsSavingCoords(false);
    }
  };

  const handleSaveField = async (field: string, sourceField: string, value: number | null, source: string | null) => {
    if (!profile?.id) return;
    
    try {
      const updateData: Record<string, unknown> = {
        [field]: value,
        [sourceField]: source,
      };
      
      const { error } = await supabase
        .from('urban_profiles')
        .update(updateData)
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfile(prev => prev ? { ...prev, ...updateData } as UrbanProfile : prev);
      toast({
        title: 'Campo actualizado',
        description: 'Los datos se han guardado correctamente',
      });
    } catch (error) {
      console.error('Error saving field:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el campo',
      });
    }
  };

  const handleSaveAdditionalRestrictions = async (restrictions: AdditionalRestriction[]) => {
    if (!profile?.id) return;
    
    try {
      const { error } = await supabase
        .from('urban_profiles')
        .update({ additional_restrictions: restrictions as unknown as Json })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setProfile(prev => prev ? { ...prev, additional_restrictions: restrictions } : prev);
      toast({
        title: 'Restricciones actualizadas',
        description: 'Los datos se han guardado correctamente',
      });
    } catch (error) {
      console.error('Error saving restrictions:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar las restricciones',
      });
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [budgetId]);

  useEffect(() => {
    if (initialRef && !searchRef) {
      setSearchRef(initialRef);
    }
  }, [initialRef]);

  const handleCatastroSearch = async () => {
    if (!searchRef.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Introduce una referencia catastral válida',
      });
      return;
    }

    setIsSearching(true);

    try {
      const { data, error } = await supabase.functions.invoke('catastro-lookup', {
        body: {
          cadastralReference: searchRef.trim(),
          budgetId,
          saveToProfile: true,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const catastroData = data.data as CatastroData;
        toast({
          title: 'Datos del Catastro obtenidos',
          description: `Parcela en ${catastroData.municipality}, ${catastroData.province}`,
        });
        // Force refresh profile to update UI with new data
        await fetchProfile();
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('Error querying catastro:', error);
      toast({
        variant: 'destructive',
        title: 'Error al consultar el Catastro',
        description: error instanceof Error ? error.message : 'No se pudo obtener la información',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchRegulations = async () => {
    if (!profile?.municipality || !profile?.province) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Primero consulta el Catastro para obtener el municipio y provincia',
      });
      return;
    }

    setIsSearchingRegulations(true);

    try {
      const { data, error } = await supabase.functions.invoke('search-urban-regulations', {
        body: {
          municipality: profile.municipality,
          province: profile.province,
          landClass: profile.land_class || 'Urbano',
          budgetId,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const regulations = data.data;
        const valuesFound = regulations.valuesFound || 0;
        
        if (regulations.parseError) {
          toast({
            title: 'Búsqueda completada',
            description: 'Se encontró información pero no se pudo estructurar automáticamente. Revisa los campos manualmente.',
          });
        } else if (valuesFound === 0) {
          // No numeric values found, but sources may be available
          const sourcesCount = regulations.sources?.length || 0;
          toast({
            variant: 'default',
            title: 'Búsqueda completada',
            description: sourcesCount > 0 
              ? `No se encontraron valores numéricos específicos en la normativa urbanística de ${profile.municipality}. Se encontraron ${sourcesCount} fuentes que puedes consultar manualmente. Revisa las notas de análisis.`
              : `No se encontraron datos específicos en la normativa urbanística de ${profile.municipality}. Puedes introducir los valores manualmente.`,
          });
        } else {
          toast({
            title: 'Normativa urbanística encontrada',
            description: `Se han actualizado ${valuesFound} campos con datos de la normativa urbanística de ${profile.municipality}`,
          });
        }
        
        // Refresh profile to show updated data
        fetchProfile();
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('Error searching regulations:', error);
      toast({
        variant: 'destructive',
        title: 'Error al buscar normativa',
        description: error instanceof Error ? error.message : 'No se pudo obtener la información',
      });
    } finally {
      setIsSearchingRegulations(false);
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        variant: 'destructive',
        title: 'Archivo no válido',
        description: 'Por favor, selecciona un archivo PDF',
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Archivo demasiado grande',
        description: 'El PDF no puede superar los 20MB',
      });
      return;
    }

    setIsProcessingPdf(true);
    toast({
      title: 'Procesando PDF...',
      description: 'Extrayendo texto del documento. Esto puede tardar unos segundos.',
    });

    try {
      // Read the PDF file
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      const maxPages = Math.min(pdf.numPages, 50); // Limit to 50 pages

      toast({
        title: 'Extrayendo texto...',
        description: `Procesando ${maxPages} de ${pdf.numPages} páginas`,
      });

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n\n';
      }

      if (fullText.trim().length < 100) {
        toast({
          variant: 'destructive',
          title: 'PDF sin texto legible',
          description: 'El PDF parece ser una imagen escaneada. Prueba con un PDF con texto seleccionable.',
        });
        return;
      }

      toast({
        title: 'Analizando con IA...',
        description: 'Extrayendo parámetros urbanísticos del documento',
      });

      // Send to edge function for AI processing
      const { data, error } = await supabase.functions.invoke('extract-pgou-data', {
        body: {
          pdfText: fullText,
          municipality: profile?.municipality,
          landClass: profile?.land_class || 'Urbano',
          budgetId,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const valuesFound = data.data?.valuesFound || 0;
        
        if (data.data?.parseError) {
          toast({
            title: 'Análisis completado',
            description: 'Se procesó el PDF pero no se pudo estructurar la información automáticamente.',
          });
        } else if (valuesFound === 0) {
          toast({
            variant: 'default',
            title: 'No se encontraron datos',
            description: 'El PDF no contiene los parámetros urbanísticos buscados o están en un formato no reconocible.',
          });
        } else {
          toast({
            title: '¡Datos extraídos correctamente!',
            description: `Se han encontrado ${valuesFound} parámetros urbanísticos en el PDF`,
          });
        }

        await fetchProfile();
      } else {
        throw new Error(data?.error || 'Error al procesar el PDF');
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      toast({
        variant: 'destructive',
        title: 'Error al procesar PDF',
        description: error instanceof Error ? error.message : 'No se pudo extraer la información del PDF',
      });
    } finally {
      setIsProcessingPdf(false);
      // Reset file input
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  };

  const getStatusInfo = () => {
    const status = profile?.analysis_status || 'pending';
    return statusLabels[status] || statusLabels.pending;
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num == null) return '-';
    return num.toLocaleString('es-ES');
  };

  const openGoogleMaps = () => {
    if (coordLat && coordLng) {
      window.open(`https://www.google.com/maps?q=${coordLat},${coordLng}`, '_blank');
    }
  };

  const coordsHaveChanged = () => {
    return coordLat !== (profile?.google_maps_lat ?? undefined) ||
           coordLng !== (profile?.google_maps_lng ?? undefined) ||
           coordSource !== (profile?.coordinates_source || '');
  };

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  
  const additionalRestrictions: AdditionalRestriction[] = profile?.additional_restrictions || [];

  return (
    <Card className="border-primary/20">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Perfil Urbanístico</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {profile && (
                <Badge className={statusInfo.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? 'Contraer' : 'Expandir'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <CardDescription>
            Consulta la normativa urbanística a partir de la referencia catastral
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Search Section */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="cadastral-ref" className="sr-only">Referencia Catastral</Label>
                  <Input
                    id="cadastral-ref"
                    placeholder="Ej: 52025A06004590000RS"
                    value={searchRef}
                    onChange={(e) => setSearchRef(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                </div>
              </div>
              
              {/* Main Action Button */}
              <Button 
                onClick={handleCatastroSearch} 
                disabled={isSearching || !searchRef.trim()}
                className="w-full"
                size="lg"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Consultando Catastro...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    {profile ? 'Actualizar Calificación del Terreno' : 'Consultar Calificación del Terreno'}
                  </>
                )}
              </Button>
              
              {/* Search Urban Regulations Button - only show after catastro data is loaded */}
              {profile && profile.municipality && (
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSearchRegulations} 
                    disabled={isSearchingRegulations || isProcessingPdf}
                    variant="secondary"
                    className="flex-1"
                    size="lg"
                  >
                    {isSearchingRegulations ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Buscando en web...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Buscar Normativa Urbanística en Web
                      </>
                    )}
                  </Button>
                  
                  {/* Hidden file input for PDF upload */}
                  <input
                    type="file"
                    ref={pdfInputRef}
                    accept="application/pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                  />
                  
                  <Button 
                    onClick={() => pdfInputRef.current?.click()} 
                    disabled={isProcessingPdf || isSearchingRegulations}
                    variant="outline"
                    size="lg"
                    className="flex-1"
                  >
                    {isProcessingPdf ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Procesando PDF...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Subir PDF pequeño
                      </>
                    )}
                  </Button>
                </div>
              )}
              
              {/* Large Document Uploader - for files > 20MB or external URLs */}
              {profile && profile.municipality && (
                <LargeDocumentUploader
                  budgetId={budgetId}
                  municipality={profile.municipality}
                  landClass={profile.land_class || undefined}
                  onProcessingComplete={fetchProfile}
                />
              )}
            </div>

            {/* Profile Data */}
            {profile && (
              <div className="space-y-4">
                <Separator />
                
                {/* Location Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      Ubicación
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Municipio:</span>
                        <p className="font-medium">{profile.municipality || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Provincia:</span>
                        <p className="font-medium">{profile.province || '-'}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Localidad:</span>
                        <p className="font-medium">{profile.locality || '-'}</p>
                      </div>
                      {profile.address && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Dirección:</span>
                          <p className="font-medium">{profile.address}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Google Maps Coordinates */}
                    <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Navigation className="h-4 w-4 text-primary" />
                          <span>Coordenadas Google Maps</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {coordsHaveChanged() && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleSaveCoordinates}
                                disabled={isSavingCoords}
                                className="h-6 px-2"
                              >
                                {isSavingCoords ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 text-green-600" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setCoordLat(profile.google_maps_lat ?? undefined);
                                  setCoordLng(profile.google_maps_lng ?? undefined);
                                  setCoordSource(profile.coordinates_source || '');
                                  setIsEditingCoords(false);
                                }}
                                className="h-6 px-2"
                              >
                                ✕
                              </Button>
                            </>
                          )}
                          {coordLat && coordLng && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={openGoogleMaps}
                              className="h-6 px-2"
                              title="Abrir en Google Maps"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Latitud</Label>
                          <Input
                            type="number"
                            step="any"
                            value={coordLat ?? ''}
                            onChange={(e) => {
                              setCoordLat(e.target.value ? parseFloat(e.target.value) : undefined);
                              setIsEditingCoords(true);
                            }}
                            placeholder="40.4168"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Longitud</Label>
                          <Input
                            type="number"
                            step="any"
                            value={coordLng ?? ''}
                            onChange={(e) => {
                              setCoordLng(e.target.value ? parseFloat(e.target.value) : undefined);
                              setIsEditingCoords(true);
                            }}
                            placeholder="-3.7038"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      
                      {/* Google Maps URL display */}
                      {coordLat && coordLng && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            URL Google Maps
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              value={`https://www.google.com/maps?q=${coordLat},${coordLng}`}
                              readOnly
                              className="h-8 text-xs font-mono bg-muted/50"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={openGoogleMaps}
                              className="h-8 px-3 shrink-0"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Abrir
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Fuente
                        </Label>
                        <Input
                          value={coordSource}
                          onChange={(e) => {
                            setCoordSource(e.target.value);
                            setIsEditingCoords(true);
                          }}
                          placeholder="Ej: Sede Electrónica del Catastro"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Land Section */}
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <TreePine className="h-4 w-4 text-primary" />
                      Terreno
                    </h4>
                    <div className="space-y-2 text-sm">
                      {/* Land Class - Main field */}
                      <div className="p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-muted-foreground font-medium">Tipo de Terreno:</span>
                          <Badge variant={
                            profile.land_class === 'Urbano' ? 'default' :
                            profile.land_class === 'Urbanizable' ? 'secondary' :
                            'outline'
                          }>
                            {profile.land_class || 'No determinado'}
                          </Badge>
                        </div>
                        {/* Description from Catastro */}
                        <p className="text-xs text-muted-foreground mt-2">
                          {profile.land_class === 'Urbano' && 'Suelo Urbano - Terreno apto para edificación según normativa urbanística municipal'}
                          {profile.land_class === 'Rústico' && 'Suelo Rústico - Terreno no urbanizable, uso agrícola/ganadero. Requiere consulta específica al Ayuntamiento para usos permitidos.'}
                          {profile.land_class === 'Urbanizable' && 'Suelo Urbanizable - Terreno programado para desarrollo urbano. Requiere Plan Parcial aprobado.'}
                          {profile.land_class === 'No Urbanizable' && 'Suelo No Urbanizable de especial protección. No se permite edificación.'}
                          {!profile.land_class && 'Consultar clasificación en la normativa urbanística municipal'}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>Fuente: Catastro - Sede Electrónica del Catastro (SEC)</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">Superficie gráfica:</span>
                          <div className="flex items-center gap-2 mt-1">
                            <NumericInput
                              value={manualSurface}
                              onChange={(value) => {
                                setManualSurface(value);
                                setIsEditingSurface(true);
                              }}
                              placeholder="Introducir m²"
                              className="w-28 h-8"
                              min={0}
                              max={999999}
                            />
                            <span className="text-sm text-muted-foreground">m²</span>
                            {isEditingSurface && manualSurface !== profile.surface_area && (
                              <>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={handleSaveSurface}
                                  disabled={isSavingSurface}
                                  className="h-8 px-2"
                                  title="Guardar"
                                >
                                  {isSavingSurface ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                  )}
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => {
                                    setIsEditingSurface(false);
                                    setManualSurface(profile.surface_area || undefined);
                                  }}
                                  className="h-8 px-2"
                                  title="Cancelar"
                                >
                                  ✕
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Uso:</span>
                          <p className="font-medium">{profile.land_use || '-'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Construction Parameters Section */}
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-primary" />
                    Capacidades Constructivas
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Datos obtenidos de la normativa urbanística del Municipio (PGOU, Plan Parcial, Normas Subsidiarias, etc.). Consultar con el Ayuntamiento para verificar.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Max Buildable Volume */}
                    <EditableFieldWithSource
                      label="Volumen máximo de edificación"
                      value={profile.max_buildable_volume}
                      source={profile.max_buildable_volume_source}
                      unit="m³"
                      icon={Building2}
                      onSave={(value, source) => handleSaveField('max_buildable_volume', 'max_buildable_volume_source', value, source)}
                    />
                    
                    {/* Buildability Index */}
                    <EditableFieldWithSource
                      label="Índice de edificabilidad"
                      value={profile.buildability_index}
                      source={profile.buildability_index_source}
                      unit="m²/m²"
                      icon={Ruler}
                      onSave={(value, source) => handleSaveField('buildability_index', 'buildability_index_source', value, source)}
                    />
                    
                    {/* Max Height */}
                    <EditableFieldWithSource
                      label="Altura máxima permitida"
                      value={profile.max_height}
                      source={profile.max_height_source}
                      unit="m"
                      icon={MoveVertical}
                      onSave={(value, source) => handleSaveField('max_height', 'max_height_source', value, source)}
                    />
                    
                    {/* Max Occupation */}
                    <EditableFieldWithSource
                      label="Ocupación máxima"
                      value={profile.max_occupation_percent}
                      source={profile.max_occupation_source}
                      unit="%"
                      icon={Home}
                      onSave={(value, source) => handleSaveField('max_occupation_percent', 'max_occupation_source', value, source)}
                    />
                  </div>
                </div>

                {/* Setbacks Section */}
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2 text-sm">
                    <ArrowLeftRight className="h-4 w-4 text-primary" />
                    Distancias Mínimas / Retranqueos
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Distancias mínimas a respetar según normativa urbanística aplicable.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Front Setback */}
                    <EditableFieldWithSource
                      label="Retranqueo frontal"
                      value={profile.front_setback}
                      source={profile.front_setback_source}
                      unit="m"
                      icon={ArrowLeftRight}
                      onSave={(value, source) => handleSaveField('front_setback', 'front_setback_source', value, source)}
                    />
                    
                    {/* Side Setback */}
                    <EditableFieldWithSource
                      label="Retranqueo lateral"
                      value={profile.side_setback}
                      source={profile.side_setback_source}
                      unit="m"
                      icon={ArrowLeftRight}
                      onSave={(value, source) => handleSaveField('side_setback', 'side_setback_source', value, source)}
                    />
                    
                    {/* Rear Setback */}
                    <EditableFieldWithSource
                      label="Retranqueo posterior"
                      value={profile.rear_setback}
                      source={profile.rear_setback_source}
                      unit="m"
                      icon={ArrowLeftRight}
                      onSave={(value, source) => handleSaveField('rear_setback', 'rear_setback_source', value, source)}
                    />
                    
                    {/* Min Distance to Neighbors */}
                    <EditableFieldWithSource
                      label="Distancia mínima a colindantes"
                      value={profile.min_distance_neighbors}
                      source={profile.min_distance_neighbors_source}
                      unit="m"
                      icon={Home}
                      onSave={(value, source) => handleSaveField('min_distance_neighbors', 'min_distance_neighbors_source', value, source)}
                    />
                    
                    {/* Min Distance to Roads */}
                    <EditableFieldWithSource
                      label="Distancia mínima a caminos/carreteras"
                      value={profile.min_distance_roads}
                      source={profile.min_distance_roads_source}
                      unit="m"
                      icon={Landmark}
                      onSave={(value, source) => handleSaveField('min_distance_roads', 'min_distance_roads_source', value, source)}
                    />
                    
                    {/* Min Distance to Slopes */}
                    <EditableFieldWithSource
                      label="Distancia mínima a taludes"
                      value={profile.min_distance_slopes}
                      source={profile.min_distance_slopes_source}
                      unit="m"
                      icon={Mountain}
                      onSave={(value, source) => handleSaveField('min_distance_slopes', 'min_distance_slopes_source', value, source)}
                    />
                  </div>
                </div>

                {/* Sectoral Restrictions Section - Afecciones Sectoriales */}
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Afecciones Sectoriales
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Distancias mínimas a infraestructuras y elementos protegidos según legislación sectorial.
                  </p>
                  
                  {/* Affected By Indicators */}
                  <div className="flex flex-wrap gap-2">
                    {profile.affected_by_power_lines && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                        <Zap className="h-3 w-3 mr-1" />
                        Afectada por líneas eléctricas
                      </Badge>
                    )}
                    {profile.affected_by_cemetery && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400">
                        <Cross className="h-3 w-3 mr-1" />
                        Próxima a cementerio
                      </Badge>
                    )}
                    {profile.affected_by_water_courses && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400">
                        <Droplets className="h-3 w-3 mr-1" />
                        Próxima a cauce de agua
                      </Badge>
                    )}
                    {profile.is_divisible === false && (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400">
                        Parcela indivisible
                      </Badge>
                    )}
                    {profile.is_divisible === true && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400">
                        Parcela divisible
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Distance to Cemetery */}
                    <EditableFieldWithSource
                      label="Distancia mínima a cementerio"
                      value={profile.min_distance_cemetery}
                      source={profile.min_distance_cemetery_source}
                      unit="m"
                      icon={Cross}
                      onSave={(value, source) => handleSaveField('min_distance_cemetery', 'min_distance_cemetery_source', value, source)}
                    />
                    
                    {/* Distance to Power Lines */}
                    <EditableFieldWithSource
                      label="Distancia mínima a líneas eléctricas"
                      value={profile.min_distance_power_lines}
                      source={profile.min_distance_power_lines_source}
                      unit="m"
                      icon={Zap}
                      onSave={(value, source) => handleSaveField('min_distance_power_lines', 'min_distance_power_lines_source', value, source)}
                    />
                    
                    {/* Distance to Water Courses */}
                    <EditableFieldWithSource
                      label="Distancia mínima a cauces de agua"
                      value={profile.min_distance_water_courses}
                      source={profile.min_distance_water_courses_source}
                      unit="m"
                      icon={Droplets}
                      onSave={(value, source) => handleSaveField('min_distance_water_courses', 'min_distance_water_courses_source', value, source)}
                    />
                    
                    {/* Distance to Railway */}
                    <EditableFieldWithSource
                      label="Distancia mínima a vía férrea"
                      value={profile.min_distance_railway}
                      source={profile.min_distance_railway_source}
                      unit="m"
                      icon={Train}
                      onSave={(value, source) => handleSaveField('min_distance_railway', 'min_distance_railway_source', value, source)}
                    />
                    
                    {/* Distance to Pipeline */}
                    <EditableFieldWithSource
                      label="Distancia mínima a gasoducto/oleoducto"
                      value={profile.min_distance_pipeline}
                      source={profile.min_distance_pipeline_source}
                      unit="m"
                      icon={Fuel}
                      onSave={(value, source) => handleSaveField('min_distance_pipeline', 'min_distance_pipeline_source', value, source)}
                    />
                    
                    {/* Max Built Surface */}
                    <EditableFieldWithSource
                      label="Superficie máxima construida"
                      value={profile.max_built_surface}
                      source={profile.max_built_surface_source}
                      unit="m²"
                      icon={Building2}
                      onSave={(value, source) => handleSaveField('max_built_surface', 'max_built_surface_source', value, source)}
                    />
                    
                    {/* Fence Setback */}
                    <EditableFieldWithSource
                      label="Retranqueo de cerramiento a viario"
                      value={profile.fence_setback}
                      source={profile.fence_setback_source}
                      unit="m"
                      icon={Fence}
                      onSave={(value, source) => handleSaveField('fence_setback', 'fence_setback_source', value, source)}
                    />
                    
                    {/* Access Width */}
                    <EditableFieldWithSource
                      label="Anchura mínima de acceso rodado"
                      value={profile.access_width}
                      source={profile.access_width_source}
                      unit="m"
                      icon={Car}
                      onSave={(value, source) => handleSaveField('access_width', 'access_width_source', value, source)}
                    />
                  </div>
                </div>

                {/* Additional Restrictions Section */}
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary" />
                      Otras Restricciones y Mediciones
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newRestriction: AdditionalRestriction = {
                          id: crypto.randomUUID(),
                          name: '',
                          value: null,
                          unit: 'm',
                          source: '',
                        };
                        handleSaveAdditionalRestrictions([...additionalRestrictions, newRestriction]);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Añadir
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Otras mediciones que puedan afectar al proyecto constructivo.
                  </p>
                  
                  {additionalRestrictions.length > 0 ? (
                    <div className="space-y-2">
                      {additionalRestrictions.map((restriction, index) => (
                        <div key={restriction.id} className="p-3 rounded-lg bg-muted/30 border space-y-2">
                          <div className="flex items-center justify-between">
                            <Input
                              value={restriction.name}
                              onChange={(e) => {
                                const updated = [...additionalRestrictions];
                                updated[index] = { ...restriction, name: e.target.value };
                                handleSaveAdditionalRestrictions(updated);
                              }}
                              placeholder="Nombre de la restricción"
                              className="h-8 text-sm font-medium flex-1 mr-2"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const updated = additionalRestrictions.filter((_, i) => i !== index);
                                handleSaveAdditionalRestrictions(updated);
                              }}
                              className="h-8 px-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <NumericInput
                              value={restriction.value ?? undefined}
                              onChange={(v) => {
                                const updated = [...additionalRestrictions];
                                updated[index] = { ...restriction, value: v ?? null };
                                handleSaveAdditionalRestrictions(updated);
                              }}
                              placeholder="Valor"
                              className="w-24 h-8"
                              min={0}
                            />
                            <Input
                              value={restriction.unit}
                              onChange={(e) => {
                                const updated = [...additionalRestrictions];
                                updated[index] = { ...restriction, unit: e.target.value };
                                handleSaveAdditionalRestrictions(updated);
                              }}
                              placeholder="Unidad"
                              className="w-16 h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Fuente legal
                            </Label>
                            <Input
                              value={restriction.source}
                              onChange={(e) => {
                                const updated = [...additionalRestrictions];
                                updated[index] = { ...restriction, source: e.target.value };
                                handleSaveAdditionalRestrictions(updated);
                              }}
                              placeholder="Ej: Normativa Urbanística Art. X, Ley Y/Z"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No hay restricciones adicionales. Pulsa "Añadir" para incluir mediciones que afecten al proyecto.
                    </p>
                  )}
                </div>

                {/* CTE Zones (if available) */}
                {(profile.climatic_zone || profile.wind_zone || profile.seismic_zone) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2 text-sm">
                        <Mountain className="h-4 w-4 text-primary" />
                        Zonas CTE
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {profile.climatic_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona climática:</span>
                            <p className="font-medium">{profile.climatic_zone}</p>
                          </div>
                        )}
                        {profile.wind_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona eólica:</span>
                            <p className="font-medium">{profile.wind_zone}</p>
                          </div>
                        )}
                        {profile.seismic_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona sísmica:</span>
                            <p className="font-medium">{profile.seismic_zone}</p>
                          </div>
                        )}
                        {profile.snow_zone && (
                          <div>
                            <span className="text-muted-foreground">Zona nieve:</span>
                            <p className="font-medium">{profile.snow_zone}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Cartographic Tools Section */}
                {coordLat && coordLng && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2 text-sm">
                        <Map className="h-4 w-4 text-primary" />
                        Cartografía y Visualización
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Accede a la cartografía de la parcela con límites, curvas de nivel y ortofotografías.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {/* IBERPIX - IGN Viewer with contour lines */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => openSafeUrl(`https://www.ign.es/iberpix/visor/?center=${coordLng},${coordLat}&zoom=17`)}
                        >
                          <Map className="h-4 w-4 text-blue-600" />
                          <div className="text-left">
                            <div className="text-xs font-medium">IBERPIX (IGN)</div>
                            <div className="text-[10px] text-muted-foreground">Curvas de nivel, MDT</div>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </Button>
                        
                        {/* Sede Electrónica del Catastro */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => openSafeUrl(`https://www1.sedecatastro.gob.es/cartografia/mapa.aspx?buscar=S&from=OVCBusqueda&pest=rc&RCCompleta=${profile?.cadastral_reference || ''}`)}
                        >
                          <Landmark className="h-4 w-4 text-amber-600" />
                          <div className="text-left">
                            <div className="text-xs font-medium">Sede Catastro</div>
                            <div className="text-[10px] text-muted-foreground">Límites parcela</div>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </Button>
                        
                        {/* Google Earth Web */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => openSafeUrl(`https://earth.google.com/web/@${coordLat},${coordLng},500a,500d,35y,0h,0t,0r`)}
                        >
                          <Globe className="h-4 w-4 text-green-600" />
                          <div className="text-left">
                            <div className="text-xs font-medium">Google Earth</div>
                            <div className="text-[10px] text-muted-foreground">Vista 3D, terreno</div>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </Button>
                        
                        {/* PNOA - Orthophoto */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => openSafeUrl(`https://www.ign.es/iberpix/visor/?center=${coordLng},${coordLat}&zoom=18&layers=mapa-base-todo&capasbase=ortofotoPNOA`)}
                        >
                          <MapPin className="h-4 w-4 text-purple-600" />
                          <div className="text-left">
                            <div className="text-xs font-medium">Ortofoto PNOA</div>
                            <div className="text-[10px] text-muted-foreground">Foto aérea alta res.</div>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </Button>
                        
                        {/* SIGPAC - Agricultural viewer */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => openSafeUrl(`https://sigpac.mapa.gob.es/fega/visor/?lon=${coordLng}&lat=${coordLat}&zoom=17`)}
                        >
                          <TreePine className="h-4 w-4 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-xs font-medium">SIGPAC</div>
                            <div className="text-[10px] text-muted-foreground">Parcelas agrarias</div>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </Button>
                        
                        {/* Google Maps Terrain */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => openSafeUrl(`https://www.google.com/maps/@${coordLat},${coordLng},17z/data=!5m1!1e4`)}
                        >
                          <Mountain className="h-4 w-4 text-orange-600" />
                          <div className="text-left">
                            <div className="text-xs font-medium">Google Maps Terreno</div>
                            <div className="text-[10px] text-muted-foreground">Relieve, topografía</div>
                          </div>
                          <ExternalLink className="h-3 w-3 ml-auto" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* Notes with clickable links */}
                {profile.analysis_notes && (
                  <>
                    <Separator />
                    <div className="text-sm space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Notas del análisis y fuentes
                      </h4>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <AnalysisNotesRenderer notes={profile.analysis_notes} />
                      </div>
                    </div>
                  </>
                )}

                {/* Last Updated */}
                {profile.last_analyzed_at && (
                  <div className="text-xs text-muted-foreground pt-2">
                    Última consulta: {new Date(profile.last_analyzed_at).toLocaleString('es-ES')}
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!profile && (
              <div className="text-center py-6 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Introduce una referencia catastral y pulsa "Consultar Catastro"</p>
                <p className="text-xs mt-1">
                  Ejemplo: 52025A06004590000RS (Manzaneda, Gozón, Asturias)
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
