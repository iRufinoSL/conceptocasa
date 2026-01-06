import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

interface InboundEmail {
  from: string;
  from_name?: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type: string;
  }>;
  headers?: Record<string, string>;
  message_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("process-inbound-email function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for webhook
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const emailData: InboundEmail = await req.json();
    console.log("Received inbound email from:", emailData.from);
    console.log("Subject:", emailData.subject);

    // Extract sender email
    const fromEmail = emailData.from.includes("<") 
      ? emailData.from.match(/<(.+)>/)?.[1] || emailData.from
      : emailData.from;

    // Try to find existing contact by email
    const { data: existingContact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("email", fromEmail)
      .maybeSingle();

    let contactId = existingContact?.id;
    console.log("Contact ID:", contactId || "not found");

    // Check if this is a reply to an existing ticket (check subject for ticket number)
    const ticketMatch = emailData.subject.match(/\[Ticket #(\d+)\]/);
    let ticketId: string | null = null;

    if (ticketMatch) {
      const ticketNumber = parseInt(ticketMatch[1]);
      console.log("Found ticket reference:", ticketNumber);
      
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("ticket_number", ticketNumber)
        .maybeSingle();

      if (ticket) {
        ticketId = ticket.id;
        console.log("Matched to ticket:", ticketId);
      }
    }

    // Determine if we should create a new ticket
    const shouldCreateTicket = !ticketId && emailData.subject;
    
    if (shouldCreateTicket) {
      console.log("Creating new ticket from inbound email...");
      
      const { data: newTicket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          subject: emailData.subject,
          description: emailData.text || "Email received",
          status: "open",
          priority: "medium",
          category: "Email",
          contact_id: contactId
        })
        .select()
        .single();

      if (ticketError) {
        console.error("Error creating ticket:", ticketError);
      } else {
        ticketId = newTicket.id;
        console.log("Created new ticket:", ticketId, "Number:", newTicket.ticket_number);
      }
    }

    // Store the inbound email
    const { data: emailRecord, error: emailError } = await supabase
      .from("email_messages")
      .insert({
        direction: "inbound",
        from_email: fromEmail,
        from_name: emailData.from_name,
        to_emails: emailData.to,
        cc_emails: emailData.cc,
        subject: emailData.subject,
        body_text: emailData.text,
        body_html: emailData.html,
        status: "received",
        external_id: emailData.message_id,
        contact_id: contactId,
        ticket_id: ticketId,
        received_at: new Date().toISOString(),
        metadata: {
          headers: emailData.headers,
          has_attachments: (emailData.attachments?.length || 0) > 0
        }
      })
      .select()
      .single();

    if (emailError) {
      console.error("Error storing email:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to store email" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email stored:", emailRecord.id);

    // Create notifications for all admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "administrador");

    if (admins && admins.length > 0) {
      const notifications = admins.map(admin => ({
        user_id: admin.user_id,
        title: "Nuevo email recibido",
        message: `De: ${fromEmail}\nAsunto: ${emailData.subject}`,
        type: "email",
        email_id: emailRecord.id,
        ticket_id: ticketId,
        action_url: ticketId ? `/tickets/${ticketId}` : undefined
      }));

      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Error creating notifications:", notifError);
      } else {
        console.log("Created notifications for", admins.length, "admins");
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: emailRecord.id,
        ticket_id: ticketId,
        contact_id: contactId
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in process-inbound-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
