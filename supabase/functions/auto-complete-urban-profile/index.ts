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
    const { budgetId, municipality, province, autonomousCommunity, landClass, cadastralReference } = await req.json();

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
    const landType = landClass === 'Rústico' ? 'suelo rústico núcleo rural' : 'suelo urbano';
    const region = autonomousCommunity || province;
    
    let documentContent = '';
    const consultedUrls: string[] = [];

    if (FIRECRAWL_API_KEY) {
      // Search for PGOU and urban regulations documents
      const searchQueries = [
        `PGOU ${municipality} ${province} normativa urbanística PDF`,
        `normas subsidiarias ${municipality} ordenanzas urbanísticas`,
        `${region} normativa ${landType} edificación vivienda unifamiliar`
      ];

      for (const query of searchQueries) {
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
              limit: 3,
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
                documentContent += `\n\n--- FUENTE: ${result.title || result.url} ---\n${result.markdown.substring(0, 15000)}`;
                consultedUrls.push(result.url);
                console.log(`Found content from: ${result.url} (${result.markdown.length} chars)`);
              }
            }
          }
        } catch (e) {
          console.error(`Search error for "${query}":`, e);
        }

        // Limit total content
        if (documentContent.length > 50000) break;
      }
    }

    // Step 3: Use AI to extract the missing values
    const missingFieldsList = missingFields.map(f => `- ${f.label} (${f.field})`).join('\n');
    
    const analysisPrompt = `Eres un experto urbanista español. Analiza la siguiente información para encontrar los parámetros urbanísticos que faltan para una parcela en:
- Municipio: ${municipality}
- Provincia: ${province}
- Comunidad Autónoma: ${region || 'No especificada'}
- Tipo de suelo: ${landClass || 'No especificado'}
- Referencia catastral: ${cadastralReference || 'No especificada'}

CAMPOS QUE NECESITAMOS ENCONTRAR:
${missingFieldsList}

${documentContent ? `DOCUMENTACIÓN ENCONTRADA:\n${documentContent.substring(0, 40000)}` : 'No se encontró documentación específica. Usa valores típicos de la normativa urbanística de la comunidad autónoma.'}

RESPONDE EN JSON con esta estructura:
{
  "is_buildable": { "value": true/false o null, "source": "fuente" },
  "urban_classification": { "value": "texto" o null, "source": "fuente" },
  "buildability_index": { "value": número o null, "source": "fuente" },
  "max_height": { "value": número en metros o null, "source": "fuente" },
  "max_floors": { "value": número o null, "source": "fuente" },
  "max_occupation_percent": { "value": número (%) o null, "source": "fuente" },
  "front_setback": { "value": número en metros o null, "source": "fuente" },
  "side_setback": { "value": número en metros o null, "source": "fuente" },
  "rear_setback": { "value": número en metros o null, "source": "fuente" },
  "min_distance_neighbors": { "value": número en metros o null, "source": "fuente" },
  "road_setback": { "value": número en metros o null, "source": "fuente" },
  "has_municipal_sewage": { "value": true/false o null, "source": "fuente" },
  "building_typology": { "value": "texto" o null, "source": "fuente" },
  "permitted_uses": { "value": ["uso1", "uso2"] o null, "source": "fuente" },
  "additional_notes": "Observaciones sobre la normativa aplicable"
}

IMPORTANTE:
- Para núcleo rural/suelo rústico en Asturias, busca en BOPA y normativa autonómica
- Si no encuentras un dato específico del municipio, indica valores típicos de la normativa autonómica
- Indica siempre la fuente (artículo, normativa, etc.)`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.1,
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
          if (data.source && data.source !== 'No encontrado') {
            updateData[`${dbField}_source`] = data.source;
            if (!sources.includes(data.source)) sources.push(data.source);
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

    // Handle arrays
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
        message: fieldsCompleted > 0 
          ? `Se completaron ${fieldsCompleted} campos: ${updatedFields.join(', ')}`
          : 'No se encontraron datos adicionales para completar'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-complete-urban-profile:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al auto-completar el perfil',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
