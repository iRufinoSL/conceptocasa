import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has admin or colaborador role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['administrador', 'colaborador'])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden - Insufficient privileges' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, options } = body;
    const text = typeof body?.text === 'string' ? body.text.trim().substring(0, 2000) : '';

    // Validate action
    const validActions = ['parse_date', 'match_contact', 'match_budget', 'pick_from_list'];
    if (!action || !validActions.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action. Use: parse_date, match_contact, match_budget, pick_from_list' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing or empty text parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate options array if provided
    if (options !== undefined && options !== null) {
      if (!Array.isArray(options) || options.length > 50) {
        return new Response(JSON.stringify({ error: 'Options must be an array with max 50 items' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

    // Helper: call AI
    async function callAI(systemPrompt: string, userText: string, model = 'google/gemini-2.5-flash', maxTokens = 200) {
      const resp = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[ParseVoiceNote] AI error:', resp.status, errText);
        return null;
      }
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // Helper: extract JSON from AI response
    function extractJSON(content: string) {
      try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch (e) {
        console.error('[ParseVoiceNote] JSON parse error:', e);
      }
      return null;
    }

    // ─── Action: parse_date ─────────────────────────────────────────
    if (action === 'parse_date') {
      console.log(`[ParseVoiceNote] Parsing date from: "${text}"`);

      const now = new Date();
      const nowISO = now.toISOString();
      // Build locale-aware context
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const todayStr = `${dayNames[now.getDay()]} ${now.getDate()} de ${monthNames[now.getMonth()]} de ${now.getFullYear()}, ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}h`;

      const systemPrompt = `Eres un parser de fechas en español. Hoy es: ${todayStr}. Fecha/hora actual ISO: ${nowISO}.
El usuario te dirá cuándo quiere un recordatorio. Debes devolver SOLO un JSON con el formato:
{"datetime": "YYYY-MM-DDTHH:mm:ss", "description": "<día_semana> <día> de <mes>, <HH>:<mm>h"}

La descripción SIEMPRE debe ser la fecha absoluta legible. Ejemplos:
- "mañana a las 9" → {"datetime":"2026-02-10T09:00:00","description":"Martes 10 de Febrero, 09:00h"}
- "el viernes a las 14:30" → {"datetime":"2026-02-13T14:30:00","description":"Viernes 13 de Febrero, 14:30h"}
- "hoy dentro de dos horas" → calcula la hora exacta y muestra la fecha completa
- "la semana que viene" → lunes próximo a las 09:00
- "no, sin recordatorio" → {"datetime": null, "description": "Sin recordatorio"}

Si no se especifica hora, usa las 09:00. Si la fecha ya pasó en el año actual, usa el año siguiente.
Responde ÚNICAMENTE con el JSON, sin explicaciones.`;

      const content = await callAI(systemPrompt, text);
      if (content) {
        const parsed = extractJSON(content);
        if (parsed) {
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ datetime: null, description: 'No se pudo interpretar la fecha' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Action: match_contact ──────────────────────────────────────
    if (action === 'match_contact') {
      console.log(`[ParseVoiceNote] Matching contact: "${text}"`);

      const noContactPhrases = ['no', 'nadie', 'ninguno', 'con nadie', 'no con nadie', 'ninguna persona', 'no con ninguno', 'sin contacto'];
      const lowerText = text.toLowerCase().trim();
      if (noContactPhrases.some(phrase => lowerText.includes(phrase))) {
        return new Response(JSON.stringify({ contact_id: null, contact_name: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Split text into words for broader search
      const words = text.split(/\s+/).filter(w => w.length > 2);
      let orFilters = words.map(w => `name.ilike.%${w}%,surname.ilike.%${w}%`).join(',');
      if (!orFilters) orFilters = `name.ilike.%${text}%,surname.ilike.%${text}%`;

      const { data: contacts, error: contactsError } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email, phone')
        .or(orFilters)
        .limit(10);

      if (contactsError) {
        console.error('[ParseVoiceNote] Contacts query error:', contactsError);
      }

      if (!contacts || contacts.length === 0) {
        return new Response(JSON.stringify({ contact_id: null, contact_name: null, message: 'No se encontró ningún contacto' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Single match → return directly
      if (contacts.length === 1) {
        const c = contacts[0];
        return new Response(JSON.stringify({
          contact_id: c.id,
          contact_name: `${c.name}${c.surname ? ' ' + c.surname : ''}`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Multiple matches → use AI to narrow down or return options
      const contactList = contacts.map(c =>
        `ID: ${c.id} | Nombre: ${c.name}${c.surname ? ' ' + c.surname : ''}`
      ).join('\n');

      const aiContent = await callAI(
        `Eres un matcher de contactos. El usuario ha dicho un nombre y tienes una lista de contactos.
Si hay UNO que coincide claramente, devuelve: {"contact_id": "uuid", "contact_name": "nombre completo"}
Si hay VARIOS que podrían coincidir, devuelve: {"multiple": true, "options": [{"id": "uuid", "name": "nombre completo"}, ...]}
Si ninguno coincide: {"contact_id": null, "contact_name": null}
Contactos disponibles:\n${contactList}`,
        text,
        'google/gemini-2.5-flash-lite'
      );

      if (aiContent) {
        const parsed = extractJSON(aiContent);
        if (parsed) {
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Fallback: if multiple contacts found, return as options
      if (contacts.length > 1) {
        return new Response(JSON.stringify({
          multiple: true,
          options: contacts.slice(0, 5).map(c => ({
            id: c.id,
            name: `${c.name}${c.surname ? ' ' + c.surname : ''}`,
          })),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const first = contacts[0];
      return new Response(JSON.stringify({
        contact_id: first.id,
        contact_name: `${first.name}${first.surname ? ' ' + first.surname : ''}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Action: match_budget ───────────────────────────────────────
    if (action === 'match_budget') {
      console.log(`[ParseVoiceNote] Matching budget: "${text}"`);

      const noBudgetPhrases = ['no', 'ninguno', 'con ninguno', 'no con ninguno', 'sin presupuesto', 'ningún presupuesto'];
      const lowerText = text.toLowerCase().trim();
      if (noBudgetPhrases.some(phrase => lowerText.includes(phrase))) {
        return new Response(JSON.stringify({ budget_id: null, budget_name: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Search budgets with broader matching
      const words = text.split(/\s+/).filter(w => w.length > 2);
      let budgetQuery = supabase.from('presupuestos').select('id, nombre');

      if (words.length > 0) {
        const orFilter = words.map(w => `nombre.ilike.%${w}%`).join(',');
        budgetQuery = budgetQuery.or(orFilter);
      } else {
        budgetQuery = budgetQuery.ilike('nombre', `%${text}%`);
      }

      const { data: budgets, error: budgetsError } = await budgetQuery.limit(10);

      if (budgetsError) {
        console.error('[ParseVoiceNote] Budgets query error:', budgetsError);
      }

      if (!budgets || budgets.length === 0) {
        return new Response(JSON.stringify({ budget_id: null, budget_name: null, message: 'No se encontró ningún presupuesto' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (budgets.length === 1) {
        return new Response(JSON.stringify({
          budget_id: budgets[0].id,
          budget_name: budgets[0].nombre,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Multiple matches
      const budgetList = budgets.map(b => `ID: ${b.id} | Nombre: ${b.nombre}`).join('\n');

      const aiContent = await callAI(
        `Eres un matcher de presupuestos. El usuario ha mencionado un presupuesto.
Si hay UNO que coincide claramente, devuelve: {"budget_id": "uuid", "budget_name": "nombre"}
Si hay VARIOS que podrían coincidir, devuelve: {"multiple": true, "options": [{"id": "uuid", "name": "nombre"}, ...]}
Si ninguno coincide: {"budget_id": null, "budget_name": null}
Presupuestos disponibles:\n${budgetList}`,
        text,
        'google/gemini-2.5-flash-lite'
      );

      if (aiContent) {
        const parsed = extractJSON(aiContent);
        if (parsed) {
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Fallback: return options
      if (budgets.length > 1) {
        return new Response(JSON.stringify({
          multiple: true,
          options: budgets.slice(0, 5).map(b => ({
            id: b.id,
            name: b.nombre,
          })),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        budget_id: budgets[0].id,
        budget_name: budgets[0].nombre,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Action: pick_from_list ─────────────────────────────────────
    // Resolve a disambiguation choice from voice input
    if (action === 'pick_from_list') {
      console.log(`[ParseVoiceNote] Picking from list: "${text}"`);

      if (!options || !Array.isArray(options) || options.length === 0) {
        return new Response(JSON.stringify({ selected_id: null, selected_name: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const optionsList = options.map((o: any, i: number) =>
        `${i + 1}. ID: ${o.id} | Nombre: ${o.name}`
      ).join('\n');

      const aiContent = await callAI(
        `El usuario debe elegir una opción de esta lista. Puede decir el nombre, el número, o una variación.
Devuelve SOLO JSON: {"selected_id": "uuid", "selected_name": "nombre"}
Si dice "ninguno", "no", "nada" o similar: {"selected_id": null, "selected_name": null}
Opciones:\n${optionsList}`,
        text,
        'google/gemini-2.5-flash-lite',
        100
      );

      if (aiContent) {
        const parsed = extractJSON(aiContent);
        if (parsed) {
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ selected_id: null, selected_name: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use: parse_date, match_contact, match_budget, pick_from_list' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ParseVoiceNote] Error:', error);
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
