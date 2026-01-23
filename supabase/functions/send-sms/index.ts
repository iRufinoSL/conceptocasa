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
      .select('whatsapp_phone, sms_sender_phone, name')
      .single();

    if (settingsError) {
      console.error('Error fetching company settings:', settingsError);
    }

    // Priority: 1. sms_sender_phone from company_settings, 2. BIRD_SENDER_PHONE env, 3. whatsapp_phone fallback
    const fromPhone = companySettings?.sms_sender_phone || 
                      Deno.env.get('BIRD_SENDER_PHONE') || 
                      companySettings?.whatsapp_phone;
    
    console.log('Company settings:', { 
      sms_sender_phone: companySettings?.sms_sender_phone,
      whatsapp_phone: companySettings?.whatsapp_phone, 
      bird_sender_env: Deno.env.get('BIRD_SENDER_PHONE') ? 'set' : 'not set',
      fromPhone 
    });
    
    if (!fromPhone) {
      console.error('No sender phone configured - check company_settings.sms_sender_phone or BIRD_SENDER_PHONE env var');
      return new Response(JSON.stringify({ 
        error: 'No hay teléfono de remitente SMS configurado. Ve a Configuración > Empresa y configura el teléfono remitente SMS.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize sender phone number
    let normalizedFrom = fromPhone.replace(/\s+/g, '');
    if (!normalizedFrom.startsWith('+')) {
      normalizedFrom = '+' + normalizedFrom;
    }

    // Normalize recipient phone number
    let normalizedTo = to.replace(/\s+/g, '');
    if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    console.log(`Sending SMS from ${normalizedFrom} to ${normalizedTo}: ${message.substring(0, 50)}...`);

    // Send SMS via Bird API - Conversations API format
    // See: https://docs.bird.com/api/channels-api/sms-api
    const birdResponse = await fetch('https://api.bird.com/v2/send', {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${birdApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originator: normalizedFrom,
        recipients: [normalizedTo],
        body: message,
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
        error_message: birdData.errors?.[0]?.message || birdData.message || birdData.code || 'Error sending SMS',
        created_by: user.id,
        metadata: {
          to_phone: normalizedTo,
          from_phone: normalizedFrom,
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
          from_phone: normalizedFrom,
          budget_id: budget_id,
          external_id: birdData.id || birdData.messageId,
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
