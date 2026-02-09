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

    const { action, text } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: parse_date - Parse natural language date/time to ISO datetime
    if (action === 'parse_date') {
      console.log(`[ParseVoiceNote] Parsing date from: "${text}"`);
      
      const now = new Date().toISOString();
      
      const aiResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `Eres un parser de fechas en español. La fecha y hora actual es: ${now}. 
El usuario te dirá cuándo quiere un recordatorio. Debes devolver SOLO un JSON con el formato:
{"datetime": "YYYY-MM-DDTHH:mm:ss", "description": "breve descripción legible en español"}

Ejemplos:
- "hoy dentro de dos horas" → calcula 2 horas desde ahora
- "mañana a las 11 de la mañana" → día siguiente a las 11:00
- "el día 12 de febrero a las 13:00" → 12 de febrero a las 13:00
- "la semana que viene" → lunes próximo a las 09:00
- "ahora mismo" → ahora mismo
- "no, sin recordatorio" → {"datetime": null, "description": "Sin recordatorio"}

Si no se especifica hora, usa las 09:00. Si la fecha ya pasó en el año actual, usa el año siguiente.
Responde ÚNICAMENTE con el JSON, sin explicaciones.`
            },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
          max_tokens: 200,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[ParseVoiceNote] AI API error:', errorText);
        return new Response(JSON.stringify({ error: 'AI parsing failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      console.log('[ParseVoiceNote] AI response:', content);

      try {
        // Extract JSON from response (may have markdown wrapping)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        console.error('[ParseVoiceNote] JSON parse error:', e);
      }

      return new Response(JSON.stringify({ datetime: null, description: 'No se pudo interpretar la fecha' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: match_contact - Find a contact by spoken name
    if (action === 'match_contact') {
      console.log(`[ParseVoiceNote] Matching contact: "${text}"`);

      // Check if user said no contact
      const noContactPhrases = ['no', 'nadie', 'ninguno', 'con nadie', 'no con nadie', 'ninguna persona', 'no con ninguno', 'sin contacto'];
      const lowerText = text.toLowerCase().trim();
      if (noContactPhrases.some(phrase => lowerText.includes(phrase))) {
        return new Response(JSON.stringify({ contact_id: null, contact_name: null, message: 'Sin contacto asociado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Search contacts
      const { data: contacts, error: contactsError } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email, phone')
        .or(`name.ilike.%${text}%,surname.ilike.%${text}%`)
        .limit(5);

      if (contactsError) {
        console.error('[ParseVoiceNote] Contacts query error:', contactsError);
      }

      if (contacts && contacts.length > 0) {
        // Use AI to pick the best match
        const contactList = contacts.map(c => 
          `ID: ${c.id} | Nombre: ${c.name}${c.surname ? ' ' + c.surname : ''}`
        ).join('\n');

        const aiResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              {
                role: 'system',
                content: `Eres un matcher de contactos. El usuario ha dicho un nombre y tienes una lista de contactos. 
Devuelve SOLO JSON con el contacto que mejor coincida:
{"contact_id": "uuid", "contact_name": "nombre completo"}
Si ninguno coincide bien, devuelve: {"contact_id": null, "contact_name": null}
Contactos disponibles:\n${contactList}`
              },
              { role: 'user', content: text }
            ],
            temperature: 0.1,
            max_tokens: 100,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              return new Response(JSON.stringify(parsed), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } catch (e) {
            console.error('[ParseVoiceNote] Contact match parse error:', e);
          }
        }

        // Fallback: return first result
        const first = contacts[0];
        return new Response(JSON.stringify({
          contact_id: first.id,
          contact_name: `${first.name}${first.surname ? ' ' + first.surname : ''}`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ contact_id: null, contact_name: null, message: 'No se encontró ningún contacto' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: match_budget - Find a budget by spoken name
    if (action === 'match_budget') {
      console.log(`[ParseVoiceNote] Matching budget: "${text}"`);

      const noBudgetPhrases = ['no', 'ninguno', 'con ninguno', 'no con ninguno', 'sin presupuesto', 'ningún presupuesto'];
      const lowerText = text.toLowerCase().trim();
      if (noBudgetPhrases.some(phrase => lowerText.includes(phrase))) {
        return new Response(JSON.stringify({ budget_id: null, budget_name: null, message: 'Sin presupuesto asociado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: budgets, error: budgetsError } = await supabase
        .from('presupuestos')
        .select('id, nombre')
        .ilike('nombre', `%${text}%`)
        .limit(5);

      if (budgetsError) {
        console.error('[ParseVoiceNote] Budgets query error:', budgetsError);
      }

      if (budgets && budgets.length > 0) {
        const budgetList = budgets.map(b => `ID: ${b.id} | Nombre: ${b.nombre}`).join('\n');

        const aiResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              {
                role: 'system',
                content: `Eres un matcher de presupuestos. El usuario ha mencionado un presupuesto. 
Devuelve SOLO JSON con el que mejor coincida:
{"budget_id": "uuid", "budget_name": "nombre"}
Si ninguno coincide: {"budget_id": null, "budget_name": null}
Presupuestos disponibles:\n${budgetList}`
              },
              { role: 'user', content: text }
            ],
            temperature: 0.1,
            max_tokens: 100,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              return new Response(JSON.stringify(parsed), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } catch (e) {
            console.error('[ParseVoiceNote] Budget match parse error:', e);
          }
        }

        const first = budgets[0];
        return new Response(JSON.stringify({ budget_id: first.id, budget_name: first.nombre }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ budget_id: null, budget_name: null, message: 'No se encontró ningún presupuesto' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use: parse_date, match_contact, match_budget' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ParseVoiceNote] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
