import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { planDescription, style, rooms, dimensions, roofType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const roomList = (rooms || []).map((r: any) => `${r.name} (${r.width}x${r.length}m)`).join(", ");
    
    const styleDescriptions: Record<string, string> = {
      moderno: "modern minimalist architecture with clean lines, large windows, flat or low-slope roof, white and grey exterior with wood accents, contemporary landscaping",
      rustico: "rustic countryside home with natural stone walls, wooden beams, terracotta roof tiles, warm earth tones, surrounded by Mediterranean vegetation",
      mediterraneo: "Mediterranean villa with white stucco walls, terracotta tile roof, arched doorways, blue accents, courtyard with olive trees and bougainvillea",
      clasico: "classic European residential architecture with elegant facade, symmetrical design, pitched roof, brick or stone exterior, traditional garden",
      ecologico: "eco-friendly sustainable home with green roof, solar panels, large windows for natural light, wood and recycled materials, integrated with nature",
      industrial: "industrial modern home with exposed concrete, steel framing, large glass panels, flat roof, minimalist urban landscape",
    };

    const styleDesc = styleDescriptions[style] || styleDescriptions.moderno;
    const dims = dimensions ? `${dimensions.width}m x ${dimensions.length}m, ${dimensions.height}m ceiling height` : "";

    const roofDescriptions: Record<string, string> = {
      dos_aguas: "gable roof (two sloping sides meeting at a central ridge)",
      cuatro_aguas: "hip roof (four sloping sides)",
      plana: "flat roof",
    };
    const roofDesc = roofDescriptions[roofType] || "";

    const prompt = `Generate a photorealistic architectural exterior rendering of a single-family house with the following characteristics:

Style: ${styleDesc}
Dimensions: ${dims}
${roofDesc ? `Roof type: ${roofDesc}` : ""}
Rooms: ${roomList}
${planDescription ? `Additional details: ${planDescription}` : ""}

The image should be a professional architectural visualization showing:
- The complete exterior of the house from a 3/4 angle perspective
- Realistic lighting (golden hour/afternoon sun)
- Landscaping and surroundings appropriate to the style
- High quality photorealistic rendering suitable for a client presentation
- 16:9 aspect ratio, architectural photography quality`;

    console.log("Generating render with prompt length:", prompt.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido. Inténtalo de nuevo en unos minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA agotados. Añade créditos en la configuración." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textContent = data.choices?.[0]?.message?.content || "";

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      return new Response(JSON.stringify({ error: "No se pudo generar la imagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageUrl, description: textContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("render error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
