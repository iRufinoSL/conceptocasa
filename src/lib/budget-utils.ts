import { supabase } from '@/integrations/supabase/client';

/**
 * Get the calculated units (Uds cálculo) from an activity's measurement.
 * This returns the related_units sum if available, otherwise the manual_units.
 */
export async function getActivityMeasurementUnits(activityId: string): Promise<number | null> {
  try {
    // Get activity with its measurement_id
    const { data: activity, error: actError } = await supabase
      .from('budget_activities')
      .select('measurement_id')
      .eq('id', activityId)
      .single();
    
    if (actError || !activity?.measurement_id) return null;
    
    // Get the measurement
    const { data: measurement, error: measError } = await supabase
      .from('budget_measurements')
      .select('id, manual_units')
      .eq('id', activity.measurement_id)
      .single();
    
    if (measError || !measurement) return null;
    
    // Get relations for this measurement to calculate Uds Cálculo
    const { data: relations, error: relError } = await supabase
      .from('budget_measurement_relations')
      .select('related_measurement_id')
      .eq('measurement_id', measurement.id);
    
    if (relError) return measurement.manual_units;
    
    if (relations && relations.length > 0) {
      // Get the related measurements' manual_units
      const relatedIds = relations.map(r => r.related_measurement_id);
      const { data: relatedMeasurements, error: relMeasError } = await supabase
        .from('budget_measurements')
        .select('manual_units')
        .in('id', relatedIds);
      
      if (!relMeasError && relatedMeasurements) {
        const relatedUnits = relatedMeasurements.reduce((sum, m) => sum + (m.manual_units || 0), 0);
        if (relatedUnits > 0) return relatedUnits;
      }
    }
    
    return measurement.manual_units;
  } catch (error) {
    console.error('Error getting activity measurement units:', error);
    return null;
  }
}
