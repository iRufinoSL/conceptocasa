import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
  content_type: string;
}

interface SendEmailRequest {
  to: string | string[];
  subject: string;
  body_html?: string;
  body_text?: string;
  from_name?: string;
  cc?: string[];
  bcc?: string[];
  contact_id?: string;
  ticket_id?: string;
  create_ticket?: boolean;
  ticket_subject?: string;
  ticket_priority?: string;
  ticket_category?: string;
  attachments?: EmailAttachment[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-email function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("User authentication failed:", userError);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Authenticated user:", user.email);

    const requestData: SendEmailRequest = await req.json();
    const { 
      to, 
      subject, 
      body_html, 
      body_text, 
      from_name,
      cc,
      bcc,
      contact_id,
      ticket_id,
      create_ticket,
      ticket_subject,
      ticket_priority,
      ticket_category,
      attachments
    } = requestData;

    // Validate required fields
    if (!to || !subject || (!body_html && !body_text)) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, and body_html or body_text" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const toEmails = Array.isArray(to) ? to : [to];
    
    // Get company settings for sender name and signature
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('name, email_signature')
      .single();
    
    const senderName = from_name || (companySettings as any)?.name || 'Lovable App';
    const emailSignature = (companySettings as any)?.email_signature || '';
    
    const fromEmail = `${senderName} <onboarding@resend.dev>`;

    console.log("Sending email to:", toEmails);

    // Create ticket if requested
    let createdTicketId = ticket_id;
    if (create_ticket && !ticket_id) {
      console.log("Creating new ticket...");
      const { data: newTicket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          subject: ticket_subject || subject,
          priority: ticket_priority || "medium",
          category: ticket_category,
          contact_id: contact_id,
          created_by: user.id,
          status: "open"
        })
        .select()
        .single();

      if (ticketError) {
        console.error("Error creating ticket:", ticketError);
      } else {
        createdTicketId = newTicket.id;
        console.log("Created ticket:", createdTicketId);
      }
    }

    // Send email via Resend
    const emailPayload: any = {
      from: fromEmail,
      to: toEmails,
      subject: subject,
    };
    
    if (cc && cc.length > 0) emailPayload.cc = cc;
    if (bcc && bcc.length > 0) emailPayload.bcc = bcc;
    
    // Add attachments if present
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content, // base64 encoded
        content_type: att.content_type
      }));
      console.log(`Adding ${attachments.length} attachment(s)`);
    }
    
    // Append signature to HTML body if configured
    if (body_html) {
      let finalHtml = body_html;
      if (emailSignature) {
        const signatureHtml = `<br><br><div style="border-top: 1px solid #ccc; padding-top: 12px; margin-top: 20px; color: #666; font-size: 14px;">${emailSignature.replace(/\n/g, '<br>')}</div>`;
        finalHtml += signatureHtml;
      }
      emailPayload.html = finalHtml;
    } else if (body_text) {
      let finalText = body_text;
      if (emailSignature) {
        finalText += `\n\n--\n${emailSignature}`;
      }
      emailPayload.text = finalText;
    }

    const emailResponse = await resend.emails.send(emailPayload);

    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      
      // Store failed email
      await supabase.from("email_messages").insert({
        direction: "outbound",
        from_email: "onboarding@resend.dev",
        from_name: from_name,
        to_emails: toEmails,
        cc_emails: cc,
        bcc_emails: bcc,
        subject: subject,
        body_html: body_html,
        body_text: body_text,
        status: "failed",
        error_message: emailResponse.error.message,
        contact_id: contact_id,
        ticket_id: createdTicketId,
        created_by: user.id
      });

      return new Response(
        JSON.stringify({ error: emailResponse.error.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Store sent email
    const { data: emailRecord, error: insertError } = await supabase
      .from("email_messages")
      .insert({
        direction: "outbound",
        from_email: "onboarding@resend.dev",
        from_name: from_name,
        to_emails: toEmails,
        cc_emails: cc,
        bcc_emails: bcc,
        subject: subject,
        body_html: body_html,
        body_text: body_text,
        status: "sent",
        external_id: emailResponse.data?.id,
        contact_id: contact_id,
        ticket_id: createdTicketId,
        created_by: user.id,
        sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error storing email record:", insertError);
    } else {
      console.log("Email record stored:", emailRecord.id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: emailResponse.data?.id,
        email_id: emailRecord?.id,
        ticket_id: createdTicketId
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
