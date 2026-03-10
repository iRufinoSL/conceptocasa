import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SourceInfo {
  url: string;
  title?: string;
  type?: string;
  downloadConditions?: string;
}

interface UrbanRegulationsResult {
  // Clasificación y calificación del suelo
  urbanClassification?: { value: string | null; source: string };
  urbanQualification?: { value: string | null; source: string };
  soilCategory?: { value: string | null; source: string };
  
  // Usos urbanísticos
  principalUse?: { value: string | null; source: string };
  permittedUses?: { value: string[] | null; source: string };
  compatibleUses?: { value: string[] | null; source: string };
  prohibitedUses?: { value: string[] | null; source: string };
  
  // Tipología edificatoria
  buildingTypology?: { value: string | null; source: string };
  implantationConditions?: { value: string | null; source: string };
  
  // Parámetros de edificación
  maxBuildableVolume?: { value: number | null; source: string };
  maxHeight?: { value: number | null; source: string };
  maxFloors?: { value: number | null; source: string };
  buildabilityIndex?: { value: number | null; source: string };
  maxOccupation?: { value: number | null; source: string };
  maxBuiltSurface?: { value: number | null; source: string };
  minPlotArea?: { value: number | null; source: string };
  
  // Retranqueos y distancias
  frontSetback?: { value: number | null; source: string };
  sideSetback?: { value: number | null; source: string };
  rearSetback?: { value: number | null; source: string };
  minDistanceNeighbors?: { value: number | null; source: string };
  minDistanceRoads?: { value: number | null; source: string };
  municipalRoadSetback?: { value: number | null; source: string };
  highwaySetback?: { value: number | null; source: string };
  fenceSetback?: { value: number | null; source: string };
  accessWidth?: { value: number | null; source: string };
  
  // Afecciones sectoriales
  minDistanceCemetery?: { value: number | null; source: string };
  minDistancePowerLines?: { value: number | null; source: string };
  minDistanceWaterCourses?: { value: number | null; source: string };
  minDistanceRailway?: { value: number | null; source: string };
  minDistancePipeline?: { value: number | null; source: string };
  minDistanceCoast?: { value: number | null; source: string };
  minDistanceForest?: { value: number | null; source: string };
  minDistanceAirport?: { value: number | null; source: string };
  maxHeightAirport?: { value: number | null; source: string };
  
  // Servicios e infraestructuras
  hasMunicipalSewage?: { value: boolean | null; source: string };
  requiresSepticTank?: { value: boolean | null; source: string };
  septicTankMinDistance?: { value: number | null; source: string };
  
  // Divisibilidad y condiciones especiales
  isDivisible?: { value: boolean | null; source: string };
  
  // Edificabilidad
  isBuildable?: { value: boolean | null; source: string };
  
  // Información adicional
  additionalInfo?: string;
  sources: (string | SourceInfo)[];
  applicableRegulations?: string[];
  valuesFound?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { municipality, province, landClass, budgetId, autonomousCommunity, cadastralReference, surfaceArea } = await req.json();

    if (!municipality || !province) {
      return new Response(
        JSON.stringify({ success: false, error: 'Municipio y provincia son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Budget ownership verification (when budgetId provided) ---
    if (budgetId) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const sbUrl = Deno.env.get('SUPABASE_URL')!;
      const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(sbUrl, sbAnonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const adminClient = createClient(sbUrl, sbServiceKey);
      const { data: accessCheck } = await adminClient.rpc('has_presupuesto_access', { _user_id: claimsData.claims.sub, _presupuesto_id: budgetId });
      if (!accessCheck) {
        return new Response(JSON.stringify({ success: false, error: 'Sin acceso a este presupuesto' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    // --- End ownership verification ---

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'API de Perplexity no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching comprehensive urban regulations for ${municipality}, ${province} (${landClass})`);

    // Build comprehensive search query for full urban certificate data
    const landType = landClass === 'Rústico' ? 'suelo rústico' : (landClass === 'Urbano' ? 'suelo urbano' : 'suelo');
    const areaInfo = surfaceArea ? `La parcela tiene una superficie de ${surfaceArea} m².` : '';
    const refInfo = cadastralReference ? `Referencia catastral: ${cadastralReference}.` : '';
    
    const searchQuery = `
Busca TODA la normativa urbanística aplicable al municipio de ${municipality} en la provincia de ${province} para ${landType}.
${refInfo}
${areaInfo}

NECESITO DATOS COMPLETOS PARA GENERAR UN CERTIFICADO URBANÍSTICO:

1. CLASIFICACIÓN Y CALIFICACIÓN DEL SUELO:
   - Clasificación del suelo (Urbano Consolidado, Urbano No Consolidado, Urbanizable, No Urbanizable/Rústico, Núcleo Rural...)
   - Calificación urbanística (Residencial, Industrial, Equipamiento, zona específica...)
   - Categoría específica del suelo (Núcleo Rural Tradicional, Suelo Rústico de Especial Protección...)

2. USOS URBANÍSTICOS:
   - Uso principal/característico permitido (Residencial unifamiliar, Industrial, Comercial...)
   - Usos compatibles o complementarios
   - Usos prohibidos expresamente

3. TIPOLOGÍA EDIFICATORIA:
   - Tipo de edificación permitida (Aislada, Pareada, Adosada, En hilera, Bloque...)
   - Condiciones de implantación especiales

4. PARÁMETROS DE EDIFICACIÓN:
   - Volumen máximo edificable (m³)
   - Altura máxima (metros y/o número de plantas)
   - Índice de edificabilidad (m²t/m²s)
   - Ocupación máxima (%)
   - Superficie máxima construible (m²)
   - Parcela mínima edificable (m²)

5. RETRANQUEOS Y DISTANCIAS:
   - Retranqueo frontal a alineación/vial (m)
   - Retranqueo lateral a linderos (m)
   - Retranqueo posterior (m)
   - Distancia mínima a colindantes/edificaciones vecinas (m)
   - Distancia a caminos municipales (m)
   - Distancia a carreteras autonómicas/nacionales (m)
   - Distancia a autovías/autopistas (m)
   - Retranqueo de cierres de parcela (m)
   - Ancho mínimo de acceso rodado (m)

6. AFECCIONES SECTORIALES:
   - Distancia mínima a cementerios (m)
   - Distancia a líneas eléctricas de alta tensión (m)
   - Distancia a cauces públicos/dominio público hidráulico (m)
   - Distancia a ferrocarril (m)
   - Distancia a gasoductos/oleoductos (m)
   - Distancia a zona marítimo-terrestre/costas (m)
   - Distancia a montes/terreno forestal (m)
   - Servidumbres aeronáuticas (distancia aeropuertos, altura máxima)

7. SERVICIOS E INFRAESTRUCTURAS:
   - ¿Dispone de red de alcantarillado municipal?
   - ¿Requiere fosa séptica? ¿Distancia mínima?

8. DIVISIBILIDAD:
   - ¿Es divisible la parcela? Condiciones de segregación.

9. EDIFICABILIDAD:
   - ¿Es edificable según el planeamiento vigente?

IMPORTANTE:
- Incluye el artículo exacto del PGOU/Normas Subsidiarias para cada dato
- Busca tanto en el planeamiento municipal como en la normativa autonómica
- Incluye URLs de documentos oficiales descargables
- Si no encuentras un dato específico, indica "No encontrado" en source
    `.trim();

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: `Eres un experto urbanista español especializado en certificados urbanísticos. Tu trabajo es extraer TODOS los datos necesarios para emitir un certificado urbanístico completo.

Responde EXCLUSIVAMENTE en formato JSON con esta estructura:
{
  "urbanClassification": { "value": "Suelo Urbano Consolidado" o null, "source": "Art. X del PGOU" },
  "urbanQualification": { "value": "Residencial Unifamiliar RU-1" o null, "source": "Art. X" },
  "soilCategory": { "value": "Núcleo Rural Tradicional" o null, "source": "Art. X" },
  
  "principalUse": { "value": "Residencial unifamiliar" o null, "source": "Art. X" },
  "permittedUses": { "value": ["Residencial", "Garaje vinculado"] o null, "source": "Art. X" },
  "compatibleUses": { "value": ["Comercial en planta baja", "Profesional"] o null, "source": "Art. X" },
  "prohibitedUses": { "value": ["Industrial", "Ganadero intensivo"] o null, "source": "Art. X" },
  
  "buildingTypology": { "value": "Vivienda unifamiliar aislada" o null, "source": "Art. X" },
  "implantationConditions": { "value": "Descripción de condiciones especiales" o null, "source": "Art. X" },
  
  "maxBuildableVolume": { "value": número o null, "source": "Art. X" },
  "maxHeight": { "value": número en metros o null, "source": "Art. X" },
  "maxFloors": { "value": número o null, "source": "Art. X" },
  "buildabilityIndex": { "value": número (m²/m²) o null, "source": "Art. X" },
  "maxOccupation": { "value": número (%) o null, "source": "Art. X" },
  "maxBuiltSurface": { "value": número (m²) o null, "source": "Art. X" },
  "minPlotArea": { "value": número (m²) o null, "source": "Art. X" },
  
  "frontSetback": { "value": número (m) o null, "source": "Art. X" },
  "sideSetback": { "value": número (m) o null, "source": "Art. X" },
  "rearSetback": { "value": número (m) o null, "source": "Art. X" },
  "minDistanceNeighbors": { "value": número (m) o null, "source": "Art. X" },
  "minDistanceRoads": { "value": número (m) o null, "source": "Art. X" },
  "municipalRoadSetback": { "value": número (m) o null, "source": "Art. X" },
  "highwaySetback": { "value": número (m) o null, "source": "Art. X" },
  "fenceSetback": { "value": número (m) o null, "source": "Art. X" },
  "accessWidth": { "value": número (m) o null, "source": "Art. X" },
  
  "minDistanceCemetery": { "value": número (m) o null, "source": "Normativa sectorial" },
  "minDistancePowerLines": { "value": número (m) o null, "source": "Normativa sectorial" },
  "minDistanceWaterCourses": { "value": número (m) o null, "source": "Normativa sectorial" },
  "minDistanceRailway": { "value": número (m) o null, "source": "Normativa sectorial" },
  "minDistancePipeline": { "value": número (m) o null, "source": "Normativa sectorial" },
  "minDistanceCoast": { "value": número (m) o null, "source": "Ley de Costas" },
  "minDistanceForest": { "value": número (m) o null, "source": "Normativa forestal" },
  "minDistanceAirport": { "value": número (m) o null, "source": "AESA" },
  "maxHeightAirport": { "value": número (m) o null, "source": "AESA" },
  
  "hasMunicipalSewage": { "value": true/false o null, "source": "Información municipal" },
  "requiresSepticTank": { "value": true/false o null, "source": "Normativa" },
  "septicTankMinDistance": { "value": número (m) o null, "source": "Art. X" },
  
  "isDivisible": { "value": true/false o null, "source": "Art. X" },
  
  "isBuildable": { "value": true/false o null, "source": "Conclusión del análisis" },
  
  "additionalInfo": "Información relevante adicional, condiciones especiales, observaciones importantes",
  "sources": [
    { "url": "https://...", "title": "PGOU de ${municipality}", "type": "PGOU", "downloadConditions": "Libre descarga" }
  ],
  "applicableRegulations": ["PGOU Municipal", "Ley Autonómica de Urbanismo", "CTE", etc.]
}

REGLAS:
- Valores numéricos deben ser números, no texto
- Si no encuentras un dato, pon value: null y en source "No encontrado"
- En sources incluye URLs oficiales con título descriptivo
- Sé específico con los artículos y fuentes
- Para suelo rústico busca normativa de núcleo rural, suelo no urbanizable, etc.`
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

    console.log('Perplexity response:', content);
    console.log('Citations:', citations);

    // Try to parse the JSON response
    let regulations: UrbanRegulationsResult;
    try {
      // Extract JSON from the response (it might have markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        regulations = JSON.parse(jsonMatch[0]);
        // Add citations as sources if not already present
        if (citations.length > 0 && (!regulations.sources || regulations.sources.length === 0)) {
          regulations.sources = citations;
        }
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing Perplexity response:', parseError);
      // Return raw response if parsing fails
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            rawResponse: content,
            sources: citations,
            parseError: true
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count how many values were found
    let valuesFound = 0;
    const checkValue = (obj: { value: unknown; source: string } | undefined) => {
      if (obj?.value !== null && obj?.value !== undefined) {
        valuesFound++;
        return true;
      }
      return false;
    };

    // Count all extracted values
    checkValue(regulations.urbanClassification);
    checkValue(regulations.urbanQualification);
    checkValue(regulations.soilCategory);
    checkValue(regulations.principalUse);
    checkValue(regulations.permittedUses);
    checkValue(regulations.compatibleUses);
    checkValue(regulations.prohibitedUses);
    checkValue(regulations.buildingTypology);
    checkValue(regulations.maxBuildableVolume);
    checkValue(regulations.maxHeight);
    checkValue(regulations.maxFloors);
    checkValue(regulations.buildabilityIndex);
    checkValue(regulations.maxOccupation);
    checkValue(regulations.maxBuiltSurface);
    checkValue(regulations.minPlotArea);
    checkValue(regulations.frontSetback);
    checkValue(regulations.sideSetback);
    checkValue(regulations.rearSetback);
    checkValue(regulations.minDistanceNeighbors);
    checkValue(regulations.minDistanceRoads);
    checkValue(regulations.municipalRoadSetback);
    checkValue(regulations.highwaySetback);
    checkValue(regulations.fenceSetback);
    checkValue(regulations.accessWidth);
    checkValue(regulations.minDistanceCemetery);
    checkValue(regulations.minDistancePowerLines);
    checkValue(regulations.minDistanceWaterCourses);
    checkValue(regulations.minDistanceRailway);
    checkValue(regulations.minDistancePipeline);
    checkValue(regulations.minDistanceCoast);
    checkValue(regulations.minDistanceForest);
    checkValue(regulations.minDistanceAirport);
    checkValue(regulations.hasMunicipalSewage);
    checkValue(regulations.requiresSepticTank);
    checkValue(regulations.isDivisible);
    checkValue(regulations.isBuildable);

    console.log(`Values found: ${valuesFound}/35`);

    // If budgetId is provided, update the urban profile
    if (budgetId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const updateData: Record<string, unknown> = {};
      
      // Classification and qualification
      if (regulations.urbanClassification?.value) {
        updateData.urban_classification = regulations.urbanClassification.value;
      }
      if (regulations.urbanQualification?.value) {
        updateData.urban_qualification = regulations.urbanQualification.value;
      }
      if (regulations.soilCategory?.value) {
        updateData.soil_category = regulations.soilCategory.value;
        updateData.soil_category_source = regulations.soilCategory.source;
      }
      
      // Uses
      if (regulations.principalUse?.value) {
        updateData.principal_use = regulations.principalUse.value;
        updateData.principal_use_source = regulations.principalUse.source;
      }
      if (regulations.permittedUses?.value) {
        updateData.permitted_uses = regulations.permittedUses.value;
      }
      if (regulations.compatibleUses?.value) {
        updateData.compatible_uses = regulations.compatibleUses.value;
      }
      if (regulations.prohibitedUses?.value) {
        updateData.prohibited_uses = regulations.prohibitedUses.value;
      }
      
      // Building typology
      if (regulations.buildingTypology?.value) {
        updateData.building_typology = regulations.buildingTypology.value;
        updateData.building_typology_source = regulations.buildingTypology.source;
      }
      if (regulations.implantationConditions?.value) {
        updateData.implantation_conditions = regulations.implantationConditions.value;
        updateData.implantation_conditions_source = regulations.implantationConditions.source;
      }
      
      // Building parameters
      if (regulations.maxBuildableVolume?.value !== null && regulations.maxBuildableVolume?.value !== undefined) {
        updateData.max_buildable_volume = regulations.maxBuildableVolume.value;
        updateData.max_buildable_volume_source = regulations.maxBuildableVolume.source;
      }
      if (regulations.maxHeight?.value !== null && regulations.maxHeight?.value !== undefined) {
        updateData.max_height = regulations.maxHeight.value;
        updateData.max_height_source = regulations.maxHeight.source;
      }
      if (regulations.maxFloors?.value !== null && regulations.maxFloors?.value !== undefined) {
        updateData.max_floors = regulations.maxFloors.value;
        updateData.max_floors_source = regulations.maxFloors.source;
      }
      if (regulations.buildabilityIndex?.value !== null && regulations.buildabilityIndex?.value !== undefined) {
        updateData.buildability_index = regulations.buildabilityIndex.value;
        updateData.buildability_index_source = regulations.buildabilityIndex.source;
      }
      if (regulations.maxOccupation?.value !== null && regulations.maxOccupation?.value !== undefined) {
        updateData.max_occupation_percent = regulations.maxOccupation.value;
        updateData.max_occupation_source = regulations.maxOccupation.source;
      }
      if (regulations.maxBuiltSurface?.value !== null && regulations.maxBuiltSurface?.value !== undefined) {
        updateData.max_built_surface = regulations.maxBuiltSurface.value;
        updateData.max_built_surface_source = regulations.maxBuiltSurface.source;
      }
      if (regulations.minPlotArea?.value !== null && regulations.minPlotArea?.value !== undefined) {
        updateData.min_plot_area = regulations.minPlotArea.value;
      }
      
      // Setbacks and distances
      if (regulations.frontSetback?.value !== null && regulations.frontSetback?.value !== undefined) {
        updateData.front_setback = regulations.frontSetback.value;
        updateData.front_setback_source = regulations.frontSetback.source;
      }
      if (regulations.sideSetback?.value !== null && regulations.sideSetback?.value !== undefined) {
        updateData.side_setback = regulations.sideSetback.value;
        updateData.side_setback_source = regulations.sideSetback.source;
      }
      if (regulations.rearSetback?.value !== null && regulations.rearSetback?.value !== undefined) {
        updateData.rear_setback = regulations.rearSetback.value;
        updateData.rear_setback_source = regulations.rearSetback.source;
      }
      if (regulations.minDistanceNeighbors?.value !== null && regulations.minDistanceNeighbors?.value !== undefined) {
        updateData.min_distance_neighbors = regulations.minDistanceNeighbors.value;
        updateData.min_distance_neighbors_source = regulations.minDistanceNeighbors.source;
      }
      if (regulations.minDistanceRoads?.value !== null && regulations.minDistanceRoads?.value !== undefined) {
        updateData.min_distance_roads = regulations.minDistanceRoads.value;
        updateData.min_distance_roads_source = regulations.minDistanceRoads.source;
      }
      if (regulations.municipalRoadSetback?.value !== null && regulations.municipalRoadSetback?.value !== undefined) {
        updateData.municipal_road_setback = regulations.municipalRoadSetback.value;
        updateData.municipal_road_setback_source = regulations.municipalRoadSetback.source;
      }
      if (regulations.highwaySetback?.value !== null && regulations.highwaySetback?.value !== undefined) {
        updateData.highway_setback = regulations.highwaySetback.value;
        updateData.highway_setback_source = regulations.highwaySetback.source;
      }
      if (regulations.fenceSetback?.value !== null && regulations.fenceSetback?.value !== undefined) {
        updateData.fence_setback = regulations.fenceSetback.value;
        updateData.fence_setback_source = regulations.fenceSetback.source;
      }
      if (regulations.accessWidth?.value !== null && regulations.accessWidth?.value !== undefined) {
        updateData.access_width = regulations.accessWidth.value;
        updateData.access_width_source = regulations.accessWidth.source;
      }
      
      // Sectoral restrictions
      if (regulations.minDistanceCemetery?.value !== null && regulations.minDistanceCemetery?.value !== undefined) {
        updateData.min_distance_cemetery = regulations.minDistanceCemetery.value;
        updateData.min_distance_cemetery_source = regulations.minDistanceCemetery.source;
        updateData.affected_by_cemetery = true;
      }
      if (regulations.minDistancePowerLines?.value !== null && regulations.minDistancePowerLines?.value !== undefined) {
        updateData.min_distance_power_lines = regulations.minDistancePowerLines.value;
        updateData.min_distance_power_lines_source = regulations.minDistancePowerLines.source;
        updateData.affected_by_power_lines = true;
      }
      if (regulations.minDistanceWaterCourses?.value !== null && regulations.minDistanceWaterCourses?.value !== undefined) {
        updateData.min_distance_water_courses = regulations.minDistanceWaterCourses.value;
        updateData.min_distance_water_courses_source = regulations.minDistanceWaterCourses.source;
        updateData.affected_by_water_courses = true;
      }
      if (regulations.minDistanceRailway?.value !== null && regulations.minDistanceRailway?.value !== undefined) {
        updateData.min_distance_railway = regulations.minDistanceRailway.value;
        updateData.min_distance_railway_source = regulations.minDistanceRailway.source;
      }
      if (regulations.minDistancePipeline?.value !== null && regulations.minDistancePipeline?.value !== undefined) {
        updateData.min_distance_pipeline = regulations.minDistancePipeline.value;
        updateData.min_distance_pipeline_source = regulations.minDistancePipeline.source;
      }
      if (regulations.minDistanceCoast?.value !== null && regulations.minDistanceCoast?.value !== undefined) {
        updateData.min_distance_coast = regulations.minDistanceCoast.value;
        updateData.min_distance_coast_source = regulations.minDistanceCoast.source;
        updateData.affected_by_coast = true;
      }
      if (regulations.minDistanceForest?.value !== null && regulations.minDistanceForest?.value !== undefined) {
        updateData.min_distance_forest = regulations.minDistanceForest.value;
        updateData.min_distance_forest_source = regulations.minDistanceForest.source;
        updateData.affected_by_forest = true;
      }
      if (regulations.minDistanceAirport?.value !== null && regulations.minDistanceAirport?.value !== undefined) {
        updateData.min_distance_airport = regulations.minDistanceAirport.value;
        updateData.min_distance_airport_source = regulations.minDistanceAirport.source;
        updateData.affected_by_airport = true;
      }
      if (regulations.maxHeightAirport?.value !== null && regulations.maxHeightAirport?.value !== undefined) {
        updateData.max_height_airport = regulations.maxHeightAirport.value;
        updateData.max_height_airport_source = regulations.maxHeightAirport.source;
      }
      
      // Services
      if (regulations.hasMunicipalSewage?.value !== null && regulations.hasMunicipalSewage?.value !== undefined) {
        updateData.has_municipal_sewage = regulations.hasMunicipalSewage.value;
        updateData.has_municipal_sewage_source = regulations.hasMunicipalSewage.source;
      }
      if (regulations.requiresSepticTank?.value !== null && regulations.requiresSepticTank?.value !== undefined) {
        updateData.requires_septic_tank = regulations.requiresSepticTank.value;
      }
      if (regulations.septicTankMinDistance?.value !== null && regulations.septicTankMinDistance?.value !== undefined) {
        updateData.septic_tank_min_distance = regulations.septicTankMinDistance.value;
        updateData.septic_tank_min_distance_source = regulations.septicTankMinDistance.source;
      }
      
      // Divisibility
      if (regulations.isDivisible?.value !== null && regulations.isDivisible?.value !== undefined) {
        updateData.is_divisible = regulations.isDivisible.value;
        updateData.is_divisible_source = regulations.isDivisible.source;
      }
      
      // Buildability
      if (regulations.isBuildable?.value !== null && regulations.isBuildable?.value !== undefined) {
        updateData.is_buildable = regulations.isBuildable.value;
        updateData.is_buildable_source = regulations.isBuildable.source;
      }

      // Store consulted sources
      if (regulations.sources && regulations.sources.length > 0) {
        const formattedSources = regulations.sources.map((s: string | SourceInfo) => {
          if (typeof s === 'string') {
            return { name: s, type: 'Web', url: s };
          }
          return {
            name: s.title || 'Documento',
            type: s.type || 'Web',
            url: s.url,
            downloadConditions: s.downloadConditions
          };
        });
        updateData.consulted_sources = formattedSources;
      }

      // Always update analysis notes with additional info and applicable regulations
      const notes: string[] = [];
      if (regulations.additionalInfo) {
        notes.push(regulations.additionalInfo);
      }
      if (regulations.applicableRegulations && regulations.applicableRegulations.length > 0) {
        notes.push('\n\n**Normativa aplicable:**\n' + regulations.applicableRegulations.map((r: string) => `• ${r}`).join('\n'));
      }
      if (regulations.sources && regulations.sources.length > 0) {
        notes.push('\n\n**Fuentes consultadas:**');
        regulations.sources.forEach((s: string | SourceInfo) => {
          if (typeof s === 'string') {
            notes.push(`\n- ${s}`);
          } else {
            const sourceInfo = s as SourceInfo;
            const title = sourceInfo.title || 'Documento';
            const type = sourceInfo.type ? ` (${sourceInfo.type})` : '';
            const conditions = sourceInfo.downloadConditions ? ` - ${sourceInfo.downloadConditions}` : '';
            notes.push(`\n- [${title}${type}](${sourceInfo.url})${conditions}`);
          }
        });
      }
      if (notes.length > 0) {
        updateData.analysis_notes = notes.join('');
      }

      // Always update status and timestamp
      updateData.analysis_status = valuesFound >= 10 ? 'regulations_loaded' : 'catastro_loaded';
      updateData.last_analyzed_at = new Date().toISOString();
      
      const { error: updateError } = await supabase
        .from('urban_profiles')
        .update(updateData)
        .eq('budget_id', budgetId);

      if (updateError) {
        console.error('Error updating urban profile:', updateError);
      } else {
        console.log(`Urban profile updated with ${Object.keys(updateData).length} fields. Values found: ${valuesFound}`);
      }
    }

    // Add valuesFound to response for better UX
    regulations.valuesFound = valuesFound;

    return new Response(
      JSON.stringify({
        success: true,
        data: regulations,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-urban-regulations:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error al buscar normativa urbanística',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
