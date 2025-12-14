import { supabase } from '@/integrations/supabase/client';

/**
 * Get the calculated units (Uds cálculo) from an activity's measurement.
 * This returns the sum of related measurements' manual_units if any relations exist,
 * otherwise it returns the measurement's own manual_units.
 */
export async function getActivityMeasurementUnits(activityId: string): Promise<number | null> {
  try {
    // Get activity with its measurement_id
    const { data: activity, error: actError } = await supabase
      .from('budget_activities')
      .select('measurement_id')
      .eq('id', activityId)
      .single();
    
    if (actError || !activity?.measurement_id) {
      console.log('No measurement linked to activity:', activityId);
      return null;
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
