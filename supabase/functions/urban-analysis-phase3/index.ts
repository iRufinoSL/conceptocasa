import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 3: Afecciones Sectoriales
 * - AESA (Aeropuertos/Servidumbres aéreas)
 * - Costas (Ley de Costas)
 * - Ríos/Confederación Hidrográfica
 * - Zonas inundables
 * - Carreteras/Ferrocarriles
 * - Patrimonio histórico
 * - Montes/Forestal
 * - Vías pecuarias
 * - CEMENTERIOS / Policía Sanitaria Mortuoria (NUEVO - importante)
 * - Líneas eléctricas
 * - Gasoductos/Oleoductos
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
      autonomousCommunity,
      coordinates // { lat, lng }
    } = await req.json();

    if (!budgetId) {
      return new Response(
        JSON.stringify({ success: false, error: 'budgetId es requerido' }),
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

    console.log(`[FASE 3] Análisis Afecciones Sectoriales para ${municipality}, ${province}`);

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

    let documentContent = '';
    const consultedUrls: string[] = [];

    // Search for sectoral affections - including cemetery/mortuary police
    if (FIRECRAWL_API_KEY) {
      const queries = [
        `afecciones sectoriales ${municipality} ${province} aeropuerto costas ríos`,
        `servidumbres aeronáuticas AESA ${province}`,
        `zona inundable confederación hidrográfica ${province}`,
        `cementerio ${municipality} policía sanitaria mortuoria distancia edificación`,
        `reglamento policía sanitaria mortuoria ${autonomousCommunity || province} distancia mínima viviendas`
      ];

      for (const query of queries) {
        try {
          console.log(`[FASE 3] Buscando: ${query}`);
          
          const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              limit: 2,
              lang: 'es',
              country: 'ES',
              scrapeOptions: { formats: ['markdown'] }
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const results: SearchResult[] = searchData.data || [];
            
            for (const result of results) {
              if (result.markdown && result.markdown.length > 300) {
                documentContent += `\n\n--- AFECCIÓN SECTORIAL: ${result.title || result.url} ---\n${result.markdown.substring(0, 8000)}`;
                consultedUrls.push(result.url);
              }
            }
          }
        } catch (e) {
          console.error(`[FASE 3] Error búsqueda: ${e}`);
        }

        if (documentContent.length > 20000) break;
      }
    }

    // AI Analysis for Phase 3
    const analysisPrompt = `Eres un experto en afecciones sectoriales urbanísticas en España. Analiza FASE 3.

UBICACIÓN:
- Municipio: ${municipality}
- Provincia: ${province}
- Comunidad Autónoma: ${autonomousCommunity || 'No especificada'}
${coordinates ? `- Coordenadas: ${coordinates.lat}, ${coordinates.lng}` : ''}

${documentContent ? `INFORMACIÓN DE AFECCIONES ENCONTRADA:\n${documentContent.substring(0, 25000)}` : 'No se encontró información específica de afecciones.'}

OBJETIVO FASE 3: Identificar todas las AFECCIONES SECTORIALES que pueden afectar a esta parcela:

1. AESA (Agencia Estatal de Seguridad Aérea):
   - ¿Hay aeropuertos cerca? ¿Cuál es el más próximo?
   - ¿Existen servidumbres aeronáuticas que limiten la altura?

2. COSTAS (Ley de Costas):
   - ¿Es municipio costero?
   - ¿Aplica zona de servidumbre de protección (100m) o zona de influencia?

3. AGUAS (Confederación Hidrográfica):
   - ¿Hay cauces de agua cerca?
   - ¿Es zona inundable según SNCZI?
   - ¿Cuál es la Confederación Hidrográfica competente?

4. CARRETERAS/FERROCARRILES:
   - Distancias a vías de comunicación principales
   - Servidumbres de carreteras

5. PATRIMONIO HISTÓRICO:
   - ¿Hay BIC (Bien de Interés Cultural) cerca?
   - ¿Zona arqueológica?

6. MONTES/FORESTAL:
   - ¿Es monte público o privado?
   - ¿Zona forestal protegida?

7. VÍAS PECUARIAS:
   - ¿Existe alguna vía pecuaria que atraviese o colinde?

8. CEMENTERIOS / POLICÍA SANITARIA MORTUORIA (MUY IMPORTANTE):
   - ¿Hay cementerios cerca de la parcela?
   - ¿Cuál es la distancia mínima requerida según la normativa autonómica?
   - REFERENCIAS NORMATIVAS POR CCAA:
     * ASTURIAS: Decreto 72/2018 (50m para nuevas construcciones)
     * CANTABRIA: Decreto 1/2007 (200m para viviendas)
     * CASTILLA Y LEÓN: Decreto 16/2005 (200m)
     * GALICIA: Decreto 134/1998 (50m)
     * PAÍS VASCO: Decreto 18/2016 (50m)
     * OTROS: Generalmente 200m según RD 2263/1974

9. OTROS:
   - Líneas eléctricas alta tensión
   - Gasoductos/Oleoductos
   - Cementerios

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 3,
  "phase_name": "Afecciones Sectoriales",
  "affections_detected": {
    "airport": {
      "affected": true/false,
      "airport_name": "nombre o null",
      "distance_km": número o null,
      "max_height_limit": número metros o null,
      "requires_aesa_auth": true/false,
      "source": "fuente"
    },
    "coast": {
      "affected": true/false,
      "distance_m": número o null,
      "zone_type": "protección/influencia/tránsito/dominio público",
      "source": "fuente"
    },
    "water_courses": {
      "affected": true/false,
      "river_name": "nombre o null",
      "distance_m": número o null,
      "confederation": "Nombre Confederación Hidrográfica",
      "flood_zone": true/false,
      "source": "fuente"
    },
    "roads": {
      "affected": true/false,
      "road_type": "autopista/nacional/autonómica/local",
      "distance_m": número o null,
      "source": "fuente"
    },
    "railway": {
      "affected": true/false,
      "distance_m": número o null,
      "source": "fuente"
    },
    "heritage": {
      "affected": true/false,
      "bic_name": "nombre o null",
      "distance_m": número o null,
      "type": "monumento/conjunto/zona arqueológica",
      "source": "fuente"
    },
    "forest": {
      "affected": true/false,
      "forest_type": "público/privado/protegido",
      "distance_m": número o null,
      "source": "fuente"
    },
    "livestock_route": {
      "affected": true/false,
      "route_name": "nombre o null",
      "width_m": número o null,
      "source": "fuente"
    },
    "power_lines": {
      "affected": true/false,
      "voltage_kv": número o null,
      "distance_m": número o null,
      "source": "fuente"
    },
    "pipeline": {
      "affected": true/false,
      "type": "gas/petróleo",
      "distance_m": número o null,
      "source": "fuente"
    },
    "cemetery": {
      "affected": true/false,
      "cemetery_name": "nombre del cementerio o null",
      "distance_m": número en metros o null,
      "min_required_distance_m": número según normativa autonómica (50 a 200m),
      "source": "Normativa específica (ej: Decreto 72/2018 Asturias)",
      "regulatory_body": "Consejería de Sanidad correspondiente",
      "notes": "Observaciones sobre la afección"
    }
  },
  "total_affections": número,
  "critical_affections": ["lista de afecciones que impiden o limitan seriamente"],
  "required_authorizations": ["AESA", "Confederación Hidrográfica", etc.],
  "analysis_notes": "Resumen de afecciones detectadas y su impacto en la edificabilidad",
  "is_buildable_phase3": {
    "value": true/false/null,
    "confidence": "alta/media/baja",
    "reason": "Justificación considerando todas las afecciones"
  },
  "requires_phase4": true/false,
  "phase4_reason": "Motivo para analizar CTE y normativa constructiva"
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
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[FASE 3] Error IA:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Error de IA: ${aiResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let extractedData: Record<string, any>;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.error('[FASE 3] Error parsing:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al procesar respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile with Phase 3 results
    const updateData: Record<string, unknown> = {
      last_analyzed_at: new Date().toISOString(),
    };
    let fieldsCompleted = 0;
    const updatedFields: string[] = [];
    const affections = extractedData.affections_detected || {};

    // Airport affection
    if (affections.airport?.affected !== undefined) {
      updateData.affected_by_airport = affections.airport.affected;
      if (affections.airport.distance_km) {
        updateData.min_distance_airport = affections.airport.distance_km * 1000; // Convert to meters
        updateData.min_distance_airport_source = affections.airport.source;
      }
      if (affections.airport.max_height_limit) {
        updateData.max_height_airport = affections.airport.max_height_limit;
        updateData.max_height_airport_source = 'AESA - Servidumbres aeronáuticas';
      }
      fieldsCompleted++;
      updatedFields.push('Afección aeroportuaria');
    }

    // Coast affection
    if (affections.coast?.affected !== undefined) {
      updateData.affected_by_coast = affections.coast.affected;
      if (affections.coast.distance_m) {
        updateData.min_distance_coast = affections.coast.distance_m;
        updateData.min_distance_coast_source = affections.coast.source || 'Ley de Costas';
      }
      fieldsCompleted++;
      updatedFields.push('Afección costera');
    }

    // Water courses affection
    if (affections.water_courses?.affected !== undefined) {
      updateData.affected_by_water_courses = affections.water_courses.affected;
      if (affections.water_courses.distance_m) {
        updateData.min_distance_water_courses = affections.water_courses.distance_m;
        updateData.min_distance_water_courses_source = affections.water_courses.confederation || 'Confederación Hidrográfica';
      }
      fieldsCompleted++;
      updatedFields.push('Afección hidrográfica');
    }

    // Forest affection
    if (affections.forest?.affected !== undefined) {
      updateData.affected_by_forest = affections.forest.affected;
      if (affections.forest.distance_m) {
        updateData.min_distance_forest = affections.forest.distance_m;
        updateData.min_distance_forest_source = affections.forest.source;
      }
      fieldsCompleted++;
      updatedFields.push('Afección forestal');
    }

    // Heritage affection
    if (affections.heritage?.affected !== undefined) {
      updateData.affected_by_heritage = affections.heritage.affected;
      fieldsCompleted++;
      updatedFields.push('Afección patrimonial');
    }

    // Livestock route affection
    if (affections.livestock_route?.affected !== undefined) {
      updateData.affected_by_livestock_route = affections.livestock_route.affected;
      fieldsCompleted++;
      updatedFields.push('Vía pecuaria');
    }

    // Power lines
    if (affections.power_lines?.affected !== undefined) {
      updateData.affected_by_power_lines = affections.power_lines.affected;
      if (affections.power_lines.distance_m) {
        updateData.min_distance_power_lines = affections.power_lines.distance_m;
      }
      fieldsCompleted++;
      updatedFields.push('Líneas eléctricas');
    }

    // Cemetery
    if (affections.cemetery?.distance_m) {
      updateData.min_distance_cemetery = affections.cemetery.distance_m;
      updateData.affected_by_cemetery = affections.cemetery.affected;
      fieldsCompleted++;
      updatedFields.push('Distancia cementerio');
    }

    // Railway
    if (affections.railway?.distance_m) {
      updateData.min_distance_railway = affections.railway.distance_m;
      fieldsCompleted++;
      updatedFields.push('Distancia ferrocarril');
    }

    // Store sectoral restrictions as JSON
    updateData.sectoral_restrictions = affections;

    // Add phase notes
    const phaseNotes = extractedData.analysis_notes || '';
    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = `${existingNotes}\n\n--- FASE 3: Afecciones Sectoriales (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`;

    updateData.analysis_status = 'phase3_complete';

    // Save sources
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = consultedUrls.map(url => ({
      name: 'Afecciones Sectoriales',
      url,
      type: 'Sectorial',
      phase: 3,
      date: new Date().toISOString().split('T')[0]
    }));
    updateData.consulted_sources = [...existingSources, ...newSources];

    const { error: updateError } = await supabase
      .from('urban_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('[FASE 3] Error update:', updateError);
    }

    console.log(`[FASE 3] Completado: ${fieldsCompleted} campos, ${extractedData.total_affections || 0} afecciones`);

    return new Response(
      JSON.stringify({
        success: true,
        phase: 3,
        phaseName: 'Afecciones Sectoriales',
        fieldsCompleted,
        updatedFields,
        consultedUrls,
        affectionsDetected: affections,
        totalAffections: extractedData.total_affections || 0,
        criticalAffections: extractedData.critical_affections || [],
        requiredAuthorizations: extractedData.required_authorizations || [],
        buildabilityResult: extractedData.is_buildable_phase3,
        requiresPhase4: extractedData.requires_phase4 !== false,
        phase4Reason: extractedData.phase4_reason || 'Analizar CTE y normativa constructiva',
        analysisNotes: phaseNotes,
        message: `Fase 3 completada: ${extractedData.total_affections || 0} afecciones analizadas`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FASE 3] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Error en Fase 3: ${error instanceof Error ? error.message : 'Error desconocido'}`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
