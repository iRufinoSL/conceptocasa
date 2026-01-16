import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LandListing {
  title: string;
  location: string;
  municipality: string;
  province: string;
  price?: number;
  priceText?: string;
  surfaceArea?: number;
  surfaceText?: string;
  cadastralReference?: string;
  url?: string;
  source?: string;
  description?: string;
  landClass?: string;
  canBuild?: boolean;
}

interface SearchResult {
  listings: LandListing[];
  totalFound: number;
  sources: string[];
  searchQuery: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { municipality, province, maxPrice, minSurface, maxSurface } = await req.json();

    if (!municipality && !province) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere municipio o provincia' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'API de Perplexity no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const locationQuery = municipality 
      ? `${municipality}${province ? `, ${province}` : ''}` 
      : province;

    console.log(`Searching for land listings in: ${locationQuery}`);

    // Build search query for land listings
    const priceFilter = maxPrice ? ` precio máximo ${maxPrice}€` : '';
    const surfaceFilter = minSurface || maxSurface 
      ? ` superficie ${minSurface ? `mínimo ${minSurface}m²` : ''} ${maxSurface ? `máximo ${maxSurface}m²` : ''}`
      : '';

    const searchQuery = `
Busca terrenos y parcelas en venta en ${locationQuery}${priceFilter}${surfaceFilter}.

Necesito encontrar anuncios de venta de:
- Terrenos urbanos
- Parcelas urbanizables  
- Solares edificables
- Fincas rústicas (solo si tienen posibilidad de construcción)

Busca en:
- Portales inmobiliarios (Idealista, Fotocasa, pisos.com, Habitaclia)
- Webs de inmobiliarias locales
- Portales de subastas públicas
- Anuncios de particulares

Para cada terreno encontrado, proporciona:
- Título del anuncio
- Ubicación exacta (dirección, zona, municipio)
- Precio de venta
- Superficie en m²
- Referencia catastral (si aparece en el anuncio)
- URL del anuncio original
- Fuente (portal o inmobiliaria)
- Breve descripción

Máximo 15 resultados ordenados por relevancia.
    `.trim();

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en búsqueda de propiedades inmobiliarias en España. 
Busca terrenos y parcelas EN VENTA en los principales portales inmobiliarios y webs de inmobiliarias.

Responde SOLO en formato JSON con esta estructura exacta:
{
  "listings": [
    {
      "title": "Título del anuncio",
      "location": "Dirección o zona específica",
      "municipality": "Nombre del municipio",
      "province": "Nombre de la provincia",
      "price": 50000,
      "priceText": "50.000 €",
      "surfaceArea": 1000,
      "surfaceText": "1.000 m²",
      "cadastralReference": "Referencia catastral si aparece, o null",
      "url": "URL del anuncio original",
      "source": "Nombre del portal (Idealista, Fotocasa, etc.)",
      "description": "Breve descripción del terreno"
    }
  ],
  "totalFound": 15,
  "sources": ["Idealista", "Fotocasa", "etc."]
}

IMPORTANTE:
- price debe ser un número (sin símbolos de moneda)
- surfaceArea debe ser un número en m²
- cadastralReference puede ser null si no aparece en el anuncio
- url DEBE ser una URL válida al anuncio original
- Solo incluye terrenos que estén actualmente EN VENTA`
          },
          { role: 'user', content: searchQuery }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `Error de Perplexity: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    console.log('Perplexity response received, parsing...');

    // Try to parse the JSON response
    let result: SearchResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
        // Add citations as additional sources
        if (citations.length > 0) {
          result.sources = [...new Set([...(result.sources || []), ...citations])];
        }
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing Perplexity response:', parseError);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            listings: [],
            totalFound: 0,
            sources: citations,
            rawResponse: content,
            parseError: true
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add search query to result
    result.searchQuery = locationQuery;

    console.log(`Found ${result.listings?.length || 0} listings`);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-land-listings:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al buscar terrenos',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
