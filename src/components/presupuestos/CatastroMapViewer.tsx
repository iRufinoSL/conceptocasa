import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Map,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  MapPin,
  Building2,
  TreePine,
  Eye,
  EyeOff,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CatastroMapViewerProps {
  lat: number;
  lng: number;
  cadastralReference?: string;
  municipality?: string;
  province?: string;
  onCenterChange?: (lat: number, lng: number) => void;
  className?: string;
}

// WMS layers configuration for Spanish Catastro
const WMS_LAYERS = {
  catastro: {
    url: 'https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx',
    layers: {
      parcelas: {
        name: 'CP.CadastralParcel',
        label: 'Parcelas catastrales',
        icon: MapPin,
        color: 'text-blue-500',
      },
      edificios: {
        name: 'BU.Building',
        label: 'Edificaciones',
        icon: Building2,
        color: 'text-orange-500',
      },
    },
  },
  pnoa: {
    url: 'https://www.ign.es/wms-inspire/pnoa-ma',
    layers: {
      ortofoto: {
        name: 'OI.OrthoimageCoverage',
        label: 'Ortofoto PNOA',
        icon: Map,
        color: 'text-green-500',
      },
    },
  },
  ign: {
    url: 'https://www.ign.es/wms-inspire/mdt',
    layers: {
      relieve: {
        name: 'EL.GridCoverage',
        label: 'Modelo Digital Terreno',
        icon: TreePine,
        color: 'text-emerald-500',
      },
    },
  },
};

export function CatastroMapViewer({
  lat,
  lng,
  cadastralReference,
  municipality,
  province,
  onCenterChange,
  className,
}: CatastroMapViewerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const wmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>({});
  
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    parcelas: true,
    edificios: false,
    ortofoto: false,
    relieve: false,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(18);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 18,
      zoomControl: false,
      attributionControl: true,
    });

    // Add base layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 21,
    }).addTo(map);

    // Add WMS layers
    // Catastro - Parcelas
    const parcelasLayer = L.tileLayer.wms(WMS_LAYERS.catastro.url, {
      layers: WMS_LAYERS.catastro.layers.parcelas.name,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: 0.7,
      attribution: '&copy; <a href="https://www.catastro.meh.es">Catastro</a>',
    });
    wmsLayersRef.current['parcelas'] = parcelasLayer;
    if (activeLayers.parcelas) parcelasLayer.addTo(map);

    // Catastro - Edificios
    const edificiosLayer = L.tileLayer.wms(WMS_LAYERS.catastro.url, {
      layers: WMS_LAYERS.catastro.layers.edificios.name,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: 0.6,
      attribution: '&copy; <a href="https://www.catastro.meh.es">Catastro</a>',
    });
    wmsLayersRef.current['edificios'] = edificiosLayer;
    if (activeLayers.edificios) edificiosLayer.addTo(map);

    // PNOA - Ortofoto
    const ortofotoLayer = L.tileLayer.wms(WMS_LAYERS.pnoa.url, {
      layers: WMS_LAYERS.pnoa.layers.ortofoto.name,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity: 0.8,
      attribution: '&copy; <a href="https://www.ign.es">IGN España</a>',
    });
    wmsLayersRef.current['ortofoto'] = ortofotoLayer;
    if (activeLayers.ortofoto) ortofotoLayer.addTo(map);

    // IGN - Modelo Digital Terreno
    const relieveLayer = L.tileLayer.wms(WMS_LAYERS.ign.url, {
      layers: WMS_LAYERS.ign.layers.relieve.name,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity: 0.5,
      attribution: '&copy; <a href="https://www.ign.es">IGN España</a>',
    });
    wmsLayersRef.current['relieve'] = relieveLayer;
    if (activeLayers.relieve) relieveLayer.addTo(map);

    // Add marker for the parcel
    const customIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background: hsl(var(--primary));
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });

    const marker = L.marker([lat, lng], { 
      icon: customIcon,
      draggable: true,
    }).addTo(map);

    // Handle marker drag
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      onCenterChange?.(position.lat, position.lng);
    });

    markerRef.current = marker;

    // Track zoom changes
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapRef.current = map;
    setMapReady(true);

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      wmsLayersRef.current = {};
    };
  }, []);

  // Update marker position when lat/lng changes
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom());
  }, [lat, lng]);

  // Toggle layer visibility
  const toggleLayer = (layerKey: string) => {
    const layer = wmsLayersRef.current[layerKey];
    if (!layer || !mapRef.current) return;

    const newState = !activeLayers[layerKey];
    setActiveLayers(prev => ({ ...prev, [layerKey]: newState }));

    if (newState) {
      layer.addTo(mapRef.current);
    } else {
      mapRef.current.removeLayer(layer);
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleCenterOnParcel = () => {
    if (!mapRef.current) return;
    mapRef.current.setView([lat, lng], 18);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    // Trigger map resize after transition
    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 300);
  };

  // Open in external viewers
  const openInCatastro = () => {
    if (cadastralReference) {
      window.open(
        `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?RC1=${cadastralReference.substring(0, 7)}&RC2=${cadastralReference.substring(7, 14)}`,
        '_blank'
      );
    } else {
      window.open(
        `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?lat=${lat}&lon=${lng}`,
        '_blank'
      );
    }
  };

  const openInGoogleMaps = () => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  const openInIBERPIX = () => {
    window.open(
      `https://www.ign.es/iberpix/visor/?x=${lng}&y=${lat}&z=17`,
      '_blank'
    );
  };

  // Layer control items
  const layerItems = [
    { key: 'parcelas', ...WMS_LAYERS.catastro.layers.parcelas },
    { key: 'edificios', ...WMS_LAYERS.catastro.layers.edificios },
    { key: 'ortofoto', ...WMS_LAYERS.pnoa.layers.ortofoto },
    { key: 'relieve', ...WMS_LAYERS.ign.layers.relieve },
  ];

  return (
    <Card className={cn(
      'overflow-hidden transition-all duration-300',
      isFullscreen && 'fixed inset-4 z-50',
      className
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Visor de Parcela</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {municipality && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {municipality}{province ? `, ${province}` : ''}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="h-7 w-7 p-0"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {/* Map container */}
          <div
            ref={mapContainerRef}
            className={cn(
              'w-full transition-all duration-300',
              isFullscreen ? 'h-[calc(100vh-12rem)]' : 'h-64'
            )}
          />

          {/* Layer controls */}
          <div className="absolute top-2 left-2 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-2 space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
              <Layers className="h-3 w-3" />
              Capas
            </div>
            {layerItems.map((layer) => {
              const Icon = layer.icon;
              const isActive = activeLayers[layer.key];
              return (
                <Button
                  key={layer.key}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => toggleLayer(layer.key)}
                  className="w-full justify-start gap-2 h-7 text-xs"
                >
                  {isActive ? (
                    <Eye className={cn('h-3 w-3', layer.color)} />
                  ) : (
                    <EyeOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <Icon className={cn('h-3 w-3', isActive ? layer.color : 'text-muted-foreground')} />
                  <span className={isActive ? '' : 'text-muted-foreground'}>{layer.label}</span>
                </Button>
              );
            })}
          </div>

          {/* Zoom controls */}
          <div className="absolute top-2 right-2 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              className="h-8 w-8 p-0 rounded-b-none border-b"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="text-xs text-center py-1 text-muted-foreground border-b">
              {currentZoom}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              className="h-8 w-8 p-0 rounded-t-none"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Center button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCenterOnParcel}
            className="absolute bottom-12 right-2 z-[1000] h-8 w-8 p-0 shadow-lg"
          >
            <Navigation className="h-4 w-4" />
          </Button>

          {/* External links */}
          <div className="absolute bottom-2 right-2 z-[1000] flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={openInCatastro}
              className="h-7 text-xs shadow-lg"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Catastro
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={openInGoogleMaps}
              className="h-7 text-xs shadow-lg"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Google Maps
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={openInIBERPIX}
              className="h-7 text-xs shadow-lg"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              IBERPIX
            </Button>
          </div>

          {/* Coordinates display */}
          <div className="absolute bottom-2 left-2 z-[1000] bg-background/95 backdrop-blur-sm rounded px-2 py-1 text-xs font-mono text-muted-foreground shadow border">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </div>
        </div>

        {/* Info bar */}
        {cadastralReference && (
          <div className="px-3 py-2 bg-muted/50 border-t text-xs text-muted-foreground">
            <span className="font-medium">Ref. Catastral:</span>{' '}
            <span className="font-mono">{cadastralReference}</span>
            <span className="mx-2">•</span>
            <span className="text-primary/80">
              Arrastra el marcador para ajustar la posición
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
