import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FloorPlanData, RoomData, WallData, OpeningData, WallType, FloorLevel } from '@/lib/floor-plan-calculations';
import { migrateLegacyWallType, autoClassifyWalls, isExteriorType } from '@/lib/floor-plan-calculations';

interface DbFloorPlan {
  id: string;
  budget_id: string;
  name: string;
  width: number;
  length: number;
  default_height: number;
  external_wall_thickness: number;
  internal_wall_thickness: number;
  roof_overhang: number;
  roof_slope_percent: number;
  roof_type: string;
}

interface DbRoom {
  id: string;
  floor_plan_id: string;
  name: string;
  pos_x: number;
  pos_y: number;
  width: number;
  length: number;
  height: number | null;
  order_index: number;
}

interface DbWall {
  id: string;
  room_id: string;
  wall_index: number;
  wall_type: string;
  thickness: number | null;
  height: number | null;
}

interface DbOpening {
  id: string;
  wall_id: string;
  opening_type: string;
  name: string | null;
  width: number;
  height: number;
  position_x: number;
  sill_height: number;
}

/** Map space m2 to predefined width×length */
function getPresetDimensions(m2: number): { width: number; length: number } {
  // Use known presets
  const presets: Array<{ m2: number; width: number; length: number }> = [
    { m2: 9, width: 3, length: 3 },
    { m2: 12, width: 4, length: 3 },
    { m2: 20, width: 5, length: 4 },
    { m2: 4, width: 2, length: 2 },
    { m2: 6, width: 3, length: 2 },
    { m2: 8, width: 4, length: 2 },
    { m2: 30, width: 6, length: 5 },
    { m2: 10, width: 5, length: 2 },
    { m2: 15, width: 5, length: 3 },
  ];
  const match = presets.find(p => p.m2 === m2);
  if (match) return { width: match.width, length: match.length };
  // Fallback: closest rectangle with integer sides
  const side = Math.ceil(Math.sqrt(m2));
  const length = Math.max(1, Math.ceil(m2 / side));
  return { width: side, length };
}

function calcGridPositions(spaces: Array<{ m2: number; gridCol: number; gridRow: number }>) {
  // For 1m grid: if gridCol/gridRow are 0, the space is "unplaced" (posX=-1, posY=-1)
  // Otherwise place at gridCol-1, gridRow-1 in meters
  return spaces.map(s => {
    const dims = getPresetDimensions(s.m2);
    if (s.gridCol <= 0 || s.gridRow <= 0) {
      // Unplaced - use negative position as marker
      return { width: dims.width, length: dims.length, posX: -1, posY: -1 };
    }
    return { width: dims.width, length: dims.length, posX: s.gridCol - 1, posY: s.gridRow - 1 };
  });
}

export function useFloorPlan(budgetId: string) {
  const [floorPlan, setFloorPlan] = useState<(DbFloorPlan) | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [floors, setFloors] = useState<FloorLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch floor plan
      const { data: fp } = await supabase
        .from('budget_floor_plans')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!fp) {
        setFloorPlan(null);
        setRooms([]);
        setFloors([]);
        setLoading(false);
        return;
      }

      setFloorPlan(fp as DbFloorPlan);

      // Fetch floors
      const { data: floorsData } = await supabase
        .from('budget_floors')
        .select('*')
        .eq('floor_plan_id', fp.id)
        .order('order_index');

      const floorLevels: FloorLevel[] = (floorsData || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        level: f.level,
        orderIndex: f.order_index,
      }));
      setFloors(floorLevels);

      // Fetch rooms
      const { data: roomsData } = await supabase
        .from('budget_floor_plan_rooms')
        .select('*')
        .eq('floor_plan_id', fp.id)
        .order('order_index');

      if (!roomsData || roomsData.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const roomIds = roomsData.map(r => r.id);

      // Fetch walls
      const { data: wallsData } = await supabase
        .from('budget_floor_plan_walls')
        .select('*')
        .in('room_id', roomIds)
        .order('wall_index');

      const wallIds = (wallsData || []).map(w => w.id);

      // Fetch openings
      let openingsData: DbOpening[] = [];
      if (wallIds.length > 0) {
        const { data } = await supabase
          .from('budget_floor_plan_openings')
          .select('*')
          .in('wall_id', wallIds);
        openingsData = (data || []) as DbOpening[];
      }

      // Build tree
      const roomTree: RoomData[] = roomsData.map((r: any) => {
        const roomWalls = (wallsData || [])
          .filter((w: any) => w.room_id === r.id)
          .map((w: any) => {
            // Migrate legacy wall type names
            const wallType = migrateLegacyWallType(w.wall_type as string);
            return {
              id: w.id,
              wallIndex: w.wall_index,
              wallType,
              thickness: w.thickness || undefined,
              height: w.height || undefined,
              openings: openingsData
                .filter(o => o.wall_id === w.id)
                .map(o => ({
                  id: o.id,
                  openingType: o.opening_type as any,
                  name: o.name || undefined,
                  width: o.width,
                  height: o.height,
                  sillHeight: o.sill_height ?? 0,
                  positionX: o.position_x,
                })),
            };
          });

        // Ensure all 4 walls exist
        const walls: WallData[] = [1, 2, 3, 4].map(idx => {
          const existing = roomWalls.find((w: WallData) => w.wallIndex === idx);
          return existing || {
            id: `temp-${r.id}-${idx}`,
            wallIndex: idx,
            wallType: 'interior' as WallType,
            openings: [],
          };
        });

        return {
          id: r.id,
          name: r.name,
          posX: Number(r.pos_x),
          posY: Number(r.pos_y),
          width: Number(r.width),
          length: Number(r.length),
          height: r.height ? Number(r.height) : undefined,
          hasFloor: r.has_floor !== false,
          hasCeiling: r.has_ceiling !== false,
          hasRoof: r.has_roof !== false,
          floorId: (r as any).floor_id || undefined,
          groupId: (r as any).group_id || undefined,
          groupName: (r as any).group_name || undefined,
          walls,
        };
      });

      setRooms(roomTree);
    } catch (err) {
      console.error('Error fetching floor plan:', err);
      toast.error('Error al cargar el plano');
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createFloorPlan = async (data: Partial<FloorPlanData>) => {
    setSaving(true);
    try {
      const { data: fp, error } = await supabase
        .from('budget_floor_plans')
        .insert({
          budget_id: budgetId,
          width: data.width || 12,
          length: data.length || 9,
        default_height: data.defaultHeight || 2.5,
        external_wall_thickness: data.externalWallThickness || 0.25,
        internal_wall_thickness: data.internalWallThickness || 0.13,
          roof_overhang: data.roofOverhang || 0.6,
          roof_slope_percent: data.roofSlopePercent || 20,
          roof_type: data.roofType || 'dos_aguas',
        })
        .select()
        .single();

      if (error) throw error;
      setFloorPlan(fp as DbFloorPlan);
      toast.success('Plano creado');
      return fp;
    } catch (err) {
      console.error('Error creating floor plan:', err);
      toast.error('Error al crear el plano');
    } finally {
      setSaving(false);
    }
  };

  const updateFloorPlan = async (data: Partial<FloorPlanData>) => {
    if (!floorPlan) return;
    setSaving(true);
    try {
      const updates: any = {};
      if (data.width !== undefined) updates.width = data.width;
      if (data.length !== undefined) updates.length = data.length;
      if (data.defaultHeight !== undefined) updates.default_height = data.defaultHeight;
      if (data.externalWallThickness !== undefined) updates.external_wall_thickness = data.externalWallThickness;
      if (data.internalWallThickness !== undefined) updates.internal_wall_thickness = data.internalWallThickness;
      if (data.roofOverhang !== undefined) updates.roof_overhang = data.roofOverhang;
      if (data.roofSlopePercent !== undefined) updates.roof_slope_percent = data.roofSlopePercent;
      if (data.roofType !== undefined) updates.roof_type = data.roofType;

      const { error } = await supabase
        .from('budget_floor_plans')
        .update(updates)
        .eq('id', floorPlan.id);

      if (error) throw error;
      setFloorPlan({ ...floorPlan, ...updates });
    } catch (err) {
      console.error('Error updating floor plan:', err);
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const addRoom = async (name: string, width: number, length: number, floorId?: string, gridCol?: number, gridRow?: number) => {
    if (!floorPlan) return;
    setSaving(true);
    try {
      // Calculate position based on grid coordinate (1m grid: posX = col-1, posY = row-1)
      let posX = -1;
      let posY = -1;

      if (gridCol && gridRow && gridCol > 0 && gridRow > 0) {
        posX = gridCol - 1;
        posY = gridRow - 1;
      }
      // If no coordinate given, room stays "unplaced" (posX=-1) → appears in staging header

      const { data: room, error } = await supabase
        .from('budget_floor_plan_rooms')
        .insert({
          floor_plan_id: floorPlan.id,
          floor_id: floorId || null,
          name,
          width,
          length,
          pos_x: Math.round(posX * 100) / 100,
          pos_y: Math.round(posY * 100) / 100,
          order_index: rooms.length,
        })
        .select()
        .single();

      if (error) throw error;

      // Create 4 default walls
      const wallInserts = [1, 2, 3, 4].map(idx => ({
        room_id: room.id,
        wall_index: idx,
        wall_type: 'interior',
      }));

      const { data: walls, error: wallError } = await supabase
        .from('budget_floor_plan_walls')
        .insert(wallInserts)
        .select();

      if (wallError) throw wallError;

      await fetchAll();
      toast.success(`Habitación "${name}" añadida`);
    } catch (err) {
      console.error('Error adding room:', err);
      toast.error('Error al añadir habitación');
    } finally {
      setSaving(false);
    }
  };

  const updateRoom = async (roomId: string, data: { name?: string; width?: number; length?: number; height?: number; posX?: number; posY?: number; hasFloor?: boolean; hasCeiling?: boolean; hasRoof?: boolean; floorId?: string | null }) => {
    setSaving(true);
    try {
      const updates: any = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.width !== undefined) updates.width = data.width;
      if (data.length !== undefined) updates.length = data.length;
      if (data.height !== undefined) updates.height = data.height;
      if (data.posX !== undefined) updates.pos_x = data.posX;
      if (data.posY !== undefined) updates.pos_y = data.posY;
      if (data.hasFloor !== undefined) updates.has_floor = data.hasFloor;
      if (data.hasCeiling !== undefined) updates.has_ceiling = data.hasCeiling;
      if (data.hasRoof !== undefined) updates.has_roof = data.hasRoof;
      if (data.floorId !== undefined) updates.floor_id = data.floorId;

      const { error } = await supabase
        .from('budget_floor_plan_rooms')
        .update(updates)
        .eq('id', roomId);

      if (error) throw error;
      await fetchAll();
    } catch (err) {
      console.error('Error updating room:', err);
      toast.error('Error al actualizar habitación');
    } finally {
      setSaving(false);
    }
  };

  const deleteRoom = async (roomId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('budget_floor_plan_rooms')
        .delete()
        .eq('id', roomId);

      if (error) throw error;
      await fetchAll();
      toast.success('Habitación eliminada');
    } catch (err) {
      console.error('Error deleting room:', err);
      toast.error('Error al eliminar habitación');
    } finally {
      setSaving(false);
    }
  };

  const updateWall = async (wallId: string, data: { wallType?: WallType; thickness?: number; height?: number }) => {
    setSaving(true);
    try {
      const updates: any = {};
      if (data.wallType !== undefined) updates.wall_type = data.wallType;
      if (data.thickness !== undefined) updates.thickness = data.thickness;
      if (data.height !== undefined) updates.height = data.height;

      const { error } = await supabase
        .from('budget_floor_plan_walls')
        .update(updates)
        .eq('id', wallId);

      if (error) throw error;
      await fetchAll();
    } catch (err) {
      console.error('Error updating wall:', err);
      toast.error('Error al actualizar pared');
    } finally {
      setSaving(false);
    }
  };

  const addOpening = async (wallId: string, openingType: string, width: number, height: number, sillHeight?: number) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('budget_floor_plan_openings')
        .insert({
          wall_id: wallId,
          opening_type: openingType,
          width,
          height,
          sill_height: sillHeight ?? 0,
          position_x: 0.5,
        });

      if (error) throw error;
      await fetchAll();
      toast.success('Abertura añadida');
    } catch (err) {
      console.error('Error adding opening:', err);
      toast.error('Error al añadir abertura');
    } finally {
      setSaving(false);
    }
  };

  const deleteOpening = async (openingId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('budget_floor_plan_openings')
        .delete()
        .eq('id', openingId);

      if (error) throw error;
      await fetchAll();
    } catch (err) {
      console.error('Error deleting opening:', err);
      toast.error('Error al eliminar abertura');
    } finally {
      setSaving(false);
    }
  };

  const updateOpening = async (openingId: string, data: { openingType?: string; width?: number; height?: number; sillHeight?: number; positionX?: number }) => {
    setSaving(true);
    try {
      const updates: any = {};
      if (data.openingType !== undefined) updates.opening_type = data.openingType;
      if (data.width !== undefined) updates.width = data.width;
      if (data.height !== undefined) updates.height = data.height;
      if (data.sillHeight !== undefined) updates.sill_height = data.sillHeight;
      if (data.positionX !== undefined) updates.position_x = data.positionX;

      const { error } = await supabase
        .from('budget_floor_plan_openings')
        .update(updates)
        .eq('id', openingId);

      if (error) throw error;
      await fetchAll();
    } catch (err) {
      console.error('Error updating opening:', err);
      toast.error('Error al actualizar abertura');
    } finally {
      setSaving(false);
    }
  };

  const syncToMeasurements = async () => {
    if (!floorPlan) return;
    setSaving(true);
    try {
      // Import calculation
      const { calculateFloorPlanSummary } = await import('@/lib/floor-plan-calculations');
      
      const planData: FloorPlanData = {
        width: Number(floorPlan.width),
        length: Number(floorPlan.length),
        defaultHeight: Number(floorPlan.default_height),
        externalWallThickness: Number(floorPlan.external_wall_thickness),
        internalWallThickness: Number(floorPlan.internal_wall_thickness),
        roofOverhang: Number(floorPlan.roof_overhang),
        roofSlopePercent: Number(floorPlan.roof_slope_percent),
        roofType: floorPlan.roof_type as any,
      };

      const summary = calculateFloorPlanSummary(planData, rooms);

      // Create measurements for each calculated surface
      const measurements = [
        { name: 'Planta total', manual_units: summary.plantaTotalM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Superficie útil total', manual_units: summary.totalUsableM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Superficie construida', manual_units: summary.totalBuiltM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Tejado', manual_units: summary.roofM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Paredes externas', manual_units: summary.totalExternalWallM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Paredes internas', manual_units: summary.totalInternalWallM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Suelos útiles', manual_units: summary.totalFloorM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Techos', manual_units: summary.totalCeilingM2, measurement_unit: 'm2', source: 'plano' },
        { name: 'Base paredes externas', manual_units: summary.totalExternalWallBaseM, measurement_unit: 'ml', source: 'plano' },
        { name: 'Base paredes internas', manual_units: summary.totalInternalWallBaseM, measurement_unit: 'ml', source: 'plano' },
        { name: 'Puertas (total)', manual_units: summary.totalDoors, measurement_unit: 'ud', source: 'plano' },
        { name: 'Ventanas (total)', manual_units: summary.totalWindows, measurement_unit: 'ud', source: 'plano' },
      ];

      // Add detailed per-type opening measurements
      const { OPENING_PRESETS } = await import('@/lib/floor-plan-calculations');
      Object.entries(summary.openingsByType).forEach(([type, count]) => {
        const label = OPENING_PRESETS[type as keyof typeof OPENING_PRESETS]?.label || type;
        measurements.push({
          name: `${label} (unidades)`,
          manual_units: count,
          measurement_unit: 'ud',
          source: 'plano',
        });
      });

      // Per-room measurements
      summary.rooms.forEach(rc => {
        measurements.push(
          { name: `${rc.roomName} - Suelo`, manual_units: rc.floorArea, measurement_unit: 'm2', source: 'plano' },
          { name: `${rc.roomName} - Techo`, manual_units: rc.ceilingArea, measurement_unit: 'm2', source: 'plano' },
        );
        rc.walls.forEach(w => {
          if (w.netArea > 0) {
            const wallLabel = w.wallIndex === 1 ? 'Superior' : w.wallIndex === 2 ? 'Derecha' : w.wallIndex === 3 ? 'Inferior' : 'Izquierda';
            measurements.push({
              name: `${rc.roomName} - Pared ${wallLabel} (${w.wallType})`,
              manual_units: w.netArea,
              measurement_unit: 'm2',
              source: 'plano',
            });
          }
        });
      });

      // Delete old plano-sourced measurements
      await supabase
        .from('budget_measurements')
        .delete()
        .eq('budget_id', budgetId)
        .eq('source', 'plano');

      // Insert new
      const { error } = await supabase
        .from('budget_measurements')
        .insert(measurements.map(m => ({ ...m, budget_id: budgetId })));

      if (error) throw error;

      // Also sync rooms to budget_spaces
      await supabase
        .from('budget_spaces')
        .delete()
        .eq('budget_id', budgetId);

      const spaces = rooms.map(r => ({
        budget_id: budgetId,
        name: r.name,
        space_type: 'habitacion',
        level: 'planta_baja',
        m2_built: r.width * r.length,
        m2_livable: r.width * r.length,
      }));

      if (spaces.length > 0) {
        await supabase.from('budget_spaces').insert(spaces);
      }

      toast.success(`Sincronizadas ${measurements.length} mediciones y ${spaces.length} espacios`);
      window.dispatchEvent(new CustomEvent('budget-recalculated'));
    } catch (err) {
      console.error('Error syncing:', err);
      toast.error('Error al sincronizar mediciones');
    } finally {
      setSaving(false);
    }
  };

  // Auto-classify perimeter walls as 'externa' in DB
  const classifyPerimeterWalls = async () => {
    if (!floorPlan || rooms.length === 0) return;
    setSaving(true);
    try {
      const classification = autoClassifyWalls(rooms);
      let updated = 0;
      for (const room of rooms) {
        for (const wall of room.walls) {
          if (wall.id.startsWith('temp-')) continue;
          const key = `${room.id}::${wall.wallIndex}`;
          const autoType = classification.get(key);
          if (!autoType) continue;
          // Only update if the auto-classification differs from stored type
          if (wall.wallType !== autoType) {
            const { error } = await supabase
              .from('budget_floor_plan_walls')
              .update({ wall_type: autoType })
              .eq('id', wall.id);
            if (error) throw error;
            updated++;
          }
        }
      }
      await fetchAll();
      toast.success(`${updated} paredes actualizadas automáticamente`);
    } catch (err) {
      console.error('Error classifying walls:', err);
      toast.error('Error al clasificar paredes');
    } finally {
      setSaving(false);
    }
  };

  // --- Undo system: up to 3 snapshots ---
  const undoStackRef = useRef<Array<Array<{ id: string; posX: number; posY: number; width: number; length: number }>>>([]);
  const [undoCount, setUndoCount] = useState(0);

  const pushUndoSnapshot = () => {
    const snapshot = rooms.map(r => ({ id: r.id, posX: r.posX, posY: r.posY, width: r.width, length: r.length }));
    undoStackRef.current = [...undoStackRef.current.slice(-2), snapshot];
    setUndoCount(undoStackRef.current.length);
  };

  const undoLastChange = async () => {
    if (undoStackRef.current.length === 0) return;
    const snapshot = undoStackRef.current.pop()!;
    setUndoCount(undoStackRef.current.length);
    setSaving(true);
    try {
      for (const s of snapshot) {
        await supabase
          .from('budget_floor_plan_rooms')
          .update({ pos_x: s.posX, pos_y: s.posY, width: s.width, length: s.length } as any)
          .eq('id', s.id);
      }
      await fetchAll();
      toast.success('Cambio deshecho');
    } catch (err) {
      console.error('Error undoing:', err);
      toast.error('Error al deshacer');
    } finally {
      setSaving(false);
    }
  };

  // Duplicate a room with all its characteristics (walls, openings)
  // direction: 'right' places copy 1 grid cell away, displacing any occupant
  // autoGroup: if true, groups copy with the original automatically
  const duplicateRoom = async (roomId: string, direction: 'right' | 'down' = 'right', autoGroup = true) => {
    if (!floorPlan) return;
    const sourceRoom = rooms.find(r => r.id === roomId);
    if (!sourceRoom) return;
    pushUndoSnapshot();
    setSaving(true);
    try {
      // Generate new name
      const baseName = sourceRoom.name.replace(/\s*\(copia.*\)$/, '');
      const existingCopies = rooms.filter(r => r.name.startsWith(baseName) && r.id !== roomId).length;
      const newName = `${baseName} (copia${existingCopies > 0 ? ` ${existingCopies + 1}` : ''})`;

      // 1m grid: posX/posY are in meters, col = posX + width, row = posY + length
      const sameFloorRooms = rooms.filter(r => (r.floorId || null) === (sourceRoom.floorId || null));

      let targetPosX: number;
      let targetPosY: number;

      if (direction === 'right') {
        targetPosX = Math.round(sourceRoom.posX + sourceRoom.width);
        targetPosY = Math.round(sourceRoom.posY);
      } else {
        targetPosX = Math.round(sourceRoom.posX);
        targetPosY = Math.round(sourceRoom.posY + sourceRoom.length);
      }

      // Check for occupant at the target position and displace it
      const THRESHOLD = 0.5;
      const occupant = sameFloorRooms.find(r =>
        r.id !== roomId &&
        Math.abs(r.posX - targetPosX) < THRESHOLD &&
        Math.abs(r.posY - targetPosY) < THRESHOLD
      );
      if (occupant) {
        const shiftX = direction === 'right' ? Math.round(occupant.width) : 0;
        const shiftY = direction === 'down' ? Math.round(occupant.length) : 0;
        await supabase
          .from('budget_floor_plan_rooms')
          .update({
            pos_x: Math.round((occupant.posX + shiftX) * 100) / 100,
            pos_y: Math.round((occupant.posY + shiftY) * 100) / 100,
          } as any)
          .eq('id', occupant.id);
      }

      // Determine group: use existing groupId or create a new one
      const groupId = sourceRoom.groupId || crypto.randomUUID();
      const groupName = sourceRoom.groupName || sourceRoom.name;

      // Ensure dimensions are valid (defensive)
      const copyWidth = sourceRoom.width > 0 ? sourceRoom.width : 1;
      const copyLength = sourceRoom.length > 0 ? sourceRoom.length : 1;

      const insertData: any = {
        floor_plan_id: floorPlan.id,
        name: newName,
        width: copyWidth,
        length: copyLength,
        height: sourceRoom.height || null,
        pos_x: targetPosX,
        pos_y: targetPosY,
        order_index: rooms.length,
        has_floor: sourceRoom.hasFloor !== false,
        has_ceiling: sourceRoom.hasCeiling !== false,
        has_roof: sourceRoom.hasRoof !== false,
        floor_id: sourceRoom.floorId || null,
      };

      if (autoGroup) {
        insertData.group_id = groupId;
        insertData.group_name = groupName;
      }

      const { data: newRoom, error: roomError } = await supabase
        .from('budget_floor_plan_rooms')
        .insert(insertData)
        .select()
        .single();

      if (roomError) throw roomError;

      // Copy walls
      for (const wall of sourceRoom.walls) {
        const wallData: any = {
          room_id: newRoom.id,
          wall_index: wall.wallIndex,
          wall_type: wall.wallType || 'interior',
        };
        if (wall.thickness) wallData.thickness = wall.thickness;
        if (wall.height) wallData.height = wall.height;

        const { data: newWall, error: wallError } = await supabase
          .from('budget_floor_plan_walls')
          .insert(wallData)
          .select()
          .single();

        if (wallError) throw wallError;

        // Copy openings
        for (const op of wall.openings) {
          const { error: opError } = await supabase
            .from('budget_floor_plan_openings')
            .insert({
              wall_id: newWall.id,
              opening_type: op.openingType,
              name: op.name || null,
              width: op.width,
              height: op.height,
              sill_height: op.sillHeight ?? 0,
              position_x: op.positionX,
            });
          if (opError) throw opError;
        }
      }

      // If autoGroup and source room wasn't already in a group, update source to join the new group
      if (autoGroup && !sourceRoom.groupId) {
        await supabase
          .from('budget_floor_plan_rooms')
          .update({ group_id: groupId, group_name: groupName } as any)
          .eq('id', sourceRoom.id);
      }

      await fetchAll();
      toast.success(`"${newName}" duplicado hacia ${direction === 'right' ? 'la derecha' : 'abajo'}`);
      return newRoom.id;
    } catch (err) {
      console.error('Error duplicating room:', err);
      toast.error('Error al duplicar habitación');
    } finally {
      setSaving(false);
    }
  };

  const getPlanData = (): FloorPlanData | null => {
    if (!floorPlan) return null;
    return {
      width: Number(floorPlan.width),
      length: Number(floorPlan.length),
      defaultHeight: Number(floorPlan.default_height),
      externalWallThickness: Number(floorPlan.external_wall_thickness),
      internalWallThickness: Number(floorPlan.internal_wall_thickness),
      roofOverhang: Number(floorPlan.roof_overhang),
      roofSlopePercent: Number(floorPlan.roof_slope_percent),
      roofType: floorPlan.roof_type as any,
    };
  };

  // Floor CRUD
  const addFloor = async (name: string, level: string) => {
    if (!floorPlan) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('budget_floors')
        .insert({
          floor_plan_id: floorPlan.id,
          name,
          level,
          order_index: floors.length,
        });
      if (error) throw error;
      await fetchAll();
      toast.success(`Planta "${name}" creada`);
    } catch (err) {
      console.error('Error adding floor:', err);
      toast.error('Error al añadir planta');
    } finally {
      setSaving(false);
    }
  };

  const updateFloor = async (floorId: string, data: { name?: string; level?: string; orderIndex?: number }) => {
    setSaving(true);
    try {
      const updates: any = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.level !== undefined) updates.level = data.level;
      if (data.orderIndex !== undefined) updates.order_index = data.orderIndex;
      const { error } = await supabase.from('budget_floors').update(updates).eq('id', floorId);
      if (error) throw error;
      await fetchAll();
    } catch (err) {
      console.error('Error updating floor:', err);
      toast.error('Error al actualizar planta');
    } finally {
      setSaving(false);
    }
  };

  const deleteFloor = async (floorId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('budget_floors').delete().eq('id', floorId);
      if (error) throw error;
      await fetchAll();
      toast.success('Planta eliminada');
    } catch (err) {
      console.error('Error deleting floor:', err);
      toast.error('Error al eliminar planta');
    } finally {
      setSaving(false);
    }
  };

  // Auto-create default floors based on roof type
  const autoCreateFloors = async () => {
    if (!floorPlan || floors.length > 0) return;
    setSaving(true);
    try {
      const planData = getPlanData();
      const isFlat = planData?.roofType === 'plana' || planData?.roofSlopePercent === 0;
      
      const defaultFloors = [
        { floor_plan_id: floorPlan.id, name: 'Planta 1', level: 'planta_1', order_index: 0 },
      ];
      if (!isFlat) {
        defaultFloors.push({ floor_plan_id: floorPlan.id, name: 'Bajo cubierta', level: 'bajo_cubierta', order_index: 1 });
      }
      
      const { error } = await supabase.from('budget_floors').insert(defaultFloors);
      if (error) throw error;
      await fetchAll();
      toast.success('Plantas creadas automáticamente');
    } catch (err) {
      console.error('Error auto-creating floors:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteFloorPlan = async () => {
    if (!floorPlan) return;
    setSaving(true);
    try {
      await supabase.from('budget_floor_plan_rooms').delete().eq('floor_plan_id', floorPlan.id);
      await supabase.from('budget_floors').delete().eq('floor_plan_id', floorPlan.id);
      const { error } = await supabase.from('budget_floor_plans').delete().eq('id', floorPlan.id);
      if (error) throw error;
      setFloorPlan(null);
      setRooms([]);
      setFloors([]);
      toast.success('Plano eliminado');
    } catch (err) {
      console.error('Error deleting floor plan:', err);
      toast.error('Error al eliminar plano');
    } finally {
      setSaving(false);
    }
  };

  const generateFromTemplate = async (
    planConfig: {
      defaultHeight: number;
      externalWallThickness: number;
      internalWallThickness: number;
      roofOverhang: number;
      roofSlopePercent: number;
      roofType: string;
    },
    floorDefs: Array<{
      name: string;
      level: string;
      m2: number;
      spaces: Array<{ name: string; m2: number; gridCol: number; gridRow: number }>;
    }>
  ) => {
    setSaving(true);
    try {
      if (floorPlan) {
        await supabase.from('budget_floor_plan_rooms').delete().eq('floor_plan_id', floorPlan.id);
        await supabase.from('budget_floors').delete().eq('floor_plan_id', floorPlan.id);
        await supabase.from('budget_floor_plans').delete().eq('id', floorPlan.id);
      }

      // Use the floor m2 value directly for plan dimensions
      const maxFloorM2 = Math.max(...floorDefs.map(f => f.m2 || f.spaces.reduce((s, sp) => s + sp.m2, 0)), 1);
      // Create a rectangular grid: use reasonable aspect ratio (e.g. 1.2:1)
      const planWidth = Math.ceil(Math.sqrt(maxFloorM2 * 1.2));
      const planLength = Math.ceil(maxFloorM2 / planWidth);

      const { data: fp, error: fpError } = await supabase
        .from('budget_floor_plans')
        .insert({
          budget_id: budgetId,
          width: planWidth,
          length: planLength,
          default_height: planConfig.defaultHeight,
          external_wall_thickness: planConfig.externalWallThickness,
          internal_wall_thickness: planConfig.internalWallThickness,
          roof_overhang: planConfig.roofOverhang,
          roof_slope_percent: planConfig.roofSlopePercent,
          roof_type: planConfig.roofType,
        })
        .select()
        .single();
      if (fpError) throw fpError;

      for (let fi = 0; fi < floorDefs.length; fi++) {
        const fd = floorDefs[fi];
        const { data: floor, error: flError } = await supabase
          .from('budget_floors')
          .insert({ floor_plan_id: fp.id, name: fd.name, level: fd.level, order_index: fi })
          .select()
          .single();
        if (flError) throw flError;

        const positions = calcGridPositions(fd.spaces);

        for (let si = 0; si < fd.spaces.length; si++) {
          const space = fd.spaces[si];
          const pos = positions[si];
          const { data: room, error: rError } = await supabase
            .from('budget_floor_plan_rooms')
            .insert({
              floor_plan_id: fp.id,
              floor_id: floor.id,
              name: space.name,
              width: pos.width,
              length: pos.length,
              pos_x: pos.posX,
              pos_y: pos.posY,
              order_index: space.gridCol * 100 + space.gridRow,
            })
            .select()
            .single();
          if (rError) throw rError;

          await supabase
            .from('budget_floor_plan_walls')
            .insert([1, 2, 3, 4].map(idx => ({
              room_id: room.id,
              wall_index: idx,
              wall_type: 'interior',
            })));
        }
      }

      await fetchAll();
      setTimeout(() => classifyPerimeterWalls(), 500);
      toast.success('Plano generado correctamente');
    } catch (err) {
      console.error('Error generating floor plan:', err);
      toast.error('Error al generar el plano');
    } finally {
      setSaving(false);
    }
  };

  // Group/ungroup rooms
  const groupRooms = async (roomIds: string[], groupName: string) => {
    if (roomIds.length < 2) return;
    setSaving(true);
    try {
      const groupId = crypto.randomUUID();
      const { error } = await supabase
        .from('budget_floor_plan_rooms')
        .update({ group_id: groupId, group_name: groupName } as any)
        .in('id', roomIds);
      if (error) throw error;
      await fetchAll();
      toast.success(`${roomIds.length} espacios agrupados como "${groupName}"`);
    } catch (err) {
      console.error('Error grouping rooms:', err);
      toast.error('Error al agrupar espacios');
    } finally {
      setSaving(false);
    }
  };

  const ungroupRooms = async (groupId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('budget_floor_plan_rooms')
        .update({ group_id: null, group_name: null } as any)
        .eq('group_id', groupId);
      if (error) throw error;
      await fetchAll();
      toast.success('Grupo disuelto');
    } catch (err) {
      console.error('Error ungrouping rooms:', err);
      toast.error('Error al desagrupar');
    } finally {
      setSaving(false);
    }
  };

  return {
    floorPlan,
    rooms,
    floors,
    loading,
    saving,
    createFloorPlan,
    updateFloorPlan,
    addRoom,
    updateRoom,
    deleteRoom,
    duplicateRoom,
    updateWall,
    addOpening,
    updateOpening,
    deleteOpening,
    classifyPerimeterWalls,
    syncToMeasurements,
    getPlanData,
    addFloor,
    updateFloor,
    deleteFloor,
    autoCreateFloors,
    deleteFloorPlan,
    generateFromTemplate,
    groupRooms,
    ungroupRooms,
    undoLastChange,
    undoCount,
    refetch: fetchAll,
  };
}
