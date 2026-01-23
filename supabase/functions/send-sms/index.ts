import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendSMSRequest {
  to: string;
  message: string;
  contact_id?: string;
  budget_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { to, message, contact_id, budget_id }: SendSMSRequest = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const birdApiKey = Deno.env.get('BIRD_API_KEY');
    if (!birdApiKey) {
      console.error('BIRD_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'SMS service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get company settings for sender info
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: companySettings, error: settingsError } = await adminClient
      .from('company_settings')
      .select('whatsapp_phone, name')
      .single();

    if (settingsError) {
      console.error('Error fetching company settings:', settingsError);
    }

    const fromPhone = companySettings?.whatsapp_phone || Deno.env.get('BIRD_SENDER_PHONE');
    
    console.log('Company settings:', { 
      whatsapp_phone: companySettings?.whatsapp_phone, 
      bird_sender_env: Deno.env.get('BIRD_SENDER_PHONE') ? 'set' : 'not set',
      fromPhone 
    });
    
    if (!fromPhone) {
      console.error('No sender phone configured - check company_settings.whatsapp_phone or BIRD_SENDER_PHONE env var');
      return new Response(JSON.stringify({ 
        error: 'No hay teléfono de remitente configurado. Ve a Configuración > Empresa y configura el teléfono de WhatsApp/SMS.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize phone number
    let normalizedTo = to.replace(/\s+/g, '');
    if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    console.log(`Sending SMS to ${normalizedTo}: ${message.substring(0, 50)}...`);

    // Send SMS via Bird API
    // Bird API v2 endpoint for sending messages
    const birdResponse = await fetch('https://api.bird.com/workspaces/default/channels/sms/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${birdApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receiver: {
          contacts: [
            {
              identifierKey: 'phonenumber',
              identifierValue: normalizedTo,
            }
          ]
        },
        body: {
          type: 'text',
          text: {
            text: message
          }
        }
      }),
    });

    const birdData = await birdResponse.json();
    console.log('Bird API response:', JSON.stringify(birdData, null, 2));

    if (!birdResponse.ok) {
      console.error('Bird API error:', birdData);
      
      // Store failed communication
      await adminClient.from('crm_communications').insert({
        contact_id: contact_id || null,
        communication_type: 'sms',
        direction: 'outbound',
        content: message,
        subject: `SMS a ${normalizedTo}`,
        status: 'failed',
        error_message: birdData.errors?.[0]?.message || birdData.message || 'Error sending SMS',
        created_by: user.id,
        metadata: {
          to_phone: normalizedTo,
          from_phone: fromPhone,
          budget_id: budget_id,
          error_response: birdData,
        },
      });

      return new Response(JSON.stringify({ 
        error: 'Failed to send SMS', 
        details: birdData 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Store successful communication
    const { data: communication, error: commError } = await adminClient
      .from('crm_communications')
      .insert({
        contact_id: contact_id || null,
        communication_type: 'sms',
        direction: 'outbound',
        content: message,
        subject: `SMS a ${normalizedTo}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: user.id,
        metadata: {
          to_phone: normalizedTo,
          from_phone: fromPhone,
          budget_id: budget_id,
          external_id: birdData.id,
          bird_response: birdData,
        },
      })
      .select()
      .single();

    if (commError) {
      console.error('Error storing communication:', commError);
    }

    console.log('SMS sent successfully:', birdData.id);

    return new Response(JSON.stringify({ 
      success: true, 
      message_id: birdData.id,
      communication_id: communication?.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error sending SMS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
