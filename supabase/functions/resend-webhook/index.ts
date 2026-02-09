import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

// Map Resend event types to our delivery status
const eventToStatus: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
};

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  console.log("resend-webhook function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook signature (optional but recommended)
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    
    if (webhookSecret) {
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");
      
      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn("Missing Svix headers, skipping signature verification");
      }
    }

    const payload: ResendWebhookPayload = await req.json();
    console.log("Received webhook event:", payload.type, "for email:", payload.data?.email_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const eventType = payload.type;
    const emailId = payload.data?.email_id;
    const newStatus = eventToStatus[eventType];

    if (!emailId) {
      console.error("No email_id in webhook payload");
      return new Response(
        JSON.stringify({ error: "Missing email_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!newStatus) {
      console.log("Unhandled event type:", eventType);
      return new Response(
        JSON.stringify({ success: true, message: "Event type not tracked" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build update payload
    const updateData: Record<string, any> = {
      delivery_status: newStatus,
      delivery_updated_at: new Date().toISOString(),
    };

    // If opened, also set read_receipt_at
    if (newStatus === 'opened') {
      updateData.read_receipt_at = new Date().toISOString();
    }

    // Update the email record with the new delivery status
    const { data: updatedEmail, error: updateError } = await supabase
      .from("email_messages")
      .update(updateData)
      .eq("external_id", emailId)
      .select("id, subject, to_emails, request_read_receipt, contact_id, created_by, delivery_status")
      .maybeSingle();

    if (updateError) {
      console.error("Error updating email status:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!updatedEmail) {
      console.warn("No email found with external_id:", emailId);
      return new Response(
        JSON.stringify({ success: true, message: "Email not found in database" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Updated email ${updatedEmail.id} to status: ${newStatus}`);

    // Create system alerts for important events
    if (newStatus === 'delivered') {
      await supabase.from("system_alerts").insert({
        alert_type: 'email_delivered',
        title: 'Email entregado',
        message: `El email "${updatedEmail.subject || 'Sin asunto'}" fue entregado al servidor de ${updatedEmail.to_emails?.[0] || 'destinatario'}.`,
        action_url: "/crm",
        priority: "low",
        metadata: { email_id: updatedEmail.id },
      });
    }

    if (newStatus === 'opened' && updatedEmail.request_read_receipt) {
      await supabase.from("system_alerts").insert({
        alert_type: 'email_read_receipt',
        title: 'Confirmación de lectura recibida',
        message: `El email "${updatedEmail.subject || 'Sin asunto'}" fue abierto por ${updatedEmail.to_emails?.[0] || 'destinatario'}.`,
        action_url: "/crm",
        priority: "medium",
        metadata: { email_id: updatedEmail.id },
      });
      console.log(`Read receipt alert created for email ${updatedEmail.id}`);
    }

    // For bounced or complained emails, create a system alert
    if (newStatus === 'bounced' || newStatus === 'complained') {
      const alertType = newStatus === 'bounced' ? 'email_bounced' : 'email_complained';
      const alertTitle = newStatus === 'bounced' 
        ? 'Email rebotado'
        : 'Email marcado como spam';
      const alertMessage = newStatus === 'bounced'
        ? `El email "${updatedEmail.subject || 'Sin asunto'}" no pudo entregarse a ${updatedEmail.to_emails?.[0] || 'destinatario'}.`
        : `El email "${updatedEmail.subject || 'Sin asunto'}" fue marcado como spam por ${updatedEmail.to_emails?.[0] || 'destinatario'}.`;

      await supabase.from("system_alerts").insert({
        alert_type: alertType,
        title: alertTitle,
        message: alertMessage,
        action_url: "/crm",
        priority: "high",
        metadata: { email_id: updatedEmail.id },
      });

      console.log(`Created ${alertType} alert for email ${updatedEmail.id}`);
    }

    return new Response(
      JSON.stringify({ success: true, status: newStatus, emailId: updatedEmail.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in resend-webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
