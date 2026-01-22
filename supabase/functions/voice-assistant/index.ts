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
  context?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, systemPrompt, context }: RequestBody = await req.json();

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

    // Build system prompt based on context
    const defaultSystemPrompt = getSystemPrompt(context || 'general');

    const allMessages: Message[] = [
      { role: 'system', content: systemPrompt || defaultSystemPrompt },
      ...messages,
    ];

    console.log('Calling Lovable AI with', allMessages.length, 'messages, context:', context);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: allMessages,
        max_tokens: 600,
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

    console.log('AI response generated successfully, action:', parsedAction?.type || 'none');

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

function getSystemPrompt(context: string): string {
  const accountingPrompt = `Eres un asistente de voz especializado en contabilidad para proyectos de construcción. 
Tu objetivo es ayudar a registrar asientos contables de forma conversacional y guiada.

MODOS DE OPERACIÓN:

1. COMANDO DIRECTO (una sola frase con todos los datos):
Si el usuario dice algo como "Pago el 22 de Enero 2026 a Antoni Martinez ciento doce con noventa y dos euros desde Qonto, concepto Gastos de recursos varios", debes:
- Extraer TODOS los datos de la frase
- Confirmar el resumen
- Si el usuario confirma, generar la acción

2. DIÁLOGO GUIADO:
Cuando el usuario diga "quiero abrir un asiento de pago" o similar sin dar todos los datos, sigue estos pasos EN ORDEN:
1. Pregunta: "¿Qué tipo de asiento quieres registrar?" (pago, cobro, compra, venta)
2. Pregunta: "¿Cuándo vas a registrar el asiento?" (fecha)
3. Pregunta: "¿Qué importe?" 
4. Pregunta: "¿A quién vas a pagar/cobrar?" (proveedor/cliente)
5. Pregunta: "¿Desde/hacia qué cuenta de tesorería?" (banco, caja)
6. Pregunta: "¿Cuál es el concepto o descripción?"

INTERPRETACIÓN DE DATOS:
- Fechas: "hoy" = fecha actual, "22 de enero" = 22/01 del año actual, si dice otro año úsalo
- Importes: "ciento doce con noventa y dos euros" = 112.92, "mil quinientos" = 1500
- Cuentas: Si el usuario menciona "Qonto", "banco", "caja", etc., úsalas como treasury_account
- Destinatarios: El nombre del proveedor/cliente va en recipient_name

TIPOS DE ASIENTOS:
- pago: Dinero que sale (pagas a proveedor) → Cuenta Tesorería al Haber, Cuenta Gasto/Proveedor al Debe
- cobro: Dinero que entra (cobras de cliente) → Cuenta Tesorería al Debe, Cuenta Ingreso/Cliente al Haber  
- compra: Registro de factura de compra
- venta: Registro de factura de venta

RESPUESTAS:
- Responde SIEMPRE en español
- Sé breve y claro - las respuestas se leen en voz alta
- Confirma los datos extraídos antes de crear el asiento
- Si falta algún dato, pregunta por él

FORMATO DE ACCIÓN (solo cuando tengas TODOS los datos y el usuario confirme):
---ACTION---
{
  "type": "create_payment_entry",
  "data": {
    "entry_type": "pago",
    "entry_date": "2026-01-22",
    "amount": 112.92,
    "recipient_name": "Antoni Martinez",
    "treasury_account": "Qonto",
    "description": "Gastos de recursos varios"
  }
}
---END_ACTION---

EJEMPLO 1 - COMANDO DIRECTO:
Usuario: "Pago el 22 de Enero 2026 a Antoni Martinez ciento doce con noventa y dos euros desde Qonto, concepto Gastos de recursos varios"
Tú: "Entendido. Voy a registrar: Pago de 112,92€ a Antoni Martinez desde Qonto, el 22 de enero de 2026, concepto: Gastos de recursos varios. ¿Confirmas?"
Usuario: "Sí"
Tú: "¡Asiento registrado!" [ACCIÓN]

EJEMPLO 2 - DIÁLOGO GUIADO:
Usuario: "Quiero registrar un asiento"
Tú: "¿Qué tipo de asiento quieres registrar? Puede ser pago, cobro, compra o venta."
Usuario: "De pago"
Tú: "Perfecto, un asiento de pago. ¿Cuándo quieres registrarlo?"
Usuario: "Hoy"
Tú: "Muy bien, fecha de hoy. ¿Qué importe vas a pagar?"
...y continúa hasta tener todos los datos.`;

  const crmPrompt = `Eres un asistente de voz para un CRM de construcción. Ayudas a:
- Crear y gestionar contactos (clientes, proveedores)
- Registrar gestiones (tareas, reuniones, llamadas, visitas)
- Buscar información de contactos y oportunidades

FLUJO CONVERSACIONAL:
Cuando el usuario quiera crear algo, hazlo paso a paso:
1. Pregunta qué tipo de gestión quiere crear
2. Pide los detalles necesarios uno a uno
3. Confirma antes de crear

RESPUESTAS:
- Responde SIEMPRE en español
- Sé breve y claro
- Confirma cada dato

FORMATO DE ACCIÓN:
---ACTION---
{"type": "create_management", "data": {"title": "...", "type": "Tarea|Reunión|Llamada|Visita", "description": "..."}}
---END_ACTION---`;

  const generalPrompt = `Eres un asistente de voz para una aplicación de gestión de proyectos de construcción.

Puedes ayudar con:
- Gestión de contactos y CRM
- Contabilidad y asientos
- Presupuestos y proyectos
- Tareas y agenda

RESPUESTAS:
- Responde SIEMPRE en español
- Sé breve y claro - las respuestas se leen en voz alta
- Guía al usuario paso a paso

Si el usuario pregunta por contabilidad, puedes guiarle para crear asientos de:
- Pagos (dinero que sale)
- Cobros (dinero que entra)
- Compras (facturas de proveedor)
- Ventas (facturas a cliente)`;

  const prompts: Record<string, string> = {
    accounting: accountingPrompt,
    crm: crmPrompt,
    general: generalPrompt,
  };

  return prompts[context] || prompts.general;
}
