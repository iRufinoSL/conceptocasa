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
    
    // If uses_measurement is false, return 0
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
    
    // If there are related measurements, calculate the sum of their manual_units
    if (relations && relations.length > 0) {
      const relatedIds = relations.map(r => r.related_measurement_id);
      const { data: relatedMeasurements, error: relMeasError } = await supabase
        .from('budget_measurements')
        .select('manual_units')
        .in('id', relatedIds);
      
      if (!relMeasError && relatedMeasurements && relatedMeasurements.length > 0) {
        const relatedUnits = relatedMeasurements.reduce((sum, m) => sum + (m.manual_units || 0), 0);
        console.log('Calculated related units:', relatedUnits, 'from', relatedMeasurements.length, 'measurements');
        // Return the sum of related units (could be 0 if all related measurements have 0 units)
        return relatedUnits;
      }
    }
    
    // No relations or error fetching related measurements - use manual_units
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
        calculatedRelatedUnits = relatedMeasurements.reduce((sum, m) => sum + (m.manual_units || 0), 0);
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
    // Get all activities for this budget
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
    
    // Get all measurement relations for this budget
    const { data: relations, error: relError } = await supabase
      .from('budget_measurement_relations')
      .select('measurement_id, related_measurement_id');
    
    if (relError) {
      console.error('Error fetching relations:', relError);
    }
    
    // Build a map of measurement_id -> sum of related measurements' units
    const relatedUnitsMap = new Map<string, number>();
    
    if (relations) {
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
    
    // Calculate related_units for each activity
    const activityUnitsMap = new Map<string, number>();
    
    for (const activity of activities) {
      if (!activity.uses_measurement) {
        // If uses_measurement is false, related_units should be 0
        activityUnitsMap.set(activity.id, 0);
      } else if (activity.measurement_id) {
        // Check if measurement has relations
        const relatedSum = relatedUnitsMap.get(activity.measurement_id);
        if (relatedSum !== undefined) {
          activityUnitsMap.set(activity.id, relatedSum);
        } else {
          // Use measurement's own manual_units
          activityUnitsMap.set(activity.id, measurementMap.get(activity.measurement_id) || 0);
        }
      } else {
        // No measurement linked, related_units should be null/0
        activityUnitsMap.set(activity.id, 0);
      }
    }
    
    // Update resources for each activity
    for (const [activityId, relatedUnits] of activityUnitsMap) {
      const { error: updateError, count } = await supabase
        .from('budget_activity_resources')
        .update({ related_units: relatedUnits })
        .eq('activity_id', activityId)
        .select('id');
      
      if (updateError) {
        console.error(`Error updating resources for activity ${activityId}:`, updateError);
        errors++;
      } else {
        // Count isn't directly available, but we track success
        updated++;
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
