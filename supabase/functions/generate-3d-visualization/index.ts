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
    const { imageBase64, terrainImageBase64, prompt, budgetId } = await req.json();

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
    console.log("Prompt:", prompt);

    // Build the message content based on whether we have a terrain image
    let messageContent: Array<{type: string; text?: string; image_url?: {url: string}}>;
    let finalPrompt: string;

    if (terrainImageBase64) {
      // We have both building and terrain images - instruct AI to composite them
      finalPrompt = `${prompt}

INSTRUCCIONES IMPORTANTES:
- La primera imagen es la IMAGEN SATELITAL REAL del terreno/parcela donde se ubicará el edificio.
- La segunda imagen es el EDIFICIO/VIVIENDA que debe integrarse en ese terreno.
- Genera una vista aérea 3D realista donde el edificio aparezca ubicado naturalmente sobre el terreno de la imagen satelital.
- Mantén los detalles del terreno real (vegetación, caminos, parcelas vecinas) visibles alrededor del edificio.
- El resultado debe parecer una foto aérea real con el edificio ya construido en la parcela.`;

      messageContent = [
        { type: "text", text: finalPrompt },
        { type: "image_url", image_url: { url: terrainImageBase64 } },
        { type: "image_url", image_url: { url: imageBase64 } }
      ];
    } else {
      // Only building image - generate with generic environment
      finalPrompt = `${prompt}

INSTRUCCIONES:
- Genera una vista aérea/isométrica 3D del edificio de la imagen.
- Añade un entorno genérico apropiado (jardín, vegetación, accesos).
- Estilo de render arquitectónico profesional fotorrealista.`;

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

    // Create predesign record with appropriate description
    const description = terrainImageBase64 
      ? "Vista aérea 3D sobre terreno real (imagen satelital)" 
      : "Vista aérea 3D generada con IA";

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