import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BirdSMSEvent {
  id: string;
  type: string;
  receiver: {
    contact: {
      identifierValue: string;
    };
  };
  sender: {
    contact: {
      identifierValue: string;
    };
  };
  body: {
    text: {
      text: string;
    };
  };
  createdDatetime: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log('Bird webhook received:', JSON.stringify(payload, null, 2));

    // Bird sends events in different formats depending on the event type
    // Handle message.created event for inbound SMS
    const eventType = payload.type || payload.eventType;
    
    if (eventType !== 'message.created' && eventType !== 'message.received') {
      console.log('Ignoring non-message event:', eventType);
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract message data - Bird API v2 format
    const message = payload.message || payload;
    const fromPhone = message.sender?.contact?.identifierValue || 
                      message.originator || 
                      message.from;
    const toPhone = message.receiver?.contact?.identifierValue || 
                    message.recipient || 
                    message.to;
    const messageText = message.body?.text?.text || 
                        message.content?.text || 
                        message.body || 
                        '';
    const externalId = message.id || payload.id;
    const receivedAt = message.createdDatetime || payload.createdAt || new Date().toISOString();

    if (!fromPhone) {
      console.error('No sender phone found in payload');
      return new Response(JSON.stringify({ error: 'No sender phone found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing inbound SMS from ${fromPhone}: ${messageText.substring(0, 50)}...`);

    // Normalize phone number (remove spaces, ensure + prefix)
    const normalizedPhone = fromPhone.replace(/\s+/g, '').replace(/^00/, '+');
    
    // Look up contact by phone
    const { data: contact, error: contactError } = await supabase
      .from('crm_contacts')
      .select('id, name, surname')
      .or(`phone.eq.${normalizedPhone},phone.eq.${fromPhone}`)
      .maybeSingle();

    if (contactError) {
      console.error('Error looking up contact:', contactError);
    }

    let contactId = contact?.id || null;
    let contactName = contact ? `${contact.name} ${contact.surname || ''}`.trim() : fromPhone;

    // If no contact found, create one
    if (!contactId) {
      console.log('Creating new contact for phone:', normalizedPhone);
      const { data: newContact, error: createError } = await supabase
        .from('crm_contacts')
        .insert({
          name: normalizedPhone,
          phone: normalizedPhone,
          contact_type: 'particular',
          status: 'activo',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating contact:', createError);
      } else {
        contactId = newContact.id;
        contactName = normalizedPhone;
      }
    }

    // Store the inbound SMS in crm_communications
    const { data: communication, error: commError } = await supabase
      .from('crm_communications')
      .insert({
        contact_id: contactId,
        communication_type: 'sms',
        direction: 'inbound',
        content: messageText,
        subject: `SMS de ${contactName}`,
        status: 'received',
        sent_at: receivedAt,
        metadata: {
          external_id: externalId,
          from_phone: fromPhone,
          to_phone: toPhone,
          raw_payload: payload,
        },
      })
      .select()
      .single();

    if (commError) {
      console.error('Error storing SMS:', commError);
      throw commError;
    }

    console.log('SMS stored successfully:', communication.id);

    // Create notification for admins
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'administrador');

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin) => ({
        user_id: admin.user_id,
        title: `SMS recibido de ${contactName}`,
        message: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''),
        type: 'sms_received',
        reference_id: communication.id,
        reference_type: 'crm_communication',
      }));

      await supabase.from('notifications').insert(notifications);
    }

    return new Response(JSON.stringify({ success: true, communication_id: communication.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing Bird webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
