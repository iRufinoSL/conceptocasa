import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserWithPendingEmails {
  user_id: string;
  notification_email: string;
  full_name: string;
  unread_count: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is the scheduler
    const authHeader = req.headers.get('Authorization');
    const schedulerSecret = Deno.env.get('SCHEDULER_SECRET');
    const expectedKey = Deno.env.get('SUPABASE_ANON_KEY');
    const token = authHeader?.replace('Bearer ', '');
    const isScheduler = schedulerSecret && token === schedulerSecret;
    const isAnonKey = expectedKey && token === expectedKey;
    if (!authHeader || (!isScheduler && !isAnonKey)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Starting pending emails reminder job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with their notification preferences
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email, personal_notification_email, personal_notification_phone, personal_notification_type")
      .or("personal_notification_email.not.is.null,personal_notification_phone.not.is.null");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} users with notification preferences configured`);

    // Bird API for SMS
    const birdApiKey = Deno.env.get('BIRD_API_KEY');
    const birdWorkspaceId = Deno.env.get('BIRD_WORKSPACE_ID');
    const birdChannelId = Deno.env.get('BIRD_CHANNEL_ID');

    async function sendSmsNotification(toPhone: string, message: string) {
      if (!birdApiKey) {
        console.error('BIRD_API_KEY not configured, skipping SMS');
        return false;
      }
      if (!birdWorkspaceId || !birdChannelId) {
        console.error('BIRD_WORKSPACE_ID or BIRD_CHANNEL_ID not configured, skipping SMS');
        return false;
      }

      let normalizedTo = toPhone.replace(/\s+/g, '');
      if (!normalizedTo.startsWith('+')) normalizedTo = '+' + normalizedTo;

      try {
        const birdUrl = `https://api.bird.com/workspaces/${birdWorkspaceId}/channels/${birdChannelId}/messages`;
        const response = await fetch(birdUrl, {
          method: 'POST',
          headers: {
            'Authorization': `AccessKey ${birdApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receiver: {
              contacts: [{ identifierKey: 'phonenumber', identifierValue: normalizedTo }],
            },
            body: {
              type: 'text',
              text: { text: message },
            },
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          console.error('Bird SMS error:', data);
          return false;
        }
        console.log(`SMS sent to ${normalizedTo}: ${data.id}`);
        return true;
      } catch (err) {
        console.error(`Error sending SMS to ${normalizedTo}:`, err);
        return false;
      }
    }

    const usersWithPendingEmails: UserWithPendingEmails[] = [];

    // Count ALL unread inbound emails
    const { count: totalUnread, error: countError } = await supabase
      .from("email_messages")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("is_read", false)
      .is("deleted_at", null);

    if (countError) {
      console.error("Error counting unread emails:", countError);
      throw countError;
    }

    console.log(`Total unread inbound emails: ${totalUnread || 0}`);

    // If there are unread emails, notify users based on their preferences
    if (totalUnread && totalUnread > 0) {
      for (const profile of profiles || []) {
        const notifType = profile.personal_notification_type || 'email';
        if (notifType === 'none') continue;

        usersWithPendingEmails.push({
          user_id: profile.id,
          notification_email: profile.personal_notification_email || '',
          full_name: profile.full_name || "Usuario",
          unread_count: totalUnread,
        });
      }
    }

    console.log(`Found ${usersWithPendingEmails.length} users with pending emails`);

    // Send reminders
    const emailResults = [];
    let smsSentCount = 0;
    let smsFailedCount = 0;

    for (const user of usersWithPendingEmails) {
      // Find the matching profile for notification preferences
      const profile = (profiles || []).find(p => p.id === user.user_id);
      const notifType = profile?.personal_notification_type || 'email';
      const notificationPhone = profile?.personal_notification_phone;
      const notificationEmail = user.notification_email;

      const shouldSendEmail = (notifType === 'email' || notifType === 'both') && notificationEmail;
      const shouldSendSms = (notifType === 'sms' || notifType === 'both') && notificationPhone;

      // Send email
      if (shouldSendEmail) {
        try {
          console.log(`Sending email reminder to ${notificationEmail} (${user.unread_count} unread emails)`);

          const appUrl = "https://conceptocasa.lovable.app";
          const inboxUrl = `${appUrl}/crm?tab=comunicaciones`;
          const dashboardUrl = `${appUrl}/dashboard`;

          const emailResponse = await resend.emails.send({
            from: "ConceptoCasa <avisos@conceptocasa.com>",
            to: [notificationEmail],
            subject: `📬 Tienes ${user.unread_count} email${user.unread_count > 1 ? "s" : ""} pendiente${user.unread_count > 1 ? "s" : ""} de leer`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f5f5f5; 
                    -webkit-text-size-adjust: 100%;
                  }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .card { 
                    background: white; 
                    border-radius: 16px; 
                    padding: 32px; 
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
                  }
                  .header { text-align: center; margin-bottom: 24px; }
                  .logo { 
                    width: 60px; 
                    height: 60px; 
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8); 
                    border-radius: 16px; 
                    display: inline-flex; 
                    align-items: center; 
                    justify-content: center; 
                    margin-bottom: 16px;
                  }
                  .logo-icon { font-size: 32px; }
                  h1 { color: #1a1a1a; font-size: 22px; margin: 0 0 8px 0; font-weight: 600; }
                  .subtitle { color: #666; font-size: 15px; margin: 0; }
                  .content { text-align: center; margin: 28px 0; }
                  .count-box {
                    background: linear-gradient(135deg, #eff6ff, #dbeafe);
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 24px;
                  }
                  .count { font-size: 56px; font-weight: 700; color: #1d4ed8; line-height: 1; }
                  .count-label { color: #3b82f6; font-size: 16px; font-weight: 500; margin-top: 8px; }
                  .button-primary { 
                    display: block; 
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8); 
                    color: white !important; 
                    padding: 18px 32px; 
                    border-radius: 12px; 
                    text-decoration: none; 
                    font-weight: 600; 
                    font-size: 17px;
                    margin: 16px 0;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                  }
                  .button-secondary { 
                    display: block; 
                    background: #f1f5f9; 
                    color: #475569 !important; 
                    padding: 14px 24px; 
                    border-radius: 10px; 
                    text-decoration: none; 
                    font-weight: 500; 
                    font-size: 15px;
                    margin: 12px 0;
                    text-align: center;
                  }
                  .quick-links { 
                    margin-top: 24px; 
                    padding-top: 20px; 
                    border-top: 1px solid #e2e8f0; 
                  }
                  .quick-links-title { 
                    font-size: 13px; 
                    color: #94a3b8; 
                    text-transform: uppercase; 
                    letter-spacing: 0.5px; 
                    margin-bottom: 12px; 
                  }
                  .quick-link { 
                    display: inline-block; 
                    background: #f8fafc; 
                    color: #64748b !important; 
                    padding: 10px 16px; 
                    border-radius: 8px; 
                    text-decoration: none; 
                    font-size: 14px;
                    margin: 4px;
                    border: 1px solid #e2e8f0;
                  }
                  .footer { 
                    text-align: center; 
                    margin-top: 28px; 
                    color: #94a3b8; 
                    font-size: 13px; 
                  }
                  .footer a { color: #64748b; }
                  
                  @media only screen and (max-width: 480px) {
                    .container { padding: 12px; }
                    .card { padding: 24px 20px; border-radius: 12px; }
                    h1 { font-size: 20px; }
                    .count { font-size: 48px; }
                    .button-primary { padding: 16px 24px; font-size: 16px; }
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="card">
                    <div class="header">
                      <div class="logo">
                        <span class="logo-icon">🏠</span>
                      </div>
                      <h1>¡Hola ${user.full_name}!</h1>
                      <p class="subtitle">Tienes correos pendientes de revisar</p>
                    </div>
                    
                    <div class="content">
                      <div class="count-box">
                        <div class="count">${user.unread_count}</div>
                        <div class="count-label">email${user.unread_count > 1 ? "s" : ""} sin leer</div>
                      </div>
                      
                      <a href="${inboxUrl}" class="button-primary">
                        📬 Abrir Bandeja de Entrada
                      </a>
                      
                      <a href="${dashboardUrl}" class="button-secondary">
                        📊 Ir al Panel Principal
                      </a>
                    </div>
                    
                    <div class="quick-links">
                      <div class="quick-links-title">Accesos rápidos</div>
                      <a href="${appUrl}/presupuestos" class="quick-link">📋 Presupuestos</a>
                      <a href="${appUrl}/agenda" class="quick-link">📅 Agenda</a>
                      <a href="${appUrl}/crm" class="quick-link">👥 CRM</a>
                    </div>
                  </div>
                  
                  <div class="footer">
                    <p>Este es un aviso automático de <strong>ConceptoCasa</strong></p>
                    <p>
                      <a href="${appUrl}/configuracion">⚙️ Configurar notificaciones</a>
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });

          emailResults.push({
            user_id: user.user_id,
            email: notificationEmail,
            success: true,
            response: emailResponse,
          });

          console.log(`Email reminder sent to ${notificationEmail}`);
        } catch (emailError: any) {
          console.error(`Error sending email to ${notificationEmail}:`, emailError);
          emailResults.push({
            user_id: user.user_id,
            email: notificationEmail,
            success: false,
            error: emailError.message,
          });
        }
      }

      // Send SMS - URL on its own line for reliable auto-linking
      if (shouldSendSms) {
        const smsMessage = `ConceptoCasa: ${user.unread_count} emails sin leer\nhttps://conceptocasa.lovable.app/crm`;
        const smsResult = await sendSmsNotification(notificationPhone, smsMessage);
        if (smsResult) {
          smsSentCount++;
          console.log(`SMS reminder sent to ${notificationPhone}`);
        } else {
          smsFailedCount++;
        }
      }
    }

    const successCount = emailResults.filter((r) => r.success).length;
    const failCount = emailResults.filter((r) => !r.success).length;

    console.log(`Reminder job completed: ${successCount} emails sent, ${failCount} failed. SMS: ${smsSentCount} sent, ${smsFailedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${usersWithPendingEmails.length} users with pending emails`,
        emailsSent: successCount,
        emailsFailed: failCount,
        smsSent: smsSentCount,
        smsFailed: smsFailedCount,
        results: emailResults,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-pending-emails-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
