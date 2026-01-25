import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Image as ImageIcon, Sparkles, X, MapPin, Ruler, CheckCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Generate3DVisualizationProps {
  budgetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
  parcelData?: {
    area?: number;
    address?: string;
    municipality?: string;
    lat?: number;
    lng?: number;
  };
}

export function Generate3DVisualization({ 
  budgetId, 
  open, 
  onOpenChange, 
  onGenerated,
  parcelData 
}: Generate3DVisualizationProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const [buildingFootprint, setBuildingFootprint] = useState<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Map preview state (just for visual reference - satellite fetch happens server-side)
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const hasCoordinates = parcelData?.lat && parcelData?.lng;

  // Calculate the scale ratio for proportional placement
  const getScaleInfo = () => {
    if (!parcelData?.area || !buildingFootprint) return null;
    const ratio = (buildingFootprint / parcelData.area) * 100;
    return {
      parcelArea: parcelData.area,
      buildingArea: buildingFootprint,
      ratio: ratio.toFixed(1)
    };
  };

  // Initialize map for preview when dialog opens (visual reference only)
  useEffect(() => {
    if (!open || !hasCoordinates || !mapContainerRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      if (!mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [parcelData.lat!, parcelData.lng!],
        zoom: 18,
        zoomControl: true,
        attributionControl: false,
      });

      // Add PNOA orthophoto layer for preview
      L.tileLayer.wms('https://www.ign.es/wms-inspire/pnoa-ma', {
        layers: 'OI.OrthoimageCoverage',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        opacity: 1,
      }).addTo(map);

      // Add parcel marker
      L.marker([parcelData.lat!, parcelData.lng!], {
        icon: L.divIcon({
          className: 'custom-marker',
          html: '<div class="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, [open, hasCoordinates, parcelData?.lat, parcelData?.lng]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Por favor selecciona un archivo de imagen'
      });
      return;
    }

    setSelectedImage(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes subir una imagen base para generar la visualización'
      });
      return;
    }

    setIsGenerating(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedImage);
      });
      
      const base64Image = await base64Promise;

      // Build context prompt with scale information
      let contextPrompt = 'Genera una vista aérea 3D donde el edificio esté integrado en el terreno real.';
      
      if (parcelData?.area) {
        contextPrompt += ` La parcela tiene ${parcelData.area} m² de superficie.`;
      }
      
      // Add building footprint for scale calculation
      const scaleInfo = getScaleInfo();
      if (scaleInfo) {
        contextPrompt += ` El edificio ocupa aproximadamente ${scaleInfo.buildingArea} m² de huella (${scaleInfo.ratio}% de la parcela).`;
      }
      
      if (parcelData?.address) {
        contextPrompt += ` Ubicación: ${parcelData.address}.`;
      }
      if (parcelData?.municipality) {
        contextPrompt += ` Municipio: ${parcelData.municipality}.`;
      }
      if (additionalContext.trim()) {
        contextPrompt += ` ${additionalContext.trim()}`;
      }

      // Send coordinates so server can fetch PNOA image directly (avoiding CORS)
      const { data, error } = await supabase.functions.invoke('generate-3d-visualization', {
        body: {
          imageBase64: base64Image,
          prompt: contextPrompt,
          budgetId,
          parcelAreaM2: parcelData?.area,
          buildingFootprintM2: buildingFootprint,
          parcelLat: parcelData?.lat,
          parcelLng: parcelData?.lng
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Visualización generada',
        description: data?.usedTerrainImage 
          ? 'La imagen 3D se ha generado sobre el terreno real de la parcela'
          : 'La imagen 3D se ha guardado en el ante-proyecto'
      });

      onGenerated();
      onOpenChange(false);
      
      clearImage();
      setAdditionalContext('');
      setBuildingFootprint(undefined);

    } catch (error) {
      console.error('Error generating 3D visualization:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo generar la visualización'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generar Visualización 3D en Terreno Real
          </DialogTitle>
          <DialogDescription>
            La vivienda se ubicará proporcionalmente sobre la imagen satelital real de la parcela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Map preview section - shows where the image will be fetched from */}
          {hasCoordinates ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Vista previa de la ubicación (PNOA)
              </Label>
              
              <div 
                ref={mapContainerRef}
                className="h-48 rounded-lg border overflow-hidden"
                style={{ minHeight: '192px' }}
              />
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>
                  La imagen satelital se obtendrá automáticamente de estas coordenadas: {parcelData?.lat?.toFixed(6)}, {parcelData?.lng?.toFixed(6)}
                </span>
              </div>
              {parcelData?.municipality && (
                <p className="text-xs text-muted-foreground">
                  Municipio: {parcelData.municipality}
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No hay coordenadas disponibles en el perfil urbanístico.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                La visualización se generará sin imagen de fondo del terreno real.
              </p>
            </div>
          )}

          {/* Image upload */}
          <div className="space-y-2">
            <Label>Imagen del edificio (planta, render, perspectiva) *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {imagePreview ? (
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-full h-48 object-contain rounded-lg border bg-muted"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={clearImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Haz clic para subir una imagen del edificio
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Plano de planta, render 3D, perspectiva de ChiefArchitect...
                </p>
              </div>
            )}
          </div>

          {/* Building footprint for scale */}
          <div className="space-y-2">
            <Label htmlFor="footprint" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Superficie de la vivienda (m²) — para escala proporcional
            </Label>
            <Input
              id="footprint"
              type="number"
              min={0}
              placeholder="Ej: 180"
              value={buildingFootprint || ''}
              onChange={(e) => setBuildingFootprint(e.target.value ? Number(e.target.value) : undefined)}
            />
            {getScaleInfo() && (
              <p className="text-xs text-muted-foreground">
                La vivienda ocupará aproximadamente el <strong>{getScaleInfo()!.ratio}%</strong> de la parcela ({getScaleInfo()!.buildingArea} m² de {getScaleInfo()!.parcelArea} m²)
              </p>
            )}
          </div>

          {/* Parcel info display */}
          {parcelData && parcelData.area && (
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="font-medium mb-1">Datos de la parcela:</p>
              <p>• Superficie parcela: {parcelData.area.toLocaleString('es-ES')} m²</p>
              {parcelData.address && <p>• Dirección: {parcelData.address}</p>}
            </div>
          )}

          {/* Additional context */}
          <div className="space-y-2">
            <Label htmlFor="context">Contexto adicional (opcional)</Label>
            <Textarea
              id="context"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Ej: Vivienda unifamiliar de 2 plantas, estilo mediterráneo, orientación sur..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !selectedImage}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 mr-2" />
                Generar Vista 3D
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
