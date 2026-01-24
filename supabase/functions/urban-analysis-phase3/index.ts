import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 3: Afecciones Sectoriales (MEJORADO)
 * 
 * FUENTES OFICIALES CONSULTADAS (basado en metodología ChatGPT/Ayto. Siero):
 * 
 * 1. AESA (Agencia Estatal de Seguridad Aérea)
 *    - Servidumbres aeronáuticas
 *    - Zonas de aproximación
 *    URL: https://www.seguridadaerea.gob.es
 * 
 * 2. COSTAS (Ministerio para la Transición Ecológica)
 *    - Deslinde de costas
 *    - Zonas de servidumbre (100m) y de influencia
 *    URL: https://www.miteco.gob.es/costas
 * 
 * 3. CONFEDERACIONES HIDROGRÁFICAS
 *    - Dominio público hidráulico
 *    - Zonas inundables (SNCZI)
 *    URL: https://sig.mapama.gob.es/snczi/
 * 
 * 4. CARRETERAS
 *    - Ley de Carreteras del Estado (Ley 37/2015)
 *    - Leyes autonómicas de carreteras
 *    - Líneas límite de edificación
 * 
 * 5. PATRIMONIO HISTÓRICO
 *    - BIC (Bienes de Interés Cultural)
 *    - Entornos de protección
 *    URL: https://www.culturaydeporte.gob.es/bienes
 * 
 * 6. MONTES Y FORESTAL
 *    - Montes de Utilidad Pública
 *    - Zonas forestales
 * 
 * 7. VÍAS PECUARIAS
 *    - Red de vías pecuarias
 * 
 * 8. CEMENTERIOS / POLICÍA MORTUORIA (MUY IMPORTANTE)
 *    - Distancias según normativa autonómica
 *    - Decreto 72/2018 Asturias: 50m
 *    - Decreto 1/2007 Cantabria: 200m
 *    - RD 2263/1974: 200m (estatal supletorio)
 * 
 * 9. LÍNEAS ELÉCTRICAS
 *    - Servidumbres de paso
 *    - Distancias de seguridad según tensión
 * 
 * 10. FERROCARRILES
 *     - Ley del Sector Ferroviario
 *     - Zonas de protección
 */

interface SearchResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

// Official sources for sectoral affections
const SECTORAL_SOURCES = {
  aesa: {
    url: 'seguridadaerea.gob.es',
    name: 'AESA - Agencia Estatal de Seguridad Aérea'
  },
  costas: {
    url: 'miteco.gob.es/costas',
    name: 'Dirección General de la Costa y el Mar'
  },
  snczi: {
    url: 'sig.mapama.gob.es/snczi',
    name: 'Sistema Nacional de Cartografía de Zonas Inundables'
  },
  patrimonio: {
    url: 'culturaydeporte.gob.es',
    name: 'Ministerio de Cultura - Patrimonio Histórico'
  },
  montes: {
    url: 'miteco.gob.es/biodiversidad',
    name: 'Catálogo de Montes de Utilidad Pública'
  }
};

// Cemetery/Mortuary Police distances by autonomous community
const CEMETERY_DISTANCES: Record<string, { distance: number; regulation: string; body: string }> = {
  'asturias': { 
    distance: 50, 
    regulation: 'Decreto 72/2018, de 12 de diciembre, Reglamento de Policía Sanitaria Mortuoria',
    body: 'Consejería de Salud del Principado de Asturias'
  },
  'cantabria': { 
    distance: 200, 
    regulation: 'Decreto 1/2007, de 11 de enero, de Policía Sanitaria Mortuoria',
    body: 'Consejería de Sanidad de Cantabria'
  },
  'galicia': { 
    distance: 50, 
    regulation: 'Decreto 134/1998, de 23 de abril, de Policía Sanitaria Mortuoria',
    body: 'Consellería de Sanidade de Galicia'
  },
  'castilla y león': { 
    distance: 200, 
    regulation: 'Decreto 16/2005, de 10 de febrero, de Policía Sanitaria Mortuoria',
    body: 'Consejería de Sanidad de Castilla y León'
  },
  'país vasco': { 
    distance: 50, 
    regulation: 'Decreto 18/2016, de 16 de febrero, de Policía Sanitaria Mortuoria',
    body: 'Departamento de Salud del Gobierno Vasco'
  },
  'madrid': { 
    distance: 200, 
    regulation: 'Decreto 124/1997, de 9 de octubre, de Policía Sanitaria Mortuoria',
    body: 'Consejería de Sanidad de Madrid'
  },
  'cataluña': { 
    distance: 200, 
    regulation: 'Decreto 297/1997, de 25 de noviembre, de Policía Sanitaria Mortuoria',
    body: 'Departament de Salut de Catalunya'
  },
  'default': { 
    distance: 200, 
    regulation: 'RD 2263/1974, de 20 de julio, Reglamento de Policía Sanitaria Mortuoria',
    body: 'Ministerio de Sanidad (normativa estatal supletoria)'
  }
};

// Road building distances by road type (meters)
const ROAD_DISTANCES: Record<string, { building: number; protection: number; affection: number; regulation: string }> = {
  'autopista': { building: 50, protection: 100, affection: 200, regulation: 'Ley 37/2015 de Carreteras' },
  'autovia': { building: 50, protection: 100, affection: 200, regulation: 'Ley 37/2015 de Carreteras' },
  'nacional': { building: 25, protection: 50, affection: 100, regulation: 'Ley 37/2015 de Carreteras' },
  'autonomica': { building: 18, protection: 25, affection: 50, regulation: 'Ley autonómica de Carreteras' },
  'provincial': { building: 15, protection: 20, affection: 30, regulation: 'Normativa provincial' },
  'local': { building: 8, protection: 10, affection: 20, regulation: 'Normativa municipal' }
};

// Power line distances by voltage (meters)
const POWER_LINE_DISTANCES: Record<string, { horizontal: number; vertical: number; regulation: string }> = {
  'alta_tension_400kv': { horizontal: 30, vertical: 11, regulation: 'RD 223/2008 - RLAT' },
  'alta_tension_220kv': { horizontal: 25, vertical: 9, regulation: 'RD 223/2008 - RLAT' },
  'alta_tension_132kv': { horizontal: 20, vertical: 7, regulation: 'RD 223/2008 - RLAT' },
  'media_tension': { horizontal: 10, vertical: 5, regulation: 'RD 337/2014' },
  'baja_tension': { horizontal: 3, vertical: 2, regulation: 'REBT' }
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

    // Determine cemetery distance based on autonomous community
    const region = (autonomousCommunity || province || '').toLowerCase();
    let cemeteryRegulation = CEMETERY_DISTANCES.default;
    for (const [key, value] of Object.entries(CEMETERY_DISTANCES)) {
      if (region.includes(key)) {
        cemeteryRegulation = value;
        break;
      }
    }

    let documentContent = '';
    const consultedUrls: string[] = [];
    const officialSourcesFound: Array<{name: string; url: string; type: string}> = [];

    // ENHANCED SEARCH with official sources
    if (FIRECRAWL_API_KEY) {
      const queries = [
        // 1. SNCZI - Zonas inundables (fuente oficial)
        `site:sig.mapama.gob.es SNCZI zona inundable ${municipality} ${province}`,
        
        // 2. AESA - Servidumbres aeronáuticas
        `site:seguridadaerea.gob.es servidumbre aeronáutica ${province} aeropuerto`,
        
        // 3. Costas - Si es municipio costero
        `site:miteco.gob.es deslinde costa ${municipality} servidumbre protección`,
        
        // 4. Patrimonio - BIC y zonas protegidas
        `site:culturaydeporte.gob.es BIC ${municipality} ${province} entorno protección`,
        
        // 5. Cementerios - Normativa autonómica específica
        `cementerio ${municipality} policía sanitaria mortuoria ${autonomousCommunity || province} distancia edificación`,
        
        // 6. Carreteras - Afecciones viales
        `carretera ${municipality} línea límite edificación servidumbre protección`
      ];

      for (const query of queries) {
        if (!query || query.includes('undefined')) continue;
        
        try {
          console.log(`[FASE 3] Buscando: ${query.substring(0, 70)}...`);
          
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
                // Classify the source
                let sourceType = 'Sectorial';
                let sourceName = result.title || 'Documento';
                
                if (result.url.includes('seguridadaerea')) {
                  sourceType = 'AESA';
                  sourceName = 'AESA - Seguridad Aérea';
                } else if (result.url.includes('miteco') || result.url.includes('mapama')) {
                  if (result.url.includes('costa')) {
                    sourceType = 'Costas';
                    sourceName = 'Dirección General de la Costa';
                  } else if (result.url.includes('snczi')) {
                    sourceType = 'SNCZI';
                    sourceName = 'Sistema Nacional Zonas Inundables';
                  } else {
                    sourceType = 'MITECO';
                    sourceName = 'Ministerio Transición Ecológica';
                  }
                } else if (result.url.includes('cultura')) {
                  sourceType = 'Patrimonio';
                  sourceName = 'Ministerio de Cultura - BIC';
                } else if (result.url.includes('cementerio') || result.url.includes('mortuori')) {
                  sourceType = 'Cementerio';
                  sourceName = 'Policía Sanitaria Mortuoria';
                }

                documentContent += `\n\n--- FUENTE ${sourceType.toUpperCase()}: ${sourceName} ---\nURL: ${result.url}\n${result.markdown.substring(0, 6000)}`;
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
          console.error(`[FASE 3] Error búsqueda: ${e}`);
        }

        if (documentContent.length > 25000) break;
      }
    }

    // Build comprehensive distance reference for AI
    const roadDistancesRef = Object.entries(ROAD_DISTANCES)
      .map(([type, d]) => `${type}: edificación ${d.building}m, protección ${d.protection}m`)
      .join('; ');
    
    const powerDistancesRef = Object.entries(POWER_LINE_DISTANCES)
      .map(([type, d]) => `${type}: ${d.horizontal}m horizontal`)
      .join('; ');

    // AI Analysis for Phase 3
    const analysisPrompt = `Eres un experto en afecciones sectoriales urbanísticas en España. Debes contrastar información de FUENTES OFICIALES.

UBICACIÓN:
- Municipio: ${municipality}
- Provincia: ${province}
- Comunidad Autónoma: ${autonomousCommunity || 'No especificada'}
${coordinates ? `- Coordenadas: ${coordinates.lat}, ${coordinates.lng}` : ''}

NORMATIVA DE REFERENCIA APLICABLE:

🏛️ CEMENTERIOS - POLICÍA SANITARIA MORTUORIA:
- Comunidad: ${autonomousCommunity || province}
- Distancia mínima requerida: ${cemeteryRegulation.distance} metros
- Normativa aplicable: ${cemeteryRegulation.regulation}
- Órgano competente: ${cemeteryRegulation.body}

🛣️ CARRETERAS - Líneas límite edificación:
${roadDistancesRef}

⚡ LÍNEAS ELÉCTRICAS - Servidumbres:
${powerDistancesRef}

${documentContent ? `\nINFORMACIÓN DE AFECCIONES ENCONTRADA EN FUENTES OFICIALES:\n${documentContent.substring(0, 28000)}` : '\nNo se encontró información específica de afecciones online.'}

🎯 OBJETIVO FASE 3: Identificar TODAS las afecciones sectoriales con FUENTES VERIFICABLES:

1. AESA (Servidumbres aeronáuticas)
   - ¿Hay aeropuertos en un radio de 15km?
   - ¿Existen limitaciones de altura?

2. COSTAS (Ley de Costas 22/1988)
   - ¿Es municipio costero?
   - ¿Afecta zona servidumbre (100m) o influencia (500m)?

3. AGUAS (Confederación Hidrográfica)
   - ¿Hay cauces cercanos? (zona policía: 100m)
   - ¿Es zona inundable según SNCZI?

4. CARRETERAS
   - ¿Qué carreteras afectan? Tipo y distancia
   - Línea límite de edificación aplicable

5. FERROCARRILES
   - ¿Hay vías férreas cerca? (zona 70m)

6. PATRIMONIO HISTÓRICO
   - ¿Hay BIC cercanos? ¿Entorno de protección?

7. MONTES / FORESTAL
   - ¿Monte público o protegido?

8. VÍAS PECUARIAS
   - ¿Cruza o linda con vía pecuaria?

9. CEMENTERIOS (CRÍTICO)
   - ¿Hay cementerios en el municipio?
   - Distancia a la parcela
   - Comparar con distancia mínima: ${cemeteryRegulation.distance}m

10. LÍNEAS ELÉCTRICAS
    - Tensión y distancia de servidumbre

RESPONDE ÚNICAMENTE con este JSON:
{
  "phase": 3,
  "phase_name": "Afecciones Sectoriales",
  "sources_consulted": [
    {
      "source_name": "Nombre fuente oficial",
      "source_type": "AESA/Costas/SNCZI/Patrimonio/etc.",
      "url": "URL o null",
      "data_found": "Resumen de lo encontrado",
      "reliability": "alta/media/baja"
    }
  ],
  "affections_detected": {
    "airport": {
      "affected": true/false,
      "airport_name": "nombre o null",
      "distance_km": número o null,
      "max_height_limit_m": número o null,
      "requires_aesa_auth": true/false,
      "source": "AESA / Web oficial"
    },
    "coast": {
      "affected": true/false,
      "distance_m": número o null,
      "zone_type": "dominio público/servidumbre/influencia",
      "source": "Ley de Costas 22/1988"
    },
    "water_courses": {
      "affected": true/false,
      "river_name": "nombre o null",
      "distance_m": número o null,
      "confederation": "Nombre Confederación",
      "is_flood_zone": true/false,
      "flood_zone_type": "frecuente/ocasional/excepcional",
      "source": "SNCZI / CHx"
    },
    "roads": {
      "affected": true/false,
      "roads": [
        {
          "name": "AS-378 / N-634 / etc.",
          "type": "autopista/autovia/nacional/autonómica/provincial/local",
          "distance_to_edge_m": número,
          "building_line_m": número según tipo,
          "protection_zone_m": número,
          "source": "Ley 37/2015 / Ley autonómica"
        }
      ]
    },
    "railway": {
      "affected": true/false,
      "line_name": "nombre o null",
      "distance_m": número o null,
      "zone_type": "dominio público/protección/límite edificación",
      "source": "Ley 38/2015 del Sector Ferroviario"
    },
    "heritage": {
      "affected": true/false,
      "bic_name": "nombre o null",
      "bic_type": "monumento/conjunto/zona arqueológica/jardín histórico",
      "distance_m": número o null,
      "protection_type": "entorno/buffer",
      "source": "Ley 16/1985 PHE / Ley autonómica"
    },
    "forest": {
      "affected": true/false,
      "forest_type": "MUP/protegido/privado",
      "catalog_number": "número si aplica",
      "source": "Catálogo MUP / Ley de Montes"
    },
    "livestock_route": {
      "affected": true/false,
      "route_name": "nombre o null",
      "route_type": "cañada/cordel/vereda/colada",
      "width_m": número según tipo,
      "source": "Ley 3/1995 de Vías Pecuarias"
    },
    "power_lines": {
      "affected": true/false,
      "lines": [
        {
          "voltage_kv": número,
          "type": "alta_tension/media_tension/baja_tension",
          "distance_m": número,
          "required_distance_m": número según normativa,
          "source": "RD 223/2008 RLAT / RD 337/2014"
        }
      ]
    },
    "pipeline": {
      "affected": true/false,
      "type": "gas/petróleo",
      "operator": "Enagás/CLH/etc.",
      "distance_m": número o null,
      "source": "normativa sectorial"
    },
    "cemetery": {
      "affected": true/false,
      "cemetery_name": "nombre del cementerio",
      "distance_m": número medido o estimado,
      "min_required_distance_m": ${cemeteryRegulation.distance},
      "complies": true/false,
      "regulation": "${cemeteryRegulation.regulation}",
      "regulatory_body": "${cemeteryRegulation.body}",
      "notes": "Observaciones sobre cumplimiento"
    }
  },
  "summary": {
    "total_affections": número,
    "critical_affections": ["lista de afecciones que IMPIDEN edificar"],
    "conditioning_affections": ["lista de afecciones que CONDICIONAN pero permiten"],
    "required_authorizations": ["AESA", "Confederación", "Costas", etc.],
    "required_reports": ["Informe AESA", "Informe CHx", etc.]
  },
  "is_buildable_phase3": {
    "value": true/false/null,
    "confidence": "alta/media/baja",
    "reason": "Justificación basada en afecciones detectadas y cumplimiento normativo"
  },
  "missing_verifications": [
    {
      "affection": "tipo de afección",
      "verification_needed": "qué hay que verificar",
      "where": "dónde consultarlo (presencial o visor)"
    }
  ],
  "analysis_notes": "Resumen técnico de afecciones con referencias normativas específicas",
  "requires_phase4": true/false,
  "phase4_reason": "Analizar CTE y requisitos técnicos constructivos"
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
      console.error('[FASE 3] Error IA:', aiResponse.status, errorText);
      
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

    // Process all affections
    if (affections.airport?.affected !== undefined) {
      updateData.affected_by_airport = affections.airport.affected;
      if (affections.airport.distance_km) {
        updateData.min_distance_airport = affections.airport.distance_km * 1000;
        updateData.min_distance_airport_source = affections.airport.source;
      }
      if (affections.airport.max_height_limit_m) {
        updateData.max_height_airport = affections.airport.max_height_limit_m;
        updateData.max_height_airport_source = 'AESA - Servidumbres aeronáuticas';
      }
      fieldsCompleted++;
      updatedFields.push('Afección aeroportuaria');
    }

    if (affections.coast?.affected !== undefined) {
      updateData.affected_by_coast = affections.coast.affected;
      if (affections.coast.distance_m) {
        updateData.min_distance_coast = affections.coast.distance_m;
        updateData.min_distance_coast_source = affections.coast.source || 'Ley de Costas 22/1988';
      }
      fieldsCompleted++;
      updatedFields.push('Afección costera');
    }

    if (affections.water_courses?.affected !== undefined) {
      updateData.affected_by_water_courses = affections.water_courses.affected;
      if (affections.water_courses.distance_m) {
        updateData.min_distance_water_courses = affections.water_courses.distance_m;
        updateData.min_distance_water_courses_source = affections.water_courses.confederation || 'Confederación Hidrográfica';
      }
      if (affections.water_courses.is_flood_zone) {
        updateData.is_flood_zone = true;
        updateData.flood_zone_type = affections.water_courses.flood_zone_type;
      }
      fieldsCompleted++;
      updatedFields.push('Afección hidrográfica');
    }

    if (affections.forest?.affected !== undefined) {
      updateData.affected_by_forest = affections.forest.affected;
      fieldsCompleted++;
      updatedFields.push('Afección forestal');
    }

    if (affections.heritage?.affected !== undefined) {
      updateData.affected_by_heritage = affections.heritage.affected;
      fieldsCompleted++;
      updatedFields.push('Afección patrimonial');
    }

    if (affections.livestock_route?.affected !== undefined) {
      updateData.affected_by_livestock_route = affections.livestock_route.affected;
      fieldsCompleted++;
      updatedFields.push('Vía pecuaria');
    }

    if (affections.power_lines?.affected !== undefined) {
      updateData.affected_by_power_lines = affections.power_lines.affected;
      if (affections.power_lines.lines && affections.power_lines.lines.length > 0) {
        updateData.min_distance_power_lines = affections.power_lines.lines[0].distance_m;
      }
      fieldsCompleted++;
      updatedFields.push('Líneas eléctricas');
    }

    if (affections.cemetery) {
      updateData.affected_by_cemetery = affections.cemetery.affected;
      if (affections.cemetery.distance_m) {
        updateData.min_distance_cemetery = affections.cemetery.distance_m;
      }
      updateData.cemetery_min_required = cemeteryRegulation.distance;
      updateData.cemetery_regulation = cemeteryRegulation.regulation;
      fieldsCompleted++;
      updatedFields.push('Afección cementerio');
    }

    if (affections.railway?.distance_m) {
      updateData.min_distance_railway = affections.railway.distance_m;
      fieldsCompleted++;
      updatedFields.push('Afección ferrocarril');
    }

    // Store complete sectoral restrictions
    updateData.sectoral_restrictions = affections;

    // Build comprehensive notes
    let phaseNotes = '';
    
    // Add verified sources
    if (extractedData.sources_consulted && extractedData.sources_consulted.length > 0) {
      phaseNotes += '📚 FUENTES SECTORIALES CONSULTADAS:\n';
      for (const src of extractedData.sources_consulted) {
        phaseNotes += `• ${src.source_name} (${src.source_type}): ${src.data_found || 'Consultado'}\n`;
      }
    }
    
    phaseNotes += '\n' + (extractedData.analysis_notes || '');
    
    // Add summary
    if (extractedData.summary) {
      phaseNotes += `\n\n📊 RESUMEN AFECCIONES:`;
      phaseNotes += `\n- Total detectadas: ${extractedData.summary.total_affections || 0}`;
      if (extractedData.summary.critical_affections?.length > 0) {
        phaseNotes += `\n- 🔴 CRÍTICAS (impiden): ${extractedData.summary.critical_affections.join(', ')}`;
      }
      if (extractedData.summary.conditioning_affections?.length > 0) {
        phaseNotes += `\n- 🟡 Condicionantes: ${extractedData.summary.conditioning_affections.join(', ')}`;
      }
      if (extractedData.summary.required_authorizations?.length > 0) {
        phaseNotes += `\n- 📋 Autorizaciones necesarias: ${extractedData.summary.required_authorizations.join(', ')}`;
      }
    }
    
    // Add missing verifications
    if (extractedData.missing_verifications && extractedData.missing_verifications.length > 0) {
      phaseNotes += '\n\n⚠️ VERIFICACIONES PENDIENTES:';
      for (const mv of extractedData.missing_verifications) {
        phaseNotes += `\n• ${mv.affection}: ${mv.verification_needed} → Consultar: ${mv.where}`;
      }
    }

    const existingNotes = profile.analysis_notes || '';
    updateData.analysis_notes = `${existingNotes}\n\n--- FASE 3: Afecciones Sectoriales (${new Date().toLocaleDateString('es-ES')}) ---\n${phaseNotes}`;

    updateData.analysis_status = 'phase3_complete';

    // Save sources with detailed info
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = officialSourcesFound.map(src => ({
      name: src.name,
      url: src.url,
      type: src.type,
      phase: 3,
      date: new Date().toISOString().split('T')[0],
      verified: true
    }));
    
    // Add AI-identified sources
    if (extractedData.sources_consulted) {
      for (const src of extractedData.sources_consulted) {
        if (src.url && !newSources.find(s => s.url === src.url)) {
          newSources.push({
            name: src.source_name,
            url: src.url,
            type: src.source_type,
            phase: 3,
            date: new Date().toISOString().split('T')[0],
            verified: src.reliability === 'alta'
          });
        }
      }
    }
    
    updateData.consulted_sources = [...existingSources, ...newSources];

    const { error: updateError } = await supabase
      .from('urban_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error('[FASE 3] Error update:', updateError);
    }

    const summary = extractedData.summary || {};
    console.log(`[FASE 3] Completado: ${fieldsCompleted} campos, ${summary.total_affections || 0} afecciones detectadas`);

    return new Response(
      JSON.stringify({
        success: true,
        phase: 3,
        phaseName: 'Afecciones Sectoriales',
        fieldsCompleted,
        updatedFields,
        consultedUrls,
        officialSources: officialSourcesFound,
        sourcesConsulted: extractedData.sources_consulted || [],
        affectionsDetected: affections,
        summary: {
          totalAffections: summary.total_affections || 0,
          criticalAffections: summary.critical_affections || [],
          conditioningAffections: summary.conditioning_affections || [],
          requiredAuthorizations: summary.required_authorizations || [],
          requiredReports: summary.required_reports || []
        },
        cemeteryRegulation: {
          distance: cemeteryRegulation.distance,
          regulation: cemeteryRegulation.regulation,
          body: cemeteryRegulation.body
        },
        missingVerifications: extractedData.missing_verifications || [],
        buildabilityResult: extractedData.is_buildable_phase3,
        requiresPhase4: extractedData.requires_phase4 !== false,
        phase4Reason: extractedData.phase4_reason || 'Analizar CTE y requisitos técnicos',
        analysisNotes: phaseNotes,
        message: `Fase 3 completada: ${summary.total_affections || 0} afecciones analizadas de ${officialSourcesFound.length} fuentes oficiales`
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
