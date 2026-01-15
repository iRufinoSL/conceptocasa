import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UrbanRegulationsResult {
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
  sources: string[];
  valuesFound?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { municipality, province, landClass, budgetId } = await req.json();

    if (!municipality || !province) {
      return new Response(
        JSON.stringify({ success: false, error: 'Municipio y provincia son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'API de Perplexity no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching urban regulations for ${municipality}, ${province} (${landClass})`);

    // Build the search query
    const landType = landClass === 'Rústico' ? 'suelo rústico' : 'suelo urbano';
    const searchQuery = `
Busca las condiciones urbanísticas del PGOU del municipio de ${municipality} en la provincia de ${province} para ${landType}. 
Necesito los siguientes datos específicos con sus fuentes:

1. Volumen máximo de edificación (m³)
2. Altura máxima permitida (metros)
3. Índice de edificabilidad (m²/m²)
4. Ocupación máxima del terreno (%)
5. Retranqueos: frontal, lateral y posterior (metros)
6. Distancias mínimas: a colindantes, a caminos/carreteras, y a taludes (metros)

Para cada dato indica la fuente exacta (artículo del PGOU, normativa urbanística, etc.).
Si no encuentras algún dato específico, indica "No encontrado".
    `.trim();

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en urbanismo español. Extrae datos numéricos precisos de normativas urbanísticas municipales (PGOU, normas subsidiarias). 
            
Responde SOLO en formato JSON con esta estructura exacta:
{
  "maxBuildableVolume": { "value": null o número, "source": "fuente o No encontrado" },
  "maxHeight": { "value": null o número, "source": "fuente" },
  "buildabilityIndex": { "value": null o número, "source": "fuente" },
  "maxOccupation": { "value": null o número (porcentaje), "source": "fuente" },
  "frontSetback": { "value": null o número, "source": "fuente" },
  "sideSetback": { "value": null o número, "source": "fuente" },
  "rearSetback": { "value": null o número, "source": "fuente" },
  "minDistanceNeighbors": { "value": null o número, "source": "fuente" },
  "minDistanceRoads": { "value": null o número, "source": "fuente" },
  "minDistanceSlopes": { "value": null o número, "source": "fuente" },
  "additionalInfo": "Información adicional relevante",
  "sources": ["URL1", "URL2"]
}

Si no encuentras un valor, pon value: null y en source indica "No encontrado en PGOU de [municipio]".
Los valores deben ser números, no texto.`
          },
          { role: 'user', content: searchQuery }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Error de Perplexity: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    console.log('Perplexity response:', content);
    console.log('Citations:', citations);

    // Try to parse the JSON response
    let regulations: UrbanRegulationsResult;
    try {
      // Extract JSON from the response (it might have markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        regulations = JSON.parse(jsonMatch[0]);
        // Add citations as sources if not already present
        if (citations.length > 0 && (!regulations.sources || regulations.sources.length === 0)) {
          regulations.sources = citations;
        }
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing Perplexity response:', parseError);
      // Return raw response if parsing fails
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            rawResponse: content,
            sources: citations,
            parseError: true
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count how many values were found
    let valuesFound = 0;
    const checkValue = (obj: { value: number | null | undefined; source: string } | undefined) => {
      if (obj?.value !== null && obj?.value !== undefined) {
        valuesFound++;
        return true;
      }
      return false;
    };

    checkValue(regulations.maxBuildableVolume);
    checkValue(regulations.maxHeight);
    checkValue(regulations.buildabilityIndex);
    checkValue(regulations.maxOccupation);
    checkValue(regulations.frontSetback);
    checkValue(regulations.sideSetback);
    checkValue(regulations.rearSetback);
    checkValue(regulations.minDistanceNeighbors);
    checkValue(regulations.minDistanceRoads);
    checkValue(regulations.minDistanceSlopes);

    console.log(`Values found: ${valuesFound}/10`);

    // If budgetId is provided, update the urban profile
    if (budgetId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const updateData: Record<string, unknown> = {};
      
      if (regulations.maxBuildableVolume?.value !== null && regulations.maxBuildableVolume?.value !== undefined) {
        updateData.max_buildable_volume = regulations.maxBuildableVolume.value;
        updateData.max_buildable_volume_source = regulations.maxBuildableVolume.source;
      }
      if (regulations.maxHeight?.value !== null && regulations.maxHeight?.value !== undefined) {
        updateData.max_height = regulations.maxHeight.value;
        updateData.max_height_source = regulations.maxHeight.source;
      }
      if (regulations.buildabilityIndex?.value !== null && regulations.buildabilityIndex?.value !== undefined) {
        updateData.buildability_index = regulations.buildabilityIndex.value;
        updateData.buildability_index_source = regulations.buildabilityIndex.source;
      }
      if (regulations.maxOccupation?.value !== null && regulations.maxOccupation?.value !== undefined) {
        updateData.max_occupation_percent = regulations.maxOccupation.value;
        updateData.max_occupation_source = regulations.maxOccupation.source;
      }
      if (regulations.frontSetback?.value !== null && regulations.frontSetback?.value !== undefined) {
        updateData.front_setback = regulations.frontSetback.value;
        updateData.front_setback_source = regulations.frontSetback.source;
      }
      if (regulations.sideSetback?.value !== null && regulations.sideSetback?.value !== undefined) {
        updateData.side_setback = regulations.sideSetback.value;
        updateData.side_setback_source = regulations.sideSetback.source;
      }
      if (regulations.rearSetback?.value !== null && regulations.rearSetback?.value !== undefined) {
        updateData.rear_setback = regulations.rearSetback.value;
        updateData.rear_setback_source = regulations.rearSetback.source;
      }
      if (regulations.minDistanceNeighbors?.value !== null && regulations.minDistanceNeighbors?.value !== undefined) {
        updateData.min_distance_neighbors = regulations.minDistanceNeighbors.value;
        updateData.min_distance_neighbors_source = regulations.minDistanceNeighbors.source;
      }
      if (regulations.minDistanceRoads?.value !== null && regulations.minDistanceRoads?.value !== undefined) {
        updateData.min_distance_roads = regulations.minDistanceRoads.value;
        updateData.min_distance_roads_source = regulations.minDistanceRoads.source;
      }
      if (regulations.minDistanceSlopes?.value !== null && regulations.minDistanceSlopes?.value !== undefined) {
        updateData.min_distance_slopes = regulations.minDistanceSlopes.value;
        updateData.min_distance_slopes_source = regulations.minDistanceSlopes.source;
      }

      // Always update analysis notes with additional info and sources
      if (regulations.additionalInfo || (regulations.sources && regulations.sources.length > 0)) {
        const notes: string[] = [];
        if (regulations.additionalInfo) {
          notes.push(regulations.additionalInfo);
        }
        if (regulations.sources && regulations.sources.length > 0) {
          notes.push('\n\n**Fuentes consultadas:**\n' + regulations.sources.map(s => `- ${s}`).join('\n'));
        }
        updateData.analysis_notes = notes.join('\n');
      }

      // Always update status and timestamp
      updateData.analysis_status = valuesFound > 0 ? 'regulations_loaded' : 'catastro_loaded';
      updateData.last_analyzed_at = new Date().toISOString();
      
      const { error: updateError } = await supabase
        .from('urban_profiles')
        .update(updateData)
        .eq('budget_id', budgetId);

      if (updateError) {
        console.error('Error updating urban profile:', updateError);
      } else {
        console.log(`Urban profile updated. Values found: ${valuesFound}`);
      }
    }

    // Add valuesFound to response for better UX
    regulations.valuesFound = valuesFound;

    return new Response(
      JSON.stringify({
        success: true,
        data: regulations,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-urban-regulations:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al buscar normativa urbanística',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
