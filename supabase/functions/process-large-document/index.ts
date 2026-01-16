import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessingResult {
  success: boolean;
  pagesProcessed?: number;
  totalPages?: number;
  extractedData?: Record<string, unknown>;
  error?: string;
}

// Use Lovable AI to analyze extracted text (with optional image for OCR)
async function analyzeWithAI(
  input: {
    text: string;
    municipality: string | null;
    landClass: string;
    firstPageImageDataUrl?: string | null;
  }
): Promise<Record<string, unknown>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const systemPrompt = `Eres un experto en urbanismo español especializado en analizar documentos urbanísticos oficiales. Tu trabajo es extraer ABSOLUTAMENTE TODOS los datos urbanísticos del documento proporcionado.

TIPOS DE DOCUMENTOS QUE PUEDES RECIBIR:
1. **CERTIFICADO URBANÍSTICO / CÉDULA URBANÍSTICA** - Documento oficial del Ayuntamiento que certifica las condiciones urbanísticas de una parcela específica.

INSTRUCCIONES CRÍTICAS:
1. Lee con máxima atención. Si es un Certificado Urbanístico, normalmente contiene la respuesta explícita.
2. Si hay una imagen de página (OCR), úsala como fuente principal cuando el texto sea incompleto.
3. Extrae valores numéricos exactos.
4. Incluye siempre la fuente exacta (sección/artículo/página) cuando sea posible.

CONCLUSIÓN EDIFICABLE (MUY IMPORTANTE):
- Si el documento dice explícitamente "edificable" o "no edificable", respeta esa conclusión.
- Si hay contradicción, prioriza el texto literal más claro (p.ej. "SE CERTIFICA: ... edificable").

RESPONDE SOLO en formato JSON con esta estructura exacta:
{
  "isEdificable": { "value": true o false o null, "source": "texto literal del documento o sección" },
  "urbanClassification": { "value": "clasificación encontrada o null", "source": "sección o artículo" },
  "urbanQualification": { "value": "calificación/zona encontrada o null", "source": "sección o artículo" },
  "maxBuildableVolume": { "value": null o número, "source": "artículo o sección" },
  "maxHeight": { "value": null o número en metros, "source": "artículo o sección" },
  "maxFloors": { "value": null o número, "source": "artículo o sección" },
  "buildabilityIndex": { "value": null o número, "source": "artículo o sección" },
  "maxOccupation": { "value": null o número (porcentaje sin %), "source": "artículo o sección" },
  "maxBuiltSurface": { "value": null o número en m², "source": "artículo o sección" },
  "minPlotArea": { "value": null o número en m², "source": "artículo o sección" },
  "minFrontage": { "value": null o número en metros, "source": "artículo o sección" },
  "frontSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "sideSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "rearSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceNeighbors": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceRoads": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceSlopes": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceCemetery": { "value": null o número en metros, "source": "ley o artículo" },
  "minDistancePowerLines": { "value": null o número en metros, "source": "normativa sectorial" },
  "minDistanceWaterCourses": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceRailway": { "value": null o número en metros, "source": "normativa sectorial" },
  "minDistancePipeline": { "value": null o número en metros, "source": "normativa sectorial" },
  "fenceSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "accessWidth": { "value": null o número en metros, "source": "artículo o sección" },
  "hasMunicipalSewage": { "value": null o true o false, "source": "información del municipio" },
  "requiresSepticTank": { "value": null o true o false, "source": "normativa aplicable" },
  "septicTankRegulations": { "value": null o "texto con la normativa", "source": "artículo o sección" },
  "septicTankMinDistance": { "value": null o número en metros, "source": "normativa sanitaria" },
  "distanceToWaterSupply": { "value": null o número en metros, "source": "informe o documento" },
  "distanceToSewageNetwork": { "value": null o número en metros, "source": "informe o documento" },
  "distanceToElectricity": { "value": null o número en metros, "source": "informe o documento" },
  "isDivisible": { "value": null o true o false, "source": "artículo o sección" },
  "affectedByPowerLines": true o false o null,
  "affectedByCemetery": true o false o null,
  "affectedByWaterCourses": true o false o null,
  "sectoralRestrictions": [
    { "type": "tipo de afección", "description": "descripción", "distance": número o null, "source": "referencia" }
  ],
  "additionalInfo": "Cualquier otra información urbanística relevante encontrada que no encaje en los campos anteriores",
  "documentSummary": "Breve resumen del tipo de documento y sus conclusiones principales"
}`;

  // Provide a more robust input: head + tail + keyword snippets
  const text = input.text || '';
  const head = text.slice(0, 45000);
  const tail = text.length > 90000 ? text.slice(-45000) : '';

  const keywords = [
    'CERTIFICA',
    'EDIFICABLE',
    'NO EDIFICABLE',
    'APTO PARA EDIFICAR',
    'CLASIFICACIÓN',
    'CALIFICACIÓN',
    'EDIFICABILIDAD',
    'OCUPACIÓN',
    'ALTURA',
    'PLANTAS',
    'RETRANQUEO',
    'PARCELA',
    'SUPERFICIE',
    'VOLUMEN',
  ];

  const snippets: string[] = [];
  const upper = text.toUpperCase();
  for (const k of keywords) {
    const ku = k.toUpperCase();
    let idx = 0;
    let hits = 0;
    while (hits < 8) {
      const found = upper.indexOf(ku, idx);
      if (found === -1) break;
      const start = Math.max(0, found - 400);
      const end = Math.min(text.length, found + ku.length + 400);
      snippets.push(text.slice(start, end));
      idx = found + ku.length;
      hits++;
    }
  }

  const analysisText = [
    '=== INICIO DEL DOCUMENTO (recorte) ===\n' + head,
    tail ? '\n\n=== FINAL DEL DOCUMENTO (recorte) ===\n' + tail : '',
    snippets.length ? '\n\n=== EXTRACTOS POR PALABRAS CLAVE ===\n' + snippets.join('\n\n---\n\n') : '',
  ].filter(Boolean).join('\n');

  const hasImage = !!input.firstPageImageDataUrl;
  const model = hasImage ? 'openai/gpt-5-mini' : 'google/gemini-2.5-flash';

  const userContent: any = hasImage
    ? [
        { type: 'text', text: `Analiza el siguiente contenido extraído (puede estar incompleto) y la imagen de la primera página si la necesitas:\n\n${analysisText}` },
        { type: 'image_url', image_url: { url: input.firstPageImageDataUrl } },
      ]
    : `Analiza el siguiente texto extraído de un documento urbanístico:\n\n${analysisText}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    throw new Error(`Error de Lovable AI: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return { rawResponse: content, parseError: true };
}

// Fetch PDF from URL and extract text (simplified - for large docs we'd use a proper PDF service)
async function fetchAndExtractFromUrl(url: string): Promise<{ text: string; pageCount: number }> {
  console.log('Fetching document from URL:', url);
  
  // For Dropbox, convert share link to direct download
  let directUrl = url;
  if (url.includes('dropbox.com')) {
    directUrl = url.replace('dl=0', 'dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  }
  // For Google Drive, convert share link to direct download
  if (url.includes('drive.google.com/file/d/')) {
    const fileId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (fileId) {
      directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
  }

  const response = await fetch(directUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DocumentProcessor/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Error al descargar documento: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  
  // If it's a PDF, we'll need to handle it differently
  // For now, we can work with HTML/text content from web pages
  if (contentType.includes('text/html') || contentType.includes('text/plain')) {
    const text = await response.text();
    // Simple HTML to text conversion
    const cleanText = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return { text: cleanText, pageCount: 1 };
  }

  // For PDFs, return info that we need client-side processing
  if (contentType.includes('application/pdf')) {
    // Note: For very large PDFs, we'd need a dedicated PDF processing service
    // or process in chunks. This is a placeholder.
    throw new Error('Los PDFs de URL requieren procesamiento especial. Por favor, descarga el documento y súbelo directamente al sistema.');
  }

  throw new Error(`Tipo de documento no soportado: ${contentType}`);
}

// Process document from Supabase Storage
async function processFromStorage(
  supabaseUrl: string,
  supabaseKey: string,
  storagePath: string
): Promise<{ text: string; pageCount: number }> {
  console.log('Processing document from storage:', storagePath);
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  // Download the file
  const { data, error } = await supabase.storage
    .from('pgou-documents')
    .download(storagePath);

  if (error) {
    throw new Error(`Error al descargar documento: ${error.message}`);
  }

  // For now, return placeholder - actual PDF processing would require pdf-parse or similar
  // In a production environment, we'd use a dedicated PDF extraction service
  const text = await data.text().catch(() => '');
  
  if (!text || text.length < 100) {
    throw new Error('No se pudo extraer texto del documento. Asegúrate de que el PDF tiene texto seleccionable (no es una imagen escaneada).');
  }

  return { text, pageCount: 1 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    try {
      const {
        uploadId,
        sourceType,
        storagePath,
        externalUrl,
        municipality,
        landClass,
        budgetId,
        pdfText,
        pdfPageCount,
        firstPageImageDataUrl,
      } = await req.json();

      if (!uploadId) {
        return new Response(
          JSON.stringify({ success: false, error: 'ID de carga requerido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      console.log(`Processing document upload ${uploadId}, source: ${sourceType}`);

      // Update status to processing
      await supabase
        .from('urban_document_uploads')
        .update({
          status: 'processing',
          processing_started_at: new Date().toISOString(),
        })
        .eq('id', uploadId);

      let extractedText = '';
      let pageCount = 0;

      try {
        // Prefer client-side extracted text (more reliable than Blob.text() for PDFs)
        if (typeof pdfText === 'string' && pdfText.trim().length > 0) {
          extractedText = pdfText;
          pageCount = typeof pdfPageCount === 'number' && pdfPageCount > 0 ? pdfPageCount : 1;
          console.log(`Using client-extracted PDF text (${extractedText.length} chars)`);
        } else if (sourceType === 'url' && externalUrl) {
          const result = await fetchAndExtractFromUrl(externalUrl);
          extractedText = result.text;
          pageCount = result.pageCount;
        } else if (sourceType === 'storage' && storagePath) {
          const result = await processFromStorage(supabaseUrl, supabaseServiceKey, storagePath);
          extractedText = result.text;
          pageCount = result.pageCount;
        } else {
          throw new Error('Fuente de documento no válida');
        }

        console.log(`Extracted ${extractedText.length} characters from ${pageCount} pages`);

        // Analyze with AI (use image for OCR fallback if provided)
        let extractedData = await analyzeWithAI({
          text: extractedText,
          municipality: municipality ?? null,
          landClass: landClass || 'suelo urbano',
          firstPageImageDataUrl: typeof firstPageImageDataUrl === 'string' ? firstPageImageDataUrl : null,
        });

        // Heuristic correction for buildable / not buildable if the document clearly states it
        try {
          const txt = extractedText || '';
          const hasNoEdificable = /\bno\s+edificable\b/i.test(txt);
          const hasEdificable = /\bedificable\b/i.test(txt) || /\bapto\s+para\s+edificar\b/i.test(txt);
          const ie = (extractedData as any)?.isEdificable;
          if (ie && typeof ie.value === 'boolean') {
            if (ie.value === false && !hasNoEdificable && hasEdificable) {
              (extractedData as any).isEdificable = {
                value: true,
                source: 'Heurística: el documento contiene "edificable/apto para edificar" y no contiene "no edificable"',
              };
            }
            if (ie.value === true && hasNoEdificable) {
              (extractedData as any).isEdificable = {
                value: false,
                source: 'Heurística: el documento contiene explícitamente "no edificable"',
              };
            }
          } else {
            if (hasNoEdificable) {
              (extractedData as any).isEdificable = { value: false, source: 'Heurística: aparece "no edificable"' };
            } else if (hasEdificable) {
              (extractedData as any).isEdificable = { value: true, source: 'Heurística: aparece "edificable/apto para edificar"' };
            }
          }
        } catch (e) {
          console.warn('Buildable heuristic failed:', e);
        }

      // Count values found
      let valuesFound = 0;
      const checkValue = (obj: { value: number | null | undefined } | undefined) => {
        if (obj?.value !== null && obj?.value !== undefined) {
          valuesFound++;
        }
      };

      if (extractedData && !extractedData.parseError) {
        checkValue(extractedData.maxBuildableVolume as { value: number | null });
        checkValue(extractedData.maxHeight as { value: number | null });
        checkValue(extractedData.maxFloors as { value: number | null });
        checkValue(extractedData.buildabilityIndex as { value: number | null });
        checkValue(extractedData.maxOccupation as { value: number | null });
        checkValue(extractedData.maxBuiltSurface as { value: number | null });
        checkValue(extractedData.frontSetback as { value: number | null });
        checkValue(extractedData.sideSetback as { value: number | null });
        checkValue(extractedData.rearSetback as { value: number | null });
        checkValue(extractedData.minDistanceNeighbors as { value: number | null });
        checkValue(extractedData.minDistanceRoads as { value: number | null });
        checkValue(extractedData.minDistanceSlopes as { value: number | null });
        checkValue(extractedData.minDistanceCemetery as { value: number | null });
        checkValue(extractedData.minDistancePowerLines as { value: number | null });
        checkValue(extractedData.minDistanceWaterCourses as { value: number | null });
        checkValue(extractedData.minDistanceRailway as { value: number | null });
        checkValue(extractedData.minDistancePipeline as { value: number | null });
        checkValue(extractedData.fenceSetback as { value: number | null });
        checkValue(extractedData.accessWidth as { value: number | null });
        checkValue(extractedData.septicTankMinDistance as { value: number | null });
        checkValue(extractedData.distanceToWaterSupply as { value: number | null });
        checkValue(extractedData.distanceToSewageNetwork as { value: number | null });
        checkValue(extractedData.distanceToElectricity as { value: number | null });
      }

      // Update the upload record with results
      await supabase
        .from('urban_document_uploads')
        .update({
          status: 'completed',
          processing_completed_at: new Date().toISOString(),
          extracted_text: extractedText.substring(0, 100000), // Limit stored text
          extracted_data: extractedData,
          pages_processed: pageCount,
          total_pages: pageCount,
        })
        .eq('id', uploadId);

      // If budget_id provided, update the urban profile with extracted data
      if (budgetId && extractedData && !extractedData.parseError) {
        const updateData: Record<string, unknown> = {};
        
        const ed = extractedData as Record<string, { value?: number | string | boolean; source?: string }>;
        const edAny = extractedData as Record<string, unknown>;
        
        // CRITICAL: isEdificable - the most important conclusion
        const isEdificableField = ed.isEdificable;
        if (typeof isEdificableField?.value === 'boolean') {
          updateData.is_buildable = isEdificableField.value;
          updateData.is_buildable_source = isEdificableField.source || 'Certificado Urbanístico';
        }
        
        // Urban classification and qualification from document
        const urbanClassField = ed.urbanClassification;
        if (urbanClassField?.value && typeof urbanClassField.value === 'string') {
          updateData.urban_classification = urbanClassField.value;
        }
        const urbanQualField = ed.urbanQualification;
        if (urbanQualField?.value && typeof urbanQualField.value === 'string') {
          updateData.urban_qualification = urbanQualField.value;
        }
        
        // Min plot area and frontage
        const minPlotAreaField = ed.minPlotArea as { value?: number; source?: string };
        if (minPlotAreaField?.value) {
          updateData.min_plot_area = minPlotAreaField.value;
        }
        
        if (ed.maxBuildableVolume?.value && typeof ed.maxBuildableVolume.value === 'number') {
          updateData.max_buildable_volume = ed.maxBuildableVolume.value;
          updateData.max_buildable_volume_source = ed.maxBuildableVolume.source;
        }
        if (ed.maxHeight?.value && typeof ed.maxHeight.value === 'number') {
          updateData.max_height = ed.maxHeight.value;
          updateData.max_height_source = ed.maxHeight.source;
        }
        if (ed.buildabilityIndex?.value) {
          updateData.buildability_index = ed.buildabilityIndex.value;
          updateData.buildability_index_source = ed.buildabilityIndex.source;
        }
        if (ed.maxOccupation?.value) {
          updateData.max_occupation_percent = ed.maxOccupation.value;
          updateData.max_occupation_source = ed.maxOccupation.source;
        }
        if (ed.frontSetback?.value) {
          updateData.front_setback = ed.frontSetback.value;
          updateData.front_setback_source = ed.frontSetback.source;
        }
        if (ed.sideSetback?.value) {
          updateData.side_setback = ed.sideSetback.value;
          updateData.side_setback_source = ed.sideSetback.source;
        }
        if (ed.rearSetback?.value) {
          updateData.rear_setback = ed.rearSetback.value;
          updateData.rear_setback_source = ed.rearSetback.source;
        }
        if (ed.minDistanceNeighbors?.value) {
          updateData.min_distance_neighbors = ed.minDistanceNeighbors.value;
          updateData.min_distance_neighbors_source = ed.minDistanceNeighbors.source;
        }
        if (ed.minDistanceRoads?.value) {
          updateData.min_distance_roads = ed.minDistanceRoads.value;
          updateData.min_distance_roads_source = ed.minDistanceRoads.source;
        }
        if (ed.minDistanceSlopes?.value) {
          updateData.min_distance_slopes = ed.minDistanceSlopes.value;
          updateData.min_distance_slopes_source = ed.minDistanceSlopes.source;
        }
        // New sectoral restriction fields
        if (ed.minDistanceCemetery?.value) {
          updateData.min_distance_cemetery = ed.minDistanceCemetery.value;
          updateData.min_distance_cemetery_source = ed.minDistanceCemetery.source;
        }
        if (ed.minDistancePowerLines?.value) {
          updateData.min_distance_power_lines = ed.minDistancePowerLines.value;
          updateData.min_distance_power_lines_source = ed.minDistancePowerLines.source;
        }
        if (ed.minDistanceWaterCourses?.value) {
          updateData.min_distance_water_courses = ed.minDistanceWaterCourses.value;
          updateData.min_distance_water_courses_source = ed.minDistanceWaterCourses.source;
        }
        if (ed.minDistanceRailway?.value) {
          updateData.min_distance_railway = ed.minDistanceRailway.value;
          updateData.min_distance_railway_source = ed.minDistanceRailway.source;
        }
        if (ed.minDistancePipeline?.value) {
          updateData.min_distance_pipeline = ed.minDistancePipeline.value;
          updateData.min_distance_pipeline_source = ed.minDistancePipeline.source;
        }
        if (ed.maxBuiltSurface?.value) {
          updateData.max_built_surface = ed.maxBuiltSurface.value;
          updateData.max_built_surface_source = ed.maxBuiltSurface.source;
        }
        if (ed.maxFloors?.value) {
          updateData.max_floors = ed.maxFloors.value;
          updateData.max_floors_source = ed.maxFloors.source;
        }
        if (ed.fenceSetback?.value) {
          updateData.fence_setback = ed.fenceSetback.value;
          updateData.fence_setback_source = ed.fenceSetback.source;
        }
        if (ed.accessWidth?.value) {
          updateData.access_width = ed.accessWidth.value;
          updateData.access_width_source = ed.accessWidth.source;
        }
        // Boolean fields - use proper type casting
        const isDivisibleField = (extractedData as Record<string, { value?: boolean | null; source?: string }>).isDivisible;
        if (typeof isDivisibleField?.value === 'boolean') {
          updateData.is_divisible = isDivisibleField.value;
          updateData.is_divisible_source = isDivisibleField.source;
        }
        // edAny is already defined above, reusing it
        if (typeof edAny.affectedByPowerLines === 'boolean') {
          updateData.affected_by_power_lines = edAny.affectedByPowerLines;
        }
        if (typeof edAny.affectedByCemetery === 'boolean') {
          updateData.affected_by_cemetery = edAny.affectedByCemetery;
        }
        if (typeof edAny.affectedByWaterCourses === 'boolean') {
          updateData.affected_by_water_courses = edAny.affectedByWaterCourses;
        }
        // Sewage/Sanitation fields
        const hasMunicipalSewageField = (extractedData as Record<string, { value?: boolean | null; source?: string }>).hasMunicipalSewage;
        if (typeof hasMunicipalSewageField?.value === 'boolean') {
          updateData.has_municipal_sewage = hasMunicipalSewageField.value;
          updateData.has_municipal_sewage_source = hasMunicipalSewageField.source;
        }
        const requiresSepticTankField = (extractedData as Record<string, { value?: boolean | null; source?: string }>).requiresSepticTank;
        if (typeof requiresSepticTankField?.value === 'boolean') {
          updateData.requires_septic_tank = requiresSepticTankField.value;
        }
        const septicTankRegulationsField = (extractedData as Record<string, { value?: string | null; source?: string }>).septicTankRegulations;
        if (septicTankRegulationsField?.value) {
          updateData.septic_tank_regulations = septicTankRegulationsField.value;
        }
        if (ed.septicTankMinDistance?.value) {
          updateData.septic_tank_min_distance = ed.septicTankMinDistance.value;
          updateData.septic_tank_min_distance_source = ed.septicTankMinDistance.source;
        }
        // Distance to utilities/services
        if (ed.distanceToWaterSupply?.value) {
          updateData.distance_to_water_supply = ed.distanceToWaterSupply.value;
          updateData.distance_to_water_supply_source = ed.distanceToWaterSupply.source;
        }
        if (ed.distanceToSewageNetwork?.value) {
          updateData.distance_to_sewage_network = ed.distanceToSewageNetwork.value;
          updateData.distance_to_sewage_network_source = ed.distanceToSewageNetwork.source;
        }
        if (ed.distanceToElectricity?.value) {
          updateData.distance_to_electricity = ed.distanceToElectricity.value;
          updateData.distance_to_electricity_source = ed.distanceToElectricity.source;
        }
        // Store sectoral restrictions as JSON
        if (Array.isArray(edAny.sectoralRestrictions) && edAny.sectoralRestrictions.length > 0) {
          updateData.sectoral_restrictions = edAny.sectoralRestrictions;
        }

        if (Object.keys(updateData).length > 0) {
          updateData.analysis_status = 'pgou_loaded';
          updateData.last_analyzed_at = new Date().toISOString();
          
          const additionalInfo = edAny.additionalInfo as string || '';
          const summary = edAny.documentSummary as string || '';
          if (additionalInfo || summary) {
            updateData.analysis_notes = [summary, additionalInfo].filter(Boolean).join('\n\n');
          }

          await supabase
            .from('urban_profiles')
            .update(updateData)
            .eq('budget_id', budgetId);

          console.log(`Updated urban profile with ${Object.keys(updateData).length} fields`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            pagesProcessed: pageCount,
            totalPages: pageCount,
            extractedData,
            valuesFound,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError) {
      console.error('Processing error:', processingError);
      
      // Update status to failed
      await supabase
        .from('urban_document_uploads')
        .update({
          status: 'failed',
          processing_completed_at: new Date().toISOString(),
          error_message: processingError instanceof Error ? processingError.message : 'Error desconocido',
        })
        .eq('id', uploadId);

      throw processingError;
    }

  } catch (error) {
    console.error('Error in process-large-document:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar documento',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
