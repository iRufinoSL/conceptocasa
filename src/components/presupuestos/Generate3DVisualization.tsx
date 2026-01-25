import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Image as ImageIcon, Sparkles, X, MapPin, RefreshCw } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Map capture state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedMapImage, setCapturedMapImage] = useState<string | null>(null);

  const hasCoordinates = parcelData?.lat && parcelData?.lng;

  // Initialize map when dialog opens and coordinates are available
  useEffect(() => {
    if (!open || !hasCoordinates || !mapContainerRef.current) {
      return;
    }

    // Small delay to ensure container is rendered
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

      // Add PNOA orthophoto layer (satellite imagery)
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
          html: '<div class="w-4 h-4 bg-primary rounded-full border-2 border-white shadow-lg"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      // Auto-capture after map loads
      setTimeout(async () => {
        await captureMap();
      }, 1500);
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

  const captureMap = useCallback(async () => {
    if (!mapContainerRef.current) return;

    setIsCapturing(true);
    try {
      // Wait for tiles to load
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      setCapturedMapImage(dataUrl);
    } catch (error) {
      console.error('Error capturing map:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo capturar la imagen del mapa'
      });
    } finally {
      setIsCapturing(false);
    }
  }, [toast]);

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
    
    // Create preview
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
      // Convert image to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedImage);
      });
      
      const base64Image = await base64Promise;

      // Build context prompt
      let contextPrompt = 'Genera una vista aérea 3D realista de este edificio/vivienda integrado en el terreno real.';
      
      if (parcelData?.area) {
        contextPrompt += ` La parcela tiene ${parcelData.area} m² de superficie.`;
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

      contextPrompt += ' Combina el edificio con la imagen satelital del terreno de forma realista, manteniendo la perspectiva aérea/isométrica. El edificio debe aparecer integrado naturalmente en la parcela visible en la imagen satelital.';

      // Call edge function to generate the visualization
      const { data, error } = await supabase.functions.invoke('generate-3d-visualization', {
        body: {
          imageBase64: base64Image,
          terrainImageBase64: capturedMapImage || undefined,
          prompt: contextPrompt,
          budgetId
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
      
      // Reset form
      clearImage();
      setAdditionalContext('');
      setCapturedMapImage(null);

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
            Sube una imagen del edificio y se combinará con la imagen satelital real de la parcela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Map capture section */}
          {hasCoordinates ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Imagen satelital del terreno
                </Label>
                {mapReady && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={captureMap}
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
                {/* Live map for positioning */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Vista del mapa (ajusta el zoom)</p>
                  <div 
                    ref={mapContainerRef}
                    className="h-40 rounded-lg border overflow-hidden"
                    style={{ minHeight: '160px' }}
                  />
                </div>
                
                {/* Captured image preview */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Imagen capturada</p>
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
                        <p className="text-xs">Capturando...</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Esperando captura...
                      </p>
                    )}
                  </div>
                </div>
              </div>
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
            <Label>Imagen del edificio *</Label>
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
                  className="w-full h-48 object-cover rounded-lg border"
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
                  Render, maqueta, perspectiva 3D...
                </p>
              </div>
            )}
          </div>

          {/* Parcel info display */}
          {parcelData && (parcelData.area || parcelData.address) && (
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="font-medium mb-1">Datos de la parcela:</p>
              {parcelData.area && <p>• Superficie: {parcelData.area.toLocaleString('es-ES')} m²</p>}
              {parcelData.address && <p>• Dirección: {parcelData.address}</p>}
              {parcelData.municipality && <p>• Municipio: {parcelData.municipality}</p>}
              {hasCoordinates && <p>• Coordenadas: {parcelData.lat?.toFixed(6)}, {parcelData.lng?.toFixed(6)}</p>}
            </div>
          )}

          {/* Additional context */}
          <div className="space-y-2">
            <Label htmlFor="context">Contexto adicional (opcional)</Label>
            <Textarea
              id="context"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Ej: Vivienda unifamiliar de 2 plantas, estilo mediterráneo, con piscina..."
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