import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

// HTML entity encoding to prevent XSS
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

// Replace template variables
function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, escapeHtml(value));
  }
  return result;
}

const handler = async (req: Request): Promise<Response> => {
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

    const body: SendEmailRequest = await req.json();
    const { contactId, contactIds, email, subject, content, templateId, campaignId, variables = {} } = body;

    if (!subject || !content) {
      return new Response(
        JSON.stringify({ error: "Asunto y contenido son obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company settings for sender info
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('name, email')
      .single();

    const senderName = companySettings?.name || 'Concepto.Casa';
    const senderEmail = companySettings?.email || 'organiza@concepto.casa';

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

    console.log(`Sending email to ${recipients.length} recipient(s)`);

    const results: { contactId: string; email: string; success: boolean; error?: string }[] = [];

    for (const recipient of recipients) {
      try {
        // Prepare variables for this recipient
        const recipientVariables = {
          ...variables,
          nombre: recipient.name,
          email: recipient.email,
          empresa_nombre: senderName,
        };

        const finalSubject = replaceVariables(subject, recipientVariables);
        const finalContent = replaceVariables(content, recipientVariables);

        // Send email
        const emailResponse = await resend.emails.send({
          from: `${senderName} <onboarding@resend.dev>`,
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
        results
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
