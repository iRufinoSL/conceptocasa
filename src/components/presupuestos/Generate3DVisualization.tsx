import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Image as ImageIcon, Sparkles, X, MapPin, RefreshCw, Ruler } from 'lucide-react';
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
  
  // Map capture state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedMapImage, setCapturedMapImage] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(18);

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

  // Capture satellite image directly using WMS GetMap request (no CORS issues with static image)
  const captureStaticSatelliteImage = useCallback(async () => {
    if (!hasCoordinates || !parcelData?.lat || !parcelData?.lng) return null;

    setIsCapturing(true);
    try {
      const lat = parcelData.lat;
      const lng = parcelData.lng;
      
      // Calculate bounding box for the area (approximately 200m x 200m at the parcel location)
      const metersPerDegLat = 111320;
      const metersPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);
      const halfSizeMeters = 150; // 150m in each direction = 300m x 300m area
      
      const minLat = lat - (halfSizeMeters / metersPerDegLat);
      const maxLat = lat + (halfSizeMeters / metersPerDegLat);
      const minLng = lng - (halfSizeMeters / metersPerDegLng);
      const maxLng = lng + (halfSizeMeters / metersPerDegLng);

      // Use PNOA WMS GetMap to get a static image
      const width = 800;
      const height = 800;
      const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
      
      // PNOA orthophoto WMS service
      const wmsUrl = `https://www.ign.es/wms-inspire/pnoa-ma?` +
        `SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
        `&LAYERS=OI.OrthoimageCoverage` +
        `&STYLES=` +
        `&CRS=EPSG:4326` +
        `&BBOX=${bbox}` +
        `&WIDTH=${width}&HEIGHT=${height}` +
        `&FORMAT=image/png`;

      console.log('Fetching satellite image from:', wmsUrl);

      // Fetch the image and convert to base64
      const response = await fetch(wmsUrl);
      if (!response.ok) {
        throw new Error(`WMS request failed: ${response.status}`);
      }

      const blob = await response.blob();
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    } catch (error) {
      console.error('Error fetching satellite image:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [hasCoordinates, parcelData?.lat, parcelData?.lng]);

  // Initialize map for preview when dialog opens
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
        zoom: mapZoom,
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

      map.on('zoomend', () => {
        setMapZoom(map.getZoom());
      });

      mapRef.current = map;
      setMapReady(true);

      // Auto-capture satellite image
      captureStaticSatelliteImage().then(img => {
        if (img) {
          setCapturedMapImage(img);
        }
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, [open, hasCoordinates, parcelData?.lat, parcelData?.lng, mapZoom, captureStaticSatelliteImage]);

  const handleRecapture = async () => {
    const img = await captureStaticSatelliteImage();
    if (img) {
      setCapturedMapImage(img);
      toast({
        title: 'Imagen capturada',
        description: 'Se ha actualizado la imagen satelital del terreno'
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo capturar la imagen satelital'
      });
    }
  };

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

      const { data, error } = await supabase.functions.invoke('generate-3d-visualization', {
        body: {
          imageBase64: base64Image,
          terrainImageBase64: capturedMapImage || undefined,
          prompt: contextPrompt,
          budgetId,
          parcelAreaM2: parcelData?.area,
          buildingFootprintM2: buildingFootprint
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Visualización generada',
        description: 'La imagen 3D se ha guardado en el ante-proyecto'
      });

      onGenerated();
      onOpenChange(false);
      
      clearImage();
      setAdditionalContext('');
      setCapturedMapImage(null);
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
          {/* Map and satellite image section */}
          {hasCoordinates ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Imagen satelital del terreno (PNOA)
                </Label>
                {mapReady && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRecapture}
                    disabled={isCapturing}
                  >
                    {isCapturing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-1">Recapturar</span>
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Live map for preview */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Vista del mapa (solo referencia)</p>
                  <div 
                    ref={mapContainerRef}
                    className="h-40 rounded-lg border overflow-hidden"
                    style={{ minHeight: '160px' }}
                  />
                </div>
                
                {/* Captured static satellite image */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Imagen satelital capturada</p>
                  <div className="h-40 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                    {capturedMapImage ? (
                      <img 
                        src={capturedMapImage} 
                        alt="Terreno capturado" 
                        className="w-full h-full object-cover"
                      />
                    ) : isCapturing ? (
                      <div className="text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 mx-auto animate-spin mb-1" />
                        <p className="text-xs">Descargando imagen satelital...</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center px-2">
                        Esperando imagen del servicio PNOA...
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Coordenadas: {parcelData?.lat?.toFixed(6)}, {parcelData?.lng?.toFixed(6)} 
                {parcelData?.municipality && ` — ${parcelData.municipality}`}
              </p>
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