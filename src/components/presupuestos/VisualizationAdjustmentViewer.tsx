import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Move, ZoomIn, ZoomOut, RotateCcw, Save, Loader2, Hand, AlertCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface VisualizationAdjustmentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatedImageUrl: string;
  parcelData?: {
    lat?: number;
    lng?: number;
    area?: number;
  };
  onSave?: (adjustedImageUrl: string) => void;
  predesignId?: string;
}

export function VisualizationAdjustmentViewer({
  open,
  onOpenChange,
  generatedImageUrl,
  parcelData,
  onSave,
  predesignId
}: VisualizationAdjustmentViewerProps) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  
  // Adjustment state
  const [scale, setScale] = useState(100); // percentage
  const [rotation, setRotation] = useState(0); // degrees
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  
  // Image dimensions in meters (estimated based on view)
  const baseImageSizeMeters = 50; // Base size of the overlay in meters

  const hasCoordinates = parcelData?.lat && parcelData?.lng;

  // Pre-load image to verify it's accessible
  useEffect(() => {
    if (!open || !generatedImageUrl) return;
    
    setImageLoaded(false);
    setImageError(null);
    
    console.log('Loading image for adjustment:', generatedImageUrl);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      console.log('Image loaded successfully:', img.width, 'x', img.height);
      setImageLoaded(true);
      setImageError(null);
    };
    
    img.onerror = (e) => {
      console.error('Error loading image:', e);
      setImageError('No se pudo cargar la imagen. Verifica que la URL sea accesible.');
    };
    
    img.src = generatedImageUrl;
  }, [open, generatedImageUrl]);

  // Calculate bounds for the image overlay
  const calculateBounds = useCallback((centerLat: number, centerLng: number, sizeMeters: number) => {
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(centerLat * Math.PI / 180);
    
    const latOffset = (sizeMeters / 2) / metersPerDegLat;
    const lngOffset = (sizeMeters / 2) / metersPerDegLng;
    
    return L.latLngBounds(
      [centerLat - latOffset, centerLng - lngOffset],
      [centerLat + latOffset, centerLng + lngOffset]
    );
  }, []);

  // Update overlay position and size
  const updateOverlay = useCallback(() => {
    if (!imageOverlayRef.current || !mapRef.current || !isMapReady) return;
    
    const adjustedSize = baseImageSizeMeters * (scale / 100);
    const newBounds = calculateBounds(position.lat, position.lng, adjustedSize);
    
    imageOverlayRef.current.setBounds(newBounds);
    
    // Apply rotation via CSS transform on the overlay element
    const overlayElement = imageOverlayRef.current.getElement();
    if (overlayElement) {
      overlayElement.style.transform = `rotate(${rotation}deg)`;
      overlayElement.style.transformOrigin = 'center center';
    }
  }, [position, scale, rotation, calculateBounds, isMapReady]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && parcelData?.lat && parcelData?.lng) {
      setPosition({ lat: parcelData.lat, lng: parcelData.lng });
      setScale(100);
      setRotation(0);
      setIsMapReady(false);
    }
  }, [open, parcelData?.lat, parcelData?.lng]);

  // Initialize map only after image is loaded
  useEffect(() => {
    if (!open || !hasCoordinates || !imageLoaded) return;

    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        imageOverlayRef.current = null;
      }

      const container = mapContainerRef.current;
      if (!container) return;

      container.style.width = '100%';
      container.style.height = '400px';

      try {
        const centerLat = parcelData.lat!;
        const centerLng = parcelData.lng!;

        const map = L.map(container, {
          center: [centerLat, centerLng],
          zoom: 18,
          zoomControl: true,
          attributionControl: false,
        });

        // Add OSM base layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 20,
        }).addTo(map);

        // Add PNOA orthophoto layer
        L.tileLayer.wms('https://www.ign.es/wms-inspire/pnoa-ma', {
          layers: 'OI.OrthoimageCoverage',
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          opacity: 1,
        }).addTo(map);

        // Add parcel center marker
        L.marker([centerLat, centerLng], {
          icon: L.divIcon({
            className: '',
            html: '<div style="width:12px;height:12px;background:#ef4444;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          })
        }).addTo(map).bindTooltip('Centro parcela', { permanent: false });

        // Create image overlay at initial position
        const initialBounds = calculateBounds(centerLat, centerLng, baseImageSizeMeters);
        
        console.log('Creating image overlay with URL:', generatedImageUrl);
        console.log('Initial bounds:', initialBounds.toBBoxString());
        
        const imageOverlay = L.imageOverlay(generatedImageUrl, initialBounds, {
          opacity: 0.85,
          interactive: false,
          className: 'visualization-overlay',
          crossOrigin: 'anonymous'
        }).addTo(map);

        // Monitor overlay loading
        const overlayElement = imageOverlay.getElement();
        if (overlayElement) {
          overlayElement.style.border = '3px solid #3b82f6';
          overlayElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          console.log('Overlay element created:', overlayElement);
        }

        // Handle click on map to move the image
        map.on('click', (e: L.LeafletMouseEvent) => {
          console.log('Map clicked at:', e.latlng);
          setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        mapRef.current = map;
        imageOverlayRef.current = imageOverlay;
        setIsMapReady(true);

        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 300);
        setTimeout(() => map.invalidateSize(), 600);

      } catch (err) {
        console.error('Error initializing adjustment map:', err);
        setImageError('Error al inicializar el mapa');
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        imageOverlayRef.current = null;
        setIsMapReady(false);
      }
    };
  }, [open, hasCoordinates, parcelData?.lat, parcelData?.lng, generatedImageUrl, calculateBounds, imageLoaded]);

  // Update overlay when adjustments change
  useEffect(() => {
    updateOverlay();
  }, [position, scale, rotation, updateOverlay]);

  const handleReset = () => {
    if (parcelData?.lat && parcelData?.lng) {
      setPosition({ lat: parcelData.lat, lng: parcelData.lng });
    }
    setScale(100);
    setRotation(0);
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      if (predesignId) {
        // Update the predesign with adjustment metadata
        await supabase
          .from('budget_predesigns')
          .update({
            description: `Ajustes aplicados: Posición (${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}), Escala ${scale}%, Rotación ${rotation}°`,
            updated_at: new Date().toISOString()
          })
          .eq('id', predesignId);
      }

      toast({
        title: 'Ajustes guardados',
        description: 'La posición y escala de la visualización se han guardado'
      });

      onSave?.(generatedImageUrl);
      onOpenChange(false);
      
    } catch (error) {
      console.error('Error saving adjustments:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar los ajustes'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Move className="h-5 w-5 text-primary" />
            Ajustar Visualización 3D
          </DialogTitle>
          <DialogDescription>
            Haz clic en el mapa para mover la imagen y usa los controles para ajustar tamaño y rotación.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Image preview */}
          <div className="space-y-2">
            <Label>Vista previa de la imagen a posicionar:</Label>
            <div className="relative h-32 bg-muted rounded-lg overflow-hidden border">
              {!imageLoaded && !imageError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Cargando imagen...</span>
                </div>
              )}
              {imageError && (
                <div className="absolute inset-0 flex items-center justify-center text-destructive">
                  <AlertCircle className="h-6 w-6 mr-2" />
                  <span className="text-sm">{imageError}</span>
                </div>
              )}
              {imageLoaded && (
                <img 
                  src={generatedImageUrl} 
                  alt="Visualización 3D" 
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>

          {/* Map viewer */}
          {hasCoordinates ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Hand className="h-4 w-4" />
                Haz clic en el mapa para mover la imagen
              </Label>
              
              {!imageLoaded ? (
                <div className="rounded-lg border bg-muted flex items-center justify-center" style={{ height: '400px' }}>
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Esperando a que cargue la imagen...</p>
                  </div>
                </div>
              ) : (
                <div 
                  ref={mapContainerRef}
                  className="rounded-lg border overflow-hidden bg-muted cursor-crosshair"
                  style={{ 
                    width: '100%', 
                    height: '400px',
                    position: 'relative',
                    zIndex: 0
                  }}
                />
              )}
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-destructive rounded-full border border-white shadow"></div>
                  <span>Centro parcela</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-blue-500 border-2 border-blue-500"></div>
                  <span>Imagen vivienda</span>
                </div>
                <span className="text-primary font-medium">
                  📍 Posición: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                No hay coordenadas disponibles para mostrar el mapa.
              </p>
            </div>
          )}

          {/* Scale adjustment */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ZoomIn className="h-4 w-4" />
              Tamaño: {scale}%
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setScale(Math.max(20, scale - 10))}
                disabled={!imageLoaded}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Slider
                value={[scale]}
                onValueChange={(val) => setScale(val[0])}
                min={20}
                max={200}
                step={5}
                className="flex-1"
                disabled={!imageLoaded}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setScale(Math.min(200, scale + 10))}
                disabled={!imageLoaded}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ajusta el tamaño de la vivienda respecto a la parcela
            </p>
          </div>

          {/* Rotation adjustment */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Rotación: {rotation}°
            </Label>
            <Slider
              value={[rotation]}
              onValueChange={(val) => setRotation(val[0])}
              min={0}
              max={360}
              step={5}
              className="w-full"
              disabled={!imageLoaded}
            />
            <p className="text-xs text-muted-foreground">
              Gira la vivienda para alinearla con el terreno
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!imageLoaded}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reiniciar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !imageLoaded}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Ajustes
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
