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
  }
): Promise<CloneResult> {
  const stats = {
    phases: 0,
    activities: 0,
    resources: 0,
    measurements: 0,
    measurementRelations: 0,
    predesigns: 0
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
        coordenadas_lng: newBudgetData.coordenadas_lng || null
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

    // 4. Clone measurements (without manual_units values) and build ID mapping
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
            manual_units: null // Clear manual_units as requested
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

    // 7. Clone predesigns (structure only, no files)
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
