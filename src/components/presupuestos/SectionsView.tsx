import React, { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Grid3x3, ArrowLeftRight, ArrowUpDown, AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Box } from 'lucide-react';
import { toast } from 'sonner';
import { CustomSectionManager, type CustomSection, type ScaleConfig, type SectionWallProjection } from './CustomSectionManager';
import type { FloorPlanData, RoomData, FloorLevel, WallType } from '@/lib/floor-plan-calculations';
import type { CustomCorner, ManualElevation, RidgeLine } from '@/hooks/useFloorPlan';

interface SectionsViewProps {
  planData: FloorPlanData;
  rooms: RoomData[];
  floors: FloorLevel[];
  budgetName?: string;
  saving: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onAddRoom?: (name: string, width: number, length: number, floorId?: string, gridCol?: number, gridRow?: number) => Promise<void>;
  onGroupRooms?: (roomIds: string[], groupName: string, emptyCells?: { col: number; row: number }[]) => Promise<void>;
  onUngroupRooms?: (groupId: string) => Promise<void>;
  onUndo?: () => Promise<void>;
  undoCount?: number;
  gridRef?: React.RefObject<HTMLDivElement | null>;
  onActiveFloorChange?: (floorName: string, floorId?: string) => void;
  forceActiveFloorId?: string;
  customCorners?: CustomCorner[];
  onCustomCornersChange?: (corners: CustomCorner[]) => void;
  onRecalculateSegments?: () => Promise<void>;
  onShiftGrid?: (deltaCol: number, deltaRow: number) => Promise<void>;
  onUpdateOpening: (openingId: string, data: any) => Promise<void>;
  onAddOpening: (wallId: string, type: string, w: number, h: number, sh?: number, px?: number) => Promise<void>;
  onDeleteOpening: (openingId: string) => Promise<void>;
  onUpdateWall?: (wallId: string, data: any) => Promise<void>;
  onUpdateWallSegmentType?: (wallId: string, segmentIndex: number, segmentType: WallType) => Promise<void>;
  onAddBlockGroup?: (wallId: string, startCol: number, startRow: number, spanCols: number, spanRows: number, name?: string, color?: string) => Promise<void>;
  onDeleteBlockGroup?: (blockGroupId: string) => Promise<void>;
  onUpdateBlockGroup?: (blockGroupId: string, data: any) => Promise<void>;
  manualElevations?: ManualElevation[];
  onManualElevationsChange?: (elevations: ManualElevation[]) => void;
  focusWallId?: string;
  customSections?: CustomSection[];
  onCustomSectionsChange?: (sections: CustomSection[]) => void;
  renderSelectedRoom?: () => React.ReactNode;
  onRefresh?: () => Promise<void>;
}

const SECTION_GROUPS = [
  { type: 'vertical' as const, label: 'S. Verticales (Z)', icon: Grid3x3, color: 'text-blue-600', desc: 'Planos de planta a cada nivel Z' },
  { type: 'longitudinal' as const, label: 'S. Longitudinales (Y)', icon: ArrowLeftRight, color: 'text-green-600', desc: 'Cortes longitudinales a cada valor Y' },
  { type: 'transversal' as const, label: 'S. Transversales (X)', icon: ArrowUpDown, color: 'text-orange-600', desc: 'Cortes transversales a cada valor X' },
];

/**
 * Compute wall projections for longitudinal (Y) and transversal (X) sections.
 * For a section at Y=val, find all workspace polygon edges that lie on or cross Y=val,
 * then project their X range and Z range (based on floor height).
 */
function computeWallProjections(
  sections: CustomSection[],
  rooms: RoomData[],
  floors: FloorLevel[],
  planData: FloorPlanData,
): Map<string, SectionWallProjection[]> {
  const result = new Map<string, SectionWallProjection[]>();

  const blockHMm = planData.blockHeightMm || 250;

  // Build floor Z base map from floors table
  const sortedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);
  const floorBaseZMap = new Map<string, number>();
  let accZ = 0;
  for (const f of sortedFloors) {
    floorBaseZMap.set(f.id, accZ);
    const floorRooms = rooms.filter(r => r.floorId === f.id);
    const firstHeight = floorRooms[0]?.height;
    const heightM = firstHeight !== undefined ? firstHeight : planData.defaultHeight;
    const heightMm = Math.round(heightM * 1000);
    accZ += Math.round(heightMm / blockHMm);
  }

  // Build vertical section Z map: verticalSectionId → axisValue (Z level)
  const verticalSectionZMap = new Map<string, number>();
  for (const s of sections) {
    if (s.sectionType === 'vertical') {
      verticalSectionZMap.set(s.id, s.axisValue);
    }
  }

  // Only process longitudinal (Y) and transversal (X) sections
  for (const section of sections) {
    if (section.sectionType === 'vertical') continue;

    const projections: SectionWallProjection[] = [];
    const axisVal = section.axisValue;

    for (const room of rooms) {
      if (!room.floorPolygon || room.floorPolygon.length < 1) continue;

      const poly = room.floorPolygon;

      // Determine zBase: 1st priority: floorId → floorBaseZMap, 2nd: verticalSectionId → axisValue
      let zBase = 0;
      if (room.floorId && floorBaseZMap.has(room.floorId)) {
        zBase = floorBaseZMap.get(room.floorId)!;
      } else if (room.verticalSectionId && verticalSectionZMap.has(room.verticalSectionId)) {
        zBase = verticalSectionZMap.get(room.verticalSectionId)!;
      }

      const heightM = room.height !== undefined ? room.height : planData.defaultHeight;
      const heightBlocks = Math.round((heightM * 1000) / blockHMm);
      const zTop = zBase + heightBlocks;

      if (section.sectionType === 'longitudinal') {
        // Section cuts at Y=axisVal: find X range of edges on this Y
        let intersections: number[];
        if (poly.length === 1) {
          // Point: show if Y matches
          if (poly[0].y === axisVal) {
            intersections = [poly[0].x];
          } else {
            intersections = [];
          }
        } else if (poly.length === 2) {
          if (poly[0].y === axisVal && poly[1].y === axisVal) {
            intersections = [poly[0].x, poly[1].x];
          } else {
            intersections = findPolygonIntersectionsAtAxis(poly, 'y', axisVal);
          }
        } else {
          intersections = findPolygonIntersectionsAtAxis(poly, 'y', axisVal);
        }
        if (intersections.length >= 2) {
          const hMin = Math.min(...intersections);
          const hMax = Math.max(...intersections);
          projections.push({
            workspaceId: room.id,
            workspaceName: room.name,
            hStart: hMin,
            hEnd: hMax,
            zBase,
            zTop,
          });
        } else if (intersections.length === 1) {
          // Single point
          projections.push({
            workspaceId: room.id,
            workspaceName: room.name,
            hStart: intersections[0],
            hEnd: intersections[0],
            zBase,
            zTop,
          });
        }
      } else if (section.sectionType === 'transversal') {
        // Section cuts at X=axisVal: find Y range of edges on this X
        let intersections: number[];
        if (poly.length === 1) {
          if (poly[0].x === axisVal) {
            intersections = [poly[0].y];
          } else {
            intersections = [];
          }
        } else if (poly.length === 2) {
          if (poly[0].x === axisVal && poly[1].x === axisVal) {
            intersections = [poly[0].y, poly[1].y];
          } else {
            intersections = findPolygonIntersectionsAtAxis(poly, 'x', axisVal);
          }
        } else {
          intersections = findPolygonIntersectionsAtAxis(poly, 'x', axisVal);
        }
        if (intersections.length >= 2) {
          const hMin = Math.min(...intersections);
          const hMax = Math.max(...intersections);
          projections.push({
            workspaceId: room.id,
            workspaceName: room.name,
            hStart: hMin,
            hEnd: hMax,
            zBase,
            zTop,
          });
        } else if (intersections.length === 1) {
          projections.push({
            workspaceId: room.id,
            workspaceName: room.name,
            hStart: intersections[0],
            hEnd: intersections[0],
            zBase,
            zTop,
          });
        }
      }
    }

    result.set(section.id, projections);
  }

  return result;
}

/**
 * Find all X (or Y) intersection points where a polygon crosses axis=val.
 * For longitudinal (Y=val): axis='y', returns X values
 * For transversal (X=val): axis='x', returns Y values
 */
function findPolygonIntersectionsAtAxis(
  poly: Array<{ x: number; y: number }>,
  axis: 'x' | 'y',
  val: number,
): number[] {
  const intersections: number[] = [];
  const otherAxis = axis === 'y' ? 'x' : 'y';

  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i];
    const b = poly[j];

    const aVal = a[axis];
    const bVal = b[axis];

    // Check if edge touches or crosses the axis value
    if ((aVal <= val && bVal >= val) || (aVal >= val && bVal <= val)) {
      if (aVal === bVal) {
        // Edge runs along the axis - include both endpoints
        intersections.push(a[otherAxis], b[otherAxis]);
      } else {
        // Interpolate
        const t = (val - aVal) / (bVal - aVal);
        const otherVal = a[otherAxis] + t * (b[otherAxis] - a[otherAxis]);
        intersections.push(otherVal);
      }
    }
  }

  return intersections;
}

export function SectionsView(props: SectionsViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['vertical', 'longitudinal', 'transversal'])
  );
  const [show3D, setShow3D] = useState(false);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);

  const toggleGroup = (type: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const allSections = props.customSections || [];

  // Build scaleConfig from planData
  const scaleConfig: ScaleConfig = useMemo(() => ({
    scaleX: props.planData.blockLengthMm || 625,
    scaleY: props.planData.blockLengthMm || 625,
    scaleZ: props.planData.blockHeightMm || 250,
  }), [props.planData.blockLengthMm, props.planData.blockHeightMm]);

  // Compute wall projections for longitudinal/transversal sections
  const wallProjections = useMemo(() =>
    computeWallProjections(allSections, props.rooms, props.floors, props.planData),
    [allSections, props.rooms, props.floors, props.planData]
  );

  // ── Navigate to a section containing a wall (double-click on wall number) ──
  const handleNavigateToWallSection = useCallback((wallInfo: {
    roomId: string; roomName: string; wallIndex: number;
    isHorizontal: boolean; edgeAxisValue: number; sourceSectionType: string;
  }) => {
    let targetType: string;

    if (wallInfo.sourceSectionType === 'vertical') {
      // Z section: horizontal edges → Y sections, vertical edges → X sections
      targetType = wallInfo.isHorizontal ? 'longitudinal' : 'transversal';
    } else if (wallInfo.sourceSectionType === 'longitudinal') {
      // Y section: horizontal edges (along X) → Z sections, vertical edges (along Z) → X sections
      targetType = wallInfo.isHorizontal ? 'vertical' : 'transversal';
    } else {
      // X section: horizontal edges (along Y) → Z sections, vertical edges (along Z) → Y sections
      targetType = wallInfo.isHorizontal ? 'vertical' : 'longitudinal';
    }

    const candidates = allSections.filter(s => s.sectionType === targetType);

    // Find the closest matching section by axis value
    let bestSection: CustomSection | null = null;
    let bestDist = Infinity;
    for (const s of candidates) {
      const dist = Math.abs(s.axisValue - wallInfo.edgeAxisValue);
      if (dist < bestDist) {
        bestDist = dist;
        bestSection = s;
      }
    }

    const axisLabel = targetType === 'vertical' ? 'Z' : targetType === 'longitudinal' ? 'Y' : 'X';

    if (bestSection && bestDist <= 1) {
      // Expand the target group and focus the section grid
      setExpandedGroups(prev => {
        const next = new Set(prev);
        next.add(targetType);
        return next;
      });
      setFocusSectionId(bestSection.id);
      toast.info(`Navegando a P${wallInfo.wallIndex + 1} de "${wallInfo.roomName}" en sección ${axisLabel}=${bestSection.axisValue}`);

      // Scroll into view after a tick
      setTimeout(() => {
        const el = document.querySelector(`[data-section-id="${bestSection!.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      // Clear focus after a short delay to allow re-triggering
      setTimeout(() => setFocusSectionId(null), 500);
    } else {
      toast.warning(`No hay sección ${targetType === 'vertical' ? 'Vertical (Z)' : targetType === 'longitudinal' ? 'Longitudinal (Y)' : 'Transversal (X)'} para P${wallInfo.wallIndex + 1}. Crea una sección en ${axisLabel}=${wallInfo.edgeAxisValue}`);
    }
  }, [allSections]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Button
          size="sm"
          variant={show3D ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => setShow3D(!show3D)}
        >
          <Box className="h-3 w-3" /> Vista 3D
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={async () => { await props.onRefresh?.(); toast.success('Secciones actualizadas'); }} title="Actualizar secciones">
          <RefreshCw className="h-3 w-3" /> Actualizar
        </Button>
      </div>

      {/* 3D Wireframe View */}
      {show3D && (
        <Workspace3DWireframe
          rooms={props.rooms}
          floors={props.floors}
          planData={props.planData}
          scaleConfig={scaleConfig}
        />
      )}

      {SECTION_GROUPS.map(group => {
        const Icon = group.icon;
        const count = allSections.filter(s => s.sectionType === group.type).length;
        const isOpen = expandedGroups.has(group.type);

        return (
          <div key={group.type} className="border border-border rounded-lg overflow-hidden">
            <button
              className="flex items-center justify-between w-full px-3 py-2.5 bg-muted/50 hover:bg-muted/80 transition-colors"
              onClick={() => toggleGroup(group.type)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Icon className={`h-4 w-4 ${group.color}`} />
                <span className="text-sm font-semibold text-foreground">{group.label}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] h-5">
                {count} {count === 1 ? 'sección' : 'secciones'}
              </Badge>
            </button>

            {isOpen && (
              <div className="px-3 py-2 bg-background border-t border-border">
                <CustomSectionManager
                  sectionType={group.type}
                  sections={allSections}
                  onSectionsChange={props.onCustomSectionsChange || (() => {})}
                  scaleConfig={scaleConfig}
                  wallProjectionsBySection={wallProjections}
                  rooms={props.rooms}
                  budgetName={props.budgetName}
                  onNavigateToWallSection={handleNavigateToWallSection}
                  forcedVisibleGridId={focusSectionId}
                  planData={props.planData}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline 3D Wireframe Component ──────────────────────────────
interface Workspace3DWireframeProps {
  rooms: RoomData[];
  floors: FloorLevel[];
  planData: FloorPlanData;
  scaleConfig: ScaleConfig;
}

function Workspace3DWireframe({ rooms, floors, planData, scaleConfig }: Workspace3DWireframeProps) {
  const blockHMm = planData.blockHeightMm || 250;
  const scaleXm = (scaleConfig.scaleX || 625) / 1000;
  const scaleYm = (scaleConfig.scaleY || 625) / 1000;
  const scaleZm = blockHMm / 1000;

  // Build floor Z base map
  const sortedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);
  const floorBaseZMap = useMemo(() => {
    const map = new Map<string, number>();
    let accZ = 0;
    for (const f of sortedFloors) {
      map.set(f.id, accZ);
      const floorRooms = rooms.filter(r => r.floorId === f.id);
      const firstHeight = floorRooms[0]?.height;
      const heightM = firstHeight !== undefined ? firstHeight : planData.defaultHeight;
      const heightMm = Math.round(heightM * 1000);
      accZ += Math.round(heightMm / blockHMm);
    }
    return map;
  }, [rooms, floors, planData, blockHMm]);

  // Build workspace volumes
  const volumes = useMemo(() => {
    return rooms
      .filter(r => r.floorPolygon && r.floorPolygon.length >= 3)
      .map(room => {
        const poly = room.floorPolygon!;
        const zBase = room.floorId ? (floorBaseZMap.get(room.floorId) ?? 0) : 0;
        const heightM = room.height !== undefined ? room.height : planData.defaultHeight;
        const heightBlocks = Math.round((heightM * 1000) / blockHMm);
        const zTop = zBase + heightBlocks;

        // Convert grid units to meters for SVG
        const baseVertices = poly.map(p => ({
          x: p.x * scaleXm,
          y: p.y * scaleYm,
        }));

        return {
          id: room.id,
          name: room.name,
          baseVertices,
          zBaseM: zBase * scaleZm,
          zTopM: zTop * scaleZm,
        };
      });
  }, [rooms, floorBaseZMap, planData, scaleXm, scaleYm, scaleZm, blockHMm]);

  if (volumes.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground bg-muted/20">
        No hay Espacios de trabajo con geometría definida para visualizar en 3D.
      </div>
    );
  }

  // Isometric projection helpers
  // Using a simple isometric: x' = (x - y) * cos30, y' = z - (x + y) * sin30
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  const isoScale = 60; // pixels per meter

  const project = (x: number, y: number, z: number) => ({
    px: (x - y) * cos30 * isoScale,
    py: -(z * isoScale) + (x + y) * sin30 * isoScale,
  });

  // Calculate all projected points to determine viewBox
  const allPoints: { px: number; py: number }[] = [];
  volumes.forEach(v => {
    v.baseVertices.forEach(bv => {
      allPoints.push(project(bv.x, bv.y, v.zBaseM));
      allPoints.push(project(bv.x, bv.y, v.zTopM));
    });
  });

  const minPx = Math.min(...allPoints.map(p => p.px)) - 40;
  const maxPx = Math.max(...allPoints.map(p => p.px)) + 40;
  const minPy = Math.min(...allPoints.map(p => p.py)) - 40;
  const maxPy = Math.max(...allPoints.map(p => p.py)) + 40;
  const vbW = maxPx - minPx;
  const vbH = maxPy - minPy;

  const COLORS = [
    'hsl(210 70% 55%)', 'hsl(150 60% 45%)', 'hsl(30 80% 55%)',
    'hsl(280 60% 55%)', 'hsl(0 70% 55%)', 'hsl(180 60% 45%)',
    'hsl(60 70% 45%)', 'hsl(330 60% 55%)',
  ];

  return (
    <div className="border rounded-lg bg-muted/10 p-2">
      <div className="flex items-center gap-2 mb-1">
        <Box className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Vista 3D — Espacios de trabajo</span>
        <span className="text-[9px] text-muted-foreground ml-auto">Proyección isométrica</span>
      </div>
      <div className="overflow-auto" style={{ maxHeight: '500px' }}>
        <svg
          viewBox={`${minPx} ${minPy} ${vbW} ${vbH}`}
          className="w-full"
          style={{ minHeight: '300px', maxHeight: '480px' }}
        >
          {/* Grid floor reference */}
          {(() => {
            const g0 = project(0, 0, 0);
            const gx = project(12 * scaleXm, 0, 0);
            const gy = project(0, 12 * scaleYm, 0);
            return (
              <g className="pointer-events-none" opacity={0.3}>
                <line x1={g0.px} y1={g0.py} x2={gx.px} y2={gx.py} stroke="hsl(var(--foreground))" strokeWidth={0.5} strokeDasharray="4 2" />
                <line x1={g0.px} y1={g0.py} x2={gy.px} y2={gy.py} stroke="hsl(var(--foreground))" strokeWidth={0.5} strokeDasharray="4 2" />
                <text x={gx.px + 4} y={gx.py} fontSize={8} fill="hsl(var(--foreground))">X</text>
                <text x={gy.px - 8} y={gy.py} fontSize={8} fill="hsl(var(--foreground))">Y</text>
              </g>
            );
          })()}

          {/* Render each volume */}
          {volumes.map((vol, vi) => {
            const color = COLORS[vi % COLORS.length];
            const bv = vol.baseVertices;
            const n = bv.length;

            // Project base and top vertices
            const baseProj = bv.map(v => project(v.x, v.y, vol.zBaseM));
            const topProj = bv.map(v => project(v.x, v.y, vol.zTopM));

            // Draw bottom polygon (filled translucent)
            const basePath = baseProj.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px},${p.py}`).join(' ') + ' Z';
            const topPath = topProj.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px},${p.py}`).join(' ') + ' Z';

            // Calculate centroid of top face for label
            const topCx = topProj.reduce((s, p) => s + p.px, 0) / n;
            const topCy = topProj.reduce((s, p) => s + p.py, 0) / n;

            return (
              <g key={vol.id}>
                {/* Bottom face */}
                <path d={basePath} fill={`${color} / 0.15`} stroke={color} strokeWidth={1} />

                {/* Vertical edges */}
                {bv.map((_, i) => (
                  <line
                    key={`vert-${i}`}
                    x1={baseProj[i].px} y1={baseProj[i].py}
                    x2={topProj[i].px} y2={topProj[i].py}
                    stroke={color}
                    strokeWidth={1}
                  />
                ))}

                {/* Top face */}
                <path d={topPath} fill={`${color} / 0.25`} stroke={color} strokeWidth={1.5} />

                {/* Side faces (translucent fill) */}
                {bv.map((_, i) => {
                  const j = (i + 1) % n;
                  const sidePath = `M${baseProj[i].px},${baseProj[i].py} L${baseProj[j].px},${baseProj[j].py} L${topProj[j].px},${topProj[j].py} L${topProj[i].px},${topProj[i].py} Z`;
                  return (
                    <path
                      key={`side-${i}`}
                      d={sidePath}
                      fill={`${color} / 0.08`}
                      stroke={color}
                      strokeWidth={0.5}
                    />
                  );
                })}

                {/* Label */}
                <text
                  x={topCx}
                  y={topCy - 4}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={700}
                  fill={color}
                  stroke="white"
                  strokeWidth={0.3}
                >
                  {vol.name}
                </text>
              </g>
            );
          })}

          {/* Z axis indicator */}
          {(() => {
            const z0 = project(0, 0, 0);
            const zTop = project(0, 0, Math.max(...volumes.map(v => v.zTopM), 3));
            return (
              <g className="pointer-events-none" opacity={0.4}>
                <line x1={z0.px} y1={z0.py} x2={zTop.px} y2={zTop.py} stroke="hsl(var(--primary))" strokeWidth={0.8} strokeDasharray="3 2" />
                <text x={zTop.px + 4} y={zTop.py} fontSize={8} fill="hsl(var(--primary))" fontWeight={600}>Z</text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-1.5 px-1">
        {volumes.map((vol, vi) => (
          <div key={vol.id} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm border" style={{ backgroundColor: COLORS[vi % COLORS.length], opacity: 0.6 }} />
            <span className="text-[9px] text-muted-foreground">{vol.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
