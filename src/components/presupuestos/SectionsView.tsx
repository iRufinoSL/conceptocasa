import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Grid3x3, ArrowLeftRight, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { FloorPlanGridView } from './FloorPlanGridView';
import { ElevationsGridViewer } from './ElevationsGridViewer';
import { CustomSectionManager, type CustomSection, type ScaleConfig } from './CustomSectionManager';
import type { FloorPlanData, RoomData, FloorLevel, WallType } from '@/lib/floor-plan-calculations';
import type { CustomCorner, ManualElevation } from '@/hooks/useFloorPlan';

// Error boundary to catch ElevationsGridViewer crashes
class ElevationErrorBoundary extends React.Component<
  { children: React.ReactNode; sectionName: string },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error(`[ElevationErrorBoundary:${this.props.sectionName}]`, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm font-medium text-destructive">Error al renderizar: {this.props.sectionName}</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{this.state.error}</p>
            <button
              className="text-xs text-primary underline"
              onClick={() => this.setState({ hasError: false, error: '' })}
            >
              Reintentar
            </button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

interface SectionsViewProps {
  planData: FloorPlanData;
  rooms: RoomData[];
  floors: FloorLevel[];
  budgetName?: string;
  saving: boolean;
  // Grid view props
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
  // Elevation props
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
  // Render child for selected room
  renderSelectedRoom?: () => React.ReactNode;
}

// Compute section names from floors and grid
function computeSectionNames(
  floors: FloorLevel[],
  planData: FloorPlanData,
  rooms: RoomData[]
): {
  vertical: Array<{ id: string; name: string; z: number }>;
  longitudinal: Array<{ id: string; name: string; axis: 'Y'; value: number }>;
  transversal: Array<{ id: string; name: string; axis: 'X'; value: number }>;
} {
  const blockHMm = planData.blockHeightMm || 250;
  const scaleXMm = planData.blockLengthMm || 625;
  const sortedFloors = [...floors].sort((a, b) => a.orderIndex - b.orderIndex);

  // Vertical sections = one per floor level
  const vertical: Array<{ id: string; name: string; z: number }> = [];
  let accZ = 0;
  sortedFloors.forEach(f => {
    vertical.push({ id: f.id, name: f.name || `Nivel ${f.orderIndex + 1}`, z: accZ });
    const floorRooms = rooms.filter(r => r.floorId === f.id);
    const firstH = floorRooms[0]?.height;
    const heightMm = (firstH != null && firstH > 0 ? firstH : planData.defaultHeight) * 1000;
    accZ += Math.round(heightMm / blockHMm);
  });
  if (vertical.length === 0) {
    vertical.push({ id: '_default_', name: 'Nivel 1', z: 0 });
  }

  // Compute grid bounds for named longitudinal/transversal sections
  const placedRooms = rooms.filter(r => r.posX != null && r.posY != null);
  const csm = scaleXMm / 1000;

  const longitudinal: Array<{ id: string; name: string; axis: 'Y'; value: number }> = [];
  const transversal: Array<{ id: string; name: string; axis: 'X'; value: number }> = [];

  if (placedRooms.length > 0) {
    const minX = Math.min(...placedRooms.map(r => Math.round(r.posX! / csm)));
    const maxX = Math.max(...placedRooms.map(r => Math.round((r.posX! + r.width) / csm)));
    const minY = Math.min(...placedRooms.map(r => Math.round(r.posY! / csm)));
    const maxY = Math.max(...placedRooms.map(r => Math.round((r.posY! + r.length) / csm)));

    // Default 4 cardinal faces
    longitudinal.push({ id: 'y-top', name: `Cara Superior (Y${minY})`, axis: 'Y', value: minY });
    longitudinal.push({ id: 'y-bottom', name: `Cara Inferior (Y${maxY})`, axis: 'Y', value: maxY });
    transversal.push({ id: 'x-left', name: `Cara Izquierda (X${minX})`, axis: 'X', value: minX });
    transversal.push({ id: 'x-right', name: `Cara Derecha (X${maxX})`, axis: 'X', value: maxX });
  }

  return { vertical, longitudinal, transversal };
}

export function SectionsView(props: SectionsViewProps) {
  const [sectionType, setSectionType] = useState<'vertical' | 'longitudinal' | 'transversal'>('vertical');

  const sectionNames = useMemo(() =>
    computeSectionNames(props.floors, props.planData, props.rooms),
    [props.floors, props.planData, props.rooms]
  );

  // Build scale config for custom section grids
  const scaleConfig: ScaleConfig = useMemo(() => {
    const scaleX = props.planData.blockLengthMm || 625;
    const scaleY = props.planData.blockLengthMm || 625;
    const scaleZ = props.planData.blockHeightMm || 250;
    const csm = scaleX / 1000;
    const placedRooms = props.rooms.filter(r => r.posX != null && r.posY != null);

    let minX = 0, maxX = 10, minY = 0, maxY = 10, minZ = 0, maxZ = 10;
    if (placedRooms.length > 0) {
      minX = Math.min(...placedRooms.map(r => Math.round(r.posX! / csm)));
      maxX = Math.max(...placedRooms.map(r => Math.round((r.posX! + r.width) / csm)));
      minY = Math.min(...placedRooms.map(r => Math.round(r.posY! / csm)));
      maxY = Math.max(...placedRooms.map(r => Math.round((r.posY! + r.length) / csm)));
      const defaultHMm = (props.planData.defaultHeight || 2.6) * 1000;
      maxZ = Math.ceil(defaultHMm / scaleZ) * (props.floors.length || 1);
    }
    return { scaleX, scaleY, scaleZ, gridRange: { minX, maxX, minY, maxY, minZ, maxZ } };
  }, [props.planData, props.rooms, props.floors]);

  return (
    <div className="space-y-3">
      <Tabs value={sectionType} onValueChange={v => setSectionType(v as any)}>
        <TabsList className="h-8">
          <TabsTrigger value="vertical" className="text-xs h-7 px-3 gap-1">
            <Grid3x3 className="h-3.5 w-3.5" /> S. Verticales
            <Badge variant="secondary" className="text-[9px] h-4 ml-0.5">{sectionNames.vertical.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="longitudinal" className="text-xs h-7 px-3 gap-1">
            <ArrowLeftRight className="h-3.5 w-3.5" /> S. Longitudinales
            <Badge variant="secondary" className="text-[9px] h-4 ml-0.5">{sectionNames.longitudinal.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="transversal" className="text-xs h-7 px-3 gap-1">
            <ArrowUpDown className="h-3.5 w-3.5" /> S. Transversales
            <Badge variant="secondary" className="text-[9px] h-4 ml-0.5">{sectionNames.transversal.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Secciones Verticales = current grid view */}
        <TabsContent value="vertical" className="mt-3 space-y-4">
          {/* Custom named sections */}
          <CustomSectionManager
            sectionType="vertical"
            sections={props.customSections || []}
            onSectionsChange={props.onCustomSectionsChange || (() => {})}
            scaleConfig={scaleConfig}
          />
          <Separator />
          <div className="mb-2">
            <p className="text-[10px] text-muted-foreground font-semibold">
              Por espacio — Planos horizontales a distintas alturas Z.
              {sectionNames.vertical.map(s => ` ${s.name} (Z${s.z})`).join(',')}
            </p>
          </div>
          <div className={`grid gap-4 ${props.selectedRoomId && props.renderSelectedRoom ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            <div className={props.selectedRoomId && props.renderSelectedRoom ? 'lg:col-span-2' : ''}>
              <FloorPlanGridView
                rooms={props.rooms}
                floors={props.floors}
                planWidth={props.planData.width || 12}
                planLength={props.planData.length || 9}
                selectedRoomId={props.selectedRoomId}
                onSelectRoom={props.onSelectRoom}
                onAddRoom={props.onAddRoom}
                onGroupRooms={props.onGroupRooms}
                onUngroupRooms={props.onUngroupRooms}
                onUndo={props.onUndo}
                undoCount={props.undoCount}
                saving={props.saving}
                gridRef={props.gridRef}
                onActiveFloorChange={props.onActiveFloorChange}
                forceActiveFloorId={props.forceActiveFloorId}
                scaleMode={props.planData.scaleMode}
                blockLengthMm={props.planData.blockLengthMm}
                budgetName={props.budgetName}
                customCorners={props.customCorners}
                onCustomCornersChange={props.onCustomCornersChange}
                roofType={props.planData.roofType}
                roofSlopePercent={props.planData.roofSlopePercent}
                roofOverhang={props.planData.roofOverhang}
                defaultHeight={props.planData.defaultHeight}
                onRecalculateSegments={props.onRecalculateSegments}
                onShiftGrid={props.onShiftGrid}
              />
            </div>
            {props.selectedRoomId && props.renderSelectedRoom ? (
              <div className="space-y-4">
                {props.renderSelectedRoom()}
              </div>
            ) : null}
          </div>
        </TabsContent>

        {/* Secciones Longitudinales = Y-axis elevations (Cara Superior/Inferior) */}
        <TabsContent value="longitudinal" className="mt-3 space-y-4">
          {/* Custom named sections */}
          <CustomSectionManager
            sectionType="longitudinal"
            sections={props.customSections || []}
            onSectionsChange={props.onCustomSectionsChange || (() => {})}
            scaleConfig={scaleConfig}
          />
          <Separator />
          <div className="mb-2">
            <p className="text-[10px] text-muted-foreground font-semibold">
              Por espacio — Alzados en el eje Y (longitudinal).
              {sectionNames.longitudinal.map(s => ` ${s.name}`).join(',')}
            </p>
          </div>
          <ElevationErrorBoundary sectionName="Secciones Longitudinales">
            <ElevationsGridViewer
              plan={props.planData}
              rooms={props.rooms}
              floors={props.floors}
              onUpdateOpening={props.onUpdateOpening}
              onAddOpening={props.onAddOpening}
              onDeleteOpening={props.onDeleteOpening}
              onUpdateWall={props.onUpdateWall}
              onUpdateWallSegmentType={props.onUpdateWallSegmentType}
              onAddBlockGroup={props.onAddBlockGroup}
              onDeleteBlockGroup={props.onDeleteBlockGroup}
              onUpdateBlockGroup={props.onUpdateBlockGroup}
              saving={props.saving}
              focusWallId={props.focusWallId}
              budgetName={props.budgetName}
              customCorners={props.customCorners}
              onCustomCornersChange={props.onCustomCornersChange}
              manualElevations={props.manualElevations}
              onManualElevationsChange={props.onManualElevationsChange}
            />
          </ElevationErrorBoundary>
        </TabsContent>

        {/* Secciones Transversales = X-axis elevations (Cara Izquierda/Derecha) */}
        <TabsContent value="transversal" className="mt-3 space-y-4">
          {/* Custom named sections */}
          <CustomSectionManager
            sectionType="transversal"
            sections={props.customSections || []}
            onSectionsChange={props.onCustomSectionsChange || (() => {})}
            scaleConfig={scaleConfig}
          />
          <Separator />
          <div className="mb-2">
            <p className="text-[10px] text-muted-foreground font-semibold">
              Por espacio — Alzados en el eje X (transversal).
              {sectionNames.transversal.map(s => ` ${s.name}`).join(',')}
            </p>
          </div>
          <ElevationErrorBoundary sectionName="Secciones Transversales">
            <ElevationsGridViewer
              plan={props.planData}
              rooms={props.rooms}
              floors={props.floors}
              onUpdateOpening={props.onUpdateOpening}
              onAddOpening={props.onAddOpening}
              onDeleteOpening={props.onDeleteOpening}
              onUpdateWall={props.onUpdateWall}
              onUpdateWallSegmentType={props.onUpdateWallSegmentType}
              onAddBlockGroup={props.onAddBlockGroup}
              onDeleteBlockGroup={props.onDeleteBlockGroup}
              onUpdateBlockGroup={props.onUpdateBlockGroup}
              saving={props.saving}
              budgetName={props.budgetName}
              customCorners={props.customCorners}
              onCustomCornersChange={props.onCustomCornersChange}
              manualElevations={props.manualElevations}
              onManualElevationsChange={props.onManualElevationsChange}
            />
          </ElevationErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
