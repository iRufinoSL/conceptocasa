import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 4: Código Técnico de la Edificación y Normativa Constructiva
 * - CTE (Código Técnico de la Edificación)
 * - Zonas climáticas, sísmicas, eólicas
 * - Normativa de construcción local
 * - Estética admitida
 * - Requisitos técnicos específicos
 */

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
      coordinates
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

    console.log(`[FASE 4] Análisis CTE y Normativa Constructiva para ${municipality}, ${province}`);

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

    // Search for CTE and construction regulations
    if (FIRECRAWL_API_KEY) {
      const queries = [
        `CTE zona climática ${province} DB-HE eficiencia energética`,
        `ordenanza estética ${municipality} tipología edificatoria tradicional`
      ];

      for (const query of queries) {
        try {
          console.log(`[FASE 4] Buscando: ${query}`);
          
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
            const results = searchData.data || [];
            
            for (const result of results) {
              if (result.markdown && result.markdown.length > 300) {
                documentContent += `\n\n--- CTE/NORMATIVA: ${result.title || result.url} ---\n${result.markdown.substring(0, 8000)}`;
                consultedUrls.push(result.url);
              }
            }
          }
        } catch (e) {
          console.error(`[FASE 4] Error búsqueda: ${e}`);
        }
      }
    }

    // AI Analysis for Phase 4
    const analysisPrompt = `Eres un experto en normativa de construcción española. Analiza FASE 4.

UBICACIÓN:
- Municipio: ${municipality}
- Provincia: ${province}
- Comunidad Autónoma: ${autonomousCommunity || 'No especificada'}
${coordinates ? `- Coordenadas: ${coordinates.lat}, ${coordinates.lng}` : ''}

DATOS DEL PERFIL (Fases anteriores):
- Clasificación suelo: ${profile.urban_classification || 'No determinada'}
- Altura máxima: ${profile.max_height ? `${profile.max_height}m` : 'No determinada'}
- Plantas: ${profile.max_floors || 'No determinadas'}

${documentContent ? `DOCUMENTACIÓN CTE/CONSTRUCTIVA ENCONTRADA:\n${documentContent.substring(0, 20000)}` : ''}

OBJETIVO FASE 4: Determinar requisitos técnicos de construcción:

1. CÓDIGO TÉCNICO DE LA EDIFICACIÓN (CTE):
   - Zona climática (A, B, C, D, E)
   - Zona eólica (A, B, C)
   - Zona sísmica según NCSE-02 o NCSR-24
   - Zona de sobrecarga de nieve

2. REQUISITOS DB-HE (Ahorro energía):
   - Transmitancia térmica muros
   - Transmitancia térmica cubierta
   - Clase energética objetivo

3. ESTÉTICA Y TIPOLOGÍA:
   - Materiales de fachada permitidos/obligatorios
   - Tipo de cubierta (plana/inclinada)
   - Colores permitidos
   - Carpintería exterior

4. OTROS REQUISITOS:
   - Accesibilidad DB-SUA
   - Salubridad DB-HS
   - Protección contra incendios DB-SI

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 4,
  "phase_name": "CTE y Normativa Constructiva",
  "cte_zones": {
    "climatic_zone": "A1/A2/A3/A4/B1/B2/B3/B4/C1/C2/C3/C4/D1/D2/D3/E1",
    "wind_zone": "A/B/C",
    "seismic_zone": "descripción",
    "seismic_acceleration": número o null,
    "snow_zone": "1/2/3/4/5/6",
    "snow_load": número kg/m² o null,
    "source": "CTE/NCSE"
  },
  "energy_requirements": {
    "wall_transmittance_max": número W/m²K o null,
    "roof_transmittance_max": número W/m²K o null,
    "floor_transmittance_max": número W/m²K o null,
    "window_transmittance_max": número W/m²K o null,
    "target_energy_class": "A/B/C/D/E",
    "renewable_contribution_min": número % o null,
    "source": "DB-HE"
  },
  "aesthetic_requirements": {
    "facade_materials": ["material1", "material2"],
    "facade_colors": ["color1", "color2"] o "libres",
    "roof_type": "inclinada/plana/ambas",
    "roof_materials": ["material1", "material2"],
    "min_roof_slope": número % o null,
    "max_roof_slope": número % o null,
    "window_materials": ["material1", "material2"],
    "traditional_elements_required": true/false,
    "source": "PGOU/Ordenanza municipal"
  },
  "special_requirements": {
    "accessibility": "requisitos DB-SUA si aplican",
    "fire_protection": "requisitos DB-SI si aplican",
    "ventilation": "requisitos DB-HS3",
    "water_supply": "requisitos DB-HS4",
    "drainage": "requisitos DB-HS5"
  },
  "construction_restrictions": ["restricción1", "restricción2"],
  "recommended_construction_system": "Descripción del sistema constructivo más adecuado",
  "analysis_notes": "Resumen de requisitos técnicos y recomendaciones constructivas",
  "final_buildability": {
    "value": true/false,
    "confidence": "alta/media/baja",
    "summary": "Conclusión final considerando las 4 fases de análisis"
  }
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
      console.error('[FASE 4] Error IA:', aiResponse.status, errorText);
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
      console.error('[FASE 4] Error parsing:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al procesar respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile with Phase 4 results
    const updateData: Record<string, unknown> = {
      last_analyzed_at: new Date().toISOString(),
    };
    let fieldsCompleted = 0;
    const updatedFields: string[] = [];

    // CTE Zones
    const cteZones = extractedData.cte_zones || {};
    if (cteZones.climatic_zone && !profile.climatic_zone) {
      updateData.climatic_zone = cteZones.climatic_zone;
      fieldsCompleted++;
      updatedFields.push('Zona climática');
    }
    if (cteZones.wind_zone && !profile.wind_zone) {
      updateData.wind_zone = cteZones.wind_zone;
      fieldsCompleted++;
      updatedFields.push('Zona eólica');
    }
    if (cteZones.seismic_zone && !profile.seismic_zone) {
      updateData.seismic_zone = cteZones.seismic_zone;
      fieldsCompleted++;
      updatedFields.push('Zona sísmica');
    }
    if (cteZones.snow_zone && !profile.snow_zone) {
      updateData.snow_zone = cteZones.snow_zone;
      fieldsCompleted++;
      updatedFields.push('Zona nieve');
    }

    // Final buildability determination
    if (extractedData.final_buildability?.value !== undefined) {
      // Only override if we have high confidence
      if (extractedData.final_buildability.confidence === 'alta' || profile.is_buildable === null) {
        updateData.is_buildable = extractedData.final_buildability.value;
        updateData.is_buildable_source = 'Análisis completo (4 fases)';
        fieldsCompleted++;
        updatedFields.push('Edificabilidad final');
      }
    }

    // Add phase notes
    const phaseNotes = extractedData.analysis_notes || '';
    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = `${existingNotes}\n\n--- FASE 4: CTE y Normativa Constructiva (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}\n\n**CONCLUSIÓN FINAL:** ${extractedData.final_buildability?.summary || 'Análisis completado'}`;

    updateData.analysis_status = 'complete';

    // Save sources
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = consultedUrls.map(url => ({
      name: 'CTE / Normativa Constructiva',
      url,
      type: 'CTE',
      phase: 4,
      date: new Date().toISOString().split('T')[0]
    }));
    updateData.consulted_sources = [...existingSources, ...newSources];

    const { error: updateError } = await supabase
      .from('urban_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('[FASE 4] Error update:', updateError);
    }

    console.log(`[FASE 4] Completado: ${fieldsCompleted} campos`);

    return new Response(
      JSON.stringify({
        success: true,
        phase: 4,
        phaseName: 'CTE y Normativa Constructiva',
        fieldsCompleted,
        updatedFields,
        consultedUrls,
        cteZones: extractedData.cte_zones,
        energyRequirements: extractedData.energy_requirements,
        aestheticRequirements: extractedData.aesthetic_requirements,
        specialRequirements: extractedData.special_requirements,
        constructionRestrictions: extractedData.construction_restrictions,
        recommendedSystem: extractedData.recommended_construction_system,
        finalBuildability: extractedData.final_buildability,
        analysisNotes: phaseNotes,
        analysisComplete: true,
        message: 'Análisis urbanístico completo (4 fases)'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FASE 4] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Error en Fase 4: ${error instanceof Error ? error.message : 'Error desconocido'}`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
