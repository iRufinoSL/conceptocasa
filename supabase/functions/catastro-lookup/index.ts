import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CatastroData {
  cadastralReference: string;
  province: string;
  municipality: string;
  locality?: string;
  address?: string;
  surfaceArea?: number;
  landUse?: string;
  landClass?: string;
  landClassDescription?: string;
  landClassSource?: string;
  canBuild?: boolean;
  constructionYear?: number;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// Land class types from Catastro and their buildability
const LAND_CLASS_INFO: Record<string, { description: string; canBuild: boolean }> = {
  'UR': { description: 'Suelo Urbano - Terreno apto para edificación según PGOU municipal', canBuild: true },
  'RU': { description: 'Suelo Rústico - Terreno no urbanizable, uso agrícola/ganadero', canBuild: false },
  'RS': { description: 'Suelo Rústico con edificación', canBuild: false },
  'SU': { description: 'Suelo Urbanizable - Terreno programado para desarrollo urbano', canBuild: true },
  'SP': { description: 'Suelo Urbanizable Programado', canBuild: true },
  'SG': { description: 'Suelo Urbanizable Sectorizado', canBuild: true },
  'SN': { description: 'Suelo Urbanizable No Sectorizado', canBuild: false },
  'NU': { description: 'Suelo No Urbanizable de especial protección', canBuild: false },
};

// Parse XML response from Catastro
function parseXMLValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function parseXMLAttribute(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// Get province and municipality codes from cadastral reference
function parseCadastralReference(ref: string): { provinceCode: string; municipalityCode: string } | null {
  // Format: XXXXXAANNNNNNNNNNNN (20 chars)
  // First 5 digits can encode province/municipality in some cases
  // But we need to query the catastro to get the actual location
  if (!ref || ref.length < 14) return null;
  
  // For rustic parcels: first 2 digits = province, next 3 = municipality
  const provinceCode = ref.substring(0, 2);
  const municipalityCode = ref.substring(2, 5);
  
  return { provinceCode, municipalityCode };
}

async function lookupCadastralReference(ref: string): Promise<CatastroData | null> {
  // Clean the input: remove common prefixes like "Referencia catastral", extra spaces, etc.
  let cleanRef = ref.toUpperCase().trim();
  
  // Remove common Spanish prefixes that users might copy-paste
  const prefixesToRemove = [
    'REFERENCIA CATASTRAL:',
    'REFERENCIA CATASTRAL',
    'REF. CATASTRAL:',
    'REF. CATASTRAL',
    'REF CATASTRAL:',
    'REF CATASTRAL',
    'RC:',
    'RC',
  ];
  
  for (const prefix of prefixesToRemove) {
    if (cleanRef.startsWith(prefix)) {
      cleanRef = cleanRef.substring(prefix.length).trim();
      break;
    }
  }
  
  // Remove all spaces and ensure uppercase
  cleanRef = cleanRef.replace(/\s/g, '');
  
  // Validate cadastral reference format (should be 14-20 alphanumeric characters)
  if (cleanRef.length < 14 || cleanRef.length > 20) {
    console.log(`Invalid cadastral reference length: ${cleanRef.length} (expected 14-20)`);
    // Still try to query, catastro will return proper error
  }
  
  console.log('Cleaned cadastral reference:', cleanRef);
  
  // Use the Catastro OVC (Oficina Virtual del Catastro) web service
  // Documentation: https://ovc.catastro.meh.es/ovcservweb/ovcswlocalizacionrc/ovccoordenadas.asmx
  
  try {
    // First, try to get coordinates from cadastral reference
    const coordUrl = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=${cleanRef}`;
    
    console.log('Querying Catastro coordinates:', coordUrl);
    const coordResponse = await fetch(coordUrl);
    const coordXml = await coordResponse.text();
    
    console.log('Catastro coordinates response:', coordXml.substring(0, 500));
    
    // Check for errors
    if (coordXml.includes('<err>') || coordXml.includes('<des>')) {
      const errorDesc = parseXMLValue(coordXml, 'des');
      console.log('Catastro error:', errorDesc);
      // Continue anyway, we might get data from other endpoint
    }
    
    // Extract coordinates
    const lat = parseXMLValue(coordXml, 'lat') || parseXMLValue(coordXml, 'ycen');
    const lng = parseXMLValue(coordXml, 'lon') || parseXMLValue(coordXml, 'xcen');
    
    // Extract location data
    const province = parseXMLValue(coordXml, 'np') || parseXMLValue(coordXml, 'cpro');
    const municipality = parseXMLValue(coordXml, 'nm') || parseXMLValue(coordXml, 'cmun');
    const address = parseXMLValue(coordXml, 'ldt') || parseXMLValue(coordXml, 'dir');
    
    // Now get detailed data using DNPRC service
    const detailUrl = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${cleanRef}`;
    
    console.log('Querying Catastro details:', detailUrl);
    const detailResponse = await fetch(detailUrl);
    const detailXml = await detailResponse.text();
    
    console.log('Catastro details response:', detailXml.substring(0, 500));
    
    // Extract more detailed information
    const provinceDetail = parseXMLValue(detailXml, 'np') || province;
    const municipalityDetail = parseXMLValue(detailXml, 'nm') || municipality;
    const locality = parseXMLValue(detailXml, 'nv') || parseXMLValue(detailXml, 'loine');
    const addressDetail = parseXMLValue(detailXml, 'ldt') || address;
    const landUse = parseXMLValue(detailXml, 'luso') || parseXMLValue(detailXml, 'uso');
    const surfaceStr = parseXMLValue(detailXml, 'sfc');
    const surfaceArea = surfaceStr ? parseFloat(surfaceStr) : undefined;
    
    // Extract land class (cn = clase de naturaleza) from Catastro
    // Values: UR (urbano), RU (rústico), SU (urbanizable), etc.
    let landClassCode = parseXMLValue(detailXml, 'cn') || parseXMLValue(coordXml, 'cn');
    
    // Fallback: determine from reference format if not in XML
    // Rustic references start with numbers, Urban start with letters
    if (!landClassCode) {
      landClassCode = /^\d/.test(cleanRef) ? 'RU' : 'UR';
    }
    
    // Get land class info
    const landClassInfo = LAND_CLASS_INFO[landClassCode] || {
      description: landClassCode === 'RU' || /^\d/.test(cleanRef) 
        ? 'Suelo Rústico - Consultar PGOU para usos permitidos'
        : 'Suelo Urbano - Consultar PGOU para parámetros edificatorios',
      canBuild: !/^\d/.test(cleanRef)
    };
    
    // Determine readable land class name
    let landClass: string;
    switch (landClassCode) {
      case 'UR': landClass = 'Urbano'; break;
      case 'RU': case 'RS': landClass = 'Rústico'; break;
      case 'SU': case 'SP': case 'SG': landClass = 'Urbanizable'; break;
      case 'SN': case 'NU': landClass = 'No Urbanizable'; break;
      default: landClass = /^\d/.test(cleanRef) ? 'Rústico' : 'Urbano';
    }
    
    // Get construction year if available
    const yearStr = parseXMLValue(detailXml, 'ant');
    const constructionYear = yearStr ? parseInt(yearStr) : undefined;
    
    const result: CatastroData = {
      cadastralReference: cleanRef,
      province: provinceDetail || 'No disponible',
      municipality: municipalityDetail || 'No disponible',
      locality: locality || undefined,
      address: addressDetail || undefined,
      surfaceArea,
      landUse: landUse || undefined,
      landClass,
      landClassDescription: landClassInfo.description,
      landClassSource: 'Catastro - Sede Electrónica del Catastro (SEC)',
      canBuild: landClassInfo.canBuild,
      constructionYear,
    };
    
    if (lat && lng) {
      result.coordinates = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      };
    }
    
    return result;
  } catch (error) {
    console.error('Error querying Catastro:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cadastralReference, budgetId, saveToProfile } = await req.json();

    if (!cadastralReference) {
      return new Response(
        JSON.stringify({ success: false, error: 'Referencia catastral requerida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Looking up cadastral reference:', cadastralReference);

    // Query Catastro
    const catastroData = await lookupCadastralReference(cadastralReference);

    if (!catastroData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron datos para esta referencia catastral' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If saveToProfile is true and budgetId is provided, save to urban_profiles
    if (saveToProfile && budgetId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Check if profile already exists for this budget
      const { data: existingProfile } = await supabase
        .from('urban_profiles')
        .select('id')
        .eq('budget_id', budgetId)
        .eq('cadastral_reference', catastroData.cadastralReference)
        .single();

      const profileData = {
        budget_id: budgetId,
        cadastral_reference: catastroData.cadastralReference,
        municipality: catastroData.municipality,
        province: catastroData.province,
        locality: catastroData.locality,
        address: catastroData.address,
        surface_area: catastroData.surfaceArea,
        land_use: catastroData.landUse,
        land_class: catastroData.landClass,
        construction_year: catastroData.constructionYear,
        analysis_status: 'catastro_loaded',
        last_analyzed_at: new Date().toISOString(),
      };

      if (existingProfile) {
        // Update existing profile
        const { error: updateError } = await supabase
          .from('urban_profiles')
          .update(profileData)
          .eq('id', existingProfile.id);

        if (updateError) {
          console.error('Error updating urban profile:', updateError);
        }
      } else {
        // Create new profile
        const { error: insertError } = await supabase
          .from('urban_profiles')
          .insert(profileData);

        if (insertError) {
          console.error('Error creating urban profile:', insertError);
        }
      }

      // Update presupuesto coordinates if available
      if (catastroData.coordinates) {
        await supabase
          .from('presupuestos')
          .update({
            coordenadas_lat: catastroData.coordinates.lat,
            coordenadas_lng: catastroData.coordinates.lng,
          })
          .eq('id', budgetId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: catastroData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in catastro-lookup:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al consultar el Catastro',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
