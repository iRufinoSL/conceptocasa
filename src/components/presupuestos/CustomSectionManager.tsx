import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { RoomData } from '@/lib/floor-plan-calculations';
import { Plus, Trash2, Pencil, MapPin, Eye, EyeOff } from 'lucide-react';

export interface SectionPolygon {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
  zBase?: number;
  zTop?: number;
}

export interface CustomSection {
  id: string;
  name: string;
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axis: 'X' | 'Y' | 'Z';
  axisValue: number;
  polygons: SectionPolygon[];
}

export interface ScaleConfig {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  gridRange?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export interface SectionWallProjection {
  workspaceId: string;
  workspaceName: string;
  hStart: number;
  hEnd: number;
  zBase: number;
  zTop: number;
}

interface CustomSectionManagerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
  scaleConfig?: ScaleConfig;
  workspacesBySection?: Map<string, any[]>;
  wallProjectionsBySection?: Map<string, SectionWallProjection[]>;
  rooms?: RoomData[];
}

const AXIS_MAP: Record<string, { axis: 'X' | 'Y' | 'Z'; label: string; placeholder: string }> = {
  vertical: { axis: 'Z', label: 'Eje Z', placeholder: 'Ej: 0 (Nivel 1)' },
  longitudinal: { axis: 'Y', label: 'Eje Y', placeholder: 'Ej: 0 (Cara Superior)' },
  transversal: { axis: 'X', label: 'Eje X', placeholder: 'Ej: 0 (Cara Izquierda)' },
};

const TYPE_LABELS: Record<string, string> = {
  vertical: 'Vertical',
  longitudinal: 'Longitudinal',
  transversal: 'Transversal',
};

const AXIS_DESCRIPTION: Record<string, string> = {
  vertical: 'Plano a nivel Z — define la cota de altura',
  longitudinal: 'Corte en Y — sección longitudinal del edificio',
  transversal: 'Corte en X — sección transversal del edificio',
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Grid range constants
const GRID_MIN = -3;
const GRID_MAX = 20;
const GRID_COUNT = GRID_MAX - GRID_MIN + 1; // 24 cells

interface SectionGridProps {
  section: CustomSection;
  scaleConfig?: ScaleConfig;
  rooms?: RoomData[];
}

function SectionGrid({ section, scaleConfig, rooms }: SectionGridProps) {
  const cellSize = 28;
  const margin = { top: 24, left: 32, right: 12, bottom: 24 };
  const totalW = margin.left + GRID_COUNT * cellSize + margin.right;
  const totalH = margin.top + GRID_COUNT * cellSize + margin.bottom;

  // Determine axes labels and orientation based on section type
  // vertical (Z): plan view → hAxis=X, vAxis=Y, origin top-left (Y increases downward)
  // longitudinal (Y): elevation → hAxis=X, vAxis=Z, origin bottom-left (Z increases upward)
  // transversal (X): elevation → hAxis=Y, vAxis=Z, origin bottom-left (Z increases upward)
  const isElevation = section.sectionType !== 'vertical';
  const hLabel = section.sectionType === 'transversal' ? 'Y' : 'X';
  const vLabel = section.sectionType === 'vertical' ? 'Y' : 'Z';

  // For elevation views, we flip the vertical axis so 0 is at bottom
  const getVIndex = (val: number) => {
    if (isElevation) {
      // bottom-left origin: higher values at top
      return GRID_MAX - val;
    }
    // top-left origin: value maps directly
    return val - GRID_MIN;
  };

  const getHIndex = (val: number) => val - GRID_MIN;

  // Scale info
  const scaleH = section.sectionType === 'transversal'
    ? (scaleConfig?.scaleY ?? 625)
    : (scaleConfig?.scaleX ?? 625);
  const scaleV = isElevation
    ? (scaleConfig?.scaleZ ?? 250)
    : (scaleConfig?.scaleY ?? 625);

  return (
    <div className="mt-2 overflow-auto border border-border rounded-md bg-muted/20">
      <div className="text-[9px] text-muted-foreground px-2 pt-1 flex items-center justify-between">
        <span>
          {section.sectionType === 'vertical' && `Vista planta Z=${section.axisValue} — Origen (0,0) arriba-izq`}
          {section.sectionType === 'longitudinal' && `Vista longitudinal Y=${section.axisValue} — Origen (0,0) abajo-izq`}
          {section.sectionType === 'transversal' && `Vista transversal X=${section.axisValue} — Origen (0,0) abajo-izq`}
        </span>
        <span className="text-muted-foreground/60">
          {hLabel}: {scaleH}mm · {vLabel}: {scaleV}mm
        </span>
      </div>
      <svg width={totalW} height={totalH} className="block">
        {/* Checkerboard cells */}
        {Array.from({ length: GRID_COUNT }, (_, row) =>
          Array.from({ length: GRID_COUNT }, (_, col) => {
            const isOdd = (row + col) % 2 === 1;
            return (
              <rect
                key={`cell-${row}-${col}`}
                x={margin.left + col * cellSize}
                y={margin.top + row * cellSize}
                width={cellSize}
                height={cellSize}
                fill={isOdd ? 'hsl(var(--border) / 0.45)' : 'transparent'}
              />
            );
          })
        )}

        {/* Grid lines */}
        {Array.from({ length: GRID_COUNT + 1 }, (_, i) => {
          const x = margin.left + i * cellSize;
          const y = margin.top + i * cellSize;
          const isOriginH = i === getHIndex(0);
          const isOriginV = i === getVIndex(0);
          return (
            <React.Fragment key={i}>
              <line
                x1={x} y1={margin.top}
                x2={x} y2={margin.top + GRID_COUNT * cellSize}
                stroke={isOriginH ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isOriginH ? 1.5 : 0.5}
                opacity={isOriginH ? 0.7 : 0.4}
              />
              <line
                x1={margin.left} y1={y}
                x2={margin.left + GRID_COUNT * cellSize} y2={y}
                stroke={isOriginV ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isOriginV ? 1.5 : 0.5}
                opacity={isOriginV ? 0.7 : 0.4}
              />
            </React.Fragment>
          );
        })}

        {/* Origin marker */}
        <circle
          cx={margin.left + getHIndex(0) * cellSize}
          cy={margin.top + getVIndex(0) * cellSize}
          r={4}
          fill="hsl(var(--primary))"
          opacity={0.8}
        />

        {/* H-axis labels (top) — every unit */}
        {Array.from({ length: GRID_COUNT + 1 }, (_, i) => {
          const val = GRID_MIN + i;
          return (
            <text
              key={`h-${i}`}
              x={margin.left + i * cellSize}
              y={margin.top - 6}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={val === 0 ? 10 : 7}
              fontWeight={val === 0 ? 700 : 400}
            >
              {val}
            </text>
          );
        })}

        {/* H-axis title */}
        <text
          x={margin.left + GRID_COUNT * cellSize + 6}
          y={margin.top - 6}
          className="fill-muted-foreground"
          fontSize={9}
          fontWeight={600}
        >
          {hLabel}
        </text>

        {/* V-axis labels (left) — every unit */}
        {Array.from({ length: GRID_COUNT + 1 }, (_, i) => {
          const val = isElevation ? (GRID_MAX - i) : (GRID_MIN + i);
          return (
            <text
              key={`v-${i}`}
              x={margin.left - 4}
              y={margin.top + i * cellSize + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={val === 0 ? 10 : 7}
              fontWeight={val === 0 ? 700 : 400}
            >
              {val}
            </text>
          );
        })}

        {/* V-axis title */}
        <text
          x={margin.left - 4}
          y={margin.top - 14}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={9}
          fontWeight={600}
        >
          {vLabel}
        </text>

        {/* Axis value indicator label */}
        <text
          x={totalW - margin.right}
          y={totalH - 4}
          textAnchor="end"
          className="fill-primary"
          fontSize={9}
          fontWeight={600}
        >
          {section.axis}={section.axisValue}
        </text>

        {/* Workspace floor polygons for vertical sections */}
        {section.sectionType === 'vertical' && rooms && rooms
          .filter(r => r.verticalSectionId === section.id && r.floorPolygon && r.floorPolygon.length >= 3)
          .map(room => {
            const poly = room.floorPolygon!;
            const points = poly.map(p => {
              const hIdx = getHIndex(p.x);
              const vIdx = getVIndex(p.y);
              return `${margin.left + hIdx * cellSize},${margin.top + vIdx * cellSize}`;
            }).join(' ');

            // Centroid for label
            const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
            const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
            const cxSvg = margin.left + getHIndex(cx) * cellSize;
            const cySvg = margin.top + getVIndex(cy) * cellSize;

            // Area via shoelace
            let area = 0;
            for (let i = 0; i < poly.length; i++) {
              const j = (i + 1) % poly.length;
              area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
            }
            area = Math.abs(area) / 2;
            const scaleHm = (scaleConfig?.scaleX ?? 625) / 1000;
            const scaleVm = (scaleConfig?.scaleY ?? 625) / 1000;
            const areaM2 = area * scaleHm * scaleVm;

            return (
              <g key={room.id}>
                <polygon
                  points={points}
                  fill="hsl(200 80% 50% / 0.15)"
                  stroke="hsl(200 80% 50%)"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                <text
                  x={cxSvg}
                  y={cySvg - 4}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill="hsl(200 80% 50%)"
                >
                  {room.name}
                </text>
                <text
                  x={cxSvg}
                  y={cySvg + 7}
                  textAnchor="middle"
                  fontSize={7}
                  fill="hsl(200 80% 50% / 0.8)"
                >
                  {areaM2.toFixed(2)} m²
                </text>
              </g>
            );
          })
        }
      </svg>
    </div>
  );
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange, scaleConfig, rooms }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAxisValue, setEditAxisValue] = useState('0');
  const [visibleGridId, setVisibleGridId] = useState<string | null>(null);

  const axisConfig = AXIS_MAP[sectionType];
  const filtered = sections.filter(s => s.sectionType === sectionType);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = parseFloat(newAxisValue) || 0;
    const section: CustomSection = {
      id: generateId(),
      name: newName.trim(),
      sectionType,
      axis: axisConfig.axis,
      axisValue: val,
      polygons: [],
    };
    onSectionsChange([...sections, section]);
    setNewName('');
    setNewAxisValue('0');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
    if (visibleGridId === id) setVisibleGridId(null);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    const val = parseFloat(editAxisValue) || 0;
    onSectionsChange(sections.map(s =>
      s.id === id ? { ...s, name: editName.trim(), axisValue: val } : s
    ));
    setEditingSectionId(null);
  };

  const toggleGrid = (id: string) => {
    setVisibleGridId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Secciones {TYPE_LABELS[sectionType]}
          <Badge variant="outline" className="text-[9px] h-4">{filtered.length}</Badge>
        </h4>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Nueva Sección
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground italic">{AXIS_DESCRIPTION[sectionType]}</p>

      {showAddForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Nombre de la Sección</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Ej: Nivel 0"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-[10px]">{axisConfig.label} (valor)</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  placeholder={axisConfig.placeholder}
                  value={newAxisValue}
                  onChange={e => setNewAxisValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
            </div>
            <div className="flex gap-1 justify-end">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddForm(false)}>Cancelar</Button>
              <Button size="sm" className="h-6 text-[10px]" onClick={handleAdd} disabled={!newName.trim()}>Crear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && !showAddForm && (
        <p className="text-[10px] text-muted-foreground italic py-2">No hay secciones definidas. Pulse "Nueva Sección" para crear una.</p>
      )}

      {filtered.map(section => {
        const isEditing = editingSectionId === section.id;
        const gridVisible = visibleGridId === section.id;

        return (
          <div key={section.id}>
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                    <Input
                      className="h-7 text-xs w-36"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(section.id);
                        if (e.key === 'Escape') setEditingSectionId(null);
                      }}
                      autoFocus
                      placeholder="Nombre"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{axisConfig.label}=</span>
                      <Input
                        className="h-7 text-xs w-16"
                        type="number"
                        value={editAxisValue}
                        onChange={e => setEditAxisValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(section.id);
                          if (e.key === 'Escape') setEditingSectionId(null);
                        }}
                      />
                    </div>
                    <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleRename(section.id)}>Guardar</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingSectionId(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-semibold truncate">{section.name}</span>
                    <Badge variant="secondary" className="text-[9px] h-4 shrink-0">
                      {section.axis}={section.axisValue}
                    </Badge>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant={gridVisible ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleGrid(section.id)}
                    title={gridVisible ? 'Ocultar cuadrícula' : 'Ver cuadrícula'}
                  >
                    {gridVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingSectionId(section.id);
                      setEditName(section.name);
                      setEditAxisValue(String(section.axisValue));
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(section.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {gridVisible && (
              <SectionGrid section={section} scaleConfig={scaleConfig} rooms={rooms} />
            )}
          </div>
        );
      })}
    </div>
  );
}
