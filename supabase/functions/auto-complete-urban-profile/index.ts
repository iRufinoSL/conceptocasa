import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MissingField {
  field: string;
  label: string;
  priority: 'critical' | 'important' | 'recommended';
}

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
      landClass, 
      cadastralReference,
      specificSearch,  // Optional: specific plan/sector to search for
      urbanClassification // Optional: from existing profile
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

    console.log(`Auto-completing urban profile for ${municipality}, ${province} - Budget: ${budgetId}`);
    if (specificSearch) {
      console.log(`Specific search requested: ${specificSearch}`);
    }

    // Step 1: Get current profile to identify missing fields
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

    // Identify missing fields
    const missingFields: MissingField[] = [];
    
    // Critical fields
    if (profile.is_buildable === null) {
      missingFields.push({ field: 'is_buildable', label: 'Edificabilidad', priority: 'critical' });
    }
    if (!profile.urban_classification) {
      missingFields.push({ field: 'urban_classification', label: 'Clasificación del suelo', priority: 'critical' });
    }
    
    // Important fields
    if (!profile.buildability_index) {
      missingFields.push({ field: 'buildability_index', label: 'Índice de edificabilidad', priority: 'important' });
    }
    if (!profile.max_height) {
      missingFields.push({ field: 'max_height', label: 'Altura máxima', priority: 'important' });
    }
    if (!profile.max_occupation_percent) {
      missingFields.push({ field: 'max_occupation_percent', label: 'Ocupación máxima', priority: 'important' });
    }
    if (!profile.front_setback) {
      missingFields.push({ field: 'front_setback', label: 'Retranqueo frontal', priority: 'important' });
    }
    if (!profile.side_setback) {
      missingFields.push({ field: 'side_setback', label: 'Retranqueo lateral', priority: 'important' });
    }
    if (!profile.min_distance_neighbors) {
      missingFields.push({ field: 'min_distance_neighbors', label: 'Distancia a vecinos', priority: 'important' });
    }
    
    // Recommended fields
    if (!profile.road_setback) {
      missingFields.push({ field: 'road_setback', label: 'Distancia a carreteras', priority: 'recommended' });
    }
    if (profile.has_municipal_sewage === null) {
      missingFields.push({ field: 'has_municipal_sewage', label: 'Alcantarillado municipal', priority: 'recommended' });
    }

    console.log(`Missing fields: ${missingFields.length}`);

    if (missingFields.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'El perfil urbanístico ya está completo',
          fieldsCompleted: 0,
          sources: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Search for regulations using Firecrawl (if available) or direct AI search
    const isRustico = landClass === 'Rústico' || landClass?.toLowerCase().includes('rústico');
    const landType = isRustico ? 'suelo rústico núcleo rural' : 'suelo urbano';
    const region = autonomousCommunity || province;
    const currentUrbanClassification = urbanClassification || profile.urban_classification || '';
    
    // Define applicable regulations based on land type and region
    const applicableRegulations: string[] = [];
    
    // National regulations always apply
    applicableRegulations.push('Ley del Suelo y Rehabilitación Urbana (Real Decreto Legislativo 7/2015)');
    applicableRegulations.push('Código Técnico de la Edificación (CTE)');
    
    // Determine authorizing body based on autonomous community
    let authorizingBody = '';
    let authorizingBodyName = '';
    
    // Regional regulations based on autonomous community
    const regionLower = region?.toLowerCase() || '';
    
    if (regionLower.includes('cantabria')) {
      applicableRegulations.push('Ley de Cantabria 2/2001, de 25 de junio, de Ordenación Territorial y Régimen Urbanístico del Suelo');
      applicableRegulations.push('Decreto 65/2010 - Reglamento de Disciplina Urbanística de Cantabria');
      authorizingBody = 'CROTU';
      authorizingBodyName = 'Comisión Regional de Ordenación del Territorio y Urbanismo de Cantabria';
      if (isRustico) {
        applicableRegulations.push('Ley 4/2020 de 11 de noviembre - Suelo Rústico de Cantabria');
        applicableRegulations.push('Plan Regional de Ordenación del Territorio (PROT) de Cantabria');
        applicableRegulations.push('Normas Urbanísticas del PGOU/NSP de ' + municipality + ' - Capítulo Suelo No Urbanizable');
      }
    } else if (regionLower.includes('asturias')) {
      applicableRegulations.push('Decreto Legislativo 1/2004 - Texto Refundido de Ordenación del Territorio y Urbanismo de Asturias');
      authorizingBody = 'CUOTA';
      authorizingBodyName = 'Comisión de Urbanismo y Ordenación del Territorio de Asturias';
      if (isRustico) {
        applicableRegulations.push('Decreto 278/2007 - Reglamento de Ordenación del Territorio y Urbanismo del Principado de Asturias');
      }
    } else if (regionLower.includes('galicia')) {
      applicableRegulations.push('Ley 2/2016, de 10 de febrero, del suelo de Galicia');
      authorizingBody = 'CPTOPT';
      authorizingBodyName = 'Comisión Superior de Urbanismo de Galicia';
      if (isRustico) {
        applicableRegulations.push('Decreto 143/2016 - Reglamento de la Ley del Suelo de Galicia');
      }
    } else if (regionLower.includes('país vasco') || regionLower.includes('euskadi')) {
      applicableRegulations.push('Ley 2/2006, de 30 de junio, de Suelo y Urbanismo del País Vasco');
      authorizingBody = 'CTU';
      authorizingBodyName = 'Comisión de Ordenación del Territorio del País Vasco';
    } else if (regionLower.includes('castilla y león')) {
      applicableRegulations.push('Ley 5/1999 de Urbanismo de Castilla y León');
      authorizingBody = 'CTU';
      authorizingBodyName = 'Comisión Territorial de Urbanismo';
    }
    
    // Municipal regulations
    applicableRegulations.push(`Plan General de Ordenación Urbana (PGOU) de ${municipality}`);
    applicableRegulations.push(`Normas Subsidiarias de Planeamiento (NSP) de ${municipality} (si aplica)`);
    
    console.log('Applicable regulations:', applicableRegulations);
    console.log('Authorizing body:', authorizingBody, '-', authorizingBodyName);
    
    let documentContent = '';
    const consultedUrls: string[] = [];

    if (FIRECRAWL_API_KEY) {
      // Build search queries - OPTIMIZED: max 2 queries to avoid timeout
      const searchQueries: string[] = [];
      
      // Priority 1: Specific search or urban classification
      if (specificSearch) {
        searchQueries.push(`${specificSearch} ${municipality} ${province} ordenanzas edificabilidad retranqueos`);
      } else if (currentUrbanClassification) {
        searchQueries.push(`${currentUrbanClassification} ${municipality} ${province} normativa urbanística`);
      }
      
      // Priority 2: Main PGOU/NSP query - always include
      searchQueries.push(`PGOU ${municipality} ${province} ${isRustico ? 'suelo rústico no urbanizable' : 'ordenanzas'} edificación`);
      
      // Limit to 2 queries to avoid timeout
      const queriesToRun = searchQueries.slice(0, 2);

      for (const query of queriesToRun) {
        try {
          console.log(`Searching: ${query}`);
          
          const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              limit: 3, // Reduced from 5
              lang: 'es',
              country: 'ES',
              scrapeOptions: {
                formats: ['markdown']
              }
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const results: SearchResult[] = searchData.data || [];
            
            for (const result of results) {
              if (result.markdown && result.markdown.length > 500) {
                // Limit each document to 8000 chars (reduced from 20000)
                documentContent += `\n\n--- FUENTE: ${result.title || result.url} ---\n${result.markdown.substring(0, 8000)}`;
                consultedUrls.push(result.url);
                console.log(`Found content from: ${result.url} (${result.markdown.length} chars)`);
              }
            }
          }
        } catch (e) {
          console.error(`Search error for "${query}":`, e);
        }

        // Limit total content to 30000 chars (reduced from 80000)
        if (documentContent.length > 30000) break;
      }
    }

    // Step 3: Use AI to extract the missing values
    const missingFieldsList = missingFields.map(f => `- ${f.label} (${f.field})`).join('\n');
    
    // Build context about the specific planning instrument
    const planningContext = specificSearch 
      ? `\nBÚSQUEDA ESPECÍFICA: ${specificSearch}\nPRIORIZA la información del plan parcial o sector específico indicado.`
      : '';
    
    const classificationContext = currentUrbanClassification 
      ? `\nCLASIFICACIÓN ACTUAL: ${currentUrbanClassification}\nBusca los parámetros específicos para esta clasificación/sector.`
      : '';
    
    // Build rustic land specific context with authorizing body info
    const rusticContext = isRustico ? `
NOTA IMPORTANTE - SUELO RÚSTICO:
Este terreno está clasificado como SUELO RÚSTICO/NO URBANIZABLE. Las normativas aplicables son:
${applicableRegulations.map(r => `- ${r}`).join('\n')}

ORGANISMO AUTORIZADOR: ${authorizingBody} (${authorizingBodyName})
En suelo rústico, la edificación de vivienda unifamiliar aislada normalmente requiere:
1. Informe favorable del Ayuntamiento
2. Autorización del organismo autonómico (${authorizingBody || 'Comisión Territorial de Urbanismo'})

CRITERIOS DE EDIFICABILIDAD EN SUELO RÚSTICO:
- Si la parcela está a MENOS DE 200m del núcleo urbano más próximo, puede tener condiciones más favorables
- Si es "Rústico de Protección Ordinaria" (no especial), puede ser edificable con autorización
- Las categorías de protección especial (Agropecuario, Forestal, Paisajístico, Costas) tienen restricciones adicionales

Para suelo rústico típico, los parámetros suelen ser:
- Parcela mínima: 2.000 - 5.000 m² según municipio
- Edificabilidad: 0,10 - 0,20 m²/m² 
- Altura máxima: 7-9 metros / 2 plantas
- Ocupación máxima: 10-20%
- Retranqueos: 5-10 metros a linderos

Busca los parámetros específicos del PGOU de ${municipality} para suelo no urbanizable.
` : '';
    
    // Build a concise prompt to avoid timeout
    const analysisPrompt = `Eres un experto urbanista español. Extrae parámetros urbanísticos para esta parcela:

PARCELA: ${municipality}, ${province} (${region || 'España'})
TIPO: ${landClass || 'No especificado'}
REF CATASTRAL: ${cadastralReference || 'N/A'}
${currentUrbanClassification ? `CLASIFICACIÓN: ${currentUrbanClassification}` : ''}
${isRustico ? `ORGANISMO: ${authorizingBody} (${authorizingBodyName})` : ''}

${documentContent ? `DOCUMENTACIÓN (extracto):\n${documentContent.substring(0, 25000)}` : 'Sin documentación online. Indica valores típicos de la normativa regional.'}

INSTRUCCIONES IMPORTANTES:
1. Busca valores ESPECÍFICOS del municipio, PGOU o normativa autonómica
2. Para cada campo, indica la fuente legal (Ley, PGOU, artículo específico)
3. Si es suelo rústico, aplica la normativa autonómica correspondiente
4. Si no encuentras valores exactos, indica valores orientativos de la normativa regional
5. Para edificabilidad en rústico: suele ser 0,10-0,20 m²/m²
6. Para alturas en rústico: suele ser 7-9m / 2 plantas
7. Para retranqueos: diferencia entre frontal/lateral/posterior
8. IMPORTANTE: Determina el USO ESPECÍFICO del suelo rústico (ordinario, agropecuario, forestal, etc.)
9. IMPORTANTE: Indica la distancia estimada al núcleo urbano más próximo si es posible determinarla
10. Evalúa si el terreno podría ser EDIFICABLE y qué requisitos necesitaría

RESPONDE ÚNICAMENTE con este JSON (sin texto adicional):
{
  "is_buildable": { "value": true/false o null, "source": "Normativa y artículo específico" },
  "urban_classification": { "value": "texto descriptivo del tipo de suelo (Urbano/Urbanizable/Rústico)" o null, "source": "fuente" },
  "rustic_land_use": { "value": "uso específico: Ordinario, Agropecuario, Forestal, Especial Protección, etc." o null, "source": "fuente" },
  "distance_to_urban_nucleus": { "value": número en metros o null, "source": "fuente o estimación" },
  "nearest_urban_nucleus": { "value": "nombre del núcleo urbano más cercano" o null, "source": "fuente" },
  "buildability_assessment": { "value": "evaluación de viabilidad: Edificable directo / Edificable con autorización CROTU / No edificable / Requiere estudio" o null, "source": "fuente" },
  "buildability_requirements": { "value": ["requisito1", "requisito2"] o null, "source": "fuente" },
  "buildability_index": { "value": número (m²/m²) o null, "source": "Art. X - Normativa" },
  "max_height": { "value": número en metros o null, "source": "Art. X" },
  "max_floors": { "value": número o null, "source": "Art. X" },
  "max_occupation_percent": { "value": número (%) o null, "source": "Art. X" },
  "front_setback": { "value": número en metros o null, "source": "Art. X" },
  "side_setback": { "value": número en metros o null, "source": "Art. X" },
  "rear_setback": { "value": número en metros o null, "source": "Art. X" },
  "min_distance_neighbors": { "value": número en metros o null, "source": "Art. X" },
  "road_setback": { "value": número en metros o null, "source": "Art. X" },
  "has_municipal_sewage": { "value": true/false o null, "source": "fuente" },
  "building_typology": { "value": "texto" o null, "source": "fuente" },
  "permitted_uses": { "value": ["uso1", "uso2"] o null, "source": "fuente" },
  "min_plot_area": { "value": número en m² o null, "source": "Art. X" },
  "additional_notes": "Resumen completo de: 1) Clasificación exacta del suelo, 2) Uso rústico específico, 3) Distancia al núcleo urbano, 4) Organismo autorizador, 5) Requisitos para edificar, 6) Limitaciones especiales, 7) Recomendaciones de viabilidad"
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite', // Use faster model to avoid timeout
        messages: [
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000, // Limit response size
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Error de IA: ${aiResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', content.substring(0, 500));

    // Parse the response
    let extractedData: Record<string, { value: unknown; source: string }>;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.error('Parse error:', e);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Error al procesar la respuesta de IA',
          rawResponse: content.substring(0, 1000)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Update the profile with found values
    const updateData: Record<string, unknown> = {};
    let fieldsCompleted = 0;
    const updatedFields: string[] = [];
    const sources: string[] = [];

    const updateField = (dbField: string, data: { value: unknown; source: string } | undefined, label: string) => {
      if (data?.value !== null && data?.value !== undefined) {
        // Only update if the current value is empty/null
        if (profile[dbField] === null || profile[dbField] === undefined || profile[dbField] === '') {
          updateData[dbField] = data.value;
          // Collect sources separately - don't try to write to non-existent _source columns
          if (data.source && data.source !== 'No encontrado' && !sources.includes(data.source)) {
            sources.push(data.source);
          }
          fieldsCompleted++;
          updatedFields.push(label);
        }
      }
    };

    updateField('is_buildable', extractedData.is_buildable, 'Edificabilidad');
    updateField('urban_classification', extractedData.urban_classification, 'Clasificación');
    updateField('buildability_index', extractedData.buildability_index, 'Índice edificabilidad');
    updateField('max_height', extractedData.max_height, 'Altura máxima');
    updateField('max_floors', extractedData.max_floors, 'Plantas máximas');
    updateField('max_occupation_percent', extractedData.max_occupation_percent, 'Ocupación máxima');
    updateField('front_setback', extractedData.front_setback, 'Retranqueo frontal');
    updateField('side_setback', extractedData.side_setback, 'Retranqueo lateral');
    updateField('rear_setback', extractedData.rear_setback, 'Retranqueo posterior');
    updateField('min_distance_neighbors', extractedData.min_distance_neighbors, 'Distancia vecinos');
    updateField('road_setback', extractedData.road_setback, 'Distancia carreteras');
    updateField('has_municipal_sewage', extractedData.has_municipal_sewage, 'Alcantarillado');
    updateField('building_typology', extractedData.building_typology, 'Tipología edificatoria');
    
    // New rustic land analysis fields
    updateField('rustic_land_use', extractedData.rustic_land_use, 'Uso suelo rústico');
    updateField('distance_to_urban_nucleus', extractedData.distance_to_urban_nucleus, 'Distancia núcleo urbano');
    updateField('nearest_urban_nucleus', extractedData.nearest_urban_nucleus, 'Núcleo urbano cercano');
    updateField('buildability_assessment', extractedData.buildability_assessment, 'Evaluación edificabilidad');
    
    // Always set authorizing body for rustic land
    if (isRustico && authorizingBody && !profile.authorizing_body) {
      updateData.authorizing_body = authorizingBody;
      updateData.authorizing_body_name = authorizingBodyName;
      fieldsCompleted++;
      updatedFields.push('Organismo autorizador');
    }
    
    // Handle buildability requirements array
    if (extractedData.buildability_requirements?.value && Array.isArray(extractedData.buildability_requirements.value)) {
      if (!profile.buildability_requirements) {
        updateData.buildability_requirements = extractedData.buildability_requirements.value;
        fieldsCompleted++;
        updatedFields.push('Requisitos edificabilidad');
      }
    }

    // Handle permitted_uses arrays
    if (extractedData.permitted_uses?.value && Array.isArray(extractedData.permitted_uses.value)) {
      if (!profile.permitted_uses || (Array.isArray(profile.permitted_uses) && profile.permitted_uses.length === 0)) {
        updateData.permitted_uses = extractedData.permitted_uses.value;
        fieldsCompleted++;
        updatedFields.push('Usos permitidos');
      }
    }

    // Add analysis notes
    const additionalNotes = (extractedData as Record<string, unknown>).additional_notes as string || '';
    if (additionalNotes) {
      const existingNotes = profile.analysis_notes || '';
      updateData.analysis_notes = existingNotes 
        ? `${existingNotes}\n\n--- Auto-completado (${new Date().toLocaleDateString('es-ES')}) ---\n${additionalNotes}`
        : `--- Auto-completado (${new Date().toLocaleDateString('es-ES')}) ---\n${additionalNotes}`;
    }

    // Update consulted sources
    const existingSources = Array.isArray(profile.consulted_sources) ? profile.consulted_sources : [];
    const newSources = consultedUrls.map(url => ({ 
      name: `Documento consultado`, 
      url, 
      type: 'Web',
      date: new Date().toISOString().split('T')[0]
    }));
    updateData.consulted_sources = [...existingSources, ...newSources];
    updateData.last_analyzed_at = new Date().toISOString();

    if (Object.keys(updateData).length > 2) { // More than just consulted_sources and last_analyzed_at
      const { error: updateError } = await supabase
        .from('urban_profiles')
        .update(updateData)
        .eq('id', profile.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Error al actualizar el perfil' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Completed ${fieldsCompleted} fields: ${updatedFields.join(', ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        fieldsCompleted,
        updatedFields,
        sources,
        consultedUrls,
        applicableRegulations, // Include applicable regulations in response
        landType: isRustico ? 'Suelo Rústico' : 'Suelo Urbano',
        message: fieldsCompleted > 0 
          ? `Se completaron ${fieldsCompleted} campos: ${updatedFields.join(', ')}`
          : 'No se encontraron datos adicionales para completar'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-complete-urban-profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({
        success: false,
        error: `Error al auto-completar el perfil urbanístico: ${errorMessage}. Por favor, intente subir un documento PDF del PGOU o consulte directamente con el Ayuntamiento.`,
        suggestion: 'Puede subir un PDF del PGOU o normas subsidiarias usando el botón "Subir PDF" para obtener mejores resultados.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
