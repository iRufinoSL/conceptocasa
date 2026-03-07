import React, { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { RoomData } from '@/lib/floor-plan-calculations';
import { Plus, Trash2, Pencil, MapPin, Eye, EyeOff, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { GridPdfExport } from './GridPdfExport';

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
  budgetName?: string;
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
  budgetName?: string;
  wallProjections?: SectionWallProjection[];
}

function SectionGrid({ section, scaleConfig, rooms, budgetName, wallProjections }: SectionGridProps) {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridMin, setGridMin] = useState(GRID_MIN);
  const [gridMax, setGridMax] = useState(GRID_MAX);
  const [zoomLevel, setZoomLevel] = useState(1);
  const gridCount = gridMax - gridMin + 1;
  const baseCellSize = 28;
  const cellSize = Math.round(baseCellSize * zoomLevel);
  const margin = { top: 28, left: 36, right: 16, bottom: 28 };
  const totalW = margin.left + gridCount * cellSize + margin.right;
  const totalH = margin.top + gridCount * cellSize + margin.bottom;

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
      return gridMax - val;
    }
    return val - gridMin;
  };

  const getHIndex = (val: number) => val - gridMin;

  // Scale info
  const scaleH = section.sectionType === 'transversal'
    ? (scaleConfig?.scaleY ?? 625)
    : (scaleConfig?.scaleX ?? 625);
  const scaleV = isElevation
    ? (scaleConfig?.scaleZ ?? 250)
    : (scaleConfig?.scaleY ?? 625);

  const zoomOptions = [1, 1.5, 2, 2.5, 3];

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between px-2 pt-1 pb-0.5 flex-wrap gap-1">
        <span className="text-[9px] text-muted-foreground">
          {section.sectionType === 'vertical' && `Vista planta Z=${section.axisValue} — Origen (0,0) arriba-izq`}
          {section.sectionType === 'longitudinal' && `Vista longitudinal Y=${section.axisValue} — Origen (0,0) abajo-izq`}
          {section.sectionType === 'transversal' && `Vista transversal X=${section.axisValue} — Origen (0,0) abajo-izq`}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5">
            <span className="text-[8px] text-muted-foreground font-medium">Zoom:</span>
            {zoomOptions.map(z => (
              <Button
                key={z}
                variant={zoomLevel === z ? 'default' : 'ghost'}
                size="sm"
                className="h-4 px-1.5 text-[8px] min-w-0"
                onClick={() => setZoomLevel(z)}
              >
                {z}x
              </Button>
            ))}
          </div>
          {/* Grid range controls */}
          <div className="flex items-center gap-0.5 border border-border rounded px-1.5 py-0.5">
            <span className="text-[8px] text-muted-foreground font-medium">Rango:</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMin(m => m - 3)} title="Ampliar mín −3">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[8px] font-mono text-muted-foreground">{gridMin}</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMin(m => Math.min(m + 3, -1))} title="Reducir mín +3">
              <ChevronRight className="h-3 w-3" />
            </Button>
            <span className="text-[8px] text-muted-foreground mx-0.5">→</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMax(m => Math.max(m - 3, 1))} title="Reducir máx −3">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[8px] font-mono text-muted-foreground">{gridMax}</span>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setGridMax(m => m + 3)} title="Ampliar máx +3">
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          <span className="text-[9px] text-muted-foreground/60">
            {hLabel}: {scaleH}mm · {vLabel}: {scaleV}mm
          </span>
          <GridPdfExport
            title={budgetName || 'Presupuesto'}
            subtitle={`${section.name} (${section.axis}=${section.axisValue})`}
            containerRef={gridContainerRef}
            size="sm"
          />
        </div>
      </div>
      <div ref={gridContainerRef} className="overflow-auto border border-border rounded-md bg-muted/20" style={{ maxHeight: zoomLevel > 1 ? '600px' : undefined }}>
      <svg width={totalW} height={totalH} className="block">
        {/* Checkerboard cells */}
        {Array.from({ length: gridCount }, (_, row) =>
          Array.from({ length: gridCount }, (_, col) => {
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
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const x = margin.left + i * cellSize;
          const y = margin.top + i * cellSize;
          const isOriginH = i === getHIndex(0);
          const isOriginV = i === getVIndex(0);
          return (
            <React.Fragment key={i}>
              <line
                x1={x} y1={margin.top}
                x2={x} y2={margin.top + gridCount * cellSize}
                stroke={isOriginH ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isOriginH ? 1.5 : 0.5}
                opacity={isOriginH ? 0.7 : 0.4}
              />
              <line
                x1={margin.left} y1={y}
                x2={margin.left + gridCount * cellSize} y2={y}
                stroke={isOriginV ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isOriginV ? 1.5 : 0.5}
                opacity={isOriginV ? 0.7 : 0.4}
              />
            </React.Fragment>
          );
        })}

        {/* Origin marker */}
        {getHIndex(0) >= 0 && getHIndex(0) <= gridCount && getVIndex(0) >= 0 && getVIndex(0) <= gridCount && (
          <circle
            cx={margin.left + getHIndex(0) * cellSize}
            cy={margin.top + getVIndex(0) * cellSize}
            r={4}
            fill="hsl(var(--primary))"
            opacity={0.8}
          />
        )}

        {/* H-axis labels (top) — every unit */}
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const val = gridMin + i;
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
          x={margin.left + gridCount * cellSize + 6}
          y={margin.top - 6}
          className="fill-muted-foreground"
          fontSize={9}
          fontWeight={600}
        >
          {hLabel}
        </text>

        {/* V-axis labels (left) — every unit */}
        {Array.from({ length: gridCount + 1 }, (_, i) => {
          const val = isElevation ? (gridMax - i) : (gridMin + i);
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
        {section.sectionType === 'vertical' && rooms && (() => {
          const sectionRooms = rooms
            .filter(r => r.verticalSectionId === section.id && r.floorPolygon && r.floorPolygon.length >= 3);

          if (sectionRooms.length === 0) return null;

          const allVertices = sectionRooms.flatMap(room => room.floorPolygon ?? []);
          const hasGlobalBounds = allVertices.length >= 2;

          const globalMinX = hasGlobalBounds ? Math.min(...allVertices.map(v => v.x)) : 0;
          const globalMaxX = hasGlobalBounds ? Math.max(...allVertices.map(v => v.x)) : 0;
          const globalMinY = hasGlobalBounds ? Math.min(...allVertices.map(v => v.y)) : 0;
          const globalMaxY = hasGlobalBounds ? Math.max(...allVertices.map(v => v.y)) : 0;

          const globalLeft = margin.left + getHIndex(globalMinX) * cellSize;
          const globalRight = margin.left + getHIndex(globalMaxX) * cellSize;
          const globalTop = margin.top + getVIndex(globalMinY) * cellSize;
          const globalBottom = margin.top + getVIndex(globalMaxY) * cellSize;

          const globalWidthMm = Math.round((globalMaxX - globalMinX) * scaleH);
          const globalHeightMm = Math.round((globalMaxY - globalMinY) * scaleV);

          return (
            <>
              {sectionRooms.map(room => {
                const poly = room.floorPolygon!;
                const points = poly.map(p => {
                  const hIdx = getHIndex(p.x);
                  const vIdx = getVIndex(p.y);
                  return `${margin.left + hIdx * cellSize},${margin.top + vIdx * cellSize}`;
                }).join(' ');

                const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                const cxSvg = margin.left + getHIndex(cx) * cellSize;
                const cySvg = margin.top + getVIndex(cy) * cellSize;

                let area = 0;
                for (let i = 0; i < poly.length; i++) {
                  const j = (i + 1) % poly.length;
                  area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
                }
                area = Math.abs(area) / 2;
                const scaleHm = (scaleConfig?.scaleX ?? 625) / 1000;
                const scaleVm = (scaleConfig?.scaleY ?? 625) / 1000;
                const areaM2 = area * scaleHm * scaleVm;

                const svgPts = poly.map(p => ({
                  x: margin.left + getHIndex(p.x) * cellSize,
                  y: margin.top + getVIndex(p.y) * cellSize,
                }));

                return (
                  <g key={room.id}>
                    <polygon
                      points={points}
                      fill="hsl(var(--primary) / 0.12)"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />

                    {/* Medidas de cada pared SOBRE la línea en azul */}
                    {svgPts.map((pt, i) => {
                      const next = svgPts[(i + 1) % svgPts.length];
                      const currGrid = poly[i];
                      const nextGrid = poly[(i + 1) % poly.length];

                      const mx = (pt.x + next.x) / 2;
                      const my = (pt.y + next.y) / 2;
                      const dx = next.x - pt.x;
                      const dy = next.y - pt.y;

                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      const rotAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;

                      const dxMm = (nextGrid.x - currGrid.x) * scaleH;
                      const dyMm = (nextGrid.y - currGrid.y) * scaleV;
                      const wallLenMm = Math.round(Math.hypot(dxMm, dyMm));

                      return (
                        <g key={`wall-mm-${room.id}-${i}`} className="pointer-events-none">
                          <text
                            x={mx}
                            y={my}
                            textAnchor="middle"
                            dominantBaseline="central"
                            transform={`rotate(${rotAngle}, ${mx}, ${my})`}
                            fontSize={Math.round(8 * Math.max(1, zoomLevel * 0.8))}
                            fontWeight={900}
                            fill="hsl(210 100% 45%)"
                            stroke="white"
                            strokeWidth={0.3}
                          >
                            {wallLenMm} mm
                          </text>
                        </g>
                      );
                    })}

                    {/* Nombre del polígono - color diferenciado */}
                    <rect
                      x={cxSvg - 30}
                      y={cySvg - 12}
                      width={60}
                      height={22}
                      rx={3}
                      fill="hsl(45 100% 50% / 0.85)"
                    />
                    <text
                      x={cxSvg}
                      y={cySvg - 3}
                      textAnchor="middle"
                      fontSize={Math.round(8 * Math.max(1, zoomLevel * 0.7))}
                      fontWeight={700}
                      fill="hsl(0 0% 10%)"
                    >
                      {room.name}
                    </text>
                    <text
                      x={cxSvg}
                      y={cySvg + 7}
                      textAnchor="middle"
                      fontSize={Math.round(7 * Math.max(1, zoomLevel * 0.7))}
                      fontWeight={600}
                      fill="hsl(0 0% 15%)"
                    >
                      {areaM2.toFixed(2)} m²
                    </text>
                  </g>
                );
              })}

              {/* Cotas exteriores globales (arriba, derecha, abajo, izquierda) */}
              {hasGlobalBounds && (() => {
                const off = 26;
                const topY = globalTop - off;
                const bottomY = globalBottom + off;
                const leftX = globalLeft - off;
                const rightX = globalRight + off;
                const midX = (globalLeft + globalRight) / 2;
                const midY = (globalTop + globalBottom) / 2;
                const perimFontSize = Math.round(8 * Math.max(1, zoomLevel * 0.8));

                return (
                  <g className="pointer-events-none">
                    {/* Arriba */}
                    <line x1={globalLeft} y1={topY} x2={globalRight} y2={topY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalTop} x2={globalLeft} y2={topY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalRight} y1={globalTop} x2={globalRight} y2={topY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text x={midX} y={topY - 5} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{globalWidthMm} mm</text>

                    {/* Abajo */}
                    <line x1={globalLeft} y1={bottomY} x2={globalRight} y2={bottomY} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalBottom} x2={globalLeft} y2={bottomY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalRight} y1={globalBottom} x2={globalRight} y2={bottomY} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text x={midX} y={bottomY + 10} textAnchor="middle" fontSize={perimFontSize} fontWeight={700} fill="hsl(0 70% 45%)">{globalWidthMm} mm</text>

                    {/* Izquierda */}
                    <line x1={leftX} y1={globalTop} x2={leftX} y2={globalBottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalLeft} y1={globalTop} x2={leftX} y2={globalTop} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalLeft} y1={globalBottom} x2={leftX} y2={globalBottom} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text
                      x={leftX - 6}
                      y={midY}
                      textAnchor="middle"
                      fontSize={perimFontSize}
                      fontWeight={700}
                      fill="hsl(0 70% 45%)"
                      transform={`rotate(-90, ${leftX - 6}, ${midY})`}
                    >
                      {globalHeightMm} mm
                    </text>

                    {/* Derecha */}
                    <line x1={rightX} y1={globalTop} x2={rightX} y2={globalBottom} stroke="hsl(0 70% 50%)" strokeWidth={1.2} />
                    <line x1={globalRight} y1={globalTop} x2={rightX} y2={globalTop} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <line x1={globalRight} y1={globalBottom} x2={rightX} y2={globalBottom} stroke="hsl(0 70% 50% / 0.5)" strokeWidth={0.8} />
                    <text
                      x={rightX + 6}
                      y={midY}
                      textAnchor="middle"
                      fontSize={perimFontSize}
                      fontWeight={700}
                      fill="hsl(0 70% 45%)"
                      transform={`rotate(-90, ${rightX + 6}, ${midY})`}
                    >
                      {globalHeightMm} mm
                    </text>
                  </g>
                );
              })()}
            </>
          );
        })()}

        {/* Wall projections for longitudinal/transversal sections */}
        {isElevation && wallProjections && wallProjections.length > 0 && (() => {
          const PROJ_COLORS = [
            'hsl(210 70% 55%)', 'hsl(150 60% 45%)', 'hsl(30 80% 55%)',
            'hsl(280 60% 55%)', 'hsl(0 70% 55%)', 'hsl(180 60% 45%)',
          ];

          return (
            <>
              {wallProjections.map((proj, pi) => {
                const color = PROJ_COLORS[pi % PROJ_COLORS.length];
                const x1 = margin.left + getHIndex(proj.hStart) * cellSize;
                const x2 = margin.left + getHIndex(proj.hEnd) * cellSize;
                const y1 = margin.top + getVIndex(proj.zTop) * cellSize;
                const y2 = margin.top + getVIndex(proj.zBase) * cellSize;

                const w = Math.abs(x2 - x1);
                const h = Math.abs(y2 - y1);
                const rx = Math.min(x1, x2);
                const ry = Math.min(y1, y2);

                const cx = rx + w / 2;
                const cy = ry + h / 2;

                // Dimension labels
                const widthMm = Math.round(Math.abs(proj.hEnd - proj.hStart) * scaleH);
                const heightMm = Math.round(Math.abs(proj.zTop - proj.zBase) * scaleV);
                const fontSize = Math.round(7 * Math.max(1, zoomLevel * 0.8));

                return (
                  <g key={`proj-${proj.workspaceId}-${pi}`}>
                    {/* Filled rectangle */}
                    <rect
                      x={rx} y={ry} width={w} height={h}
                      fill={`${color} / 0.15`}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />

                    {/* Name label */}
                    <rect
                      x={cx - 28} y={cy - 10}
                      width={56} height={20}
                      rx={3}
                      fill="hsl(45 100% 50% / 0.85)"
                    />
                    <text
                      x={cx} y={cy - 1}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fontWeight={700}
                      fill="hsl(0 0% 10%)"
                    >
                      {proj.workspaceName}
                    </text>
                    <text
                      x={cx} y={cy + 8}
                      textAnchor="middle"
                      fontSize={fontSize - 1}
                      fontWeight={500}
                      fill="hsl(0 0% 25%)"
                    >
                      {widthMm}×{heightMm}mm
                    </text>

                    {/* Width dimension (top) */}
                    <line x1={rx} y1={ry - 8} x2={rx + w} y2={ry - 8} stroke={color} strokeWidth={0.8} />
                    <line x1={rx} y1={ry} x2={rx} y2={ry - 10} stroke={`${color} / 0.5`} strokeWidth={0.5} />
                    <line x1={rx + w} y1={ry} x2={rx + w} y2={ry - 10} stroke={`${color} / 0.5`} strokeWidth={0.5} />
                    <text x={cx} y={ry - 11} textAnchor="middle" fontSize={fontSize - 1} fontWeight={600} fill={color}>
                      {widthMm} mm
                    </text>

                    {/* Height dimension (right) */}
                    <line x1={rx + w + 8} y1={ry} x2={rx + w + 8} y2={ry + h} stroke={color} strokeWidth={0.8} />
                    <line x1={rx + w} y1={ry} x2={rx + w + 10} y2={ry} stroke={`${color} / 0.5`} strokeWidth={0.5} />
                    <line x1={rx + w} y1={ry + h} x2={rx + w + 10} y2={ry + h} stroke={`${color} / 0.5`} strokeWidth={0.5} />
                    <text
                      x={rx + w + 12} y={cy}
                      textAnchor="middle"
                      fontSize={fontSize - 1}
                      fontWeight={600}
                      fill={color}
                      transform={`rotate(-90, ${rx + w + 12}, ${cy})`}
                    >
                      {heightMm} mm
                    </text>
                  </g>
                );
              })}
            </>
          );
        })()}

      </svg>
      </div>
    </div>
  );
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange, scaleConfig, wallProjectionsBySection, rooms, budgetName }: CustomSectionManagerProps) {
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
              <SectionGrid section={section} scaleConfig={scaleConfig} rooms={rooms} budgetName={budgetName} wallProjections={wallProjectionsBySection?.get(section.id)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
