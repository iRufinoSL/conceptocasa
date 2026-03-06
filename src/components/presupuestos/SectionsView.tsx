import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Grid3x3, ArrowLeftRight, ArrowUpDown, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CustomSectionManager, type CustomSection, type ScaleConfig } from './CustomSectionManager';
import type { FloorPlanData, RoomData, FloorLevel, WallType } from '@/lib/floor-plan-calculations';
import type { CustomCorner, ManualElevation } from '@/hooks/useFloorPlan';

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

export function SectionsView(props: SectionsViewProps) {
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

  const allSections = props.customSections || [];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={async () => { await props.onRefresh?.(); toast.success('Secciones actualizadas'); }} title="Actualizar secciones">
          <RefreshCw className="h-3 w-3" /> Actualizar
        </Button>
      </div>
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
                  rooms={props.rooms}
                  budgetName={props.budgetName}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
