import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Image as ImageIcon, Sparkles, X, MapPin, Ruler, CheckCircle, RotateCcw, Move, Percent } from 'lucide-react';
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
  
  // Map preview state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  
  // Manual placement state
  const [placementOffset, setPlacementOffset] = useState<{ lat: number; lng: number } | null>(null);
  const [rotation, setRotation] = useState<number>(0); // degrees
  const [scaleAdjustment, setScaleAdjustment] = useState<number>(100); // percentage (100 = no change)

  const hasCoordinates = parcelData?.lat && parcelData?.lng;

  // Calculate the scale ratio for proportional placement
  const getScaleInfo = () => {
    if (!parcelData?.area || !buildingFootprint) return null;
    // Apply scale adjustment
    const adjustedFootprint = buildingFootprint * (scaleAdjustment / 100);
    const ratio = (adjustedFootprint / parcelData.area) * 100;
    return {
      parcelArea: parcelData.area,
      buildingArea: adjustedFootprint,
      originalBuildingArea: buildingFootprint,
      ratio: ratio.toFixed(1),
      scalePercent: scaleAdjustment
    };
  };

  // Reset placement when dialog opens
  useEffect(() => {
    if (open) {
      setPlacementOffset(null);
      setRotation(0);
      setScaleAdjustment(100);
    }
  }, [open]);

  // Initialize map for preview and placement when dialog opens
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

      // Add parcel center marker (red, fixed)
      L.marker([parcelData.lat!, parcelData.lng!], {
        icon: L.divIcon({
          className: 'parcel-center-marker',
          html: '<div class="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        })
      }).addTo(map);

      // Click handler to place the building
      map.on('click', (e: L.LeafletMouseEvent) => {
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;
        
        setPlacementOffset({ lat: clickLat, lng: clickLng });
        
        // Update or create placement marker (green)
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          const marker = L.marker([clickLat, clickLng], {
            icon: L.divIcon({
              className: 'building-placement-marker',
              html: '<div class="w-5 h-5 bg-green-500 rounded border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold">🏠</div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })
          }).addTo(map);
          markerRef.current = marker;
        }
      });

      mapRef.current = map;
      setMapReady(true);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
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

  const resetPlacement = () => {
    setPlacementOffset(null);
    setRotation(0);
    setScaleAdjustment(100);
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
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
        contextPrompt += ` El edificio ocupa aproximadamente ${scaleInfo.buildingArea.toFixed(0)} m² de huella (${scaleInfo.ratio}% de la parcela).`;
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

      // Calculate placement offset relative to parcel center
      let placementOffsetData = null;
      if (placementOffset && parcelData?.lat && parcelData?.lng) {
        // Calculate offset in meters from parcel center
        const metersPerDegLat = 111320;
        const metersPerDegLng = 111320 * Math.cos(parcelData.lat * Math.PI / 180);
        
        const offsetMetersX = (placementOffset.lng - parcelData.lng) * metersPerDegLng;
        const offsetMetersY = (placementOffset.lat - parcelData.lat) * metersPerDegLat;
        
        placementOffsetData = {
          offsetMetersX,
          offsetMetersY,
          targetLat: placementOffset.lat,
          targetLng: placementOffset.lng
        };
      }

      // Send coordinates and placement data
      const { data, error } = await supabase.functions.invoke('generate-3d-visualization', {
        body: {
          imageBase64: base64Image,
          prompt: contextPrompt,
          budgetId,
          parcelAreaM2: parcelData?.area,
          buildingFootprintM2: buildingFootprint ? buildingFootprint * (scaleAdjustment / 100) : undefined,
          parcelLat: parcelData?.lat,
          parcelLng: parcelData?.lng,
          // New placement parameters
          placementOffset: placementOffsetData,
          rotationDegrees: rotation,
          scaleAdjustmentPercent: scaleAdjustment
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
      resetPlacement();

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
            Haz clic en el mapa para posicionar exactamente dónde colocar la vivienda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Map preview section with click-to-place */}
          {hasCoordinates ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Haz clic en el mapa para posicionar la vivienda
              </Label>
              
              <div 
                ref={mapContainerRef}
                className="h-56 rounded-lg border overflow-hidden cursor-crosshair"
                style={{ minHeight: '224px' }}
              />
              
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full border border-white"></div>
                  <span>Centro parcela</span>
                  {placementOffset && (
                    <>
                      <span className="mx-2">|</span>
                      <div className="w-4 h-4 bg-green-500 rounded border border-white flex items-center justify-center text-[8px]">🏠</div>
                      <span className="text-green-600 font-medium">Posición seleccionada</span>
                    </>
                  )}
                </div>
                {placementOffset && (
                  <Button variant="ghost" size="sm" onClick={resetPlacement} className="h-6 text-xs">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reiniciar
                  </Button>
                )}
              </div>
              
              {!placementOffset && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  ⚠️ Haz clic en el mapa para indicar el punto exacto donde colocar la vivienda
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
            <Label>Imagen del edificio (render, perspectiva, planta) *</Label>
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
                  Render 3D, perspectiva de ChiefArchitect, plano de planta...
                </p>
              </div>
            )}
          </div>

          {/* Building footprint for scale */}
          <div className="space-y-2">
            <Label htmlFor="footprint" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Superficie de la vivienda (m²)
            </Label>
            <Input
              id="footprint"
              type="number"
              min={0}
              placeholder="Ej: 125"
              value={buildingFootprint || ''}
              onChange={(e) => setBuildingFootprint(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>

          {/* Scale adjustment slider */}
          {buildingFootprint && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Ajuste de escala: {scaleAdjustment}%
              </Label>
              <Slider
                value={[scaleAdjustment]}
                onValueChange={(val) => setScaleAdjustment(val[0])}
                min={50}
                max={150}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Ajusta si la vivienda aparece demasiado grande o pequeña respecto a la parcela
              </p>
            </div>
          )}

          {/* Rotation control */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Move className="h-4 w-4" />
              Rotación: {rotation}°
            </Label>
            <Slider
              value={[rotation]}
              onValueChange={(val) => setRotation(val[0])}
              min={0}
              max={360}
              step={15}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Gira la vivienda para alinearla con el camino o parcela
            </p>
          </div>

          {/* Scale info display */}
          {getScaleInfo() && (
            <div className="p-3 bg-primary/5 rounded-lg text-sm border border-primary/20">
              <p className="font-medium mb-1 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Proporción calculada:
              </p>
              <p>• Vivienda: {getScaleInfo()!.buildingArea.toFixed(0)} m² ({getScaleInfo()!.scalePercent}% de {getScaleInfo()!.originalBuildingArea} m² original)</p>
              <p>• Parcela: {getScaleInfo()!.parcelArea.toLocaleString('es-ES')} m²</p>
              <p>• Ocupación: <strong>{getScaleInfo()!.ratio}%</strong> de la parcela</p>
            </div>
          )}

          {/* Parcel info display */}
          {parcelData && parcelData.area && !getScaleInfo() && (
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
