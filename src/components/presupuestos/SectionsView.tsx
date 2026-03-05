import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Grid3x3, ArrowLeftRight, ArrowUpDown, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
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
}

const SECTION_GROUPS = [
  { type: 'vertical' as const, label: 'S. Verticales', icon: Grid3x3, color: 'text-blue-600' },
  { type: 'longitudinal' as const, label: 'S. Longitudinales', icon: ArrowLeftRight, color: 'text-green-600' },
  { type: 'transversal' as const, label: 'S. Transversales', icon: ArrowUpDown, color: 'text-orange-600' },
];

export function SectionsView(props: SectionsViewProps) {
  // All expanded by default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['vertical', 'longitudinal', 'transversal'])
  );

  const toggleGroup = (type: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

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

  const allSections = props.customSections || [];

  return (
    <div className="space-y-2">
      {SECTION_GROUPS.map(group => {
        const Icon = group.icon;
        const count = allSections.filter(s => s.sectionType === group.type).length;
        const isOpen = expandedGroups.has(group.type);

        return (
          <div key={group.type} className="border border-border rounded-lg overflow-hidden">
            {/* Group header */}
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

            {/* Group content */}
            {isOpen && (
              <div className="px-3 py-2 bg-background border-t border-border">
                <CustomSectionManager
                  sectionType={group.type}
                  sections={allSections}
                  onSectionsChange={props.onCustomSectionsChange || (() => {})}
                  scaleConfig={scaleConfig}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
