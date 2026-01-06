import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Rate limiting configuration
const RATE_LIMITS = {
  user: { hourly: 100, daily: 500 },
  admin: { hourly: 500, daily: 2000 },
  perContactCooldownMinutes: 5,
};

// Allowed origins for CORS - restrict to specific domains
const ALLOWED_ORIGINS = [
  "https://concepto.casa",
  "https://www.concepto.casa",
  "https://build-buddy-resources.lovable.app"
];

// Check if origin is allowed, also allow lovable preview domains
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview domains
  if (origin.match(/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/)) return true;
  if (origin.match(/^https:\/\/[a-z0-9-]+\.lovable\.app$/)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

interface SendEmailRequest {
  contactId?: string;
  contactIds?: string[];
  email?: string;
  subject: string;
  content: string;
  templateId?: string;
  campaignId?: string;
  variables?: Record<string, string>;
}

// HTML entity encoding to prevent XSS in template variables
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

// Allowed HTML tags and attributes for email sanitization
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'ul', 'ol', 'li', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'div', 'span', 'blockquote', 'hr'
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  'a': new Set(['href', 'style', 'class']),
  'img': new Set(['src', 'alt', 'style', 'class', 'width', 'height']),
  'table': new Set(['style', 'class', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'align']),
  'td': new Set(['style', 'class', 'width', 'height', 'align', 'valign', 'bgcolor', 'colspan', 'rowspan']),
  'th': new Set(['style', 'class', 'width', 'height', 'align', 'valign', 'bgcolor', 'colspan', 'rowspan']),
  'tr': new Set(['style', 'class', 'bgcolor', 'align', 'valign']),
  'div': new Set(['style', 'class', 'align']),
  'span': new Set(['style', 'class']),
  'p': new Set(['style', 'class', 'align']),
  'h1': new Set(['style', 'class', 'align']),
  'h2': new Set(['style', 'class', 'align']),
  'h3': new Set(['style', 'class', 'align']),
  'h4': new Set(['style', 'class', 'align']),
  'h5': new Set(['style', 'class', 'align']),
  'h6': new Set(['style', 'class', 'align']),
  'ul': new Set(['style', 'class']),
  'ol': new Set(['style', 'class']),
  'li': new Set(['style', 'class']),
  'blockquote': new Set(['style', 'class']),
};

// Sanitize HTML content for email - manually implemented for Deno compatibility
function sanitizeHtmlForEmail(html: string): string {
  if (!html) return '';
  
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: and data: URLs from href and src
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'href="#"');
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'src=""');
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*data:[^"'>\s]*/gi, 'href="#"');
  
  // Remove style tags and their content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gi, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)[^>]*\/?>/gi, '');
  
  // Remove meta and link tags
  sanitized = sanitized.replace(/<(meta|link)[^>]*\/?>/gi, '');
  
  return sanitized;
}

// Replace template variables
function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, escapeHtml(value));
  }
  return result;
}

// Check rate limits for user
async function checkRateLimits(
  supabase: any, 
  userId: string, 
  isAdmin: boolean,
  recipientCount: number
): Promise<{ allowed: boolean; error?: string; remaining?: number; resetTime?: string }> {
  const limits = isAdmin ? RATE_LIMITS.admin : RATE_LIMITS.user;
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Check hourly limit
  const { count: hourlyCount, error: hourlyError } = await supabase
    .from('crm_communications')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .eq('communication_type', 'email')
    .gte('created_at', hourAgo.toISOString());

  if (hourlyError) {
    console.error("Error checking hourly rate limit:", hourlyError);
    // Allow on error to not block legitimate requests
    return { allowed: true };
  }

  const currentHourly = hourlyCount || 0;
  if (currentHourly + recipientCount > limits.hourly) {
    const nextHour = new Date(Math.ceil(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
    return {
      allowed: false,
      error: `Límite de emails por hora alcanzado (${limits.hourly}). Inténtalo más tarde.`,
      remaining: Math.max(0, limits.hourly - currentHourly),
      resetTime: nextHour.toISOString()
    };
  }

  // Check daily limit
  const { count: dailyCount, error: dailyError } = await supabase
    .from('crm_communications')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .eq('communication_type', 'email')
    .gte('created_at', dayAgo.toISOString());

  if (dailyError) {
    console.error("Error checking daily rate limit:", dailyError);
    return { allowed: true };
  }

  const currentDaily = dailyCount || 0;
  if (currentDaily + recipientCount > limits.daily) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return {
      allowed: false,
      error: `Límite de emails diario alcanzado (${limits.daily}). Inténtalo mañana.`,
      remaining: Math.max(0, limits.daily - currentDaily),
      resetTime: tomorrow.toISOString()
    };
  }

  return { 
    allowed: true, 
    remaining: Math.min(limits.hourly - currentHourly, limits.daily - currentDaily) 
  };
}

// Check per-contact cooldown
async function checkContactCooldown(
  supabase: any,
  contactId: string
): Promise<{ allowed: boolean; minutesRemaining?: number }> {
  const cooldownMs = RATE_LIMITS.perContactCooldownMinutes * 60 * 1000;
  const cooldownStart = new Date(Date.now() - cooldownMs);

  const { data: recentEmail, error } = await supabase
    .from('crm_communications')
    .select('sent_at')
    .eq('contact_id', contactId)
    .eq('communication_type', 'email')
    .eq('status', 'sent')
    .gte('sent_at', cooldownStart.toISOString())
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error checking contact cooldown:", error);
    return { allowed: true };
  }

  if (recentEmail && recentEmail.sent_at) {
    const lastSent = new Date(recentEmail.sent_at).getTime();
    const now = Date.now();
    const timeSince = now - lastSent;
    
    if (timeSince < cooldownMs) {
      const minutesRemaining = Math.ceil((cooldownMs - timeSince) / 60000);
      return { allowed: false, minutesRemaining };
    }
  }

  return { allowed: true };
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate origin - reject requests from unauthorized origins
  if (!isOriginAllowed(origin)) {
    console.warn(`Rejected request from unauthorized origin: ${origin}`);
    return new Response(
      JSON.stringify({ error: "Origen no autorizado" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify the request is from an authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("User authentication failed:", userError);
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin (for rate limit tiers)
    const { data: isAdminData } = await supabase.rpc('has_role', { 
      _role: 'administrador', 
      _user_id: user.id 
    });
    const isAdmin = isAdminData === true;

    const body: SendEmailRequest = await req.json();
    const { contactId, contactIds, email, subject, content, templateId, campaignId, variables = {} } = body;

    if (!subject || !content) {
      return new Response(
        JSON.stringify({ error: "Asunto y contenido son obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company settings for sender info and email signature
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('name, email, email_signature')
      .single();

    const senderName = companySettings?.name || 'Concepto.Casa';
    const senderEmail = companySettings?.email || 'organiza@concepto.casa';
    const emailSignature = (companySettings as any)?.email_signature || '';

    // Determine recipients
    let recipients: { id: string; email: string; name: string }[] = [];

    if (contactIds && contactIds.length > 0) {
      // Multiple contacts (campaign)
      const { data: contacts, error: contactsError } = await supabase
        .from('crm_contacts')
        .select('id, email, name, surname')
        .in('id', contactIds)
        .not('email', 'is', null);

      if (contactsError) {
        console.error("Error fetching contacts:", contactsError);
        return new Response(
          JSON.stringify({ error: "Error al obtener contactos" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      recipients = (contacts || []).map(c => ({
        id: c.id,
        email: c.email!,
        name: c.surname ? `${c.name} ${c.surname}` : c.name
      }));
    } else if (contactId) {
      // Single contact
      const { data: contact, error: contactError } = await supabase
        .from('crm_contacts')
        .select('id, email, name, surname')
        .eq('id', contactId)
        .single();

      if (contactError || !contact?.email) {
        console.error("Contact not found or no email:", contactError);
        return new Response(
          JSON.stringify({ error: "Contacto no encontrado o sin email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      recipients = [{
        id: contact.id,
        email: contact.email,
        name: contact.surname ? `${contact.name} ${contact.surname}` : contact.name
      }];
    } else if (email) {
      // Direct email (no contact)
      recipients = [{ id: '', email, name: '' }];
    } else {
      return new Response(
        JSON.stringify({ error: "Debe especificar un contacto o email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No hay destinatarios válidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limits before sending
    const rateLimitCheck = await checkRateLimits(supabase, user.id, isAdmin, recipients.length);
    if (!rateLimitCheck.allowed) {
      console.warn(`Rate limit exceeded for user ${user.id}: ${rateLimitCheck.error}`);
      return new Response(
        JSON.stringify({ 
          error: rateLimitCheck.error,
          remaining: rateLimitCheck.remaining,
          resetTime: rateLimitCheck.resetTime
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": "3600"
          } 
        }
      );
    }

    console.log(`Sending email to ${recipients.length} recipient(s) [User: ${user.id}, Admin: ${isAdmin}]`);

    const results: { contactId: string; email: string; success: boolean; error?: string }[] = [];

    for (const recipient of recipients) {
      try {
        // Check per-contact cooldown for contacts (not direct emails)
        if (recipient.id) {
          const cooldownCheck = await checkContactCooldown(supabase, recipient.id);
          if (!cooldownCheck.allowed) {
            console.log(`Cooldown active for contact ${recipient.id}: ${cooldownCheck.minutesRemaining} min remaining`);
            results.push({ 
              contactId: recipient.id, 
              email: recipient.email, 
              success: false, 
              error: `Cooldown: último email hace menos de ${RATE_LIMITS.perContactCooldownMinutes} minutos` 
            });
            continue;
          }
        }

        // Prepare variables for this recipient
        const recipientVariables = {
          ...variables,
          nombre: recipient.name,
          email: recipient.email,
          empresa_nombre: senderName,
        };

        const finalSubject = replaceVariables(subject, recipientVariables);
        // Replace variables first, then sanitize HTML content
        const contentWithVars = replaceVariables(content, recipientVariables);
        
        // Append email signature if configured
        let fullContent = contentWithVars;
        if (emailSignature) {
          const signatureHtml = `<br><br><div style="border-top: 1px solid #ccc; padding-top: 12px; margin-top: 20px; color: #666; font-size: 14px;">${emailSignature.replace(/\n/g, '<br>')}</div>`;
          fullContent += signatureHtml;
        }
        
        const finalContent = sanitizeHtmlForEmail(fullContent);

        // Add delay between sends for bulk campaigns to prevent rate limiting at Resend
        if (recipients.length > 10 && results.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Send email
        const emailResponse = await resend.emails.send({
          from: `${senderName} <${senderEmail}>`,
          to: [recipient.email],
          subject: finalSubject,
          html: finalContent,
        });

        const resendData = emailResponse as { data?: { id?: string }; id?: string };
        const resendId = resendData?.data?.id || resendData?.id || 'unknown';
        console.log(`Email sent to ${recipient.email}:`, resendId);

        // Log communication
        if (recipient.id) {
          await supabase.from('crm_communications').insert({
            contact_id: recipient.id,
            communication_type: 'email',
            direction: 'outbound',
            subject: finalSubject,
            content: finalContent,
            status: 'sent',
            sent_at: new Date().toISOString(),
            created_by: user.id,
            metadata: {
              resend_id: resendId,
              campaign_id: campaignId,
              template_id: templateId,
            }
          });

          // Update campaign recipient if applicable
          if (campaignId) {
            await supabase
              .from('email_campaign_recipients')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
              })
              .eq('campaign_id', campaignId)
              .eq('contact_id', recipient.id);
          }
        }

        results.push({ contactId: recipient.id, email: recipient.email, success: true });
      } catch (error: any) {
        console.error(`Error sending to ${recipient.email}:`, error);

        // Log failed communication
        if (recipient.id) {
          await supabase.from('crm_communications').insert({
            contact_id: recipient.id,
            communication_type: 'email',
            direction: 'outbound',
            subject,
            content,
            status: 'failed',
            error_message: error.message,
            created_by: user.id,
            metadata: { campaign_id: campaignId, template_id: templateId }
          });

          // Update campaign recipient if applicable
          if (campaignId) {
            await supabase
              .from('email_campaign_recipients')
              .update({
                status: 'failed',
                error_message: error.message,
              })
              .eq('campaign_id', campaignId)
              .eq('contact_id', recipient.id);
          }
        }

        results.push({ contactId: recipient.id, email: recipient.email, success: false, error: error.message });
      }
    }

    // Update campaign stats if applicable
    if (campaignId) {
      const sentCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      await supabase
        .from('email_campaigns')
        .update({
          sent_count: sentCount,
          failed_count: failedCount,
          status: 'completed',
          sent_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Enviados: ${successCount}, Fallidos: ${failedCount}`,
        results,
        rateLimit: {
          remaining: rateLimitCheck.remaining
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-crm-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al enviar email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
