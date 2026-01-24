import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 1: Análisis Catastro + Normativa Municipal
 * - Consulta datos del Catastro
 * - Busca PGOU/Normas Subsidiarias del Ayuntamiento
 * - Determina clasificación del suelo y edificabilidad básica
 */

interface SearchResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      budgetId, 
      municipality, 
      province, 
      landClass, 
      cadastralReference,
      surfaceArea
    } = await req.json();

    if (!budgetId || !municipality) {
      return new Response(
        JSON.stringify({ success: false, error: 'budgetId y municipality son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'API de IA no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[FASE 1] Análisis Catastro + Municipal para ${municipality}, ${province}`);

    // Get current profile
    const { data: profile, error: profileError } = await supabase
      .from('urban_profiles')
      .select('*')
      .eq('budget_id', budgetId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró el perfil urbanístico' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isRustico = landClass === 'Rústico' || landClass?.toLowerCase().includes('rústico');
    let documentContent = '';
    const consultedUrls: string[] = [];

    // Search municipal regulations with Firecrawl
    if (FIRECRAWL_API_KEY) {
      const queries = [
        `PGOU ${municipality} ${province} ordenanzas urbanísticas edificación`,
        `Normas Subsidiarias ${municipality} ${isRustico ? 'suelo rústico no urbanizable' : 'suelo urbano'} edificabilidad`
      ];

      for (const query of queries) {
        try {
          console.log(`[FASE 1] Buscando: ${query}`);
          
          const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              limit: 3,
              lang: 'es',
              country: 'ES',
              scrapeOptions: { formats: ['markdown'] }
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const results: SearchResult[] = searchData.data || [];
            
            for (const result of results) {
              if (result.markdown && result.markdown.length > 500) {
                documentContent += `\n\n--- FUENTE MUNICIPAL: ${result.title || result.url} ---\n${result.markdown.substring(0, 10000)}`;
                consultedUrls.push(result.url);
              }
            }
          }
        } catch (e) {
          console.error(`[FASE 1] Error búsqueda: ${e}`);
        }

        if (documentContent.length > 25000) break;
      }
    }

    // AI Analysis for Phase 1
    const analysisPrompt = `Eres un experto urbanista español. Analiza FASE 1: Catastro y Normativa Municipal.

DATOS DE LA PARCELA:
- Municipio: ${municipality}
- Provincia: ${province}
- Referencia Catastral: ${cadastralReference || 'N/A'}
- Tipo de suelo según Catastro: ${landClass || 'No especificado'}
- Superficie: ${surfaceArea ? `${surfaceArea} m²` : 'No especificada'}

${documentContent ? `DOCUMENTACIÓN MUNICIPAL ENCONTRADA:\n${documentContent.substring(0, 30000)}` : 'No se encontró documentación municipal online.'}

OBJETIVO FASE 1: Determinar la clasificación del suelo y edificabilidad básica según:
1. Datos del Catastro (ya proporcionados)
2. PGOU o Normas Subsidiarias del Ayuntamiento de ${municipality}

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 1,
  "phase_name": "Catastro + Normativa Municipal",
  "is_buildable_phase1": {
    "value": true/false/null,
    "confidence": "alta/media/baja",
    "reason": "Explicación basada en clasificación catastral y PGOU municipal"
  },
  "urban_classification": {
    "value": "Suelo Urbano / Suelo Urbanizable / Suelo No Urbanizable / Rústico Común / etc.",
    "source": "Catastro / PGOU ${municipality}"
  },
  "urban_qualification": {
    "value": "Residencial / Industrial / Agrícola / etc. si se encuentra",
    "source": "fuente"
  },
  "min_plot_area": {
    "value": número en m² o null,
    "source": "Art. X PGOU ${municipality}"
  },
  "buildability_index": {
    "value": número m²/m² o null,
    "source": "Art. X PGOU"
  },
  "max_height": {
    "value": número metros o null,
    "source": "Art. X"
  },
  "max_floors": {
    "value": número o null,
    "source": "Art. X"
  },
  "max_occupation_percent": {
    "value": número % o null,
    "source": "Art. X"
  },
  "front_setback": {
    "value": número metros o null,
    "source": "Art. X"
  },
  "side_setback": {
    "value": número metros o null,
    "source": "Art. X"
  },
  "rear_setback": {
    "value": número metros o null,
    "source": "Art. X"
  },
  "analysis_notes": "Resumen del análisis de Fase 1: qué se ha determinado, qué falta por verificar, recomendaciones para siguientes fases",
  "requires_phase2": true/false,
  "phase2_reason": "Motivo por el que se necesita analizar normativa autonómica"
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.1,
        max_tokens: 2500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[FASE 1] Error IA:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Error de IA: ${aiResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[FASE 1] Respuesta IA:', content.substring(0, 500));

    // Parse response
    let extractedData: Record<string, any>;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.error('[FASE 1] Error parsing:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al procesar respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile with Phase 1 results
    const updateData: Record<string, unknown> = {
      last_analyzed_at: new Date().toISOString(),
    };
    let fieldsCompleted = 0;
    const updatedFields: string[] = [];

    const updateField = (dbField: string, data: { value: unknown; source?: string } | undefined, label: string) => {
      if (data?.value !== null && data?.value !== undefined) {
        if (profile[dbField] === null || profile[dbField] === undefined) {
          updateData[dbField] = data.value;
          if (data.source) {
            const sourceField = `${dbField}_source`;
            if (sourceField in profile) {
              updateData[sourceField] = data.source;
            }
          }
          fieldsCompleted++;
          updatedFields.push(label);
        }
      }
    };

    // Determine buildability from phase 1
    if (extractedData.is_buildable_phase1?.value !== null) {
      // Only set if high confidence, otherwise wait for more phases
      if (extractedData.is_buildable_phase1.confidence === 'alta') {
        updateField('is_buildable', { value: extractedData.is_buildable_phase1.value }, 'Edificabilidad');
      }
    }

    updateField('urban_classification', extractedData.urban_classification, 'Clasificación suelo');
    updateField('urban_qualification', extractedData.urban_qualification, 'Calificación urbanística');
    updateField('min_plot_area', extractedData.min_plot_area, 'Parcela mínima');
    updateField('buildability_index', extractedData.buildability_index, 'Índice edificabilidad');
    updateField('max_height', extractedData.max_height, 'Altura máxima');
    updateField('max_floors', extractedData.max_floors, 'Plantas máximas');
    updateField('max_occupation_percent', extractedData.max_occupation_percent, 'Ocupación máxima');
    updateField('front_setback', extractedData.front_setback, 'Retranqueo frontal');
    updateField('side_setback', extractedData.side_setback, 'Retranqueo lateral');
    updateField('rear_setback', extractedData.rear_setback, 'Retranqueo posterior');

    // Add phase notes
    const phaseNotes = extractedData.analysis_notes || '';
    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = existingNotes 
      ? `${existingNotes}\n\n--- FASE 1: Catastro + Municipal (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`
      : `--- FASE 1: Catastro + Municipal (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`;

    // Update analysis status
    updateData.analysis_status = 'phase1_complete';

    // Save consulted sources
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = consultedUrls.map(url => ({
      name: 'Normativa Municipal',
      url,
      type: 'PGOU/NSP',
      phase: 1,
      date: new Date().toISOString().split('T')[0]
    }));
    updateData.consulted_sources = [...existingSources, ...newSources];

    // Update database
    const { error: updateError } = await supabase
      .from('urban_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('[FASE 1] Error update:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al guardar resultados' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[FASE 1] Completado: ${fieldsCompleted} campos actualizados`);

    return new Response(
      JSON.stringify({
        success: true,
        phase: 1,
        phaseName: 'Catastro + Normativa Municipal',
        fieldsCompleted,
        updatedFields,
        consultedUrls,
        buildabilityResult: extractedData.is_buildable_phase1,
        requiresPhase2: extractedData.requires_phase2 !== false,
        phase2Reason: extractedData.phase2_reason || 'Verificar normativa autonómica',
        analysisNotes: phaseNotes,
        message: fieldsCompleted > 0 
          ? `Fase 1 completada: ${updatedFields.join(', ')}`
          : 'Fase 1 completada sin nuevos datos'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FASE 1] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Error en Fase 1: ${error instanceof Error ? error.message : 'Error desconocido'}`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
