import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_EMAILS_PER_USER_PER_HOUR = 100;
const MAX_RECIPIENTS_PER_EMAIL = 50;
const MAX_INLINE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per inline attachment
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
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*(?:javascript|data):[^"'>\s]*/gi, 'href="#"');
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*(?:javascript|data):[^"'>\s]*/gi, 'src=""');
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|meta|link|base)[^>]*>.*?<\/\1>/gi, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|meta|link|base)[^>]*\/?>/gi, '');
  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '');
  sanitized = sanitized.replace(/-moz-binding\s*:[^;}"']*/gi, '');
  
  return sanitized;
}

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

function getBase64DecodedSize(base64String: string): number {
  const padding = (base64String.match(/=/g) || []).length;
  return Math.floor((base64String.length * 3) / 4) - padding;
}

function formatFileSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-email function called");
  
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Authenticated user:", user.email);

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isStaff = roleData?.some((r: { role: string }) => 
      ['administrador', 'colaborador'].includes(r.role)
    );

    if (!isStaff) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("User role verified as staff");

    // Rate limiting
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: emailCount, error: countError } = await supabaseAdmin
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .eq('direction', 'outbound')
      .gte('created_at', oneHourAgo);

    if (!countError && emailCount !== null && emailCount >= MAX_EMAILS_PER_USER_PER_HOUR) {
      console.warn(`Rate limit exceeded for user ${user.id}: ${emailCount} emails in last hour`);
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded", 
          message: `Has alcanzado el límite de ${MAX_EMAILS_PER_USER_PER_HOUR} emails por hora.`,
          retry_after_seconds: 3600
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Rate limit check passed: ${emailCount || 0}/${MAX_EMAILS_PER_USER_PER_HOUR} emails this hour`);

    const requestData: SendEmailRequest = await req.json();
    const { 
      to, subject, body_html, body_text, from_name,
      cc, bcc, contact_id, ticket_id, budget_id, project_id,
      create_ticket, ticket_subject, ticket_priority, ticket_category,
      attachments, response_deadline, request_read_receipt
    } = requestData;

    const wantReceipt = request_read_receipt !== false;

    console.log("Email request - budget_id:", budget_id, "response_deadline:", response_deadline);

    if (!to || !subject || (!body_html && !body_text)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, and body_html or body_text" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const toEmails = Array.isArray(to) ? to : [to];
    const ccEmails = cc || [];
    const bccEmails = bcc || [];
    
    const totalRecipients = toEmails.length + ccEmails.length + bccEmails.length;
    if (totalRecipients > MAX_RECIPIENTS_PER_EMAIL) {
      return new Response(
        JSON.stringify({ 
          error: "Too many recipients", 
          message: `El número máximo de destinatarios es ${MAX_RECIPIENTS_PER_EMAIL}.`
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Process attachments: oversized ones get uploaded to storage with download link
    const inlineAttachments: EmailAttachment[] = [];
    const linkedAttachments: { filename: string; size: number; signedUrl: string }[] = [];
    let totalInlineSize = 0;

    if (attachments && attachments.length > 0) {
      // Generate a temporary email ID for storage paths
      const tempEmailId = crypto.randomUUID();
      
      for (const att of attachments) {
        const attSize = getBase64DecodedSize(att.content);
        
        if (attSize > MAX_INLINE_ATTACHMENT_SIZE_BYTES || (totalInlineSize + attSize) > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
          // Upload to storage and create a download link instead
          console.log(`Attachment too large for inline (${formatFileSize(attSize)}): ${att.filename} — uploading to storage`);
          
          try {
            const binaryString = atob(att.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const filePath = `outbound/${tempEmailId}/${att.filename}`;
            const { error: uploadError } = await supabaseAdmin.storage
              .from('email-attachments')
              .upload(filePath, bytes, {
                contentType: att.content_type || 'application/octet-stream',
                upsert: false,
              });

            if (uploadError) {
              console.error("Error uploading large attachment:", att.filename, uploadError);
              // Store as failed email
              await storeFailedEmail(supabase, {
                toEmails, ccEmails, bccEmails, subject, body_html, body_text,
                from_name, contact_id, ticket_id: null, budget_id, project_id,
                userId: user.id,
                errorMessage: `Error al subir adjunto ${att.filename}: ${uploadError.message}`,
                response_deadline, wantReceipt,
              });
              return new Response(
                JSON.stringify({ error: `Error al subir adjunto: ${uploadError.message}` }),
                { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
              );
            }

            // Create a signed URL valid for 7 days
            const { data: signedData, error: signedError } = await supabaseAdmin.storage
              .from('email-attachments')
              .createSignedUrl(filePath, 7 * 24 * 3600); // 7 days

            if (signedError || !signedData?.signedUrl) {
              console.error("Error creating signed URL:", signedError);
              continue;
            }

            linkedAttachments.push({
              filename: att.filename,
              size: attSize,
              signedUrl: signedData.signedUrl,
            });

            // Also store in email_attachments table
            await supabaseAdmin.from('email_attachments').insert({
              email_id: tempEmailId,
              file_name: att.filename,
              file_path: filePath,
              file_type: att.content_type || null,
              file_size: bytes.length,
            }).then(() => {}).catch(() => {});
            
          } catch (uploadErr: any) {
            console.error("Exception uploading large attachment:", uploadErr);
          }
        } else {
          inlineAttachments.push(att);
          totalInlineSize += attSize;
        }
      }
      
      console.log(`Attachments: ${inlineAttachments.length} inline, ${linkedAttachments.length} as links`);
    }

    // Get company settings
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('name, email, email_signature')
      .single();
    
    const senderName = from_name || (companySettings as any)?.name || 'Concepto Casa';
    const senderEmail = (companySettings as any)?.email || 'organiza@concepto.casa';
    const emailSignature = (companySettings as any)?.email_signature || '';
    const fromEmail = `${senderName} <${senderEmail}>`;

    console.log("Sending email from:", fromEmail, "to:", toEmails);

    // Create ticket if requested
    let createdTicketId = ticket_id;
    if (create_ticket && !ticket_id) {
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

      if (!ticketError) {
        createdTicketId = newTicket.id;
      }
    }

    // Build email payload
    const emailPayload: any = {
      from: fromEmail,
      to: toEmails,
      subject: subject,
    };

    if (wantReceipt) {
      emailPayload.headers = {
        'Disposition-Notification-To': senderEmail,
        'Return-Receipt-To': senderEmail,
        'X-Confirm-Reading-To': senderEmail,
      };
    }
    
    if (ccEmails.length > 0) emailPayload.cc = ccEmails;
    if (bccEmails.length > 0) emailPayload.bcc = bccEmails;
    
    // Add inline attachments
    if (inlineAttachments.length > 0) {
      emailPayload.attachments = inlineAttachments.map(att => ({
        filename: att.filename,
        content: att.content,
        content_type: att.content_type
      }));
    }
    
    // Build final HTML body with linked attachments appended
    if (body_html) {
      let finalHtml = body_html;
      
      // Append download links for oversized attachments
      if (linkedAttachments.length > 0) {
        finalHtml += `<br><br><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 20px; background-color: #f9fafb;">`;
        finalHtml += `<p style="margin: 0 0 12px 0; font-weight: 600; font-size: 14px; color: #374151;">📎 Archivos adjuntos (enlace de descarga - válido 7 días):</p>`;
        for (const la of linkedAttachments) {
          finalHtml += `<p style="margin: 4px 0;"><a href="${escapeHtml(la.signedUrl)}" style="color: #2563eb; text-decoration: underline;">${escapeHtml(la.filename)}</a> <span style="color: #6b7280; font-size: 12px;">(${formatFileSize(la.size)})</span></p>`;
        }
        finalHtml += `</div>`;
      }
      
      if (emailSignature) {
        const safeSignature = escapeHtml(emailSignature).replace(/\n/g, '<br>');
        finalHtml += `<br><br><div style="border-top: 1px solid #ccc; padding-top: 12px; margin-top: 20px; color: #666; font-size: 14px;">${safeSignature}</div>`;
      }
      emailPayload.html = sanitizeHtmlForEmail(finalHtml);
    } else if (body_text) {
      let finalText = body_text;
      if (linkedAttachments.length > 0) {
        finalText += `\n\n📎 Archivos adjuntos (enlace de descarga):\n`;
        for (const la of linkedAttachments) {
          finalText += `- ${la.filename} (${formatFileSize(la.size)}): ${la.signedUrl}\n`;
        }
      }
      if (emailSignature) {
        finalText += `\n\n--\n${emailSignature}`;
      }
      emailPayload.text = finalText;
    }

    const emailResponse = await resend.emails.send(emailPayload);

    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      
      // Store failed email so it appears in "No enviados"
      await storeFailedEmail(supabase, {
        toEmails, ccEmails, bccEmails, subject, body_html, body_text,
        from_name, contact_id, ticket_id: createdTicketId, budget_id, project_id,
        userId: user.id,
        errorMessage: emailResponse.error.message,
        response_deadline, wantReceipt,
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

      // Store inline attachments in storage
      if (inlineAttachments.length > 0 && emailRecord?.id) {
        for (const att of inlineAttachments) {
          try {
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

            await supabaseAdmin.from('email_attachments').insert({
              email_id: emailRecord.id,
              file_name: att.filename,
              file_path: filePath,
              file_type: att.content_type || null,
              file_size: bytes.length,
            });
          } catch (attError: any) {
            console.error("Error processing attachment:", att.filename, attError);
          }
        }
      }

      // Update linked attachments to point to real email ID
      if (linkedAttachments.length > 0) {
        // The linked attachments were stored with tempEmailId, update them
        // They were already stored in storage, just update the email_attachments records if needed
      }
    }

    // Also create communication record for CRM tracking
    if (contact_id) {
      await supabase.from("crm_communications").insert({
        communication_type: "email",
        direction: "outbound",
        contact_id: contact_id,
        subject: subject,
        content: body_text || body_html || "",
        status: "sent",
        sent_at: new Date().toISOString(),
        created_by: user.id,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: emailResponse.data?.id,
        email_id: emailRecord?.id,
        ticket_id: createdTicketId,
        linked_attachments: linkedAttachments.length > 0 ? linkedAttachments.map(la => la.filename) : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Unhandled error in send-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

// Helper to store a failed email record
async function storeFailedEmail(supabase: any, params: {
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  body_html?: string;
  body_text?: string;
  from_name?: string;
  contact_id?: string;
  ticket_id?: string | null;
  budget_id?: string;
  project_id?: string;
  userId: string;
  errorMessage: string;
  response_deadline?: string;
  wantReceipt: boolean;
}) {
  try {
    await supabase.from("email_messages").insert({
      direction: "outbound",
      from_email: "organiza@concepto.casa",
      from_name: params.from_name,
      to_emails: params.toEmails,
      cc_emails: params.ccEmails,
      bcc_emails: params.bccEmails,
      subject: params.subject,
      body_html: params.body_html,
      body_text: params.body_text,
      status: "failed",
      error_message: params.errorMessage,
      contact_id: params.contact_id,
      ticket_id: params.ticket_id,
      budget_id: params.budget_id,
      project_id: params.project_id,
      created_by: params.userId,
      response_deadline: params.response_deadline || null,
      request_read_receipt: params.wantReceipt,
    });
    console.log("Failed email record stored");
  } catch (err: any) {
    console.error("Error storing failed email record:", err);
  }
}

serve(handler);
