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

    // Admin client for storing communications
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Normalize recipient phone number
    let normalizedTo = to.replace(/\s+/g, '');
    if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    // Bird workspace/channel config
    const birdWorkspaceId = Deno.env.get('BIRD_WORKSPACE_ID');
    const birdChannelId = Deno.env.get('BIRD_CHANNEL_ID');

    if (!birdWorkspaceId || !birdChannelId) {
      console.error('BIRD_WORKSPACE_ID or BIRD_CHANNEL_ID not configured');
      return new Response(JSON.stringify({ error: 'SMS channel not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Sending SMS to ${normalizedTo}`);
    console.log(`Message length: ${message.length} chars`);
    console.log(`Message content: ${JSON.stringify(message)}`);
    console.log(`Bird config - Workspace: ${birdWorkspaceId}, Channel: ${birdChannelId}`);

    // Step 1: Verify channel exists and is accessible
    const verifyUrl = `https://api.bird.com/workspaces/${birdWorkspaceId}/channels/${birdChannelId}`;
    console.log(`Verifying channel at: ${verifyUrl}`);
    
    const verifyResponse = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `AccessKey ${birdApiKey}`,
        'Accept': 'application/json',
      },
    });
    
    if (!verifyResponse.ok) {
      const verifyData = await verifyResponse.text();
      console.error(`Channel verification failed (${verifyResponse.status}): ${verifyData}`);
      console.error('This likely means: API key lacks permissions, or workspace/channel IDs are incorrect');
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Configuración Bird incorrecta (${verifyResponse.status}). Verifica API Key (permisos "Application"), Workspace ID y Channel ID en el panel de Bird.`,
          details: { status: verifyResponse.status, body: verifyData },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const channelInfo = await verifyResponse.json();
    console.log(`Channel verified: ${channelInfo.name || channelInfo.id}, status: ${channelInfo.status || 'unknown'}`);

    // Step 2: Send SMS via Bird Channels API
    const birdUrl = `https://api.bird.com/workspaces/${birdWorkspaceId}/channels/${birdChannelId}/messages`;
    console.log(`Sending message to: ${birdUrl}`);
    
    const requestBody = {
      receiver: {
        contacts: [{ identifierKey: 'phonenumber', identifierValue: normalizedTo }],
      },
      body: {
        type: 'text',
        text: { text: message },
      },
    };
    console.log('Request body:', JSON.stringify(requestBody));
    
    const birdResponse = await fetch(birdUrl, {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${birdApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const birdData = await birdResponse.json();
    console.log(`Bird API response (${birdResponse.status}):`, JSON.stringify(birdData, null, 2));

     if (!birdResponse.ok) {
       console.error('Bird API error:', birdData);

       // Store failed communication
       const { data: failedComm } = await adminClient
         .from('crm_communications')
         .insert({
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
           budget_id: budget_id,
           error_response: birdData,
         },
         })
         .select()
         .single();

       // IMPORTANT: return 200 so the client can read the actual error payload
       // and still show/update the tracking entry.
       return new Response(
         JSON.stringify({
           success: false,
           error: birdData.errors?.[0]?.message || birdData.message || birdData.code || 'Error sending SMS',
           details: birdData,
           communication_id: failedComm?.id,
         }),
         {
           status: 200,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         }
       );
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

     return new Response(
       JSON.stringify({
         success: true,
         message_id: birdData.id,
         communication_id: communication?.id,
       }),
       {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       }
     );

  } catch (error) {
    console.error('Error sending SMS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
