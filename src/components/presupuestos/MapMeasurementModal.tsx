import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Ruler,
  Trash2,
  Download,
  Save,
  Plus,
  Pencil,
  Square,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
  Crosshair
} from 'lucide-react';
import { MapContainer, TileLayer, useMap, useMapEvents, Polyline, Polygon, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import html2canvas from 'html2canvas';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Measurement {
  id: string;
  name: string;
  type: 'line' | 'polygon';
  coordinates: [number, number][];
  value: number; // meters for lines, m² for polygons
  color: string;
}

interface MapMeasurementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  initialLat?: number;
  initialLng?: number;
  onSave?: (imageUrl: string) => void;
}

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

// Custom labeled marker icon
function createLabeledIcon(label: string, isStart: boolean) {
  return L.divIcon({
    className: 'custom-measurement-marker',
    html: `<div class="flex items-center justify-center w-6 h-6 rounded-full ${isStart ? 'bg-green-500' : 'bg-red-500'} text-white text-xs font-bold border-2 border-white shadow-md">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// Map controls component
function MapControls({ onZoomIn, onZoomOut, onCenter }: { onZoomIn: () => void; onZoomOut: () => void; onCenter: () => void }) {
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <Button size="icon" variant="secondary" onClick={onZoomIn} className="h-8 w-8 shadow-md">
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="secondary" onClick={onZoomOut} className="h-8 w-8 shadow-md">
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="secondary" onClick={onCenter} className="h-8 w-8 shadow-md">
        <Crosshair className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Drawing handler component
function DrawingHandler({
  isDrawing,
  drawingMode,
  onPointAdded,
  onMapReady,
}: {
  isDrawing: boolean;
  drawingMode: 'line' | 'polygon' | null;
  onPointAdded: (latlng: L.LatLng) => void;
  onMapReady: (map: L.Map) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  useMapEvents({
    click(e) {
      if (isDrawing && drawingMode) {
        onPointAdded(e.latlng);
      }
    },
  });

  useEffect(() => {
    if (isDrawing) {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
    return () => {
      map.getContainer().style.cursor = '';
    };
  }, [isDrawing, map]);

  return null;
}

export function MapMeasurementModal({
  open,
  onOpenChange,
  budgetId,
  initialLat,
  initialLng,
  onSave,
}: MapMeasurementModalProps) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'line' | 'polygon' | null>(null);
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [currentName, setCurrentName] = useState('');
  const [colorIndex, setColorIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<string | null>(null);

  const center: [number, number] = [initialLat || 40.4168, initialLng || -3.7038];

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  const startDrawing = (mode: 'line' | 'polygon') => {
    setIsDrawing(true);
    setDrawingMode(mode);
    setCurrentPoints([]);
    setCurrentName(mode === 'line' ? `Línea ${measurements.filter(m => m.type === 'line').length + 1}` : `Área ${measurements.filter(m => m.type === 'polygon').length + 1}`);
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setDrawingMode(null);
    setCurrentPoints([]);
    setCurrentName('');
  };

  const handlePointAdded = (latlng: L.LatLng) => {
    setCurrentPoints(prev => [...prev, [latlng.lat, latlng.lng]]);
  };

  const finishDrawing = () => {
    if (currentPoints.length < 2) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Se necesitan al menos 2 puntos para crear una medición',
      });
      return;
    }

    if (drawingMode === 'polygon' && currentPoints.length < 3) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Se necesitan al menos 3 puntos para crear un polígono',
      });
      return;
    }

    // Calculate measurement value
    let value: number;
    if (drawingMode === 'line') {
      // Calculate line length in meters
      const line = turf.lineString(currentPoints.map(p => [p[1], p[0]])); // Note: turf uses [lng, lat]
      value = turf.length(line, { units: 'meters' });
    } else {
      // Calculate polygon area in square meters
      const closedCoords = [...currentPoints, currentPoints[0]].map(p => [p[1], p[0]]);
      const polygon = turf.polygon([closedCoords]);
      value = turf.area(polygon);
    }

    const newMeasurement: Measurement = {
      id: crypto.randomUUID(),
      name: currentName || (drawingMode === 'line' ? 'Línea' : 'Área'),
      type: drawingMode!,
      coordinates: currentPoints,
      value,
      color: COLORS[colorIndex % COLORS.length],
    };

    setMeasurements(prev => [...prev, newMeasurement]);
    setColorIndex(prev => prev + 1);
    cancelDrawing();

    toast({
      title: 'Medición creada',
      description: `${newMeasurement.name}: ${formatMeasurement(newMeasurement)}`,
    });
  };

  const deleteMeasurement = (id: string) => {
    setMeasurements(prev => prev.filter(m => m.id !== id));
  };

  const updateMeasurementName = (id: string, name: string) => {
    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, name } : m));
    setEditingMeasurement(null);
  };

  const formatMeasurement = (m: Measurement) => {
    if (m.type === 'line') {
      return m.value >= 1000 ? `${(m.value / 1000).toFixed(2)} km` : `${m.value.toFixed(2)} m`;
    } else {
      return m.value >= 10000 ? `${(m.value / 10000).toFixed(4)} ha` : `${m.value.toFixed(2)} m²`;
    }
  };

  const captureMap = async (): Promise<string | null> => {
    if (!mapContainerRef.current) return null;

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

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error capturing map:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const downloadCapture = async () => {
    const dataUrl = await captureMap();
    if (dataUrl) {
      const link = document.createElement('a');
      link.download = `mediciones-${budgetId}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast({
        title: 'Imagen descargada',
        description: 'El mapa con las mediciones se ha descargado correctamente',
      });
    }
  };

  const saveToProfile = async () => {
    if (measurements.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin mediciones',
        description: 'Dibuja al menos una medición antes de guardar',
      });
      return;
    }

    setIsSaving(true);
    try {
      // Capture the map
      const dataUrl = await captureMap();
      if (!dataUrl) throw new Error('No se pudo capturar el mapa');

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Upload to storage
      const fileName = `measurement-${budgetId}-${Date.now()}.png`;
      const filePath = `${budgetId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('budget-predesigns')
        .upload(filePath, blob, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Create predesign entry with measurement data
      const measurementSummary = measurements.map(m => 
        `${m.name}: ${formatMeasurement(m)}`
      ).join('\n');

      const { error: insertError } = await supabase
        .from('budget_predesigns')
        .insert({
          budget_id: budgetId,
          content_type: 'measurement_map',
          content: measurementSummary,
          description: `Plano de mediciones (${measurements.length} mediciones)`,
          file_path: filePath,
          file_name: fileName,
          file_type: 'image/png',
        });

      if (insertError) throw insertError;

      toast({
        title: 'Mediciones guardadas',
        description: 'El plano con las mediciones se ha guardado en el prediseño',
      });

      if (onSave) {
        const { data: urlData } = supabase.storage
          .from('budget-predesigns')
          .getPublicUrl(filePath);
        onSave(urlData.publicUrl);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving measurements:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar las mediciones',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleCenter = () => mapRef.current?.setView(center, 18);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-4 pb-2 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Herramienta de Mediciones
            </DialogTitle>
            <div className="flex items-center gap-2">
              {measurements.length > 0 && (
                <Badge variant="secondary">
                  {measurements.length} medición{measurements.length !== 1 ? 'es' : ''}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r bg-muted/30 p-4 flex flex-col gap-4 overflow-y-auto">
            {/* Drawing Tools */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Herramientas</Label>
              <div className="flex gap-2">
                <Button
                  variant={isDrawing && drawingMode === 'line' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => startDrawing('line')}
                  disabled={isDrawing && drawingMode !== 'line'}
                  className="flex-1"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Línea
                </Button>
                <Button
                  variant={isDrawing && drawingMode === 'polygon' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => startDrawing('polygon')}
                  disabled={isDrawing && drawingMode !== 'polygon'}
                  className="flex-1"
                >
                  <Square className="h-4 w-4 mr-1" />
                  Área
                </Button>
              </div>
            </div>

            {/* Current Drawing */}
            {isDrawing && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Dibujando {drawingMode === 'line' ? 'línea' : 'polígono'}
                  </span>
                  <Badge>{currentPoints.length} puntos</Badge>
                </div>
                <Input
                  value={currentName}
                  onChange={(e) => setCurrentName(e.target.value)}
                  placeholder="Nombre de la medición"
                  className="h-8"
                />
                <p className="text-xs text-muted-foreground">
                  Haz clic en el mapa para añadir puntos
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={finishDrawing}
                    disabled={currentPoints.length < 2}
                    className="flex-1"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Finalizar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={cancelDrawing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Measurements List */}
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium">Mediciones</Label>
              {measurements.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No hay mediciones. Usa las herramientas para dibujar líneas o áreas.
                </p>
              ) : (
                <div className="space-y-2">
                  {measurements.map((m) => (
                    <div
                      key={m.id}
                      className="p-2 rounded-lg border bg-background flex items-center gap-2"
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: m.color }}
                      />
                      <div className="flex-1 min-w-0">
                        {editingMeasurement === m.id ? (
                          <Input
                            autoFocus
                            defaultValue={m.name}
                            className="h-6 text-xs"
                            onBlur={(e: React.FocusEvent<HTMLInputElement>) => updateMeasurementName(m.id, e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Enter') {
                                updateMeasurementName(m.id, e.currentTarget.value);
                              }
                            }}
                          />
                        ) : (
                          <div
                            className="text-sm font-medium truncate cursor-pointer hover:underline"
                            onClick={() => setEditingMeasurement(m.id)}
                          >
                            {m.name}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {m.type === 'line' ? <Pencil className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                          {formatMeasurement(m)}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => deleteMeasurement(m.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={downloadCapture}
                disabled={isCapturing}
              >
                {isCapturing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Descargar imagen
              </Button>
              <Button
                size="sm"
                className="w-full"
                onClick={saveToProfile}
                disabled={isSaving || measurements.length === 0}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar en Prediseño
              </Button>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative" ref={mapContainerRef}>
            <MapContainer
              center={center}
              zoom={initialLat && initialLng ? 18 : 6}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <DrawingHandler
                isDrawing={isDrawing}
                drawingMode={drawingMode}
                onPointAdded={handlePointAdded}
                onMapReady={handleMapReady}
              />

              {/* Current drawing preview */}
              {currentPoints.length > 0 && (
                <>
                  {drawingMode === 'line' ? (
                    <Polyline
                      positions={currentPoints}
                      color={COLORS[colorIndex % COLORS.length]}
                      weight={3}
                      dashArray="5, 10"
                    />
                  ) : (
                    <Polygon
                      positions={currentPoints}
                      color={COLORS[colorIndex % COLORS.length]}
                      fillOpacity={0.2}
                      dashArray="5, 10"
                    />
                  )}
                  {currentPoints.map((point, idx) => (
                    <Marker
                      key={idx}
                      position={point}
                      icon={createLabeledIcon(
                        String(idx + 1),
                        idx === 0
                      )}
                    />
                  ))}
                </>
              )}

              {/* Saved measurements */}
              {measurements.map((m) => (
                <div key={m.id}>
                  {m.type === 'line' ? (
                    <Polyline
                      positions={m.coordinates}
                      color={m.color}
                      weight={3}
                    >
                      <Tooltip permanent direction="center" className="measurement-tooltip">
                        <span className="text-xs font-medium">
                          {m.name}: {formatMeasurement(m)}
                        </span>
                      </Tooltip>
                    </Polyline>
                  ) : (
                    <Polygon
                      positions={m.coordinates}
                      color={m.color}
                      fillOpacity={0.3}
                    >
                      <Tooltip permanent direction="center" className="measurement-tooltip">
                        <span className="text-xs font-medium">
                          {m.name}: {formatMeasurement(m)}
                        </span>
                      </Tooltip>
                    </Polygon>
                  )}
                  {/* Start marker */}
                  <Marker
                    position={m.coordinates[0]}
                    icon={createLabeledIcon('I', true)}
                  >
                    <Popup>
                      <strong>{m.name}</strong><br />
                      Inicio
                    </Popup>
                  </Marker>
                  {/* End marker for lines */}
                  {m.type === 'line' && (
                    <Marker
                      position={m.coordinates[m.coordinates.length - 1]}
                      icon={createLabeledIcon('F', false)}
                    >
                      <Popup>
                        <strong>{m.name}</strong><br />
                        Final: {formatMeasurement(m)}
                      </Popup>
                    </Marker>
                  )}
                </div>
              ))}

              {/* Center marker if coordinates provided */}
              {initialLat && initialLng && (
                <Marker position={[initialLat, initialLng]}>
                  <Popup>
                    <strong>Ubicación del terreno</strong><br />
                    {initialLat.toFixed(6)}, {initialLng.toFixed(6)}
                  </Popup>
                </Marker>
              )}
            </MapContainer>

            <MapControls
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onCenter={handleCenter}
            />

            {/* Drawing mode indicator */}
            {isDrawing && (
              <div className="absolute bottom-4 left-4 z-[1000] bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-medium">
                  Modo dibujo: {drawingMode === 'line' ? 'Línea' : 'Polígono'}
                </span>
                <span className="text-xs opacity-80">
                  ({currentPoints.length} puntos)
                </span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
