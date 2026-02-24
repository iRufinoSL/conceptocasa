import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is the scheduler (must send anon key as Bearer token)
    const authHeader = req.headers.get('Authorization');
    const expectedKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role for scheduled tasks
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date().toISOString();
    console.log(`[CheckReminders] Checking reminders at ${now}`);

    // Find due reminders that haven't been sent
    const { data: dueNotes, error: fetchError } = await adminClient
      .from('voice_notes')
      .select(`
        id,
        message,
        reminder_at,
        contact_name,
        budget_name,
        created_by
      `)
      .eq('status', 'active')
      .eq('sms_sent', false)
      .not('reminder_at', 'is', null)
      .lte('reminder_at', now);

    if (fetchError) {
      console.error('[CheckReminders] Error fetching due notes:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!dueNotes || dueNotes.length === 0) {
      console.log('[CheckReminders] No due reminders found');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[CheckReminders] Found ${dueNotes.length} due reminders`);

    const birdApiKey = Deno.env.get('BIRD_API_KEY');
    const birdWorkspaceId = Deno.env.get('BIRD_WORKSPACE_ID');
    const birdChannelId = Deno.env.get('BIRD_CHANNEL_ID');

    let processed = 0;
    let smsSent = 0;

    for (const note of dueNotes) {
      try {
        // Get user's phone number from profile
        const { data: profile } = await adminClient
          .from('profiles')
          .select('phone, full_name')
          .eq('id', note.created_by)
          .single();

        if (!profile?.phone) {
          console.log(`[CheckReminders] No phone for user ${note.created_by}, marking as sent without SMS`);
          await adminClient
            .from('voice_notes')
            .update({ sms_sent: true, sms_sent_at: now })
            .eq('id', note.id);
          processed++;
          continue;
        }

        // Build SMS message
        let smsMessage = `🔔 Recordatorio TO.LO.SA:\n${note.message}`;
        if (note.contact_name) {
          smsMessage += `\n👤 ${note.contact_name}`;
        }
        if (note.budget_name) {
          smsMessage += `\n📋 ${note.budget_name}`;
        }

        // Truncate if too long for SMS
        if (smsMessage.length > 450) {
          smsMessage = smsMessage.substring(0, 447) + '...';
        }

        // Add link to agenda
        smsMessage += '\n\n/agenda';

        console.log(`[CheckReminders] Sending SMS to ${profile.phone} for note ${note.id}`);

        if (birdApiKey && birdWorkspaceId && birdChannelId) {
          let normalizedPhone = profile.phone.replace(/\s+/g, '');
          if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
          }

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
              body: {
                type: 'text',
                text: { text: smsMessage },
              },
            }),
          });

          if (birdResponse.ok) {
            console.log(`[CheckReminders] SMS sent successfully for note ${note.id}`);
            smsSent++;
          } else {
            const errorBody = await birdResponse.text();
            console.error(`[CheckReminders] SMS failed for note ${note.id}:`, errorBody);
          }
        } else {
          console.warn('[CheckReminders] Bird SMS not configured, skipping SMS');
        }

        // Mark as sent regardless (to avoid repeated attempts)
        await adminClient
          .from('voice_notes')
          .update({ sms_sent: true, sms_sent_at: now })
          .eq('id', note.id);

        processed++;
      } catch (noteError) {
        console.error(`[CheckReminders] Error processing note ${note.id}:`, noteError);
      }
    }

    console.log(`[CheckReminders] Processed ${processed} reminders, ${smsSent} SMS sent`);

    return new Response(JSON.stringify({ processed, smsSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CheckReminders] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
