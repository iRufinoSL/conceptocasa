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

// Sanitize HTML content for email - whitelist-based approach
function sanitizeHtmlForEmail(html: string): string {
  if (!html) return '';
  
  let sanitized = html;
  
  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove all event handlers (onclick, onerror, onload, etc.) - comprehensive pattern
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: URLs (case insensitive, handles whitespace and encoding)
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*(?:javascript|data):[^"'>\s]*/gi, 'href="#"');
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*(?:javascript|data):[^"'>\s]*/gi, 'src=""');
  
  // Remove style tags and their content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove dangerous tags entirely
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|meta|link|base)[^>]*>.*?<\/\1>/gi, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|meta|link|base)[^>]*\/?>/gi, '');
  
  // Remove expression() in CSS (IE vulnerability)
  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '');
  
  // Remove -moz-binding (Firefox vulnerability)
  sanitized = sanitized.replace(/-moz-binding\s*:[^;}"']*/gi, '');
  
  return sanitized;
}

// Escape HTML entities for text content
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
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
    
    const senderName = from_name || (companySettings as any)?.name || 'Concepto Casa';
    const emailSignature = (companySettings as any)?.email_signature || '';
    
    // Use verified domain email - must be verified in Resend
    const fromEmail = `${senderName} <organiza@concepto.casa>`;

    console.log("Sending email from:", fromEmail, "to:", toEmails);

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
    
    // Append signature to HTML body if configured, then sanitize
    if (body_html) {
      let finalHtml = body_html;
      if (emailSignature) {
        // Escape the signature to prevent injection via company settings
        const safeSignature = escapeHtml(emailSignature).replace(/\n/g, '<br>');
        const signatureHtml = `<br><br><div style="border-top: 1px solid #ccc; padding-top: 12px; margin-top: 20px; color: #666; font-size: 14px;">${safeSignature}</div>`;
        finalHtml += signatureHtml;
      }
      // Sanitize the final HTML to remove any malicious content
      emailPayload.html = sanitizeHtmlForEmail(finalHtml);
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
        from_email: "organiza@concepto.casa",
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
        from_email: "organiza@concepto.casa",
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
