import { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, MousePointer2 } from 'lucide-react';

interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Zone {
  id: string;
  zone_x: number;
  zone_y: number;
  zone_width: number;
  zone_height: number;
  table_headers: string[];
}

interface TemplateZoneCanvasProps {
  imageUrl: string;
  zones: Zone[];
  isDrawing: boolean;
  onZoneDrawn: (rect: ZoneRect) => void;
  onZoneClick: (zone: Zone) => void;
  onZoneDelete: (zoneId: string) => void;
}

export function TemplateZoneCanvas({
  imageUrl,
  zones,
  isDrawing,
  onZoneDrawn,
  onZoneClick,
  onZoneDelete,
}: TemplateZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const getRelativePos = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const img = container.querySelector('img');
      if (!img) return { x: 0, y: 0 };
      const imgRect = img.getBoundingClientRect();
      return {
        x: ((e.clientX - imgRect.left) / imgRect.width) * 100,
        y: ((e.clientY - imgRect.top) / imgRect.height) * 100,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getRelativePos(e);
      setDragStart(pos);
      setDragCurrent(pos);
    },
    [isDrawing, getRelativePos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !dragStart) return;
      e.preventDefault();
      setDragCurrent(getRelativePos(e));
    },
    [isDrawing, dragStart, getRelativePos]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !dragStart || !dragCurrent) return;
      e.preventDefault();

      const x = Math.min(dragStart.x, dragCurrent.x);
      const y = Math.min(dragStart.y, dragCurrent.y);
      const width = Math.abs(dragCurrent.x - dragStart.x);
      const height = Math.abs(dragCurrent.y - dragStart.y);

      // Minimum zone size: 3% x 2%
      if (width > 3 && height > 2) {
        onZoneDrawn({
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: Math.min(width, 100 - x),
          height: Math.min(height, 100 - y),
        });
      }

      setDragStart(null);
      setDragCurrent(null);
    },
    [isDrawing, dragStart, dragCurrent, onZoneDrawn]
  );

  // Compute preview rectangle
  const previewRect =
    dragStart && dragCurrent
      ? {
          left: `${Math.min(dragStart.x, dragCurrent.x)}%`,
          top: `${Math.min(dragStart.y, dragCurrent.y)}%`,
          width: `${Math.abs(dragCurrent.x - dragStart.x)}%`,
          height: `${Math.abs(dragCurrent.y - dragStart.y)}%`,
        }
      : null;

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (dragStart) {
          setDragStart(null);
          setDragCurrent(null);
        }
      }}
    >
      <img
        src={imageUrl}
        alt="Página del documento"
        className="w-full h-auto rounded-lg shadow-sm"
        onLoad={() => setImageLoaded(true)}
        draggable={false}
      />

      {imageLoaded && (
        <>
          {/* Existing zones */}
          {zones.map((zone, idx) => (
            <div
              key={zone.id}
              className="absolute border-2 border-primary/70 bg-primary/10 rounded group"
              style={{
                left: `${zone.zone_x}%`,
                top: `${zone.zone_y}%`,
                width: `${zone.zone_width}%`,
                height: `${zone.zone_height}%`,
              }}
            >
              <div className="absolute -top-7 left-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-xs px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoneClick(zone);
                  }}
                >
                  <MousePointer2 className="h-3 w-3 mr-1" />
                  Generar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 text-xs px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoneDelete(zone.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <span className="absolute bottom-1 left-2 text-xs font-medium text-primary bg-background/80 px-1 rounded">
                Zona {idx + 1}: {zone.table_headers.join(', ')}
              </span>
            </div>
          ))}

          {/* Drawing preview */}
          {previewRect && (
            <div
              className="absolute border-2 border-dashed border-accent bg-accent/20 rounded pointer-events-none"
              style={previewRect}
            />
          )}

          {/* Drawing mode indicator */}
          {isDrawing && !dragStart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-background/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border">
                <p className="text-sm font-medium text-foreground">
                  Dibuja un rectángulo sobre la zona editable
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
