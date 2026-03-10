import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 1: Análisis Catastro + Normativa Municipal (MEJORADO)
 * 
 * FUENTES OFICIALES CONSULTADAS (basado en metodología ChatGPT/Ayto. Siero):
 * 
 * 1. SEDE ELECTRÓNICA DEL CATASTRO (sedecatastro.gob.es)
 *    - Ficha descriptiva y gráfica de la parcela
 *    - Tipo de uso (urbano/rústico), superficie, titular
 *    - Coordenadas y cartografía
 * 
 * 2. PGOU/PGMO/NORMAS SUBSIDIARIAS DEL MUNICIPIO
 *    - Planos de Clasificación del Suelo
 *    - Planos de Calificación del Suelo
 *    - Planos de Núcleos Rurales delimitados
 *    - Normativa urbanística (artículos específicos)
 * 
 * 3. WEB OFICIAL DEL AYUNTAMIENTO
 *    - Ordenanzas urbanísticas
 *    - Fichas de zonas
 *    - Catálogos de protección
 * 
 * 4. SISTEMA DE INFORMACIÓN URBANÍSTICA (SIU)
 *    - Clasificación urbanística oficial
 *    - Planes vigentes
 * 
 * METODOLOGÍA:
 * - Detectar si está en NÚCLEO RURAL (clave para suelo rústico pequeño)
 * - Extraer parámetros edificatorios de la zona
 * - Identificar artículos aplicables del PGOU
 */

interface SearchResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

// Official sources to search
const OFFICIAL_SOURCES = {
  catastro: {
    base: 'sedecatastro.gob.es',
    searchUrl: 'https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiworeno.aspx',
    name: 'Sede Electrónica del Catastro'
  },
  siu: {
    base: 'siu.vivienda.es',
    name: 'Sistema de Información Urbanística'
  },
  ideAsturias: {
    base: 'ideAsturias.es',
    name: 'IDE Asturias - Infraestructura de Datos Espaciales'
  },
  ideCantabria: {
    base: 'mapas.cantabria.es',
    name: 'IDE Cantabria'
  },
  ideGalicia: {
    base: 'mapas.xunta.gal',
    name: 'IDE Galicia'
  },
  idePaisVasco: {
    base: 'geo.euskadi.eus',
    name: 'GeoEuskadi'
  },
  ideCastillaLeon: {
    base: 'cartografia.jcyl.es',
    name: 'IDE Castilla y León'
  }
};

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
      coordinates,
      autonomousCommunity
    } = await req.json();

    if (!budgetId || !municipality) {
      return new Response(
        JSON.stringify({ success: false, error: 'budgetId y municipality son requeridos' }),
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

    console.log(`[FASE 1] Análisis Catastro + Municipal para ${municipality}, ${province}`);
    console.log(`[FASE 1] Ref. Catastral: ${cadastralReference || 'N/A'}`);

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
    const officialSourcesFound: Array<{name: string; url: string; type: string}> = [];

    // Extract polygon/parcel from cadastral reference for specific searches
    let polygonParcel = '';
    let municipalityCode = '';
    if (cadastralReference && cadastralReference.length >= 14) {
      // Format: 33066A162000020000EA
      // 33 = provincia (Asturias)
      // 066 = municipio (Siero)
      // A = tipo (rústico)
      // 162 = polígono
      // 00002 = parcela
      municipalityCode = cadastralReference.substring(0, 5);
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

    // Determine regional IDE based on province/community
    const region = (autonomousCommunity || province || '').toLowerCase();
    let regionalIDE = '';
    if (region.includes('asturias')) regionalIDE = 'ideAsturias';
    else if (region.includes('cantabria')) regionalIDE = 'ideCantabria';
    else if (region.includes('galicia')) regionalIDE = 'ideGalicia';
    else if (region.includes('vasco') || region.includes('euskadi')) regionalIDE = 'idePaisVasco';
    else if (region.includes('castilla') && region.includes('león')) regionalIDE = 'ideCastillaLeon';

    // ENHANCED SEARCH with official sources - Based on ChatGPT methodology
    if (FIRECRAWL_API_KEY) {
      const queries = [
        // 1. CATASTRO: Búsqueda directa en Sede del Catastro
        cadastralReference 
          ? `site:sedecatastro.gob.es "${cadastralReference}" ficha descriptiva gráfica`
          : `site:sedecatastro.gob.es ${municipality} ${province} consulta catastral`,
        
        // 2. PGOU/PGMO: Normativa municipal específica
        `PGOU ${municipality} ${province} núcleo rural clasificación suelo ordenanzas filetype:pdf`,
        
        // 3. AYUNTAMIENTO: Web oficial con ordenanzas
        `site:ayuntamiento ${municipality}.es urbanismo planeamiento PGOU normativa`,
        
        // 4. SIU: Sistema de Información Urbanística
        `site:siu.vivienda.es ${municipality} plan general ordenación`,
        
        // 5. NÚCLEO RURAL: Búsqueda específica si es rústico
        isRustico 
          ? `"núcleo rural" ${municipality} ${province} delimitación PGOU suelo no urbanizable ${polygonParcel || ''}`
          : `zonificación urbana ${municipality} ordenación pormenorizada`,
        
        // 6. IDE REGIONAL: Visor cartográfico de la CCAA
        regionalIDE 
          ? `site:${OFFICIAL_SOURCES[regionalIDE as keyof typeof OFFICIAL_SOURCES]?.base || ''} ${municipality} urbanismo planeamiento`
          : `IDE ${autonomousCommunity || province} visor urbanístico ${municipality}`
      ];

      for (const query of queries) {
        if (!query || query.includes('undefined')) continue;
        
        try {
          console.log(`[FASE 1] Buscando: ${query.substring(0, 80)}...`);
          
          const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              limit: 2, // Limited for performance
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
                // Classify the source
                let sourceType = 'Municipal';
                let sourceName = result.title || 'Documento';
                
                if (result.url.includes('sedecatastro')) {
                  sourceType = 'Catastro';
                  sourceName = 'Sede Electrónica del Catastro';
                } else if (result.url.includes('siu.vivienda')) {
                  sourceType = 'SIU';
                  sourceName = 'Sistema de Información Urbanística';
                } else if (result.url.includes('ide') || result.url.includes('geo.')) {
                  sourceType = 'IDE Regional';
                  sourceName = `IDE ${autonomousCommunity || province}`;
                } else if (result.url.includes('ayuntamiento') || result.url.includes('.es')) {
                  sourceType = 'Ayuntamiento';
                  sourceName = `Ayuntamiento de ${municipality}`;
                }

                documentContent += `\n\n--- FUENTE ${sourceType.toUpperCase()}: ${sourceName} ---\nURL: ${result.url}\n${result.markdown.substring(0, 8000)}`;
                consultedUrls.push(result.url);
                officialSourcesFound.push({
                  name: sourceName,
                  url: result.url,
                  type: sourceType
                });
              }
            }
          }
        } catch (e) {
          console.error(`[FASE 1] Error búsqueda: ${e}`);
        }

        // Limit total content to prevent timeouts
        if (documentContent.length > 25000) break;
      }
    }

    // AI Analysis for Phase 1 - ENHANCED with source verification
    const analysisPrompt = `Eres un experto urbanista español que debe ANALIZAR y CONTRASTAR información de FUENTES OFICIALES.

DATOS DE LA PARCELA:
- Municipio: ${municipality}
- Provincia: ${province}
- Comunidad Autónoma: ${autonomousCommunity || 'No especificada'}
- Referencia Catastral: ${cadastralReference || 'N/A'}
- Código Municipio Catastral: ${municipalityCode || 'N/A'}
- ${polygonParcel ? `Ubicación: ${polygonParcel}` : ''}
- Tipo de suelo según Catastro: ${landClass || 'No especificado'}
- Superficie: ${surfaceArea ? `${surfaceArea} m²` : 'No especificada'}
${coordinates ? `- Coordenadas: ${coordinates.lat}, ${coordinates.lng}` : ''}

FUENTES OFICIALES A CONSIDERAR (por orden de prioridad):
1. Sede Electrónica del Catastro → Datos catastrales oficiales
2. PGOU/PGMO del Ayuntamiento → Clasificación y calificación urbanística
3. Sistema de Información Urbanística (SIU) → Planes vigentes
4. IDE Regional → Cartografía oficial de la CCAA
5. Web del Ayuntamiento → Ordenanzas y fichas

${documentContent ? `DOCUMENTACIÓN ENCONTRADA EN FUENTES OFICIALES:\n${documentContent.substring(0, 30000)}` : 'No se encontró documentación online. El usuario deberá consultar presencialmente.'}

🔴 OBJETIVO FASE 1 - METODOLOGÍA TIPO AYUNTAMIENTO DE SIERO:

PASO 1: VERIFICAR DATOS CATASTRALES
- ¿Coincide la información del Catastro con la proporcionada?
- ¿Qué uso registra el Catastro (urbano/rústico)?
- ¿Es parcela única o proviene de segregación?

PASO 2: DETECTAR NÚCLEO RURAL (CRÍTICO PARA SUELO RÚSTICO)
- ¿Está la parcela dentro de un NÚCLEO RURAL delimitado por el PGOU?
- Si SÍ está en NR → Generalmente NO hay parcela mínima → ES EDIFICABLE
- Si NO está en NR → Aplican parcelas mínimas (5.000-15.000 m²)

PASO 3: IDENTIFICAR ZONA URBANÍSTICA
- ¿Qué código de zona tiene en el PGOU? (ej: NR-1, R-2, 22.02)
- ¿Qué artículos regulan esa zona?
- ¿Cuáles son los parámetros edificatorios?

PASO 4: VERIFICAR FUENTES
- ¿De qué fuente oficial proviene cada dato?
- ¿Hay contradicciones entre fuentes?
- ¿Qué información falta que requiera consulta presencial?

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 1,
  "phase_name": "Catastro + Normativa Municipal",
  "sources_verified": [
    {
      "source_name": "Nombre de la fuente (ej: Sede del Catastro)",
      "source_type": "Catastro/PGOU/SIU/IDE/Ayuntamiento",
      "url": "URL consultada o null",
      "data_found": "Resumen de datos encontrados",
      "reliability": "alta/media/baja"
    }
  ],
  "catastral_verification": {
    "matches_provided_data": true/false,
    "registered_use": "urbano/rústico/industrial/etc.",
    "is_single_plot": true/false/null,
    "notes": "Observaciones sobre datos catastrales"
  },
  "is_in_nucleo_rural": {
    "value": true/false/null,
    "nucleo_name": "Nombre del núcleo si aplica",
    "zone_code": "Código de zona (ej: 22.02 NR)",
    "source": "Fuente oficial"
  },
  "is_buildable_phase1": {
    "value": true/false/null,
    "confidence": "alta/media/baja",
    "reason": "Explicación basada en fuentes oficiales"
  },
  "urban_classification": {
    "value": "Clasificación exacta",
    "category": "Urbano/Urbanizable/No Urbanizable",
    "subcategory": "Núcleo Rural/Común/Protección si aplica",
    "source": "Fuente oficial y artículo"
  },
  "urban_qualification": {
    "value": "Calificación exacta",
    "zone_name": "Nombre completo de la zona",
    "source": "Fuente oficial"
  },
  "min_plot_area": {
    "value": número m² o null,
    "applies_in_nucleo_rural": false,
    "note": "En NR suele no haber mínimo",
    "source": "Art. X PGOU"
  },
  "max_built_surface": {
    "value": número m² o null,
    "source": "Art. X PGOU"
  },
  "max_occupation_percent": {
    "value": número % o null,
    "source": "Art. X PGOU"
  },
  "buildability_index": {
    "value": número o null,
    "source": "Art. X PGOU"
  },
  "max_height": {
    "value": número metros o null,
    "reference_point": "al alero/cumbrera",
    "source": "Art. X PGOU"
  },
  "max_floors": {
    "value": número o null,
    "note": "B+1, B+2, etc.",
    "source": "Art. X PGOU"
  },
  "front_setback": { "value": número o null, "source": "Art. X" },
  "side_setback": { "value": número o null, "source": "Art. X" },
  "rear_setback": { "value": número o null, "source": "Art. X" },
  "allowed_uses": ["lista de usos permitidos"],
  "prohibited_uses": ["lista de usos prohibidos"],
  "applicable_articles": [
    {
      "article": "Art. 4.116",
      "title": "Título",
      "summary": "Resumen",
      "source_document": "PGOU ${municipality}"
    }
  ],
  "missing_information": [
    {
      "data": "Dato que falta",
      "where_to_get": "Dónde obtenerlo (ej: Registro Propiedad, Ayuntamiento)",
      "importance": "crítico/importante/opcional"
    }
  ],
  "analysis_notes": "Resumen técnico completo con referencias a artículos y fuentes oficiales",
  "requires_phase2": true/false,
  "phase2_reason": "Motivo (verificar TROTU/ROTU, autorización CUOTA, etc.)"
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
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[FASE 1] Error IA:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Límite de solicitudes excedido. Intente de nuevo en unos minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `Error de IA: ${aiResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[FASE 1] Respuesta IA recibida:', content.substring(0, 300));

    // Parse response
    let extractedData: Record<string, any>;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
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
    
    // Determine buildability
    if (extractedData.is_buildable_phase1?.value !== null) {
      const confidence = extractedData.is_buildable_phase1.confidence;
      if (confidence === 'alta' || (isInNucleoRural && confidence === 'media')) {
        updateField('is_buildable', { value: extractedData.is_buildable_phase1.value }, 'Edificabilidad');
      }
    }

    // Urban classification with enhanced info
    if (extractedData.urban_classification?.value) {
      let classificationValue = extractedData.urban_classification.value;
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
      if (isInNucleoRural && extractedData.min_plot_area.applies_in_nucleo_rural === false) {
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

    // Save Núcleo Rural info and verified sources in requirements
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

    // Build comprehensive notes with sources and missing info
    let phaseNotes = '';
    
    // Add verified sources summary
    if (extractedData.sources_verified && extractedData.sources_verified.length > 0) {
      phaseNotes += '📚 FUENTES OFICIALES VERIFICADAS:\n';
      for (const src of extractedData.sources_verified) {
        phaseNotes += `• ${src.source_name} (${src.source_type}): ${src.data_found || 'Consultado'} [Fiabilidad: ${src.reliability}]\n`;
      }
    }
    
    phaseNotes += '\n' + (extractedData.analysis_notes || '');
    
    // Add applicable articles
    if (extractedData.applicable_articles && extractedData.applicable_articles.length > 0) {
      phaseNotes += '\n\n📋 ARTÍCULOS APLICABLES:';
      for (const art of extractedData.applicable_articles) {
        phaseNotes += `\n• ${art.article}: ${art.title || ''} - ${art.summary || ''} [${art.source_document || 'PGOU'}]`;
      }
    }
    
    // Add missing information warnings
    if (extractedData.missing_information && extractedData.missing_information.length > 0) {
      phaseNotes += '\n\n⚠️ INFORMACIÓN PENDIENTE DE VERIFICAR:';
      for (const missing of extractedData.missing_information) {
        const icon = missing.importance === 'crítico' ? '🔴' : missing.importance === 'importante' ? '🟡' : '🟢';
        phaseNotes += `\n${icon} ${missing.data} → Consultar: ${missing.where_to_get}`;
      }
    }

    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = existingNotes 
      ? `${existingNotes}\n\n--- FASE 1: Catastro + Municipal (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`
      : `--- FASE 1: Catastro + Municipal (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`;

    // Update analysis status
    updateData.analysis_status = 'phase1_complete';

    // Save consulted sources with detailed classification
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = officialSourcesFound.map(src => ({
      name: src.name,
      url: src.url,
      type: src.type,
      phase: 1,
      date: new Date().toISOString().split('T')[0],
      verified: true
    }));
    
    // Also add any sources from AI response
    if (extractedData.sources_verified) {
      for (const src of extractedData.sources_verified) {
        if (src.url && !newSources.find(s => s.url === src.url)) {
          newSources.push({
            name: src.source_name,
            url: src.url,
            type: src.source_type,
            phase: 1,
            date: new Date().toISOString().split('T')[0],
            verified: src.reliability === 'alta'
          });
        }
      }
    }
    
    updateData.consulted_sources = [...existingSources, ...newSources];

    // Update database
    const { error: updateError } = await supabase
      .from('urban_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('[FASE 1] Error updating profile:', updateError);
    }

    console.log(`[FASE 1] Completado: ${fieldsCompleted} campos actualizados, ${consultedUrls.length} fuentes consultadas`);

    return new Response(
      JSON.stringify({
        success: true,
        phase: 1,
        phaseName: 'Catastro + Normativa Municipal',
        fieldsCompleted,
        updatedFields,
        consultedUrls,
        officialSources: officialSourcesFound,
        sourcesVerified: extractedData.sources_verified || [],
        missingInformation: extractedData.missing_information || [],
        isInNucleoRural,
        nucleoRuralInfo: extractedData.is_in_nucleo_rural,
        catastralVerification: extractedData.catastral_verification,
        buildabilityResult: extractedData.is_buildable_phase1,
        applicableArticles: extractedData.applicable_articles || [],
        requiresPhase2: extractedData.requires_phase2 !== false,
        phase2Reason: extractedData.phase2_reason || 'Verificar normativa autonómica (TROTU/ROTU)',
        analysisNotes: phaseNotes,
        message: `Fase 1 completada: ${fieldsCompleted} datos extraídos de ${officialSourcesFound.length} fuentes oficiales`
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
