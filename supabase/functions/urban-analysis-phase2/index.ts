import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 2: Análisis Normativa Autonómica/Provincial
 * - Legislación urbanística de la Comunidad Autónoma
 * - Reglamentos de desarrollo autonómicos
 * - Planes de ordenación territorial
 */

interface SearchResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

// Regional regulations mapping
const REGIONAL_REGULATIONS: Record<string, { laws: string[]; body: string; bodyName: string }> = {
  'cantabria': {
    laws: [
      'Ley de Cantabria 2/2001 de Ordenación Territorial y Urbanismo',
      'Ley 4/2020 de 11 de noviembre - Suelo Rústico de Cantabria',
      'Decreto 65/2010 - Reglamento de Disciplina Urbanística'
    ],
    body: 'CROTU',
    bodyName: 'Comisión Regional de Ordenación del Territorio y Urbanismo de Cantabria'
  },
  'asturias': {
    laws: [
      'Decreto Legislativo 1/2004 - Texto Refundido de Ordenación del Territorio y Urbanismo',
      'Decreto 278/2007 - Reglamento de Ordenación del Territorio y Urbanismo'
    ],
    body: 'CUOTA',
    bodyName: 'Comisión de Urbanismo y Ordenación del Territorio de Asturias'
  },
  'galicia': {
    laws: [
      'Ley 2/2016 del Suelo de Galicia',
      'Decreto 143/2016 - Reglamento de la Ley del Suelo de Galicia'
    ],
    body: 'CPTOPT',
    bodyName: 'Comisión Superior de Urbanismo de Galicia'
  },
  'pais vasco': {
    laws: ['Ley 2/2006 de Suelo y Urbanismo del País Vasco'],
    body: 'CTU',
    bodyName: 'Comisión de Ordenación del Territorio del País Vasco'
  },
  'castilla y leon': {
    laws: ['Ley 5/1999 de Urbanismo de Castilla y León'],
    body: 'CTU',
    bodyName: 'Comisión Territorial de Urbanismo'
  },
  'andalucia': {
    laws: ['Ley 7/2021 de impulso para la sostenibilidad del territorio de Andalucía'],
    body: 'CTUA',
    bodyName: 'Comisión Territorial de Urbanismo de Andalucía'
  },
  'cataluna': {
    laws: ['Decreto Legislativo 1/2010 - Texto Refundido de la Ley de Urbanismo de Cataluña'],
    body: 'CTU',
    bodyName: 'Comisión Territorial de Urbanismo de Cataluña'
  },
  'madrid': {
    laws: ['Ley 9/2001 del Suelo de la Comunidad de Madrid'],
    body: 'CCAUEM',
    bodyName: 'Comisión de Coordinación de la Actuación Urbanística de la Comunidad de Madrid'
  },
  'valencia': {
    laws: ['Ley 5/2014 de Ordenación del Territorio, Urbanismo y Paisaje de la Comunitat Valenciana'],
    body: 'CTU',
    bodyName: 'Comisión Territorial de Urbanismo'
  }
};

function getRegionalInfo(region: string): { laws: string[]; body: string; bodyName: string } {
  const regionLower = region?.toLowerCase() || '';
  for (const [key, value] of Object.entries(REGIONAL_REGULATIONS)) {
    if (regionLower.includes(key)) {
      return value;
    }
  }
  return {
    laws: ['Ley del Suelo y Rehabilitación Urbana (RDL 7/2015)'],
    body: 'CTU',
    bodyName: 'Comisión Territorial de Urbanismo'
  };
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
      landClass
    } = await req.json();

    if (!budgetId) {
      return new Response(
        JSON.stringify({ success: false, error: 'budgetId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Budget ownership verification ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: accessCheck } = await supabase.rpc('has_presupuesto_access', { _user_id: userId, _presupuesto_id: budgetId });
    if (!accessCheck) {
      return new Response(JSON.stringify({ success: false, error: 'Sin acceso a este presupuesto' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // --- End ownership verification ---

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'API de IA no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const region = autonomousCommunity || province;
    console.log(`[FASE 2] Análisis Autonómico para ${region}`);

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
    const regionalInfo = getRegionalInfo(region);
    
    let documentContent = '';
    const consultedUrls: string[] = [];

    // Search regional regulations
    if (FIRECRAWL_API_KEY) {
      const queries = [
        `${regionalInfo.laws[0]} ${isRustico ? 'suelo rústico edificación vivienda' : 'urbanismo edificación'}`,
        `normativa urbanística ${region} ${isRustico ? 'suelo no urbanizable' : ''} edificabilidad retranqueos`
      ];

      for (const query of queries) {
        try {
          console.log(`[FASE 2] Buscando: ${query}`);
          
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
                documentContent += `\n\n--- FUENTE AUTONÓMICA: ${result.title || result.url} ---\n${result.markdown.substring(0, 10000)}`;
                consultedUrls.push(result.url);
              }
            }
          }
        } catch (e) {
          console.error(`[FASE 2] Error búsqueda: ${e}`);
        }

        if (documentContent.length > 25000) break;
      }
    }

    // AI Analysis for Phase 2
    const analysisPrompt = `Eres un experto urbanista español. Analiza FASE 2: Normativa Autonómica/Provincial.

CONTEXTO:
- Comunidad Autónoma/Región: ${region}
- Municipio: ${municipality}, ${province}
- Tipo de suelo: ${landClass || 'No especificado'}
${isRustico ? '- ES SUELO RÚSTICO: Aplican normativas especiales' : ''}

NORMATIVAS AUTONÓMICAS APLICABLES:
${regionalInfo.laws.map(l => `- ${l}`).join('\n')}

ORGANISMO AUTORIZADOR EN SUELO RÚSTICO:
- ${regionalInfo.body}: ${regionalInfo.bodyName}

DATOS ACTUALES DEL PERFIL (Fase 1):
- Clasificación: ${profile.urban_classification || 'Pendiente'}
- Edificabilidad determinada: ${profile.is_buildable === null ? 'Pendiente' : (profile.is_buildable ? 'Sí' : 'No')}

${documentContent ? `DOCUMENTACIÓN AUTONÓMICA ENCONTRADA:\n${documentContent.substring(0, 30000)}` : 'No se encontró documentación autonómica online.'}

OBJETIVO FASE 2: Complementar el análisis municipal con:
1. Normativa autonómica aplicable al tipo de suelo
2. Parámetros que la legislación autonómica establece como mínimos/máximos
3. Procedimiento de autorización necesario
4. Requisitos especiales de la Comunidad Autónoma

${isRustico ? `
PARA SUELO RÚSTICO EN ${region.toUpperCase()}:
- ¿Requiere autorización de ${regionalInfo.body}?
- ¿Cuál es la parcela mínima autonómica?
- ¿Cuáles son los parámetros de edificación en rústico?
- ¿Distancia mínima al núcleo urbano?
` : ''}

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 2,
  "phase_name": "Normativa Autonómica ${region}",
  "applicable_laws": ["lista de leyes que aplican"],
  "authorizing_body": "${regionalInfo.body}",
  "authorizing_body_name": "${regionalInfo.bodyName}",
  "requires_regional_authorization": {
    "value": true/false,
    "procedure": "Descripción del procedimiento si aplica"
  },
  "rustic_land_use": {
    "value": "Ordinario/Agropecuario/Forestal/Protección Especial/etc." o null,
    "source": "Art. X Ley autonómica"
  },
  "regional_min_plot": {
    "value": número m² o null,
    "source": "Art. X"
  },
  "regional_buildability_index": {
    "value": número m²/m² o null,
    "source": "Art. X"
  },
  "regional_max_height": {
    "value": número metros o null,
    "source": "Art. X"
  },
  "regional_setbacks": {
    "front": número o null,
    "side": número o null,
    "rear": número o null,
    "source": "Art. X"
  },
  "distance_to_urban_nucleus": {
    "required_min": número metros o null,
    "source": "Art. X"
  },
  "buildability_requirements": ["requisito1", "requisito2"],
  "analysis_notes": "Resumen del análisis autonómico: normativas aplicables, requisitos, procedimientos necesarios",
  "is_buildable_phase2": {
    "value": true/false/null,
    "confidence": "alta/media/baja",
    "reason": "Justificación según normativa autonómica"
  },
  "requires_phase3": true/false,
  "phase3_reason": "Motivo para analizar afecciones sectoriales"
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
      console.error('[FASE 2] Error IA:', aiResponse.status, errorText);
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
      console.error('[FASE 2] Error parsing:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al procesar respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile with Phase 2 results
    const updateData: Record<string, unknown> = {
      last_analyzed_at: new Date().toISOString(),
    };
    let fieldsCompleted = 0;
    const updatedFields: string[] = [];

    // Set authorizing body
    if (!profile.authorizing_body) {
      updateData.authorizing_body = extractedData.authorizing_body || regionalInfo.body;
      updateData.authorizing_body_name = extractedData.authorizing_body_name || regionalInfo.bodyName;
      fieldsCompleted++;
      updatedFields.push('Organismo autorizador');
    }

    // Update rustic land use if found
    if (extractedData.rustic_land_use?.value && !profile.rustic_land_use) {
      updateData.rustic_land_use = extractedData.rustic_land_use.value;
      updateData.rustic_land_use_source = extractedData.rustic_land_use.source;
      fieldsCompleted++;
      updatedFields.push('Uso suelo rústico');
    }

    // Update parameters if regional values are more restrictive or missing
    if (extractedData.regional_min_plot?.value && !profile.min_plot_area) {
      updateData.min_plot_area = extractedData.regional_min_plot.value;
      fieldsCompleted++;
      updatedFields.push('Parcela mínima (autonómica)');
    }

    if (extractedData.regional_buildability_index?.value && !profile.buildability_index) {
      updateData.buildability_index = extractedData.regional_buildability_index.value;
      updateData.buildability_index_source = extractedData.regional_buildability_index.source;
      fieldsCompleted++;
      updatedFields.push('Edificabilidad (autonómica)');
    }

    // Buildability requirements
    if (extractedData.buildability_requirements && Array.isArray(extractedData.buildability_requirements)) {
      const existing = profile.buildability_requirements || [];
      const combined = [...new Set([...existing, ...extractedData.buildability_requirements])];
      updateData.buildability_requirements = combined;
      fieldsCompleted++;
      updatedFields.push('Requisitos edificabilidad');
    }

    // Add phase notes
    const phaseNotes = extractedData.analysis_notes || '';
    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = `${existingNotes}\n\n--- FASE 2: Normativa Autonómica ${region} (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`;

    updateData.analysis_status = 'phase2_complete';

    // Save sources
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = consultedUrls.map(url => ({
      name: 'Normativa Autonómica',
      url,
      type: 'Legislación',
      phase: 2,
      date: new Date().toISOString().split('T')[0]
    }));
    updateData.consulted_sources = [...existingSources, ...newSources];

    const { error: updateError } = await supabase
      .from('urban_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('[FASE 2] Error update:', updateError);
    }

    console.log(`[FASE 2] Completado: ${fieldsCompleted} campos`);

    return new Response(
      JSON.stringify({
        success: true,
        phase: 2,
        phaseName: `Normativa Autonómica ${region}`,
        fieldsCompleted,
        updatedFields,
        consultedUrls,
        applicableLaws: extractedData.applicable_laws || regionalInfo.laws,
        authorizingBody: {
          code: extractedData.authorizing_body || regionalInfo.body,
          name: extractedData.authorizing_body_name || regionalInfo.bodyName
        },
        requiresRegionalAuth: extractedData.requires_regional_authorization,
        buildabilityResult: extractedData.is_buildable_phase2,
        requiresPhase3: extractedData.requires_phase3 !== false,
        phase3Reason: extractedData.phase3_reason || 'Verificar afecciones sectoriales',
        analysisNotes: phaseNotes,
        message: `Fase 2 completada: Normativa de ${region}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FASE 2] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Error en Fase 2: ${error instanceof Error ? error.message : 'Error desconocido'}`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
