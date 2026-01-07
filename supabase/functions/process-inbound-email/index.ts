import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// No CORS headers - this is a server-to-server webhook endpoint
const jsonHeaders = {
  "Content-Type": "application/json",
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
  
  // Reject browser preflight requests - this is a server-to-server webhook
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }
  
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  try {
    // Create Supabase client with service role for webhook
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    console.log("Raw request body:", rawBody.substring(0, 500));
    
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Check if this is a Resend webhook event (not a real inbound email)
    // Resend sends events like domain.updated, email.sent, email.delivered, email.opened, etc.
    if (payload.type && typeof payload.type === 'string') {
      const eventType = payload.type;
      console.log("Received Resend webhook event:", eventType);
      
      // Only process email.received events, ignore all others
      if (eventType !== 'email.received') {
        console.log("Ignoring non-inbound event:", eventType);
        return new Response(
          JSON.stringify({ success: true, message: `Ignored event: ${eventType}` }),
          { status: 200, headers: jsonHeaders }
        );
      }
      
      // For email.received, the actual email data is in payload.data
      payload = payload.data;
    }

    // Now treat payload as InboundEmail
    const emailData: InboundEmail = payload;

    // Validate required fields with safe defaults
    const fromField = emailData.from || emailData.from_name || "";
    const subjectField = emailData.subject || "(Sin asunto)";
    const toField = emailData.to || [];
    
    console.log("Received inbound email from:", fromField);
    console.log("Subject:", subjectField);

    if (!fromField) {
      console.error("No 'from' field in email data");
      return new Response(
        JSON.stringify({ error: "Missing 'from' field in email data" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Extract sender email safely
    let fromEmail = fromField;
    if (typeof fromField === 'string' && fromField.includes("<")) {
      const match = fromField.match(/<(.+)>/);
      fromEmail = match?.[1] || fromField;
    }
    
    // Extract sender name
    let fromName = emailData.from_name || "";
    if (!fromName && typeof fromField === 'string' && fromField.includes("<")) {
      fromName = fromField.split("<")[0].trim().replace(/"/g, "");
    }

    console.log("Parsed from email:", fromEmail);
    console.log("Parsed from name:", fromName);

    // Try to find existing contact by email
    const { data: existingContact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("email", fromEmail)
      .maybeSingle();

    let contactId = existingContact?.id;
    console.log("Contact ID:", contactId || "not found (unknown sender)");

    // Check if this is a reply to an existing ticket (check subject for ticket number)
    const ticketMatch = subjectField.match(/\[Ticket #(\d+)\]/);
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
    const shouldCreateTicket = !ticketId && subjectField;
    
    if (shouldCreateTicket) {
      console.log("Creating new ticket from inbound email...");
      
      const { data: newTicket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          subject: subjectField,
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

    // Check for duplicate emails by external_id (message_id)
    if (emailData.message_id) {
      const { data: existingEmail } = await supabase
        .from("email_messages")
        .select("id")
        .eq("external_id", emailData.message_id)
        .maybeSingle();
      
      if (existingEmail) {
        console.log("Duplicate email detected, skipping. Message ID:", emailData.message_id);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Duplicate email, skipped",
            email_id: existingEmail.id
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
    }

    // Store the inbound email
    const { data: emailRecord, error: emailError } = await supabase
      .from("email_messages")
      .insert({
        direction: "inbound",
        from_email: fromEmail,
        from_name: fromName || null,
        to_emails: toField.length > 0 ? toField : ["organiza@concepto.casa"],
        cc_emails: emailData.cc || null,
        subject: subjectField,
        body_text: emailData.text || null,
        body_html: emailData.html || null,
        status: "received",
        external_id: emailData.message_id || null,
        contact_id: contactId,
        ticket_id: ticketId,
        received_at: new Date().toISOString(),
        is_read: false,
        metadata: {
          headers: emailData.headers || {},
          has_attachments: (emailData.attachments?.length || 0) > 0,
          unknown_sender: !contactId // Flag to indicate sender is not a contact
        }
      })
      .select()
      .single();

    if (emailError) {
      console.error("Error storing email:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to store email" }),
        { status: 500, headers: jsonHeaders }
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
      { status: 200, headers: jsonHeaders }
    );

  } catch (error: any) {
    console.error("Error in process-inbound-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: jsonHeaders }
    );
  }
};

serve(handler);
