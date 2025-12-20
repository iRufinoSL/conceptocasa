import { supabase } from '@/integrations/supabase/client';

/**
 * Get the calculated units (Uds cálculo) from an activity's measurement.
 * This returns the sum of related measurements' manual_units if any relations exist,
 * otherwise it returns the measurement's own manual_units.
 */
export async function getActivityMeasurementUnits(activityId: string): Promise<number | null> {
  try {
    // Get activity with its measurement_id and uses_measurement flag
    const { data: activity, error: actError } = await supabase
      .from('budget_activities')
      .select('measurement_id, uses_measurement')
      .eq('id', activityId)
      .single();

    if (actError || !activity?.measurement_id) {
      console.log('No measurement linked to activity:', activityId);
      return null;
    }

    // If uses_measurement is explicitly false, return 0
    if (activity.uses_measurement === false) {
      console.log('Activity has uses_measurement=false, returning 0');
      return 0;
    }

    // Get the measurement
    const { data: measurement, error: measError } = await supabase
      .from('budget_measurements')
      .select('id, manual_units')
      .eq('id', activity.measurement_id)
      .single();

    if (measError || !measurement) {
      console.log('Measurement not found:', activity.measurement_id);
      return null;
    }

    // Get relations for this measurement to calculate Uds Cálculo
    const { data: relations, error: relError } = await supabase
      .from('budget_measurement_relations')
      .select('related_measurement_id')
      .eq('measurement_id', measurement.id);

    if (relError) {
      console.log('Error fetching relations:', relError);
      return measurement.manual_units;
    }

    // If there are related measurements, calculate the sum of their manual_units.
    // Important: if the sum is 0 (common in legacy imports with "empty" relations),
    // fall back to the measurement's own manual_units.
    if (relations && relations.length > 0) {
      const relatedIds = relations.map(r => r.related_measurement_id);
      const { data: relatedMeasurements, error: relMeasError } = await supabase
        .from('budget_measurements')
        .select('manual_units')
        .in('id', relatedIds);

      if (!relMeasError && relatedMeasurements && relatedMeasurements.length > 0) {
        const relatedUnits = relatedMeasurements.reduce((sum, m) => sum + (m.manual_units || 0), 0);
        console.log('Calculated related units:', relatedUnits, 'from', relatedMeasurements.length, 'measurements');
        if (relatedUnits > 0) return relatedUnits;
      }
    }

    // No relations / empty sum -> use manual_units
    console.log('Using manual_units:', measurement.manual_units);
    return measurement.manual_units;
  } catch (error) {
    console.error('Error getting activity measurement units:', error);
    return null;
  }
}

/**
 * Sync related_units for all resources of activities linked to a specific measurement.
 * This should be called when:
 * - A measurement's manual_units changes
 * - Measurement relations are added/removed
 * - An activity's measurement_id changes
 */
export async function syncResourcesRelatedUnits(measurementId: string): Promise<void> {
  try {
    // Get measurement data and its relations
    const { data: measurement, error: measError } = await supabase
      .from('budget_measurements')
      .select('id, manual_units')
      .eq('id', measurementId)
      .single();

    if (measError || !measurement) {
      console.log('Measurement not found for sync:', measurementId);
      return;
    }

    // Get relations for this measurement
    const { data: relations, error: relError } = await supabase
      .from('budget_measurement_relations')
      .select('related_measurement_id')
      .eq('measurement_id', measurementId);

    // Calculate the related_units value
    let calculatedRelatedUnits = measurement.manual_units || 0;

    if (!relError && relations && relations.length > 0) {
      const relatedIds = relations.map(r => r.related_measurement_id);
      const { data: relatedMeasurements, error: relMeasError } = await supabase
        .from('budget_measurements')
        .select('manual_units')
        .in('id', relatedIds);

      if (!relMeasError && relatedMeasurements && relatedMeasurements.length > 0) {
        const sum = relatedMeasurements.reduce((acc, m) => acc + (m.manual_units || 0), 0);
        // Important: if relations exist but sum is 0, treat as "no effective relations" and use manual_units.
        if (sum > 0) calculatedRelatedUnits = sum;
      }
    }

    // Get all activities linked to this measurement
    const { data: activities, error: actError } = await supabase
      .from('budget_activities')
      .select('id')
      .eq('measurement_id', measurementId);

    if (actError || !activities || activities.length === 0) {
      console.log('No activities linked to measurement:', measurementId);
      return;
    }

    const activityIds = activities.map(a => a.id);

    // Update all resources linked to these activities
    const { error: updateError } = await supabase
      .from('budget_activity_resources')
      .update({ related_units: calculatedRelatedUnits })
      .in('activity_id', activityIds);

    if (updateError) {
      console.error('Error updating resources related_units:', updateError);
    } else {
      console.log(`Synced related_units (${calculatedRelatedUnits}) for resources of ${activityIds.length} activities`);
    }
  } catch (error) {
    console.error('Error syncing resources related_units:', error);
  }
}

/**
 * Sync related_units for all resources that depend on a measurement that has changed.
 * This also handles measurements that are used as "related measurements" by others.
 */
export async function syncAllAffectedResources(changedMeasurementId: string): Promise<void> {
  try {
    // 1. Sync resources for activities directly linked to this measurement
    await syncResourcesRelatedUnits(changedMeasurementId);

    // 2. Find all measurements that use this measurement as a "related measurement"
    const { data: parentRelations, error: relError } = await supabase
      .from('budget_measurement_relations')
      .select('measurement_id')
      .eq('related_measurement_id', changedMeasurementId);

    if (!relError && parentRelations && parentRelations.length > 0) {
      // Sync resources for each parent measurement's activities
      const parentMeasurementIds = [...new Set(parentRelations.map(r => r.measurement_id))];
      for (const parentId of parentMeasurementIds) {
        await syncResourcesRelatedUnits(parentId);
      }
      console.log(`Also synced ${parentMeasurementIds.length} parent measurements`);
    }
  } catch (error) {
    console.error('Error syncing all affected resources:', error);
  }
}

/**
 * Recalculate all related_units for all resources in a budget.
 * This should be used to sync all resources when:
 * - An activity's uses_measurement flag changes
 * - Bulk data needs to be recalculated
 * 
 * Returns the number of resources updated.
 */
export async function recalculateAllBudgetResources(budgetId: string): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  try {
    // Get all activities for this budget with their resources
    const { data: activities, error: actError } = await supabase
      .from('budget_activities')
      .select('id, measurement_id, uses_measurement')
      .eq('budget_id', budgetId);

    if (actError || !activities) {
      console.error('Error fetching activities:', actError);
      return { updated: 0, errors: 1 };
    }

    // Get all measurements for this budget
    const { data: measurements, error: measError } = await supabase
      .from('budget_measurements')
      .select('id, manual_units')
      .eq('budget_id', budgetId);

    if (measError) {
      console.error('Error fetching measurements:', measError);
    }

    const measurementMap = new Map(measurements?.map(m => [m.id, m.manual_units || 0]) || []);

    // Get all measurement relations for this budget's measurements
    const measurementIds = measurements?.map(m => m.id) || [];
    const { data: relations, error: relError } = await supabase
      .from('budget_measurement_relations')
      .select('measurement_id, related_measurement_id')
      .in('measurement_id', measurementIds.length > 0 ? measurementIds : ['__none__']);

    if (relError) {
      console.error('Error fetching relations:', relError);
    }

    // Build a map of measurement_id -> sum of related measurements' units
    const relatedUnitsMap = new Map<string, number>();

    if (relations && relations.length > 0) {
      // Group relations by measurement_id
      const relationsByMeasurement = new Map<string, string[]>();
      for (const rel of relations) {
        const existing = relationsByMeasurement.get(rel.measurement_id) || [];
        existing.push(rel.related_measurement_id);
        relationsByMeasurement.set(rel.measurement_id, existing);
      }

      // Calculate sum of related units for each measurement
      for (const [measId, relatedIds] of relationsByMeasurement) {
        const sum = relatedIds.reduce((total, relId) => total + (measurementMap.get(relId) || 0), 0);
        relatedUnitsMap.set(measId, sum);
      }
    }

    // Build batch updates - group by related_units value for efficiency
    const updatesByRelatedUnits = new Map<number, string[]>();

    for (const activity of activities) {
      let relatedUnits = 0;

      if (activity.uses_measurement !== false && activity.measurement_id) {
        // Important: if relations exist but their SUM is 0, treat as "no effective relations"
        // and fall back to the measurement's own manual_units.
        const relatedSum = relatedUnitsMap.get(activity.measurement_id);
        if (relatedSum !== undefined && relatedSum > 0) {
          relatedUnits = relatedSum;
        } else {
          relatedUnits = measurementMap.get(activity.measurement_id) || 0;
        }
      }

      const existing = updatesByRelatedUnits.get(relatedUnits) || [];
      existing.push(activity.id);
      updatesByRelatedUnits.set(relatedUnits, existing);
    }

    // Perform batch updates
    for (const [relatedUnits, activityIds] of updatesByRelatedUnits) {
      // Update in batches of 50 to avoid query limits
      const batchSize = 50;
      for (let i = 0; i < activityIds.length; i += batchSize) {
        const batch = activityIds.slice(i, i + batchSize);
        const { error: updateError } = await supabase
          .from('budget_activity_resources')
          .update({ related_units: relatedUnits })
          .in('activity_id', batch);

        if (updateError) {
          console.error(`Error updating resources batch:`, updateError);
          errors++;
        } else {
          updated += batch.length;
        }
      }
    }

    // Also update resources without activity (set related_units to null)
    const { error: noActError } = await supabase
      .from('budget_activity_resources')
      .update({ related_units: null })
      .eq('budget_id', budgetId)
      .is('activity_id', null);

    if (noActError) {
      console.error('Error updating resources without activity:', noActError);
      errors++;
    }

    console.log(`Recalculated resources for ${updated} activities in budget ${budgetId}`);
    return { updated, errors };
  } catch (error) {
    console.error('Error recalculating budget resources:', error);
    return { updated, errors: errors + 1 };
  }
}

/**
 * Sync related_units for resources of a specific activity.
 * Call this when an activity's measurement_id changes or when saving resources.
 */
export async function syncActivityResourcesRelatedUnits(activityId: string): Promise<void> {
  try {
    // Get activity with its measurement_id and uses_measurement flag
    const { data: activity, error: actError } = await supabase
      .from('budget_activities')
      .select('measurement_id, uses_measurement, budget_id')
      .eq('id', activityId)
      .single();

    if (actError || !activity) {
      console.log('Activity not found:', activityId);
      return;
    }

    let relatedUnits: number | null = null;

    if (activity.uses_measurement !== false && activity.measurement_id) {
      // Get the measurement and its relations
      const { data: measurement, error: measError } = await supabase
        .from('budget_measurements')
        .select('id, manual_units')
        .eq('id', activity.measurement_id)
        .single();

      if (!measError && measurement) {
        // Get relations for this measurement
        const { data: relations, error: relError } = await supabase
          .from('budget_measurement_relations')
          .select('related_measurement_id')
          .eq('measurement_id', measurement.id);

        if (!relError && relations && relations.length > 0) {
          const relatedIds = relations.map(r => r.related_measurement_id);
          const { data: relatedMeasurements, error: relMeasError } = await supabase
            .from('budget_measurements')
            .select('manual_units')
            .in('id', relatedIds);

          if (!relMeasError && relatedMeasurements && relatedMeasurements.length > 0) {
            const sum = relatedMeasurements.reduce((acc, m) => acc + (m.manual_units || 0), 0);
            // Important: if sum is 0, fall back to measurement.manual_units (legacy imports).
            relatedUnits = sum > 0 ? sum : (measurement.manual_units || 0);
          } else {
            relatedUnits = measurement.manual_units || 0;
          }
        } else {
          relatedUnits = measurement.manual_units || 0;
        }
      }
    } else {
      relatedUnits = 0;
    }

    // Update all resources linked to this activity
    const { error: updateError } = await supabase
      .from('budget_activity_resources')
      .update({ related_units: relatedUnits })
      .eq('activity_id', activityId);

    if (updateError) {
      console.error('Error updating resources related_units for activity:', updateError);
    } else {
      console.log(`Synced related_units (${relatedUnits}) for activity ${activityId}`);
    }
  } catch (error) {
    console.error('Error syncing activity resources related_units:', error);
  }
}
