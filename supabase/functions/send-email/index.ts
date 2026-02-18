import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_EMAILS_PER_USER_PER_HOUR = 100;
const MAX_RECIPIENTS_PER_EMAIL = 50;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per attachment
const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25MB total

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://concepto.casa',
  'https://www.concepto.casa',
  'https://conceptocasa.lovable.app',
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview domains
  if (origin.match(/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/)) return true;
  if (origin.match(/^https:\/\/[a-z0-9-]+\.lovable\.app$/)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

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
  budget_id?: string;
  project_id?: string;
  create_ticket?: boolean;
  ticket_subject?: string;
  ticket_priority?: string;
  ticket_category?: string;
  attachments?: EmailAttachment[];
  response_deadline?: string;
  request_read_receipt?: boolean;
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

// Calculate base64 decoded size (approximate)
function getBase64DecodedSize(base64String: string): number {
  // Base64 encoded data is ~33% larger than the original
  const padding = (base64String.match(/=/g) || []).length;
  return Math.floor((base64String.length * 3) / 4) - padding;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-email function called");
  
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    // Service role client for rate limiting check
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    // Verify user has staff role (administrador or colaborador)
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      console.error("Error fetching user roles:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isStaff = roleData?.some((r: { role: string }) => 
      ['administrador', 'colaborador'].includes(r.role)
    );

    if (!isStaff) {
      console.error("User lacks staff role:", user.id);
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("User role verified as staff");

    // RATE LIMITING: Check emails sent in the last hour by this user
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: emailCount, error: countError } = await supabaseAdmin
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .eq('direction', 'outbound')
      .gte('created_at', oneHourAgo);

    if (countError) {
      console.error("Error checking rate limit:", countError);
      // Don't block on rate limit check failure, log and continue
    } else if (emailCount !== null && emailCount >= MAX_EMAILS_PER_USER_PER_HOUR) {
      console.warn(`Rate limit exceeded for user ${user.id}: ${emailCount} emails in last hour`);
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded", 
          message: `Has alcanzado el límite de ${MAX_EMAILS_PER_USER_PER_HOUR} emails por hora. Por favor, inténtalo más tarde.`,
          retry_after_seconds: 3600
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Rate limit check passed: ${emailCount || 0}/${MAX_EMAILS_PER_USER_PER_HOUR} emails this hour`);

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
      budget_id,
      project_id,
      create_ticket,
      ticket_subject,
      ticket_priority,
      ticket_category,
      attachments,
      response_deadline,
      request_read_receipt
    } = requestData;

    // Default to requesting read receipt
    const wantReceipt = request_read_receipt !== false;

    console.log("Email request - budget_id:", budget_id, "response_deadline:", response_deadline);

    // Validate required fields
    if (!to || !subject || (!body_html && !body_text)) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, and body_html or body_text" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const toEmails = Array.isArray(to) ? to : [to];
    const ccEmails = cc || [];
    const bccEmails = bcc || [];
    
    // VALIDATION: Check total recipient count
    const totalRecipients = toEmails.length + ccEmails.length + bccEmails.length;
    if (totalRecipients > MAX_RECIPIENTS_PER_EMAIL) {
      console.warn(`Too many recipients: ${totalRecipients} (max: ${MAX_RECIPIENTS_PER_EMAIL})`);
      return new Response(
        JSON.stringify({ 
          error: "Too many recipients", 
          message: `El número máximo de destinatarios es ${MAX_RECIPIENTS_PER_EMAIL}. Has indicado ${totalRecipients}.`
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // VALIDATION: Check attachment sizes
    if (attachments && attachments.length > 0) {
      let totalAttachmentSize = 0;
      for (const att of attachments) {
        const attSize = getBase64DecodedSize(att.content);
        if (attSize > MAX_ATTACHMENT_SIZE_BYTES) {
          console.warn(`Attachment too large: ${att.filename} (${attSize} bytes)`);
          return new Response(
            JSON.stringify({ 
              error: "Attachment too large", 
              message: `El archivo "${att.filename}" excede el límite de 10MB por adjunto.`
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        totalAttachmentSize += attSize;
      }
      
      if (totalAttachmentSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
        console.warn(`Total attachment size too large: ${totalAttachmentSize} bytes`);
        return new Response(
          JSON.stringify({ 
            error: "Total attachments too large", 
            message: `El tamaño total de adjuntos excede el límite de 25MB.`
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      console.log(`Attachment validation passed: ${attachments.length} files, ${Math.round(totalAttachmentSize / 1024)}KB total`);
    }
    
    // Get company settings for sender name, email and signature
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('name, email, email_signature')
      .single();
    
    const senderName = from_name || (companySettings as any)?.name || 'Concepto Casa';
    const senderEmail = (companySettings as any)?.email || 'organiza@concepto.casa';
    const emailSignature = (companySettings as any)?.email_signature || '';
    
    // Use email from company settings - must be verified in Resend
    const fromEmail = `${senderName} <${senderEmail}>`;

    console.log("Sending email from:", fromEmail, "to:", toEmails, "recipients:", totalRecipients);

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

    // Add custom headers for read receipt request
    if (wantReceipt) {
      emailPayload.headers = {
        'Disposition-Notification-To': senderEmail,
        'Return-Receipt-To': senderEmail,
        'X-Confirm-Reading-To': senderEmail,
      };
    }
    
    if (ccEmails.length > 0) emailPayload.cc = ccEmails;
    if (bccEmails.length > 0) emailPayload.bcc = bccEmails;
    
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
        cc_emails: ccEmails,
        bcc_emails: bccEmails,
        subject: subject,
        body_html: body_html,
        body_text: body_text,
        status: "failed",
        error_message: emailResponse.error.message,
        contact_id: contact_id,
        ticket_id: createdTicketId,
        budget_id: budget_id,
        project_id: project_id,
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
        cc_emails: ccEmails,
        bcc_emails: bccEmails,
        subject: subject,
        body_html: body_html,
        body_text: body_text,
        status: "sent",
        delivery_status: "sent",
        delivery_updated_at: new Date().toISOString(),
        external_id: emailResponse.data?.id,
        contact_id: contact_id,
        ticket_id: createdTicketId,
        budget_id: budget_id,
        project_id: project_id,
        created_by: user.id,
        sent_at: new Date().toISOString(),
        response_deadline: response_deadline || null,
        response_received: false,
        request_read_receipt: wantReceipt,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error storing email record:", insertError);
    } else {
      console.log("Email record stored:", emailRecord.id);

      // Store attachments in storage and email_attachments table
      if (attachments && attachments.length > 0 && emailRecord?.id) {
        for (const att of attachments) {
          try {
            // Decode base64 to Uint8Array
            const binaryString = atob(att.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const filePath = `outbound/${emailRecord.id}/${att.filename}`;
            const { error: uploadError } = await supabaseAdmin.storage
              .from('email-attachments')
              .upload(filePath, bytes, {
                contentType: att.content_type || 'application/octet-stream',
                upsert: false,
              });

            if (uploadError) {
              console.error("Error uploading attachment:", att.filename, uploadError);
              continue;
            }

            const { error: attInsertError } = await supabaseAdmin
              .from('email_attachments')
              .insert({
                email_id: emailRecord.id,
                file_name: att.filename,
                file_path: filePath,
                file_type: att.content_type || null,
                file_size: bytes.length,
              });

            if (attInsertError) {
              console.error("Error storing attachment record:", att.filename, attInsertError);
            } else {
              console.log("Attachment stored:", att.filename);
            }
          } catch (attError) {
            console.error("Error processing attachment:", att.filename, attError);
          }
        }
      }
      
      // Create budget assignment if budget_id is provided (verify access first)
      if (budget_id && emailRecord?.id) {
        // Verify user has access to this budget
        const { data: hasAccess } = await supabase.rpc('has_presupuesto_access', {
          _user_id: user.id,
          _presupuesto_id: budget_id
        });

        if (hasAccess) {
          const { error: assignmentError } = await supabase
            .from("email_budget_assignments")
            .insert({
              email_id: emailRecord.id,
              budget_id: budget_id
            });
          
          if (assignmentError) {
            console.error("Error creating budget assignment:", assignmentError);
          } else {
            console.log("Budget assignment created for email:", emailRecord.id);
          }
        } else {
          console.warn("User lacks access to budget, skipping assignment:", budget_id);
        }
      }
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
