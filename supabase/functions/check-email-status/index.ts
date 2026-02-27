import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user auth
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check staff role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const isStaff = roleData?.some((r: { role: string }) =>
      ['administrador', 'colaborador'].includes(r.role)
    );
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get emails that need status check (pending or sent, with external_id)
    const { data: pendingEmails, error: fetchError } = await supabaseAdmin
      .from('email_messages')
      .select('id, external_id, delivery_status')
      .eq('direction', 'outbound')
      .in('delivery_status', ['pending', 'sent'])
      .not('external_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchError) {
      console.error("Error fetching pending emails:", fetchError);
      return new Response(JSON.stringify({ error: "Error fetching emails" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "No pending emails to check" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking status for ${pendingEmails.length} emails`);

    let updatedCount = 0;
    const errors: string[] = [];

    for (const email of pendingEmails) {
      try {
        // Query Resend API for email status
        const resendRes = await fetch(`https://api.resend.com/emails/${email.external_id}`, {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        });

        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error(`Resend API error for ${email.external_id}:`, resendRes.status, errText);
          errors.push(`${email.id}: Resend API ${resendRes.status}`);
          continue;
        }

        const resendData = await resendRes.json();
        // Resend returns: { id, from, to, subject, created_at, last_event }
        // last_event can be: "sent", "delivered", "opened", "clicked", "bounced", "complained"
        const lastEvent = resendData.last_event;
        
        if (!lastEvent) continue;

        // Map Resend event to our status
        const statusMap: Record<string, string> = {
          sent: 'sent',
          delivered: 'delivered',
          opened: 'opened',
          clicked: 'opened', // clicked implies opened
          bounced: 'bounced',
          complained: 'complained',
          delivery_delayed: 'delayed',
        };

        const newStatus = statusMap[lastEvent];
        if (!newStatus) continue;

        // Only update if status changed
        if (newStatus === email.delivery_status) continue;

        const updateData: Record<string, any> = {
          delivery_status: newStatus,
          delivery_updated_at: new Date().toISOString(),
        };

        if (newStatus === 'opened' || lastEvent === 'clicked') {
          updateData.read_receipt_at = new Date().toISOString();
        }

        const { error: updateError } = await supabaseAdmin
          .from('email_messages')
          .update(updateData)
          .eq('id', email.id);

        if (updateError) {
          console.error(`Error updating email ${email.id}:`, updateError);
          errors.push(`${email.id}: DB update error`);
        } else {
          updatedCount++;
          console.log(`Updated email ${email.id}: ${email.delivery_status} → ${newStatus}`);
        }
      } catch (err: any) {
        console.error(`Error checking email ${email.id}:`, err);
        errors.push(`${email.id}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        checked: pendingEmails.length,
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in check-email-status:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
