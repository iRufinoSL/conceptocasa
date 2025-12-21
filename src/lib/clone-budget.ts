import { supabase } from '@/integrations/supabase/client';

interface CloneResult {
  success: boolean;
  newBudgetId?: string;
  error?: string;
  stats?: {
    phases: number;
    activities: number;
    resources: number;
    measurements: number;
    measurementRelations: number;
    predesigns: number;
    spaces: number;
    workAreas: number;
    workAreaMeasurements: number;
    workAreaActivities: number;
  };
}

export async function cloneBudget(
  sourceBudgetId: string,
  newBudgetData: {
    nombre: string;
    version: string;
    poblacion: string;
    provincia?: string;
    coordenadas_lat?: number;
    coordenadas_lng?: number;
    project_id?: string | null;
  },
  options: {
    preserveMeasurementValues?: boolean; // true = clone complete, false = clone as template
  } = {}
): Promise<CloneResult> {
  const { preserveMeasurementValues = false } = options;
  const stats = {
    phases: 0,
    activities: 0,
    resources: 0,
    measurements: 0,
    measurementRelations: 0,
    predesigns: 0,
    spaces: 0,
    workAreas: 0,
    workAreaMeasurements: 0,
    workAreaActivities: 0
  };

  try {
    // 1. Get next correlative code
    const { data: maxCodeData } = await supabase
      .from('presupuestos')
      .select('codigo_correlativo')
      .order('codigo_correlativo', { ascending: false })
      .limit(1);
    
    const nextCode = (maxCodeData?.[0]?.codigo_correlativo || 0) + 1;

    // 2. Create new presupuesto
    const { data: newBudget, error: budgetError } = await supabase
      .from('presupuestos')
      .insert({
        nombre: newBudgetData.nombre,
        codigo_correlativo: nextCode,
        version: newBudgetData.version,
        poblacion: newBudgetData.poblacion,
        provincia: newBudgetData.provincia || null,
        coordenadas_lat: newBudgetData.coordenadas_lat || null,
        coordenadas_lng: newBudgetData.coordenadas_lng || null,
        project_id: newBudgetData.project_id || null
      })
      .select()
      .single();

    if (budgetError || !newBudget) {
      throw new Error(`Error creando presupuesto: ${budgetError?.message}`);
    }

    const newBudgetId = newBudget.id;

    // 3. Clone phases and build ID mapping
    const { data: sourcePhases } = await supabase
      .from('budget_phases')
      .select('*')
      .eq('budget_id', sourceBudgetId)
      .order('order_index');

    const phaseIdMap = new Map<string, string>(); // old ID -> new ID

    if (sourcePhases && sourcePhases.length > 0) {
      for (const phase of sourcePhases) {
        const { data: newPhase, error: phaseError } = await supabase
          .from('budget_phases')
          .insert({
            budget_id: newBudgetId,
            name: phase.name,
            code: phase.code,
            order_index: phase.order_index,
            parent_id: null // Will update after all phases are created
          })
          .select()
          .single();

        if (!phaseError && newPhase) {
          phaseIdMap.set(phase.id, newPhase.id);
          stats.phases++;
        }
      }

      // Update parent_id references for nested phases
      for (const phase of sourcePhases) {
        if (phase.parent_id && phaseIdMap.has(phase.parent_id)) {
          const newPhaseId = phaseIdMap.get(phase.id);
          const newParentId = phaseIdMap.get(phase.parent_id);
          if (newPhaseId && newParentId) {
            await supabase
              .from('budget_phases')
              .update({ parent_id: newParentId })
              .eq('id', newPhaseId);
          }
        }
      }
    }

    // 4. Clone measurements and build ID mapping
    const { data: sourceMeasurements } = await supabase
      .from('budget_measurements')
      .select('*')
      .eq('budget_id', sourceBudgetId);

    const measurementIdMap = new Map<string, string>(); // old ID -> new ID

    if (sourceMeasurements && sourceMeasurements.length > 0) {
      for (const measurement of sourceMeasurements) {
        const { data: newMeasurement, error: measurementError } = await supabase
          .from('budget_measurements')
          .insert({
            budget_id: newBudgetId,
            name: measurement.name,
            measurement_unit: measurement.measurement_unit,
            manual_units: preserveMeasurementValues ? measurement.manual_units : null
          })
          .select()
          .single();

        if (!measurementError && newMeasurement) {
          measurementIdMap.set(measurement.id, newMeasurement.id);
          stats.measurements++;
        }
      }

      // Clone measurement relations
      const { data: sourceRelations } = await supabase
        .from('budget_measurement_relations')
        .select('*')
        .in('measurement_id', sourceMeasurements.map(m => m.id));

      if (sourceRelations && sourceRelations.length > 0) {
        for (const relation of sourceRelations) {
          const newMeasurementId = measurementIdMap.get(relation.measurement_id);
          const newRelatedId = measurementIdMap.get(relation.related_measurement_id);
          
          if (newMeasurementId && newRelatedId) {
            const { error: relationError } = await supabase
              .from('budget_measurement_relations')
              .insert({
                measurement_id: newMeasurementId,
                related_measurement_id: newRelatedId
              });

            if (!relationError) {
              stats.measurementRelations++;
            }
          }
        }
      }
    }

    // 5. Clone activities and build ID mapping
    const { data: sourceActivities } = await supabase
      .from('budget_activities')
      .select('*')
      .eq('budget_id', sourceBudgetId);

    const activityIdMap = new Map<string, string>(); // old ID -> new ID

    if (sourceActivities && sourceActivities.length > 0) {
      for (const activity of sourceActivities) {
        const newPhaseId = activity.phase_id ? phaseIdMap.get(activity.phase_id) : null;
        const newMeasurementId = activity.measurement_id ? measurementIdMap.get(activity.measurement_id) : null;

        const { data: newActivity, error: activityError } = await supabase
          .from('budget_activities')
          .insert({
            budget_id: newBudgetId,
            name: activity.name,
            code: activity.code,
            description: activity.description,
            measurement_unit: activity.measurement_unit,
            uses_measurement: activity.uses_measurement,
            phase_id: newPhaseId,
            measurement_id: newMeasurementId
          })
          .select()
          .single();

        if (!activityError && newActivity) {
          activityIdMap.set(activity.id, newActivity.id);
          stats.activities++;
        }
      }
    }

    // 6. Clone resources (linked to new activities)
    const { data: sourceResources } = await supabase
      .from('budget_activity_resources')
      .select('*')
      .eq('budget_id', sourceBudgetId);

    if (sourceResources && sourceResources.length > 0) {
      for (const resource of sourceResources) {
        const newActivityId = resource.activity_id ? activityIdMap.get(resource.activity_id) : null;

        const { error: resourceError } = await supabase
          .from('budget_activity_resources')
          .insert({
            budget_id: newBudgetId,
            activity_id: newActivityId,
            name: resource.name,
            description: resource.description,
            external_unit_cost: resource.external_unit_cost,
            unit: resource.unit,
            resource_type: resource.resource_type,
            safety_margin_percent: resource.safety_margin_percent,
            sales_margin_percent: resource.sales_margin_percent,
            manual_units: resource.manual_units,
            related_units: null // Will be recalculated
          });

        if (!resourceError) {
          stats.resources++;
        }
      }
    }

    // 7. Clone spaces (budget_spaces)
    const { data: sourceSpaces } = await supabase
      .from('budget_spaces')
      .select('*')
      .eq('budget_id', sourceBudgetId);

    if (sourceSpaces && sourceSpaces.length > 0) {
      for (const space of sourceSpaces) {
        const { error: spaceError } = await supabase
          .from('budget_spaces')
          .insert({
            budget_id: newBudgetId,
            name: space.name,
            level: space.level,
            space_type: space.space_type,
            m2_built: preserveMeasurementValues ? space.m2_built : null,
            m2_livable: preserveMeasurementValues ? space.m2_livable : null,
            observations: space.observations
          });

        if (!spaceError) {
          stats.spaces++;
        }
      }
    }

    // 8. Clone work areas and build ID mapping
    const { data: sourceWorkAreas } = await supabase
      .from('budget_work_areas')
      .select('*')
      .eq('budget_id', sourceBudgetId);

    const workAreaIdMap = new Map<string, string>(); // old ID -> new ID

    if (sourceWorkAreas && sourceWorkAreas.length > 0) {
      for (const workArea of sourceWorkAreas) {
        const { data: newWorkArea, error: workAreaError } = await supabase
          .from('budget_work_areas')
          .insert({
            budget_id: newBudgetId,
            name: workArea.name,
            level: workArea.level,
            work_area: workArea.work_area,
            area_id: workArea.area_id
          })
          .select()
          .single();

        if (!workAreaError && newWorkArea) {
          workAreaIdMap.set(workArea.id, newWorkArea.id);
          stats.workAreas++;
        }
      }

      // Clone work area measurements
      const { data: sourceWorkAreaMeasurements } = await supabase
        .from('budget_work_area_measurements')
        .select('*')
        .in('work_area_id', sourceWorkAreas.map(wa => wa.id));

      if (sourceWorkAreaMeasurements && sourceWorkAreaMeasurements.length > 0) {
        for (const wam of sourceWorkAreaMeasurements) {
          const newWorkAreaId = workAreaIdMap.get(wam.work_area_id);
          const newMeasurementId = measurementIdMap.get(wam.measurement_id);

          if (newWorkAreaId && newMeasurementId) {
            const { error: wamError } = await supabase
              .from('budget_work_area_measurements')
              .insert({
                work_area_id: newWorkAreaId,
                measurement_id: newMeasurementId
              });

            if (!wamError) {
              stats.workAreaMeasurements++;
            }
          }
        }
      }

      // Clone work area activities
      const { data: sourceWorkAreaActivities } = await supabase
        .from('budget_work_area_activities')
        .select('*')
        .in('work_area_id', sourceWorkAreas.map(wa => wa.id));

      if (sourceWorkAreaActivities && sourceWorkAreaActivities.length > 0) {
        for (const waa of sourceWorkAreaActivities) {
          const newWorkAreaId = workAreaIdMap.get(waa.work_area_id);
          const newActivityId = activityIdMap.get(waa.activity_id);

          if (newWorkAreaId && newActivityId) {
            const { error: waaError } = await supabase
              .from('budget_work_area_activities')
              .insert({
                work_area_id: newWorkAreaId,
                activity_id: newActivityId
              });

            if (!waaError) {
              stats.workAreaActivities++;
            }
          }
        }
      }
    }

    // 9. Clone predesigns (structure only, no files)
    const { data: sourcePredesigns } = await supabase
      .from('budget_predesigns')
      .select('*')
      .eq('budget_id', sourceBudgetId);

    if (sourcePredesigns && sourcePredesigns.length > 0) {
      for (const predesign of sourcePredesigns) {
        const { error: predesignError } = await supabase
          .from('budget_predesigns')
          .insert({
            budget_id: newBudgetId,
            content: predesign.content,
            content_type: predesign.content_type,
            description: predesign.description,
            // Clear file references - user needs to upload new files
            file_name: null,
            file_path: null,
            file_type: null,
            file_size: null,
            uploaded_by: null
          });

        if (!predesignError) {
          stats.predesigns++;
        }
      }
    }

    return {
      success: true,
      newBudgetId,
      stats
    };

  } catch (error: any) {
    console.error('Error cloning budget:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al clonar'
    };
  }
}
