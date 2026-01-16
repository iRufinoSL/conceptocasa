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

// Use Lovable AI to analyze extracted text
async function analyzeWithAI(
  text: string, 
  municipality: string | null,
  landClass: string
): Promise<Record<string, unknown>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const systemPrompt = `Eres un experto en urbanismo español especializado en analizar documentos de Planes Generales de Ordenación Urbanística (PGOU).

Tu tarea es extraer datos numéricos específicos del texto proporcionado de un PGOU para ${landClass} en el municipio de ${municipality || 'el municipio indicado'}.

INSTRUCCIONES:
1. Busca en el texto los siguientes parámetros urbanísticos:
   - Volumen máximo edificable (m³ o m³/parcela)
   - Altura máxima (metros o número de plantas)
   - Índice de edificabilidad (m²/m² o m²t/m²s)
   - Ocupación máxima (porcentaje)
   - Retranqueos: frontal, lateral y posterior (metros)
   - Distancias mínimas: a colindantes, a caminos/carreteras, a taludes (metros)

2. Para cada valor encontrado, indica el artículo, sección o referencia donde lo encontraste.

3. Si un valor no aparece explícitamente, pon null.

4. Si hay varios valores posibles (por zonas, usos, etc.), extrae el más general o común para vivienda unifamiliar.

5. Convierte plantas a metros si es necesario (1 planta ≈ 3m, 2 plantas ≈ 6m, etc.)

RESPONDE SOLO en formato JSON con esta estructura exacta:
{
  "maxBuildableVolume": { "value": null o número, "source": "artículo o sección" },
  "maxHeight": { "value": null o número en metros, "source": "artículo o sección" },
  "buildabilityIndex": { "value": null o número, "source": "artículo o sección" },
  "maxOccupation": { "value": null o número (porcentaje sin %), "source": "artículo o sección" },
  "frontSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "sideSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "rearSetback": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceNeighbors": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceRoads": { "value": null o número en metros, "source": "artículo o sección" },
  "minDistanceSlopes": { "value": null o número en metros, "source": "artículo o sección" },
  "additionalInfo": "Cualquier otra información urbanística relevante encontrada",
  "documentSummary": "Breve resumen del tipo de documento y su contenido principal"
}`;

  const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analiza el siguiente texto extraído de un documento urbanístico:\n\n${text.substring(0, 50000)}` }
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
    const { uploadId, sourceType, storagePath, externalUrl, municipality, landClass, budgetId } = await req.json();

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
      if (sourceType === 'url' && externalUrl) {
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

      // Analyze with AI
      const extractedData = await analyzeWithAI(
        extractedText,
        municipality,
        landClass || 'suelo urbano'
      );

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
        checkValue(extractedData.buildabilityIndex as { value: number | null });
        checkValue(extractedData.maxOccupation as { value: number | null });
        checkValue(extractedData.frontSetback as { value: number | null });
        checkValue(extractedData.sideSetback as { value: number | null });
        checkValue(extractedData.rearSetback as { value: number | null });
        checkValue(extractedData.minDistanceNeighbors as { value: number | null });
        checkValue(extractedData.minDistanceRoads as { value: number | null });
        checkValue(extractedData.minDistanceSlopes as { value: number | null });
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
        
        const ed = extractedData as Record<string, { value?: number; source?: string }>;
        
        if (ed.maxBuildableVolume?.value) {
          updateData.max_buildable_volume = ed.maxBuildableVolume.value;
          updateData.max_buildable_volume_source = ed.maxBuildableVolume.source;
        }
        if (ed.maxHeight?.value) {
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

        if (Object.keys(updateData).length > 0) {
          updateData.analysis_status = 'pgou_loaded';
          updateData.last_analyzed_at = new Date().toISOString();
          
          const additionalInfo = ed.additionalInfo as string || '';
          const summary = ed.documentSummary as string || '';
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
