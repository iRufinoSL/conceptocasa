import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedData {
  maxBuildableVolume?: { value: number | null; source: string };
  maxHeight?: { value: number | null; source: string };
  buildabilityIndex?: { value: number | null; source: string };
  maxOccupation?: { value: number | null; source: string };
  frontSetback?: { value: number | null; source: string };
  sideSetback?: { value: number | null; source: string };
  rearSetback?: { value: number | null; source: string };
  minDistanceNeighbors?: { value: number | null; source: string };
  minDistanceRoads?: { value: number | null; source: string };
  minDistanceSlopes?: { value: number | null; source: string };
  additionalInfo?: string;
  valuesFound: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfText, municipality, landClass, budgetId } = await req.json();

    if (!pdfText || pdfText.trim().length < 100) {
      return new Response(
        JSON.stringify({ success: false, error: 'El texto del PDF es demasiado corto o está vacío' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'API de IA no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracting PGOU data for ${municipality} (${landClass}). Text length: ${pdfText.length} chars`);

    // Truncate text if too long (keep first 30000 chars to stay within token limits)
    const truncatedText = pdfText.length > 30000 ? pdfText.substring(0, 30000) + '\n\n[... texto truncado ...]' : pdfText;

    const landType = landClass === 'Rústico' ? 'suelo rústico' : 'suelo urbano';
    
    const systemPrompt = `Eres un experto en urbanismo español especializado en analizar documentos de Planes Generales de Ordenación Urbanística (PGOU).

Tu tarea es extraer datos numéricos específicos del texto proporcionado de un PGOU para ${landType} en el municipio de ${municipality || 'el municipio indicado'}.

INSTRUCCIONES:
1. Busca en el texto los siguientes parámetros urbanísticos:
   - Volumen máximo edificable (m³ o m³/parcela)
   - Altura máxima (metros o número de plantas)
   - Índice de edificabilidad (m²/m² o m²t/m²s)
   - Ocupación máxima (porcentaje)
   - Retranqueos: frontal, lateral y posterior (metros)
   - Distancias mínimas: a colindantes, a caminos/carreteras, a taludes (metros)

2. Para cada valor encontrado, indica el artículo, sección o referencia donde lo encontraste.

3. Si un valor no aparece explícitamente, pon null.

4. Si hay varios valores posibles (por zonas, usos, etc.), extrae el más general o común para vivienda unifamiliar.

5. Convierte plantas a metros si es necesario (1 planta ≈ 3m, 2 plantas ≈ 6m, etc.)

RESPONDE SOLO en formato JSON con esta estructura exacta:
{
  "maxBuildableVolume": { "value": null o número, "source": "artículo o sección" },
  "maxHeight": { "value": null o número en metros, "source": "artículo o sección" },
  "buildabilityIndex": { "value": null o número, "source": "artículo o sección" },
  "maxOccupation": { "value": null o número (porcentaje sin %), "source": "artículo o sección" },
  "frontSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "sideSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "rearSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceNeighbors": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceRoads": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceSlopes": { "value": null o número en metros, "source": "artículo o sección" },
  "additionalInfo": "Resumen de condiciones adicionales relevantes encontradas"
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analiza el siguiente texto del PGOU y extrae los parámetros urbanísticos:\n\n${truncatedText}` }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Límite de peticiones excedido. Inténtalo de nuevo en unos minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'Créditos de IA agotados.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `Error de IA: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('AI response:', content);

    // Parse JSON from response
    let extractedData: ExtractedData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            rawResponse: content,
            parseError: true,
            valuesFound: 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count values found
    let valuesFound = 0;
    const checkValue = (obj: { value: number | null | undefined } | undefined) => {
      if (obj?.value !== null && obj?.value !== undefined) {
        valuesFound++;
        return true;
      }
      return false;
    };

    checkValue(extractedData.maxBuildableVolume);
    checkValue(extractedData.maxHeight);
    checkValue(extractedData.buildabilityIndex);
    checkValue(extractedData.maxOccupation);
    checkValue(extractedData.frontSetback);
    checkValue(extractedData.sideSetback);
    checkValue(extractedData.rearSetback);
    checkValue(extractedData.minDistanceNeighbors);
    checkValue(extractedData.minDistanceRoads);
    checkValue(extractedData.minDistanceSlopes);

    extractedData.valuesFound = valuesFound;
    console.log(`Values extracted: ${valuesFound}/10`);

    // Update urban profile if budgetId provided
    if (budgetId && valuesFound > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const updateData: Record<string, unknown> = {};
      
      if (extractedData.maxBuildableVolume?.value != null) {
        updateData.max_buildable_volume = extractedData.maxBuildableVolume.value;
        updateData.max_buildable_volume_source = `PDF PGOU: ${extractedData.maxBuildableVolume.source}`;
      }
      if (extractedData.maxHeight?.value != null) {
        updateData.max_height = extractedData.maxHeight.value;
        updateData.max_height_source = `PDF PGOU: ${extractedData.maxHeight.source}`;
      }
      if (extractedData.buildabilityIndex?.value != null) {
        updateData.buildability_index = extractedData.buildabilityIndex.value;
        updateData.buildability_index_source = `PDF PGOU: ${extractedData.buildabilityIndex.source}`;
      }
      if (extractedData.maxOccupation?.value != null) {
        updateData.max_occupation_percent = extractedData.maxOccupation.value;
        updateData.max_occupation_source = `PDF PGOU: ${extractedData.maxOccupation.source}`;
      }
      if (extractedData.frontSetback?.value != null) {
        updateData.front_setback = extractedData.frontSetback.value;
        updateData.front_setback_source = `PDF PGOU: ${extractedData.frontSetback.source}`;
      }
      if (extractedData.sideSetback?.value != null) {
        updateData.side_setback = extractedData.sideSetback.value;
        updateData.side_setback_source = `PDF PGOU: ${extractedData.sideSetback.source}`;
      }
      if (extractedData.rearSetback?.value != null) {
        updateData.rear_setback = extractedData.rearSetback.value;
        updateData.rear_setback_source = `PDF PGOU: ${extractedData.rearSetback.source}`;
      }
      if (extractedData.minDistanceNeighbors?.value != null) {
        updateData.min_distance_neighbors = extractedData.minDistanceNeighbors.value;
        updateData.min_distance_neighbors_source = `PDF PGOU: ${extractedData.minDistanceNeighbors.source}`;
      }
      if (extractedData.minDistanceRoads?.value != null) {
        updateData.min_distance_roads = extractedData.minDistanceRoads.value;
        updateData.min_distance_roads_source = `PDF PGOU: ${extractedData.minDistanceRoads.source}`;
      }
      if (extractedData.minDistanceSlopes?.value != null) {
        updateData.min_distance_slopes = extractedData.minDistanceSlopes.value;
        updateData.min_distance_slopes_source = `PDF PGOU: ${extractedData.minDistanceSlopes.source}`;
      }

      if (extractedData.additionalInfo) {
        updateData.analysis_notes = `Extraído de PDF PGOU:\n${extractedData.additionalInfo}`;
      }

      updateData.analysis_status = 'pgou_loaded';
      updateData.last_analyzed_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('urban_profiles')
        .update(updateData)
        .eq('budget_id', budgetId);

      if (updateError) {
        console.error('Error updating urban profile:', updateError);
      } else {
        console.log('Urban profile updated with PDF data');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in extract-pgou-data:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar el PDF',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
