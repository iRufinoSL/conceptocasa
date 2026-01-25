import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, terrainImageBase64, prompt, budgetId, parcelAreaM2, buildingFootprintM2 } = await req.json();

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

    console.log("Generating 3D visualization for budget:", budgetId);
    console.log("Has terrain image:", !!terrainImageBase64);
    console.log("Parcel area:", parcelAreaM2, "m²");
    console.log("Building footprint:", buildingFootprintM2, "m²");
    console.log("Prompt:", prompt);

    // Calculate scale ratio if both areas are provided
    let scaleInstruction = "";
    if (parcelAreaM2 && buildingFootprintM2) {
      const ratio = (buildingFootprintM2 / parcelAreaM2) * 100;
      scaleInstruction = `
ESCALA PROPORCIONAL CRÍTICA:
- La parcela mide ${parcelAreaM2} m² en total.
- La vivienda ocupa ${buildingFootprintM2} m² de huella.
- Por tanto, la vivienda debe ocupar aproximadamente el ${ratio.toFixed(1)}% del área visible de la parcela.
- Es CRÍTICO respetar esta proporción para que el resultado sea realista.`;
    }

    // Build the message content based on whether we have a terrain image
    let messageContent: Array<{type: string; text?: string; image_url?: {url: string}}>;
    let finalPrompt: string;

    if (terrainImageBase64) {
      // We have both building and terrain images - instruct AI to composite them
      finalPrompt = `${prompt}
${scaleInstruction}

INSTRUCCIONES CRÍTICAS - LEE CON ATENCIÓN:

1. IMAGEN SATELITAL (primera imagen): Es una FOTOGRAFÍA REAL cenital del terreno/parcela tomada del servicio PNOA del IGN de España. Esta imagen muestra la ubicación REAL donde se construirá el edificio.

2. IMAGEN DEL EDIFICIO (segunda imagen): Es el plano de planta, render o perspectiva de la vivienda que el cliente quiere construir. DEBES RESPETAR ESTA IMAGEN EXACTAMENTE - no la reinterpretes ni cambies su diseño.

3. TU TAREA: Crear una vista aérea 3D fotorrealista donde:
   - El terreno de fondo sea la imagen satelital real (primera imagen)
   - El edificio aparezca ubicado SOBRE ese terreno respetando la ESCALA proporcional indicada
   - El edificio debe mantener su diseño original tal como aparece en la segunda imagen
   - Añade sombras y vegetación para integrar el edificio naturalmente en el terreno
   - El resultado debe parecer una foto aérea de un dron mostrando la casa ya construida

4. NO HAGAS: No modifiques el diseño del edificio, no inventes elementos que no estén en la imagen original, no cambies la forma ni estructura de la vivienda.`;

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
- RESPETA el diseño exacto del edificio - no lo reinterpretes.
- Añade un entorno genérico apropiado (jardín, vegetación, accesos).
- Estilo de render arquitectónico profesional fotorrealista.
- NO modifiques el diseño original del edificio.`;

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

    // Create predesign record with scale info
    let description = terrainImageBase64 
      ? "Vista aérea 3D sobre terreno real (PNOA)" 
      : "Vista aérea 3D generada con IA";
    
    if (parcelAreaM2 && buildingFootprintM2) {
      description += ` — Escala: ${buildingFootprintM2}m² sobre parcela de ${parcelAreaM2}m²`;
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
      JSON.stringify({ success: true, filePath: fileName }),
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