import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is the scheduler
    const authHeader = req.headers.get('Authorization');
    const schedulerSecret = Deno.env.get('SCHEDULER_SECRET');
    const expectedKey = Deno.env.get('SUPABASE_ANON_KEY');
    const token = authHeader?.replace('Bearer ', '');
    const isScheduler = schedulerSecret && token === schedulerSecret;
    const isAnonKey = expectedKey && token === expectedKey;
    if (!authHeader || (!isScheduler && !isAnonKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find outbound emails that:
    // 1. Requested read receipt
    // 2. Were sent more than 24 hours ago
    // 3. Have NOT been opened (read_receipt_at is null)
    // 4. SMS reminder has not been sent yet
    // 5. Have a linked contact with a phone number
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: unreceiptedEmails, error: fetchError } = await supabase
      .from('email_messages')
      .select(`
        id, subject, to_emails, contact_id, created_by, sent_at,
        crm_contacts (id, name, surname, phone)
      `)
      .eq('direction', 'outbound')
      .eq('request_read_receipt', true)
      .eq('receipt_reminder_sent', false)
      .is('read_receipt_at', null)
      .not('delivery_status', 'in', '("bounced","complained")')
      .lt('sent_at', cutoff)
      .not('contact_id', 'is', null);

    if (fetchError) {
      console.error('Error fetching unreceipted emails:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${unreceiptedEmails?.length || 0} emails without read receipt`);

    const birdApiKey = Deno.env.get('BIRD_API_KEY');
    const birdWorkspaceId = Deno.env.get('BIRD_WORKSPACE_ID');
    const birdChannelId = Deno.env.get('BIRD_CHANNEL_ID');

    if (!birdApiKey || !birdWorkspaceId || !birdChannelId) {
      console.warn('Bird SMS not configured, skipping SMS reminders');
      return new Response(JSON.stringify({ success: true, message: 'SMS not configured', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get company settings for sender info
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('name')
      .single();
    const companyName = (companySettings as any)?.name || 'Concepto Casa';

    // Get creator profiles for SMS notification
    const creatorIds = [...new Set((unreceiptedEmails || []).map(e => e.created_by).filter(Boolean))];
    let creatorPhones: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, phone')
        .in('id', creatorIds)
        .not('phone', 'is', null);
      
      if (profiles) {
        creatorPhones = Object.fromEntries(profiles.map(p => [p.id, p.phone]));
      }
    }

    let sentCount = 0;

    for (const email of (unreceiptedEmails || [])) {
      // Send SMS to the email creator (the sender) about unconfirmed receipt
      const creatorPhone = email.created_by ? creatorPhones[email.created_by] : null;
      if (!creatorPhone) {
        console.log(`No phone for creator of email ${email.id}, skipping SMS`);
        // Still mark as reminder sent to avoid retrying
        await supabase
          .from('email_messages')
          .update({ receipt_reminder_sent: true, receipt_reminder_sent_at: new Date().toISOString() })
          .eq('id', email.id);
        continue;
      }

      let normalizedPhone = creatorPhone.replace(/\s+/g, '');
      if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;

      const contactName = email.crm_contacts 
        ? `${(email.crm_contacts as any).name} ${(email.crm_contacts as any).surname || ''}`.trim()
        : email.to_emails?.[0] || 'destinatario';
      
      const smsMessage = `${companyName}: El email "${email.subject || 'Sin asunto'}" enviado a ${contactName} no tiene confirmación de lectura tras 24h.`;

      try {
        const birdUrl = `https://api.bird.com/workspaces/${birdWorkspaceId}/channels/${birdChannelId}/messages`;
        const birdResponse = await fetch(birdUrl, {
          method: 'POST',
          headers: {
            'Authorization': `AccessKey ${birdApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receiver: {
              contacts: [{ identifierKey: 'phonenumber', identifierValue: normalizedPhone }],
            },
            body: { type: 'text', text: { text: smsMessage } },
          }),
        });

        const birdData = await birdResponse.json();

        if (birdResponse.ok) {
          console.log(`SMS reminder sent for email ${email.id} to ${normalizedPhone}`);
          sentCount++;
        } else {
          console.error(`SMS send failed for email ${email.id}:`, birdData);
        }

        // Mark as reminder sent regardless (to avoid infinite retries)
        await supabase
          .from('email_messages')
          .update({ receipt_reminder_sent: true, receipt_reminder_sent_at: new Date().toISOString() })
          .eq('id', email.id);

        // Also create a system alert
        await supabase.from('system_alerts').insert({
          alert_type: 'email_no_receipt',
          title: 'Email sin confirmación de lectura',
          message: `El email "${email.subject || 'Sin asunto'}" enviado a ${contactName} no ha sido confirmado como leído en 24h.`,
          action_url: '/crm',
          priority: 'high',
          metadata: { email_id: email.id },
        });

      } catch (smsError) {
        console.error(`Error sending SMS reminder for email ${email.id}:`, smsError);
      }
    }

    console.log(`Sent ${sentCount} SMS reminders`);

    return new Response(JSON.stringify({ success: true, count: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in check-email-receipts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
