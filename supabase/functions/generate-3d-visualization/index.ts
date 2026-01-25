import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fetch satellite image from PNOA WMS service (server-side, no CORS issues)
// If placementOffset is provided, center the image on that location instead of parcel center
async function fetchPNOASatelliteImage(
  parcelLat: number, 
  parcelLng: number,
  targetLat?: number,
  targetLng?: number
): Promise<string | null> {
  try {
    // Use target coordinates if provided (user clicked position), otherwise use parcel center
    const centerLat = targetLat ?? parcelLat;
    const centerLng = targetLng ?? parcelLng;
    
    console.log(`Fetching PNOA satellite image centered at: ${centerLat}, ${centerLng}`);
    
    // Calculate bounding box for the area (approximately 200m x 200m)
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(centerLat * Math.PI / 180);
    const halfSizeMeters = 120; // 120m in each direction = 240m x 240m area
    
    const minLat = centerLat - (halfSizeMeters / metersPerDegLat);
    const maxLat = centerLat + (halfSizeMeters / metersPerDegLat);
    const minLng = centerLng - (halfSizeMeters / metersPerDegLng);
    const maxLng = centerLng + (halfSizeMeters / metersPerDegLng);

    // Use PNOA WMS GetMap - BBOX format for CRS:EPSG:4326 is minLat,minLng,maxLat,maxLng
    const width = 1024;
    const height = 1024;
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
    
    // PNOA orthophoto WMS service with correct parameters
    const wmsUrl = `https://www.ign.es/wms-inspire/pnoa-ma?` +
      `SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
      `&LAYERS=OI.OrthoimageCoverage` +
      `&STYLES=` +
      `&CRS=EPSG:4326` +
      `&BBOX=${bbox}` +
      `&WIDTH=${width}&HEIGHT=${height}` +
      `&FORMAT=image/jpeg`;

    console.log("PNOA WMS URL:", wmsUrl);

    const response = await fetch(wmsUrl);
    
    if (!response.ok) {
      console.error(`PNOA WMS request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get("content-type");
    console.log("PNOA response content-type:", contentType);
    
    // Check if we got an image
    if (!contentType?.includes("image")) {
      const text = await response.text();
      console.error("PNOA returned non-image response:", text.substring(0, 500));
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    console.log(`PNOA image fetched successfully, size: ${bytes.byteLength} bytes`);
    
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error("Error fetching PNOA satellite image:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      imageBase64, 
      prompt, 
      budgetId, 
      parcelAreaM2, 
      buildingFootprintM2,
      parcelLat,
      parcelLng,
      // New placement parameters
      placementOffset,
      rotationDegrees,
      scaleAdjustmentPercent
    } = await req.json();

    if (!imageBase64 || !budgetId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: imageBase64 and budgetId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("=== Generating 3D visualization ===");
    console.log("Budget ID:", budgetId);
    console.log("Parcel coordinates:", parcelLat, parcelLng);
    console.log("Parcel area:", parcelAreaM2, "m²");
    console.log("Building footprint:", buildingFootprintM2, "m²");
    console.log("Placement offset:", placementOffset);
    console.log("Rotation:", rotationDegrees, "degrees");
    console.log("Scale adjustment:", scaleAdjustmentPercent, "%");
    console.log("Prompt:", prompt);

    // Fetch PNOA satellite image server-side, centered on placement target if provided
    let terrainImageBase64: string | null = null;
    if (parcelLat && parcelLng) {
      terrainImageBase64 = await fetchPNOASatelliteImage(
        parcelLat, 
        parcelLng,
        placementOffset?.targetLat,
        placementOffset?.targetLng
      );
      console.log("Terrain image fetched:", !!terrainImageBase64);
    }

    // Build scale instruction
    let scaleInstruction = "";
    if (parcelAreaM2 && buildingFootprintM2) {
      const ratio = (buildingFootprintM2 / parcelAreaM2) * 100;
      scaleInstruction = `
ESCALA PROPORCIONAL CRÍTICA:
- La parcela visible mide aproximadamente ${parcelAreaM2} m² en total.
- La vivienda debe ocupar ${buildingFootprintM2.toFixed(0)} m² de huella.
- Esto significa que la vivienda debe ocupar aproximadamente el ${ratio.toFixed(1)}% del área visible.
- Es ABSOLUTAMENTE CRÍTICO respetar esta proporción exacta.`;
    }

    // Build placement instruction
    let placementInstruction = "";
    if (placementOffset) {
      placementInstruction = `
POSICIÓN EXACTA DE COLOCACIÓN:
- El usuario ha seleccionado manualmente la posición donde colocar la vivienda.
- La vivienda debe colocarse EN EL CENTRO de la imagen satelital (porque la imagen está centrada en ese punto).
- NO coloques la vivienda sobre edificaciones existentes visibles en la imagen.`;
    } else {
      placementInstruction = `
POSICIÓN DE COLOCACIÓN:
- Coloca la vivienda en un área libre visible en la imagen satelital.
- EVITA colocar la vivienda sobre edificaciones existentes que se vean en la foto.
- Busca el espacio vacío más apropiado dentro de la parcela.`;
    }

    // Build rotation instruction
    let rotationInstruction = "";
    if (rotationDegrees && rotationDegrees !== 0) {
      rotationInstruction = `
ROTACIÓN:
- La vivienda debe estar rotada ${rotationDegrees} grados respecto a su orientación original.
- Mantén esta rotación para alinear con caminos o la geometría de la parcela.`;
    }

    // Build the message content based on whether we have a terrain image
    let messageContent: Array<{type: string; text?: string; image_url?: {url: string}}>;
    let finalPrompt: string;

    if (terrainImageBase64) {
      // We have both building and terrain images
      finalPrompt = `${prompt}
${scaleInstruction}
${placementInstruction}
${rotationInstruction}

═══════════════════════════════════════════════════════════════
INSTRUCCIONES CRÍTICAS - LEE CON MÁXIMA ATENCIÓN:
═══════════════════════════════════════════════════════════════

Tienes DOS imágenes:

1️⃣ IMAGEN SATELITAL (primera imagen): 
   - Es una FOTOGRAFÍA REAL cenital del terreno tomada del servicio PNOA del IGN de España.
   - Muestra la ubicación REAL con edificaciones EXISTENTES, caminos, vegetación, etc.
   - DEBES CONSERVAR TODO lo que aparece en esta imagen: casas vecinas, caminos, árboles, etc.
   - Esta imagen ES EL FONDO y NO debe modificarse salvo para añadir la nueva vivienda.

2️⃣ IMAGEN DEL EDIFICIO (segunda imagen):
   - Es un render/perspectiva/planta de la vivienda que el cliente quiere construir.
   - ⚠️ DEBES RESPETAR ESTE DISEÑO EXACTAMENTE ⚠️
   - NO reinterpretes, NO cambies colores, NO cambies forma, NO inventes otra vivienda.
   - Usa ESTA vivienda exacta y colócala en el terreno.

TU TAREA ESPECÍFICA:
1. Usa la imagen satelital como FONDO (conservando TODO lo que hay en ella)
2. Toma la vivienda de la segunda imagen SIN MODIFICARLA
3. Coloca esa vivienda EXACTA sobre el terreno respetando la ESCALA indicada
4. Añade sombras realistas coherentes con la iluminación de la foto satelital
5. El resultado debe parecer una foto aérea de dron mostrando la casa YA CONSTRUIDA

❌ ESTÁ PROHIBIDO:
- Inventar una casa diferente a la de la imagen subida
- Modificar el diseño, forma, colores o estilo de la vivienda
- Eliminar edificios/casas vecinas que aparecen en la foto satelital
- Colocar la vivienda encima de edificaciones ya existentes
- Cambiar el tamaño de la vivienda (respetar la escala indicada)
- Crear un terreno inventado diferente a la foto real

✅ RESULTADO ESPERADO:
- Foto aérea realista donde se ve la vivienda del render colocada en el terreno real
- Casas vecinas y entorno VISIBLES tal como están en la foto satelital
- Proporción correcta entre vivienda y parcela`;

      messageContent = [
        { type: "text", text: finalPrompt },
        { type: "image_url", image_url: { url: terrainImageBase64 } },
        { type: "image_url", image_url: { url: imageBase64 } }
      ];
    } else {
      // Only building image - generate with generic environment
      finalPrompt = `${prompt}
${scaleInstruction}

INSTRUCCIONES:
- Genera una vista aérea/isométrica 3D del edificio de la imagen.
- ⚠️ RESPETA el diseño EXACTO del edificio - NO lo reinterpretes ⚠️
- NO cambies colores, formas ni estructura.
- Añade un entorno genérico apropiado (jardín, vegetación, accesos).
- Estilo de render arquitectónico profesional fotorrealista.

❌ PROHIBIDO: modificar el diseño original del edificio.
✅ PERMITIDO: añadir entorno, sombras y vegetación alrededor.`;

      messageContent = [
        { type: "text", text: finalPrompt },
        { type: "image_url", image_url: { url: imageBase64 } }
      ];
    }

    // Call AI gateway to edit/transform the image
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: messageContent
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Límite de peticiones excedido. Inténtalo de nuevo más tarde." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA agotados. Añade fondos a tu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    // Extract the generated image
    const generatedImageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!generatedImageUrl) {
      console.error("No image in AI response:", JSON.stringify(aiData));
      throw new Error("No se pudo generar la imagen. Intenta con una imagen diferente.");
    }

    // Convert base64 to blob for storage
    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upload to storage
    const fileName = `${budgetId}/3d-visualization-${Date.now()}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from("budget-predesigns")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error("Error al guardar la imagen generada");
    }

    console.log("Image uploaded to storage:", fileName);

    // Create predesign record with placement info
    let description = terrainImageBase64 
      ? "Vista aérea 3D sobre terreno real (PNOA)" 
      : "Vista aérea 3D generada con IA";
    
    if (parcelAreaM2 && buildingFootprintM2) {
      description += ` — Escala: ${buildingFootprintM2.toFixed(0)}m² sobre parcela de ${parcelAreaM2}m²`;
    }
    if (rotationDegrees && rotationDegrees !== 0) {
      description += ` — Rotación: ${rotationDegrees}°`;
    }
    if (placementOffset) {
      description += ` — Posición manual`;
    }

    const { error: insertError } = await supabase
      .from("budget_predesigns")
      .insert({
        budget_id: budgetId,
        content: `Visualización 3D - ${new Date().toLocaleDateString('es-ES')}`,
        description,
        content_type: "Visualización 3D",
        file_path: fileName,
        file_name: `3d-visualization-${Date.now()}.png`,
        file_type: "image/png",
        file_size: imageBytes.length
      });

    if (insertError) {
      console.error("Database insert error:", insertError);
      // Try to clean up the uploaded file
      await supabase.storage.from("budget-predesigns").remove([fileName]);
      throw new Error("Error al guardar el registro de la visualización");
    }

    console.log("Predesign record created successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        filePath: fileName,
        usedTerrainImage: !!terrainImageBase64 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-3d-visualization:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
