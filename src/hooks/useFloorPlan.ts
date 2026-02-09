import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FloorPlanData, RoomData, WallData, OpeningData } from '@/lib/floor-plan-calculations';

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
}

export function useFloorPlan(budgetId: string) {
  const [floorPlan, setFloorPlan] = useState<(DbFloorPlan) | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
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
        setLoading(false);
        return;
      }

      setFloorPlan(fp as DbFloorPlan);

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
          .map((w: any) => ({
            id: w.id,
            wallIndex: w.wall_index,
            wallType: w.wall_type as 'externa' | 'interna' | 'compartida',
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
                positionX: o.position_x,
              })),
          }));

        // Ensure all 4 walls exist
        const walls: WallData[] = [1, 2, 3, 4].map(idx => {
          const existing = roomWalls.find((w: WallData) => w.wallIndex === idx);
          return existing || {
            id: `temp-${r.id}-${idx}`,
            wallIndex: idx,
            wallType: 'interna' as const,
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
          default_height: data.defaultHeight || 2.7,
          external_wall_thickness: data.externalWallThickness || 0.3,
          internal_wall_thickness: data.internalWallThickness || 0.15,
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

  const addRoom = async (name: string, width: number, length: number) => {
    if (!floorPlan) return;
    setSaving(true);
    try {
      // Calculate position: place rooms in a grid
      const maxX = rooms.reduce((max, r) => Math.max(max, r.posX + r.width), 0);
      const posX = rooms.length > 0 ? maxX : 0;

      const { data: room, error } = await supabase
        .from('budget_floor_plan_rooms')
        .insert({
          floor_plan_id: floorPlan.id,
          name,
          width,
          length,
          pos_x: posX,
          pos_y: 0,
          order_index: rooms.length,
        })
        .select()
        .single();

      if (error) throw error;

      // Create 4 default walls
      const wallInserts = [1, 2, 3, 4].map(idx => ({
        room_id: room.id,
        wall_index: idx,
        wall_type: 'interna',
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

  const updateRoom = async (roomId: string, data: { name?: string; width?: number; length?: number; height?: number; posX?: number; posY?: number }) => {
    setSaving(true);
    try {
      const updates: any = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.width !== undefined) updates.width = data.width;
      if (data.length !== undefined) updates.length = data.length;
      if (data.height !== undefined) updates.height = data.height;
      if (data.posX !== undefined) updates.pos_x = data.posX;
      if (data.posY !== undefined) updates.pos_y = data.posY;

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

  const updateWall = async (wallId: string, data: { wallType?: 'externa' | 'interna'; thickness?: number; height?: number }) => {
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

  const addOpening = async (wallId: string, openingType: string, width: number, height: number) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('budget_floor_plan_openings')
        .insert({
          wall_id: wallId,
          opening_type: openingType,
          width,
          height,
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
        { name: 'Puertas (unidades)', manual_units: summary.totalDoors, measurement_unit: 'ud', source: 'plano' },
        { name: 'Ventanas (unidades)', manual_units: summary.totalWindows, measurement_unit: 'ud', source: 'plano' },
      ];

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

  return {
    floorPlan,
    rooms,
    loading,
    saving,
    createFloorPlan,
    updateFloorPlan,
    addRoom,
    updateRoom,
    deleteRoom,
    updateWall,
    addOpening,
    deleteOpening,
    syncToMeasurements,
    getPlanData,
    refetch: fetchAll,
  };
}
