import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  supplierName: string;
  website: string;
  phone: string;
  email: string;
  price: string;
  description: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, resourceType } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere una consulta de búsqueda' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'El conector Firecrawl no está configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching for resources:', query, 'Type:', resourceType);

    // Build search query for construction/renovation suppliers
    const searchQuery = `${query} ${resourceType || ''} proveedor distribuidor España precio contacto`.trim();

    // Use Firecrawl search API
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 10,
        lang: 'es',
        country: 'ES',
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error('Firecrawl search error:', searchData);
      return new Response(
        JSON.stringify({ success: false, error: searchData.error || 'Error en la búsqueda' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Search completed, processing results...');

    // Process results to extract supplier information
    const results: SearchResult[] = [];

    if (searchData.data && Array.isArray(searchData.data)) {
      for (const item of searchData.data) {
        const content = item.markdown || item.description || '';
        const url = item.url || '';
        const title = item.title || '';

        // Extract contact information using regex patterns
        const phoneMatch = content.match(/(?:\+34\s?)?(?:\d{3}[\s.-]?\d{3}[\s.-]?\d{3}|\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2})/g);
        const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        const priceMatch = content.match(/(?:\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*€/g);

        // Extract supplier name from title or URL
        let supplierName = title;
        if (!supplierName && url) {
          try {
            const urlObj = new URL(url);
            supplierName = urlObj.hostname.replace('www.', '').split('.')[0];
            supplierName = supplierName.charAt(0).toUpperCase() + supplierName.slice(1);
          } catch {
            supplierName = 'Proveedor desconocido';
          }
        }

        results.push({
          supplierName: supplierName || 'Proveedor desconocido',
          website: url,
          phone: phoneMatch ? phoneMatch[0] : '',
          email: emailMatch ? emailMatch[0] : '',
          price: priceMatch ? priceMatch[0] : '',
          description: item.description || title || '',
        });
      }
    }

    console.log(`Found ${results.length} results`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: results,
        query: searchQuery 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-resources:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
