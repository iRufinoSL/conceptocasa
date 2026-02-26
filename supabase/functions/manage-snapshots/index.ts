import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SnapshotRequest {
  action: 'create' | 'restore' | 'list' | 'cleanup';
  budget_id: string;
  module: 'plano' | 'actividades' | 'recursos';
  snapshot_type?: 'auto' | 'manual' | 'daily_first' | 'daily_mid' | 'daily_last';
  snapshot_id?: string;
  label?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    
    // Validate action
    const validActions = ['create', 'restore', 'list', 'cleanup'];
    if (!body.action || !validActions.includes(body.action)) {
      return new Response(JSON.stringify({ error: 'Acción no válida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate budget_id is UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!body.budget_id || !uuidRegex.test(body.budget_id)) {
      return new Response(JSON.stringify({ error: 'budget_id inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate module
    const validModules = ['plano', 'actividades', 'recursos'];
    if (!body.module || !validModules.includes(body.module)) {
      return new Response(JSON.stringify({ error: 'Módulo no válido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate snapshot_id if provided
    if (body.snapshot_id && !uuidRegex.test(body.snapshot_id)) {
      return new Response(JSON.stringify({ error: 'snapshot_id inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate label length
    if (body.label && (typeof body.label !== 'string' || body.label.length > 200)) {
      return new Response(JSON.stringify({ error: 'Label demasiado largo (máx 200 caracteres)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has budget access
    const { data: budgetAccess } = await userClient
      .from('presupuestos')
      .select('id')
      .eq('id', body.budget_id)
      .maybeSingle();

    if (!budgetAccess) {
      return new Response(JSON.stringify({ error: 'Sin acceso al presupuesto' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, budget_id, module } = body as SnapshotRequest;

    if (action === 'list') {
      const { data, error } = await supabase
        .from('module_snapshots')
        .select('id, module, snapshot_type, label, created_at')
        .eq('budget_id', budget_id)
        .eq('module', module)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return new Response(JSON.stringify({ snapshots: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create') {
      const snapshotData = await captureModuleData(supabase, budget_id, module);
      
      const { data, error } = await supabase
        .from('module_snapshots')
        .insert({
          budget_id,
          module,
          snapshot_type: body.snapshot_type || 'manual',
          snapshot_data: snapshotData,
          label: body.label || null,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Cleanup: keep only 3 most recent auto snapshots
      if (body.snapshot_type === 'auto') {
        const { data: autos } = await supabase
          .from('module_snapshots')
          .select('id')
          .eq('budget_id', budget_id)
          .eq('module', module)
          .eq('snapshot_type', 'auto')
          .order('created_at', { ascending: false });

        if (autos && autos.length > 3) {
          const toDelete = autos.slice(3).map(s => s.id);
          await supabase.from('module_snapshots').delete().in('id', toDelete);
        }
      }

      return new Response(JSON.stringify({ id: data.id, message: 'Snapshot creado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'restore') {
      if (!body.snapshot_id) {
        return new Response(JSON.stringify({ error: 'snapshot_id requerido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create a safety snapshot before restoring
      const safetyData = await captureModuleData(supabase, budget_id, module);
      await supabase.from('module_snapshots').insert({
        budget_id,
        module,
        snapshot_type: 'manual',
        snapshot_data: safetyData,
        label: 'Auto-backup antes de restaurar',
        created_by: user.id,
      });

      // Get snapshot data
      const { data: snapshot, error: snapErr } = await supabase
        .from('module_snapshots')
        .select('snapshot_data')
        .eq('id', body.snapshot_id)
        .single();

      if (snapErr || !snapshot) {
        return new Response(JSON.stringify({ error: 'Snapshot no encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await restoreModuleData(supabase, budget_id, module, snapshot.snapshot_data);

      return new Response(JSON.stringify({ message: 'Datos restaurados correctamente' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'cleanup') {
      // Keep daily snapshots for 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('module_snapshots')
        .delete()
        .in('snapshot_type', ['daily_first', 'daily_mid', 'daily_last'])
        .lt('created_at', sevenDaysAgo)
        .eq('budget_id', budget_id);

      return new Response(JSON.stringify({ message: 'Limpieza completada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Acción no válida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Snapshot error:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function captureModuleData(supabase: any, budgetId: string, module: string) {
  if (module === 'plano') {
    const [plans, rooms, walls, openings, floors] = await Promise.all([
      supabase.from('budget_floor_plans').select('*').eq('budget_id', budgetId),
      supabase.from('budget_floor_plan_rooms').select('*, budget_floor_plans!inner(budget_id)').eq('budget_floor_plans.budget_id', budgetId),
      supabase.from('budget_floor_plan_walls').select('*, budget_floor_plan_rooms!inner(floor_plan_id, budget_floor_plans!inner(budget_id))'),
      supabase.from('budget_floor_plan_openings').select('*, budget_floor_plan_walls!inner(room_id, budget_floor_plan_rooms!inner(floor_plan_id, budget_floor_plans!inner(budget_id)))'),
      supabase.from('budget_floors').select('*, budget_floor_plans!inner(budget_id)').eq('budget_floor_plans.budget_id', budgetId),
    ]);

    // Simpler approach: query each table with known IDs
    const planData = plans.data || [];
    const planIds = planData.map((p: any) => p.id);
    
    let roomsData: any[] = [];
    let wallsData: any[] = [];
    let openingsData: any[] = [];
    let floorsData: any[] = [];

    if (planIds.length > 0) {
      const [r, f] = await Promise.all([
        supabase.from('budget_floor_plan_rooms').select('*').in('floor_plan_id', planIds),
        supabase.from('budget_floors').select('*').in('floor_plan_id', planIds),
      ]);
      roomsData = r.data || [];
      floorsData = f.data || [];

      const roomIds = roomsData.map((rm: any) => rm.id);
      if (roomIds.length > 0) {
        const [w] = await Promise.all([
          supabase.from('budget_floor_plan_walls').select('*').in('room_id', roomIds),
        ]);
        wallsData = w.data || [];

        const wallIds = wallsData.map((wl: any) => wl.id);
        if (wallIds.length > 0) {
          const [o] = await Promise.all([
            supabase.from('budget_floor_plan_openings').select('*').in('wall_id', wallIds),
          ]);
          openingsData = o.data || [];
        }
      }
    }

    return { plans: planData, rooms: roomsData, walls: wallsData, openings: openingsData, floors: floorsData };
  }

  if (module === 'actividades') {
    const [activities, workAreaActivities] = await Promise.all([
      supabase.from('budget_activities').select('*').eq('budget_id', budgetId),
      supabase.from('budget_work_area_activities').select('*, budget_activities!inner(budget_id)').eq('budget_activities.budget_id', budgetId),
    ]);
    return {
      activities: activities.data || [],
      work_area_activities: workAreaActivities.data || [],
    };
  }

  if (module === 'recursos') {
    const { data } = await supabase.from('budget_activity_resources').select('*').eq('budget_id', budgetId);
    return { resources: data || [] };
  }

  return {};
}

async function restoreModuleData(supabase: any, budgetId: string, module: string, data: any) {
  if (module === 'plano') {
    // Delete existing data
    const { data: existingPlans } = await supabase.from('budget_floor_plans').select('id').eq('budget_id', budgetId);
    const planIds = (existingPlans || []).map((p: any) => p.id);

    if (planIds.length > 0) {
      const { data: existingRooms } = await supabase.from('budget_floor_plan_rooms').select('id').in('floor_plan_id', planIds);
      const roomIds = (existingRooms || []).map((r: any) => r.id);

      if (roomIds.length > 0) {
        const { data: existingWalls } = await supabase.from('budget_floor_plan_walls').select('id').in('room_id', roomIds);
        const wallIds = (existingWalls || []).map((w: any) => w.id);

        if (wallIds.length > 0) {
          await supabase.from('budget_floor_plan_openings').delete().in('wall_id', wallIds);
        }
        await supabase.from('budget_floor_plan_walls').delete().in('room_id', roomIds);
      }
      await supabase.from('budget_floors').delete().in('floor_plan_id', planIds);
      await supabase.from('budget_floor_plan_rooms').delete().in('floor_plan_id', planIds);
      await supabase.from('budget_floor_plans').delete().eq('budget_id', budgetId);
    }

    // Restore data
    if (data.plans?.length > 0) {
      await supabase.from('budget_floor_plans').insert(data.plans);
    }
    if (data.floors?.length > 0) {
      await supabase.from('budget_floors').insert(data.floors);
    }
    if (data.rooms?.length > 0) {
      await supabase.from('budget_floor_plan_rooms').insert(data.rooms);
    }
    if (data.walls?.length > 0) {
      await supabase.from('budget_floor_plan_walls').insert(data.walls);
    }
    if (data.openings?.length > 0) {
      await supabase.from('budget_floor_plan_openings').insert(data.openings);
    }
  }

  if (module === 'actividades') {
    // Delete and re-insert activities
    await supabase.from('budget_work_area_activities')
      .delete()
      .in('activity_id', (data.activities || []).map((a: any) => a.id));
    await supabase.from('budget_activities').delete().eq('budget_id', budgetId);

    if (data.activities?.length > 0) {
      await supabase.from('budget_activities').insert(data.activities);
    }
    if (data.work_area_activities?.length > 0) {
      // Filter to only valid entries
      const validWAA = (data.work_area_activities || []).map((r: any) => ({
        id: r.id,
        activity_id: r.activity_id,
        work_area_id: r.work_area_id,
        created_at: r.created_at,
      }));
      if (validWAA.length > 0) {
        await supabase.from('budget_work_area_activities').insert(validWAA);
      }
    }
  }

  if (module === 'recursos') {
    await supabase.from('budget_activity_resources').delete().eq('budget_id', budgetId);
    if (data.resources?.length > 0) {
      await supabase.from('budget_activity_resources').insert(data.resources);
    }
  }
}
