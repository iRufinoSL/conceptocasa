import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RequestBody {
  messages: Message[];
  systemPrompt?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, systemPrompt }: RequestBody = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const defaultSystemPrompt = `Eres un asistente de voz conversacional para una aplicación de gestión de proyectos de construcción y CRM.

Tu rol es ayudar a los usuarios con:
- Crear y gestionar contactos (clientes, proveedores)
- Registrar gestiones (tareas, reuniones, llamadas, visitas, emails)
- Registrar asientos contables (compras, ventas, pagos, cobros)
- Responder preguntas sobre el sistema

INSTRUCCIONES IMPORTANTES:
1. Responde SIEMPRE en español
2. Sé conciso pero amable - las respuestas se leerán en voz alta
3. Usa frases cortas y claras
4. Si detectas una intención de crear algo, confirma los datos antes de proceder
5. Cuando detectes una acción específica, incluye un JSON con la acción al final de tu respuesta

FORMATO DE ACCIONES (incluir al final si aplica):
---ACTION---
{"type": "create_management", "data": {"title": "...", "type": "Tarea|Reunión|Llamada|Visita|Email", "description": "..."}}
---END_ACTION---

O para asientos contables:
---ACTION---
{"type": "create_entry", "data": {"entry_type": "compra|venta|pago|cobro", "amount": 123.45, "description": "...", "contact_name": "..."}}
---END_ACTION---

Ejemplos de interacciones:
- "Crear una tarea para llamar a Juan mañana" → Confirmas y generas acción create_management
- "Registrar una compra de 500 euros de materiales" → Confirmas y generas acción create_entry
- "¿Cómo añado un nuevo contacto?" → Explicas el proceso sin generar acción`;

    const allMessages: Message[] = [
      { role: 'system', content: systemPrompt || defaultSystemPrompt },
      ...messages,
    ];

    console.log('Calling Lovable AI with', allMessages.length, 'messages');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: allMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de solicitudes excedido. Intenta de nuevo en un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos agotados. Contacta al administrador.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Error al procesar la solicitud de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'No pude generar una respuesta.';

    // Parse action from response if present
    let parsedAction = null;
    let cleanResponse = content;

    const actionMatch = content.match(/---ACTION---\s*([\s\S]*?)\s*---END_ACTION---/);
    if (actionMatch) {
      try {
        parsedAction = JSON.parse(actionMatch[1].trim());
        cleanResponse = content.replace(/---ACTION---[\s\S]*?---END_ACTION---/, '').trim();
      } catch (e) {
        console.warn('Failed to parse action:', e);
      }
    }

    console.log('AI response generated successfully');

    return new Response(
      JSON.stringify({
        response: cleanResponse,
        action: parsedAction,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Voice assistant error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
