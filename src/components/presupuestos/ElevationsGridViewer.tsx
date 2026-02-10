import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, DoorOpen, X } from 'lucide-react';
import { OPENING_PRESETS, WALL_LABELS, computeWallSegments, autoClassifyWalls, generateExternalWallNames } from '@/lib/floor-plan-calculations';
import type { RoomData, WallData, OpeningData, FloorPlanData, WallSegment } from '@/lib/floor-plan-calculations';

interface ElevationsGridViewerProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  onUpdateOpening: (openingId: string, data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onAddOpening: (wallId: string, type: string, width: number, height: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  saving: boolean;
}

interface ElevationCard {
  id: string;
  label: string;
  sublabel?: string;
  category: 'cimentacion' | 'pared' | 'tejado';
  width: number; // meters
  height: number; // meters
  room?: RoomData;
  wall?: WallData;
  segment?: WallSegment;
  segmentIndex?: number;
  openings: OpeningData[];
  wallId?: string; // for adding openings
  canAddOpenings: boolean;
  fill: string;
  stroke: string;
  badgeLabel?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
}

const CARD_SCALE = 60; // px per meter for card SVGs
const CARD_PADDING = 20;
const MAX_CARD_WIDTH = 400;

function getOpeningBaseY(op: OpeningData): number {
  if (op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera') {
    return 0;
  }
  return 0.9;
}

function getWallHeight(wall: WallData, room: RoomData, plan: FloorPlanData): number {
  return wall.height || room.height || plan.defaultHeight;
}

export function ElevationsGridViewer({
  plan, rooms, onUpdateOpening, onAddOpening, onDeleteOpening, saving,
}: ElevationsGridViewerProps) {
  const [selectedOpening, setSelectedOpening] = useState<OpeningData | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const wallSegmentsMap = useMemo(() => computeWallSegments(rooms), [rooms]);
  const wallClassification = useMemo(() => autoClassifyWalls(rooms), [rooms]);
  const externalWallNames = useMemo(() => generateExternalWallNames(rooms, wallClassification), [rooms, wallClassification]);

  // Build all elevation cards
  const cards: ElevationCard[] = useMemo(() => {
    const result: ElevationCard[] = [];

    // 1. Foundation card
    if (rooms.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rooms.forEach(r => {
        minX = Math.min(minX, r.posX);
        minY = Math.min(minY, r.posY);
        maxX = Math.max(maxX, r.posX + r.width);
        maxY = Math.max(maxY, r.posY + r.length);
      });
      const extT = plan.externalWallThickness;
      const foundW = (maxX - minX) + 2 * extT;
      const foundL = (maxY - minY) + 2 * extT;
      result.push({
        id: 'cimentacion',
        label: 'Cimentación',
        sublabel: `Toda la planta`,
        category: 'cimentacion',
        width: foundW,
        height: foundL,
        openings: [],
        canAddOpenings: false,
        fill: 'hsl(25, 30%, 88%)',
        stroke: 'hsl(25, 40%, 50%)',
        badgeLabel: 'Cimentación',
        badgeVariant: 'secondary',
      });
    }

    // 2. Wall cards - one per visible segment
    rooms.forEach(room => {
      room.walls.forEach(wall => {
        const key = `${room.id}::${wall.wallIndex}`;
        const segments = wallSegmentsMap.get(key) || [];
        const wallHeight = getWallHeight(wall, room, plan);
        const isHoriz = wall.wallIndex === 1 || wall.wallIndex === 3;
        const fullWallLen = isHoriz ? room.width : room.length;

        // Count visible segments for numbering
        const visibleSegments = segments.map((s, i) => ({ ...s, idx: i })).filter(s => s.segmentType !== 'invisible');
        const hasMultiple = visibleSegments.length > 1;

        segments.forEach((seg, si) => {
          if (seg.segmentType === 'invisible') return; // Skip invisible

          const segLen = seg.endMeters - seg.startMeters;
          const visibleNumber = visibleSegments.findIndex(vs => vs.idx === si) + 1;
          const wallLabel = hasMultiple
            ? `${WALL_LABELS[wall.wallIndex]} ${visibleNumber}`
            : WALL_LABELS[wall.wallIndex];

          const ownOpenings = wall.openings.filter(op => {
            const opCenter = op.positionX;
            return opCenter >= seg.startFraction - 0.01 && opCenter <= seg.endFraction + 0.01;
          });

          const isExternal = seg.segmentType === 'externa';
          const wallName = externalWallNames.get(key);
          const canAdd = !wall.id.startsWith('temp-');

          result.push({
            id: `wall-${room.id}-${wall.wallIndex}-${si}`,
            label: `${wallLabel}`,
            sublabel: room.name,
            category: 'pared',
            width: segLen,
            height: wallHeight,
            room,
            wall,
            segment: seg,
            segmentIndex: si,
            openings: ownOpenings,
            wallId: wall.id,
            canAddOpenings: canAdd,
            fill: isExternal ? 'hsl(30, 30%, 92%)' : 'hsl(25, 60%, 93%)',
            stroke: isExternal ? 'hsl(222, 47%, 30%)' : 'hsl(25, 80%, 50%)',
            badgeLabel: isExternal ? (wallName ? `Ext. ${wallName}` : 'Externa') : 'Interna',
            badgeVariant: isExternal ? 'default' : 'outline',
          });
        });
      });
    });

    // 3. Roof cards (faldones)
    if (rooms.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rooms.forEach(r => {
        minX = Math.min(minX, r.posX);
        minY = Math.min(minY, r.posY);
        maxX = Math.max(maxX, r.posX + r.width);
        maxY = Math.max(maxY, r.posY + r.length);
      });
      const ov = plan.roofOverhang;
      const baseW = (maxX - minX) + 2 * plan.externalWallThickness + 2 * ov;
      const baseL = (maxY - minY) + 2 * plan.externalWallThickness + 2 * ov;
      const slope = plan.roofSlopePercent / 100;

      if (plan.roofType === 'plana') {
        result.push({
          id: 'roof-flat',
          label: 'Tejado Plano',
          category: 'tejado',
          width: baseW,
          height: baseL,
          openings: [],
          canAddOpenings: false,
          fill: 'hsl(200, 20%, 90%)',
          stroke: 'hsl(200, 30%, 50%)',
          badgeLabel: 'Cubierta',
          badgeVariant: 'secondary',
        });
      } else if (plan.roofType === 'dos_aguas') {
        const halfW = baseW / 2;
        const rise = halfW * slope;
        const slopeLen = Math.sqrt(halfW * halfW + rise * rise);
        // Two slopes
        result.push({
          id: 'roof-slope-1',
          label: 'Faldón Izquierdo',
          sublabel: 'Dos Aguas',
          category: 'tejado',
          width: baseL,
          height: slopeLen,
          openings: [],
          canAddOpenings: false,
          fill: 'hsl(15, 40%, 88%)',
          stroke: 'hsl(15, 50%, 45%)',
          badgeLabel: 'Cubierta',
          badgeVariant: 'secondary',
        });
        result.push({
          id: 'roof-slope-2',
          label: 'Faldón Derecho',
          sublabel: 'Dos Aguas',
          category: 'tejado',
          width: baseL,
          height: slopeLen,
          openings: [],
          canAddOpenings: false,
          fill: 'hsl(15, 40%, 88%)',
          stroke: 'hsl(15, 50%, 45%)',
          badgeLabel: 'Cubierta',
          badgeVariant: 'secondary',
        });
      } else {
        // cuatro_aguas: 4 slopes
        const halfW = baseW / 2;
        const halfL = baseL / 2;
        const riseW = halfW * slope;
        const riseL = halfL * slope;
        const slopeLenW = Math.sqrt(halfW * halfW + riseW * riseW);
        const slopeLenL = Math.sqrt(halfL * halfL + riseL * riseL);
        const labels = ['Faldón Frontal', 'Faldón Trasero', 'Faldón Izquierdo', 'Faldón Derecho'];
        const widths = [baseW, baseW, baseL, baseL];
        const heights = [slopeLenL, slopeLenL, slopeLenW, slopeLenW];
        labels.forEach((lbl, i) => {
          result.push({
            id: `roof-slope-${i}`,
            label: lbl,
            sublabel: 'Cuatro Aguas',
            category: 'tejado',
            width: widths[i],
            height: heights[i],
            openings: [],
            canAddOpenings: false,
            fill: 'hsl(15, 40%, 88%)',
            stroke: 'hsl(15, 50%, 45%)',
            badgeLabel: 'Cubierta',
            badgeVariant: 'secondary',
          });
        });
      }
    }

    return result;
  }, [rooms, plan, wallSegmentsMap, wallClassification, externalWallNames]);

  const handleOpeningClick = useCallback((op: OpeningData) => {
    setSelectedOpening(op);
    setEditDialogOpen(true);
  }, []);

  const handleSaveOpening = useCallback(async (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => {
    if (!selectedOpening) return;
    await onUpdateOpening(selectedOpening.id, data);
    setSelectedOpening(prev => prev ? { ...prev, ...data } as OpeningData : null);
  }, [selectedOpening, onUpdateOpening]);

  // Group cards by category
  const cimentacion = cards.filter(c => c.category === 'cimentacion');
  const paredes = cards.filter(c => c.category === 'pared');
  const tejado = cards.filter(c => c.category === 'tejado');

  // Group paredes by room
  const paredesByRoom = useMemo(() => {
    const map = new Map<string, ElevationCard[]>();
    paredes.forEach(c => {
      const roomName = c.sublabel || 'Sin estancia';
      if (!map.has(roomName)) map.set(roomName, []);
      map.get(roomName)!.push(c);
    });
    return map;
  }, [paredes]);

  return (
    <div className="space-y-6">
      {/* Foundation */}
      {cimentacion.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Cimentación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cimentacion.map(card => (
              <ElevationCardView key={card.id} card={card} onOpeningClick={handleOpeningClick} onAddOpening={onAddOpening} onDeleteOpening={onDeleteOpening} saving={saving} />
            ))}
          </div>
        </div>
      )}

      {/* Walls grouped by room */}
      {Array.from(paredesByRoom.entries()).map(([roomName, roomCards]) => (
        <div key={roomName}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {roomName}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {roomCards.map(card => (
              <ElevationCardView key={card.id} card={card} onOpeningClick={handleOpeningClick} onAddOpening={onAddOpening} onDeleteOpening={onDeleteOpening} saving={saving} />
            ))}
          </div>
        </div>
      ))}

      {/* Roof */}
      {tejado.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Tejado</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tejado.map(card => (
              <ElevationCardView key={card.id} card={card} onOpeningClick={handleOpeningClick} onAddOpening={onAddOpening} onDeleteOpening={onDeleteOpening} saving={saving} />
            ))}
          </div>
        </div>
      )}

      {/* Opening edit dialog */}
      {selectedOpening && (
        <OpeningEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          opening={selectedOpening}
          onSave={handleSaveOpening}
          onDelete={async () => {
            await onDeleteOpening(selectedOpening.id);
            setEditDialogOpen(false);
            setSelectedOpening(null);
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

// Individual elevation card
function ElevationCardView({ card, onOpeningClick, onAddOpening, onDeleteOpening, saving }: {
  card: ElevationCard;
  onOpeningClick: (op: OpeningData) => void;
  onAddOpening: (wallId: string, type: string, width: number, height: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  saving: boolean;
}) {
  const aspect = card.width / card.height;
  const maxW = MAX_CARD_WIDTH;
  const scale = Math.min(CARD_SCALE, (maxW - CARD_PADDING * 2 - 30) / card.width);
  const svgW = card.width * scale + CARD_PADDING * 2 + 30;
  const svgH = card.height * scale + CARD_PADDING * 2 + 30;
  const rectX = CARD_PADDING + 20;
  const rectY = CARD_PADDING;
  const rectW = card.width * scale;
  const rectH = card.height * scale;
  const area = (card.width * card.height).toFixed(2);

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardHeader className="py-2 px-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-xs font-semibold truncate">{card.label}</CardTitle>
            {card.sublabel && (
              <p className="text-[10px] text-muted-foreground truncate">{card.sublabel}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {card.badgeLabel && (
              <Badge variant={card.badgeVariant || 'secondary'} className="text-[9px] h-4">
                {card.badgeLabel}
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] h-4">
              {area}m²
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <svg
          width="100%"
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="mx-auto"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', maxHeight: '220px' }}
        >
          {/* Ground line for walls */}
          {card.category === 'pared' && (
            <>
              <line
                x1={rectX - 5} y1={rectY + rectH}
                x2={rectX + rectW + 5} y2={rectY + rectH}
                stroke="hsl(25, 60%, 40%)" strokeWidth={1.5}
              />
              {Array.from({ length: Math.ceil((rectW + 10) / 6) }, (_, i) => (
                <line key={`gh-${i}`}
                  x1={rectX - 5 + i * 6} y1={rectY + rectH + 1.5}
                  x2={rectX - 5 + i * 6 - 4} y2={rectY + rectH + 5}
                  stroke="hsl(25, 60%, 40%)" strokeWidth={0.4} opacity={0.5}
                />
              ))}
            </>
          )}

          {/* Main rectangle */}
          <rect
            x={rectX} y={rectY} width={rectW} height={rectH}
            fill={card.fill} stroke={card.stroke}
            strokeWidth={1.5} rx={1}
          />

          {/* Width dimension (bottom) */}
          <line
            x1={rectX} y1={rectY + rectH + 12}
            x2={rectX + rectW} y2={rectY + rectH + 12}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.6}
          />
          <line x1={rectX} y1={rectY + rectH + 8} x2={rectX} y2={rectY + rectH + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={rectX + rectW} y1={rectY + rectH + 8} x2={rectX + rectW} y2={rectY + rectH + 16} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text
            x={rectX + rectW / 2} y={rectY + rectH + 24}
            textAnchor="middle" fontSize={8} fill="hsl(25, 95%, 45%)" fontWeight={600}
          >
            {card.width.toFixed(2)}m
          </text>

          {/* Height dimension (left) */}
          <line
            x1={rectX - 12} y1={rectY}
            x2={rectX - 12} y2={rectY + rectH}
            stroke="hsl(25, 95%, 45%)" strokeWidth={0.6}
          />
          <line x1={rectX - 16} y1={rectY} x2={rectX - 8} y2={rectY} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <line x1={rectX - 16} y1={rectY + rectH} x2={rectX - 8} y2={rectY + rectH} stroke="hsl(25, 95%, 45%)" strokeWidth={0.4} />
          <text
            x={rectX - 18} y={rectY + rectH / 2}
            textAnchor="middle" fontSize={8} fill="hsl(25, 95%, 45%)" fontWeight={600}
            transform={`rotate(-90, ${rectX - 18}, ${rectY + rectH / 2})`}
          >
            {card.height.toFixed(2)}m
          </text>

          {/* Openings */}
          {card.openings.map(op => {
            const isHoriz = card.wall ? (card.wall.wallIndex === 1 || card.wall.wallIndex === 3) : true;
            const fullWallLen = card.room ? (isHoriz ? card.room.width : card.room.length) : card.width;
            const seg = card.segment;

            let opCenterInSegment: number;
            if (seg) {
              const opMeters = op.positionX * fullWallLen;
              opCenterInSegment = (opMeters - seg.startMeters) / (seg.endMeters - seg.startMeters);
            } else {
              opCenterInSegment = op.positionX;
            }
            opCenterInSegment = Math.max(0.05, Math.min(0.95, opCenterInSegment));

            const opWidthPx = op.width * scale;
            const opHeightPx = op.height * scale;
            const baseY = getOpeningBaseY(op);
            const opX = rectX + opCenterInSegment * rectW - opWidthPx / 2;
            const opY = rectY + rectH - opHeightPx - baseY * scale;
            const isDoor = op.openingType === 'puerta' || op.openingType === 'puerta_externa' || op.openingType === 'ventana_balconera';

            return (
              <g key={op.id} style={{ cursor: 'pointer' }} onClick={() => onOpeningClick(op)}>
                <rect
                  x={opX} y={opY} width={opWidthPx} height={opHeightPx}
                  fill={isDoor ? 'hsl(30, 80%, 95%)' : 'hsl(210, 80%, 95%)'}
                  stroke={isDoor ? 'hsl(30, 80%, 45%)' : 'hsl(210, 80%, 45%)'}
                  strokeWidth={1.2} rx={1}
                />
                {!isDoor && (
                  <>
                    <line x1={opX} y1={opY + opHeightPx / 2} x2={opX + opWidthPx} y2={opY + opHeightPx / 2}
                      stroke="hsl(210, 80%, 70%)" strokeWidth={0.5} pointerEvents="none" />
                    <line x1={opX + opWidthPx / 2} y1={opY} x2={opX + opWidthPx / 2} y2={opY + opHeightPx}
                      stroke="hsl(210, 80%, 70%)" strokeWidth={0.5} pointerEvents="none" />
                  </>
                )}
                {isDoor && (
                  <circle cx={opX + opWidthPx * 0.8} cy={opY + opHeightPx * 0.55} r={1.5}
                    fill="hsl(30, 80%, 45%)" pointerEvents="none" />
                )}
                <text x={opX + opWidthPx / 2} y={opY + opHeightPx / 2 + 3} textAnchor="middle"
                  fontSize={6} fill="hsl(var(--foreground))" pointerEvents="none" opacity={0.8}>
                  {OPENING_PRESETS[op.openingType as keyof typeof OPENING_PRESETS]?.label || op.openingType}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Add openings for wall cards */}
        {card.canAddOpenings && card.wallId && (
          <div className="flex items-center gap-1 flex-wrap mt-1 pt-1 border-t border-border/30">
            {Object.entries(OPENING_PRESETS).map(([key, preset]) => (
              <Button key={key} variant="ghost" size="sm" className="text-[9px] h-5 px-1.5"
                onClick={() => onAddOpening(card.wallId!, key, preset.width, preset.height)}
                disabled={saving}>
                <Plus className="h-2.5 w-2.5 mr-0.5" />
                {preset.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Opening properties edit dialog
function OpeningEditDialog({ open, onOpenChange, opening, onSave, onDelete, saving }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opening: OpeningData;
  onSave: (data: { width?: number; height?: number; positionX?: number; openingType?: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
}) {
  const [width, setWidth] = useState(opening.width);
  const [height, setHeight] = useState(opening.height);
  const [positionX, setPositionX] = useState(opening.positionX);
  const [openingType, setOpeningType] = useState(opening.openingType);

  useEffect(() => {
    setWidth(opening.width);
    setHeight(opening.height);
    setPositionX(opening.positionX);
    setOpeningType(opening.openingType);
  }, [opening]);

  const handleSave = async () => {
    await onSave({ width, height, positionX, openingType });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Editar {OPENING_PRESETS[openingType as keyof typeof OPENING_PRESETS]?.label || openingType}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={openingType} onValueChange={v => setOpeningType(v as OpeningData['openingType'])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OPENING_PRESETS).map(([k, p]) => (
                  <SelectItem key={k} value={k} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Ancho (m)</Label>
              <Input type="number" step="0.05" className="h-8 text-xs"
                value={width} onChange={e => setWidth(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Alto (m)</Label>
              <Input type="number" step="0.05" className="h-8 text-xs"
                value={height} onChange={e => setHeight(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Posición (%)</Label>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="1" step="0.01"
                className="flex-1 accent-primary"
                value={positionX}
                onChange={e => setPositionX(Number(e.target.value))} />
              <span className="text-xs text-muted-foreground w-10 text-right">{(positionX * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
