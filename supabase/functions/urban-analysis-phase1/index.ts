import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 1: Análisis Catastro + Normativa Municipal
 * - Consulta datos del Catastro
 * - Busca PGOU/PGMO/Normas Subsidiarias del Ayuntamiento
 * - Detecta Núcleos Rurales (clave para edificabilidad en rústico)
 * - Determina clasificación del suelo y edificabilidad básica
 * 
 * METODOLOGÍA BASADA EN INFORME AYUNTAMIENTO DE SIERO:
 * 1. Identificar si la parcela está dentro de un Núcleo Rural delimitado
 * 2. Si está en NR, aplican parámetros especiales (sin parcela mínima)
 * 3. Buscar la zona específica en los planos del PGOU/PGMO
 * 4. Extraer artículos y normas aplicables
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
      surfaceArea,
      coordinates
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

    // Extract polygon/parcel from cadastral reference for specific searches
    let polygonParcel = '';
    if (cadastralReference && cadastralReference.length >= 14) {
      // Format: 33066A162000020000EA -> Polígono 162, Parcela 2
      const refCode = cadastralReference.substring(5, 14);
      if (refCode.startsWith('A') || refCode.match(/^\d/)) {
        const polyMatch = cadastralReference.match(/A(\d{3})/);
        const parcelMatch = cadastralReference.match(/A\d{3}(\d{5})/);
        if (polyMatch && parcelMatch) {
          const poly = parseInt(polyMatch[1]);
          const parcel = parseInt(parcelMatch[1]);
          polygonParcel = `Polígono ${poly} Parcela ${parcel}`;
        }
      }
    }

    // Search municipal regulations with Firecrawl - ENHANCED SEARCHES
    if (FIRECRAWL_API_KEY) {
      // Priority queries based on Siero methodology
      const queries = [
        // 1. CRITICAL: Search for Núcleo Rural delimitation - KEY for rustic buildability
        `PGOU ${municipality} núcleo rural delimitación ${isRustico ? 'suelo no urbanizable' : ''}`,
        // 2. Specific municipal planning documents
        `PGMO ${municipality} ordenanzas urbanísticas zonificación ${province}`,
        // 3. If we have polygon/parcel info, search specifically
        polygonParcel ? `${municipality} ${polygonParcel} clasificación suelo` : `normas subsidiarias ${municipality} edificación vivienda unifamiliar`
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
              limit: 2, // Reduced for performance
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
                documentContent += `\n\n--- FUENTE MUNICIPAL: ${result.title || result.url} ---\n${result.markdown.substring(0, 8000)}`;
                consultedUrls.push(result.url);
              }
            }
          }
        } catch (e) {
          console.error(`[FASE 1] Error búsqueda: ${e}`);
        }

        // Limit total content to prevent timeouts
        if (documentContent.length > 20000) break;
      }
    }

    // AI Analysis for Phase 1 - ENHANCED PROMPT with Núcleo Rural detection
    const analysisPrompt = `Eres un experto urbanista español. Analiza FASE 1: Catastro y Normativa Municipal.

DATOS DE LA PARCELA:
- Municipio: ${municipality}
- Provincia: ${province}
- Referencia Catastral: ${cadastralReference || 'N/A'}
- ${polygonParcel ? `Ubicación: ${polygonParcel}` : ''}
- Tipo de suelo según Catastro: ${landClass || 'No especificado'}
- Superficie: ${surfaceArea ? `${surfaceArea} m²` : 'No especificada'}
${coordinates ? `- Coordenadas: ${coordinates.lat}, ${coordinates.lng}` : ''}

${documentContent ? `DOCUMENTACIÓN MUNICIPAL ENCONTRADA:\n${documentContent.substring(0, 25000)}` : 'No se encontró documentación municipal online.'}

OBJETIVO FASE 1 (Metodología tipo Ayuntamiento de Siero):

🔑 PASO CRÍTICO: DETECTAR NÚCLEO RURAL
En suelo rústico, la clave es determinar si la parcela está dentro de un NÚCLEO RURAL delimitado:
- Si SÍ está en Núcleo Rural → Generalmente NO hay parcela mínima → ES EDIFICABLE (con condiciones)
- Si NO está en Núcleo Rural → Aplican las parcelas mínimas generales de suelo rústico (5.000-15.000 m²)

1. ¿Está la parcela incluida en un Núcleo Rural delimitado por el PGOU/PGMO?
2. Si es NR, ¿qué código de zona tiene? (ej: NR-1, 22.02 NR Carbayín)
3. ¿Qué artículos del PGOU regulan esa zona?
4. ¿Cuáles son los parámetros edificatorios específicos de esa zona?

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 1,
  "phase_name": "Catastro + Normativa Municipal",
  "is_in_nucleo_rural": {
    "value": true/false/null,
    "nucleo_name": "Nombre del núcleo si aplica (ej: NR Carbayín)",
    "zone_code": "Código de zona si aplica (ej: 22.02 NR)",
    "source": "Art. X PGOU/PGMO ${municipality}"
  },
  "is_buildable_phase1": {
    "value": true/false/null,
    "confidence": "alta/media/baja",
    "reason": "Explicación. Si está en NR: 'Parcela dentro de Núcleo Rural delimitado, no aplica parcela mínima'. Si no: explicar según clasificación"
  },
  "urban_classification": {
    "value": "Suelo Urbano / Suelo Urbanizable / Suelo No Urbanizable - Núcleo Rural / Suelo No Urbanizable - Común / Rústico Especial Protección / etc.",
    "category": "Urbano / Urbanizable / No Urbanizable",
    "subcategory": "Núcleo Rural / Común / Protección / etc. si aplica",
    "source": "Catastro / Art. X PGOU ${municipality}"
  },
  "urban_qualification": {
    "value": "Residencial Unifamiliar / Agrícola / Industrial / Mixto / etc.",
    "zone_name": "Nombre completo de la zona (ej: Zona 22.02 NR Carbayín)",
    "source": "Art. X PGOU"
  },
  "min_plot_area": {
    "value": número en m² o null,
    "applies_in_nucleo_rural": true/false,
    "note": "En Núcleos Rurales suele no existir parcela mínima",
    "source": "Art. X PGOU ${municipality}"
  },
  "max_built_surface": {
    "value": número m² o null,
    "source": "Art. X"
  },
  "max_occupation_percent": {
    "value": número % o null,
    "source": "Art. X"
  },
  "buildability_index": {
    "value": número m²/m² o null,
    "source": "Art. X PGOU"
  },
  "max_height": {
    "value": número metros o null,
    "reference_point": "al alero / a cumbrera / sobre rasante",
    "source": "Art. X"
  },
  "max_floors": {
    "value": número o null,
    "note": "B+1, B+2, etc.",
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
  "allowed_uses": ["Vivienda unifamiliar", "Agrícola", etc.],
  "prohibited_uses": ["Vivienda colectiva", "Industrial", etc.],
  "applicable_articles": [
    {
      "article": "Art. 4.116",
      "title": "Título del artículo",
      "summary": "Resumen de lo que regula"
    }
  ],
  "analysis_notes": "Resumen técnico del análisis de Fase 1: clasificación, si está en NR, parámetros clave, qué falta por verificar. Incluir referencias a artículos específicos.",
  "requires_phase2": true/false,
  "phase2_reason": "Motivo por el que se necesita analizar normativa autonómica (ej: verificar TROTU/ROTU para suelo rústico, autorización CUOTA, etc.)"
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

    // CRITICAL: Detect Núcleo Rural
    const isInNucleoRural = extractedData.is_in_nucleo_rural?.value === true;
    
    // Determine buildability - Special handling for Núcleo Rural
    if (extractedData.is_buildable_phase1?.value !== null) {
      // In Núcleo Rural, we can be more confident even with small plots
      const confidence = extractedData.is_buildable_phase1.confidence;
      if (confidence === 'alta' || (isInNucleoRural && confidence === 'media')) {
        updateField('is_buildable', { value: extractedData.is_buildable_phase1.value }, 'Edificabilidad');
      }
    }

    // Urban classification with enhanced info
    if (extractedData.urban_classification?.value) {
      let classificationValue = extractedData.urban_classification.value;
      // If in Núcleo Rural, make it explicit in classification
      if (isInNucleoRural && !classificationValue.toLowerCase().includes('núcleo rural')) {
        classificationValue = `${classificationValue} - Núcleo Rural`;
      }
      updateField('urban_classification', { 
        value: classificationValue, 
        source: extractedData.urban_classification.source 
      }, 'Clasificación suelo');
    }

    // Urban qualification with zone info
    if (extractedData.urban_qualification?.value) {
      let qualificationValue = extractedData.urban_qualification.value;
      if (extractedData.urban_qualification.zone_name) {
        qualificationValue = `${qualificationValue} (${extractedData.urban_qualification.zone_name})`;
      }
      updateField('urban_qualification', { 
        value: qualificationValue, 
        source: extractedData.urban_qualification.source 
      }, 'Calificación urbanística');
    }

    // Min plot area - special handling for Núcleo Rural
    if (extractedData.min_plot_area?.value !== null && extractedData.min_plot_area?.value !== undefined) {
      // In Núcleo Rural, there's often no minimum plot
      if (isInNucleoRural && extractedData.min_plot_area.applies_in_nucleo_rural === false) {
        // Don't set a minimum, or set to 0 to indicate no minimum
        updateData.min_plot_area = 0;
        updateData.min_plot_area_source = `${extractedData.min_plot_area.source} - Sin parcela mínima en Núcleo Rural`;
        fieldsCompleted++;
        updatedFields.push('Parcela mínima (N/A en NR)');
      } else {
        updateField('min_plot_area', extractedData.min_plot_area, 'Parcela mínima');
      }
    }

    updateField('max_built_surface', extractedData.max_built_surface, 'Superficie máx. construida');
    updateField('buildability_index', extractedData.buildability_index, 'Índice edificabilidad');
    updateField('max_height', extractedData.max_height, 'Altura máxima');
    updateField('max_floors', extractedData.max_floors, 'Plantas máximas');
    updateField('max_occupation_percent', extractedData.max_occupation_percent, 'Ocupación máxima');
    updateField('front_setback', extractedData.front_setback, 'Retranqueo frontal');
    updateField('side_setback', extractedData.side_setback, 'Retranqueo lateral');
    updateField('rear_setback', extractedData.rear_setback, 'Retranqueo posterior');

    // Save Núcleo Rural info in buildable requirements
    const requirements: string[] = [];
    if (isInNucleoRural) {
      const nucleoName = extractedData.is_in_nucleo_rural.nucleo_name || 'Núcleo Rural';
      const zoneCode = extractedData.is_in_nucleo_rural.zone_code || '';
      requirements.push(`✓ Parcela incluida en ${nucleoName}${zoneCode ? ` (${zoneCode})` : ''}`);
      requirements.push('✓ Sin parcela mínima edificable dentro del Núcleo Rural');
    }
    if (extractedData.allowed_uses && extractedData.allowed_uses.length > 0) {
      requirements.push(`Usos permitidos: ${extractedData.allowed_uses.join(', ')}`);
    }
    if (extractedData.prohibited_uses && extractedData.prohibited_uses.length > 0) {
      requirements.push(`Usos prohibidos: ${extractedData.prohibited_uses.join(', ')}`);
    }
    if (requirements.length > 0) {
      const existing = profile.buildable_requirements || [];
      updateData.buildable_requirements = [...new Set([...existing, ...requirements])];
    }

    // Add applicable articles to notes
    let phaseNotes = extractedData.analysis_notes || '';
    if (extractedData.applicable_articles && extractedData.applicable_articles.length > 0) {
      phaseNotes += '\n\n📋 Artículos aplicables del PGOU/PGMO:';
      for (const art of extractedData.applicable_articles) {
        phaseNotes += `\n• ${art.article}: ${art.title || ''} - ${art.summary || ''}`;
      }
    }

    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = existingNotes 
      ? `${existingNotes}\n\n--- FASE 1: Catastro + Municipal (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`
      : `--- FASE 1: Catastro + Municipal (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`;

    // Update analysis status
    updateData.analysis_status = 'phase1_complete';

    // Save consulted sources with more detail
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = consultedUrls.map(url => ({
      name: `PGOU/PGMO ${municipality}`,
      url,
      type: 'Normativa Municipal',
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
        isInNucleoRural,
        nucleoRuralInfo: extractedData.is_in_nucleo_rural,
        buildabilityResult: extractedData.is_buildable_phase1,
        urbanClassification: extractedData.urban_classification,
        applicableArticles: extractedData.applicable_articles,
        requiresPhase2: extractedData.requires_phase2 !== false,
        phase2Reason: extractedData.phase2_reason || 'Verificar normativa autonómica (TROTU/ROTU)',
        analysisNotes: phaseNotes,
        message: isInNucleoRural 
          ? `Fase 1 completada: Parcela en Núcleo Rural - ${updatedFields.join(', ')}`
          : fieldsCompleted > 0 
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
