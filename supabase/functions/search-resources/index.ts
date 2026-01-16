import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://concepto.casa',
  'https://www.concepto.casa',
  'https://conceptocasa.lovable.app',
  'https://id-preview--4d51c106-5c78-4d01-aefe-37e5c53dc32c.lovable.app'
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Rate limiting configuration
const RATE_LIMIT_MAX = 20; // Max 20 requests per hour per user
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-memory rate limit store (resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(userId);

  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

interface SearchResult {
  supplierName: string;
  website: string;
  phone: string;
  email: string;
  price: string;
  description: string;
  hasTechnicalSheet?: boolean;
  hasCEMarking?: boolean;
  certifications?: string[];
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('No authorization header provided');
      return new Response(
        JSON.stringify({ success: false, error: 'No autorizado. Por favor, inicie sesión.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.log('Invalid token:', claimsError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido o expirado. Por favor, inicie sesión de nuevo.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    console.log('Authenticated user:', userId);

    // Check rate limit
    const { allowed, remaining } = checkRateLimit(userId);
    if (!allowed) {
      console.log('Rate limit exceeded for user:', userId);
      return new Response(
        JSON.stringify({ success: false, error: 'Límite de búsquedas excedido. Por favor, espere una hora.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0' } }
      );
    }

    // Parse and validate input
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Cuerpo de solicitud inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, resourceType, geoFilter, specificWebsite, specificSupplier, searchExtras } = body;

    // Input validation
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere una consulta de búsqueda válida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize and limit query length
    const sanitizedQuery = query.trim().slice(0, 200);
    if (sanitizedQuery.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'La consulta de búsqueda no puede estar vacía' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate resourceType if provided
    const validResourceTypes = ['material', 'mano_de_obra', 'maquinaria', 'subcontrata', 'otros'];
    const sanitizedResourceType = resourceType && typeof resourceType === 'string' 
      ? (validResourceTypes.includes(resourceType) ? resourceType : '') 
      : '';

    // Validate geoFilter
    const validCountries = ['ES', 'PT', 'FR', 'IT', 'DE', 'GB', 'US'];
    const sanitizedGeoFilter = {
      location: geoFilter?.location && typeof geoFilter.location === 'string' 
        ? geoFilter.location.trim().slice(0, 100) 
        : '',
      country: geoFilter?.country && validCountries.includes(geoFilter.country) 
        ? geoFilter.country 
        : 'ES'
    };

    // Validate specific website
    const sanitizedWebsite = specificWebsite && typeof specificWebsite === 'string'
      ? specificWebsite.trim().slice(0, 100).replace(/^https?:\/\//, '').replace(/^www\./, '')
      : '';

    // Validate specific supplier
    const sanitizedSupplier = specificSupplier && typeof specificSupplier === 'string'
      ? specificSupplier.trim().slice(0, 100)
      : '';

    // Validate search extras (ficha_tecnica, marcado_ce, certificaciones)
    const validExtras = ['ficha_tecnica', 'marcado_ce', 'certificaciones'];
    const sanitizedExtras = Array.isArray(searchExtras) 
      ? searchExtras.filter(e => validExtras.includes(e))
      : [];

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'El conector Firecrawl no está configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching for resources:', sanitizedQuery, 'Type:', sanitizedResourceType, 'GeoFilter:', sanitizedGeoFilter, 'Website:', sanitizedWebsite, 'Supplier:', sanitizedSupplier, 'Extras:', sanitizedExtras, 'User:', userId);

    // Build search query with all filters
    let searchQueryParts = [sanitizedQuery];
    
    if (sanitizedResourceType) {
      searchQueryParts.push(sanitizedResourceType);
    }
    
    if (sanitizedSupplier) {
      searchQueryParts.push(`"${sanitizedSupplier}"`);
    }
    
    // Add quality/certification terms based on extras
    if (sanitizedExtras.includes('ficha_tecnica')) {
      searchQueryParts.push('ficha técnica especificaciones técnicas');
    }
    if (sanitizedExtras.includes('marcado_ce')) {
      searchQueryParts.push('marcado CE certificado europeo');
    }
    if (sanitizedExtras.includes('certificaciones')) {
      searchQueryParts.push('certificación calidad ISO normativa española homologación');
    }
    
    // Add geo and contact terms
    searchQueryParts.push('proveedor distribuidor');
    if (sanitizedGeoFilter.location) {
      searchQueryParts.push(sanitizedGeoFilter.location);
    }
    searchQueryParts.push('precio contacto');
    
    const searchQuery = searchQueryParts.join(' ').trim();
    
    // Determine country code for Firecrawl
    const countryCode = sanitizedGeoFilter.country;
    const langMap: Record<string, string> = {
      'ES': 'es', 'PT': 'pt', 'FR': 'fr', 'IT': 'it', 'DE': 'de'
    };

    // Build Firecrawl request options
    const firecrawlBody: Record<string, unknown> = {
      query: searchQuery,
      limit: 15,
      lang: langMap[countryCode] || 'en',
      country: countryCode,
      scrapeOptions: {
        formats: ['markdown'],
      },
    };

    // Add domain filter if specific website is provided
    if (sanitizedWebsite) {
      firecrawlBody.search_domain_filter = [sanitizedWebsite];
      console.log('Filtering to domain:', sanitizedWebsite);
    }

    // Use Firecrawl search API
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firecrawlBody),
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

    // Patterns for detecting quality indicators
    const technicalSheetPatterns = [
      /ficha\s*t[eé]cnica/i,
      /technical\s*sheet/i,
      /especificaciones\s*t[eé]cnicas/i,
      /datos\s*t[eé]cnicos/i,
      /hoja\s*de\s*producto/i,
      /datasheet/i,
    ];

    const ceMarkingPatterns = [
      /marcado\s*ce/i,
      /ce\s*mark(ing)?/i,
      /certificado\s*ce/i,
      /conformidad\s*europea/i,
      /\bce\b.*\bnorma/i,
      /directiva.*europea/i,
    ];

    const certificationPatterns = [
      { pattern: /iso\s*\d+/i, name: 'ISO' },
      { pattern: /une[- ]?en/i, name: 'UNE-EN' },
      { pattern: /aenor/i, name: 'AENOR' },
      { pattern: /ral/i, name: 'RAL' },
      { pattern: /cte/i, name: 'CTE' },
      { pattern: /dop/i, name: 'DoP' },
      { pattern: /euroclase/i, name: 'Euroclase' },
      { pattern: /reacci[oó]n\s*al\s*fuego/i, name: 'Reacción fuego' },
      { pattern: /clase\s*energ[eé]tica/i, name: 'Clase energética' },
      { pattern: /rite/i, name: 'RITE' },
      { pattern: /rohs/i, name: 'RoHS' },
      { pattern: /reach/i, name: 'REACH' },
    ];

    // Process results to extract supplier information
    const results: SearchResult[] = [];

    if (searchData.data && Array.isArray(searchData.data)) {
      for (const item of searchData.data) {
        const content = (item.markdown || item.description || '').toLowerCase();
        const fullContent = item.markdown || item.description || '';
        const url = item.url || '';
        const title = item.title || '';

        // Extract contact information using regex patterns
        const phoneMatch = fullContent.match(/(?:\+34\s?)?(?:\d{3}[\s.-]?\d{3}[\s.-]?\d{3}|\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2})/g);
        const emailMatch = fullContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        const priceMatch = fullContent.match(/(?:\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*€/g);

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

        // Check for technical sheet
        const hasTechnicalSheet = technicalSheetPatterns.some(pattern => pattern.test(content));

        // Check for CE marking
        const hasCEMarking = ceMarkingPatterns.some(pattern => pattern.test(content));

        // Find certifications
        const certifications: string[] = [];
        for (const cert of certificationPatterns) {
          if (cert.pattern.test(content) && !certifications.includes(cert.name)) {
            certifications.push(cert.name);
          }
        }

        results.push({
          supplierName: supplierName || 'Proveedor desconocido',
          website: url,
          phone: phoneMatch ? phoneMatch[0] : '',
          email: emailMatch ? emailMatch[0] : '',
          price: priceMatch ? priceMatch[0] : '',
          description: item.description || title || '',
          hasTechnicalSheet,
          hasCEMarking,
          certifications: certifications.length > 0 ? certifications : undefined,
        });
      }
    }

    console.log(`Found ${results.length} results for user ${userId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: results,
        query: searchQuery 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': remaining.toString()
        } 
      }
    );

  } catch (error) {
    console.error('Error in search-resources:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(null), 'Content-Type': 'application/json' } }
    );
  }
});
