import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailWithDeadline {
  id: string;
  subject: string;
  to_emails: string[];
  response_deadline: string;
  created_by: string;
  budget_id: string | null;
}

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  personal_notification_email: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("check-email-deadlines function called");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    console.log("Checking for emails with passed deadlines at:", now.toISOString());

    // Find emails with deadlines that have passed but haven't been notified yet
    const { data: overdueEmails, error: emailsError } = await supabase
      .from("email_messages")
      .select("id, subject, to_emails, response_deadline, created_by, budget_id")
      .eq("direction", "outbound")
      .eq("response_received", false)
      .is("reminder_sent_at", null)
      .not("response_deadline", "is", null)
      .lte("response_deadline", now.toISOString())
      .order("response_deadline", { ascending: true });

    if (emailsError) {
      console.error("Error fetching overdue emails:", emailsError);
      return new Response(
        JSON.stringify({ error: emailsError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!overdueEmails || overdueEmails.length === 0) {
      console.log("No overdue emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No overdue emails", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${overdueEmails.length} overdue emails`);

    // Get unique user IDs who sent these emails
    const userIds = [...new Set(overdueEmails.map(e => e.created_by).filter(Boolean))];

    // Get profiles for these users
    const { data: userProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name, personal_notification_email, personal_notification_phone, personal_notification_type")
      .in("id", userIds);

    if (profilesError) {
      console.error("Error fetching user profiles:", profilesError);
    }

    const profileMap = new Map<string, any>();
    userProfiles?.forEach((p: any) => profileMap.set(p.id, p));

    // Also notify all admins
    const { data: adminUsers, error: adminError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "administrador");

    if (adminError) {
      console.error("Error fetching admin users:", adminError);
    }

    const adminIds = adminUsers?.map(a => a.user_id) || [];
    
    // Get admin profiles
    if (adminIds.length > 0) {
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, personal_notification_email, personal_notification_phone, personal_notification_type")
        .in("id", adminIds);
      
      adminProfiles?.forEach((p: any) => {
        if (!profileMap.has(p.id)) {
          profileMap.set(p.id, p);
        }
      });
    }

    // Bird API for SMS
    const birdApiKey = Deno.env.get('BIRD_API_KEY');
    const birdSenderPhone = Deno.env.get('BIRD_SENDER_PHONE');

    async function sendSmsNotification(toPhone: string, message: string) {
      if (!birdApiKey) {
        console.error('BIRD_API_KEY not configured, skipping SMS');
        return false;
      }

      const { data: compSettings } = await supabase
        .from('company_settings')
        .select('sms_sender_phone, whatsapp_phone')
        .single();

      const fromPhone = compSettings?.sms_sender_phone || birdSenderPhone || compSettings?.whatsapp_phone;
      if (!fromPhone) {
        console.error('No SMS sender phone configured');
        return false;
      }

      let normalizedFrom = fromPhone.replace(/\s+/g, '');
      if (!normalizedFrom.startsWith('+')) normalizedFrom = '+' + normalizedFrom;
      let normalizedTo = toPhone.replace(/\s+/g, '');
      if (!normalizedTo.startsWith('+')) normalizedTo = '+' + normalizedTo;

      try {
        const response = await fetch('https://api.bird.com/v2/send', {
          method: 'POST',
          headers: {
            'Authorization': `AccessKey ${birdApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            originator: normalizedFrom,
            recipients: [normalizedTo],
            body: message,
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

    // Group emails by user to send consolidated notifications
    const emailsByUser = new Map<string, EmailWithDeadline[]>();
    overdueEmails.forEach((email: EmailWithDeadline) => {
      const userId = email.created_by;
      if (!emailsByUser.has(userId)) {
        emailsByUser.set(userId, []);
      }
      emailsByUser.get(userId)!.push(email);
    });

    // Also add all overdue emails to admin lists
    adminIds.forEach(adminId => {
      if (!emailsByUser.has(adminId)) {
        emailsByUser.set(adminId, [...overdueEmails]);
      }
    });

    let notificationsSent = 0;
    let smsSentCount = 0;
    const emailsToMarkNotified: string[] = [];

    // Send notifications
    for (const [userId, emails] of emailsByUser) {
      const profile = profileMap.get(userId);
      if (!profile) continue;

      const notificationEmail = profile.personal_notification_email || profile.email;
      const notificationPhone = profile.personal_notification_phone;
      const notifType = profile.personal_notification_type || 'email';

      if (notifType === 'none') continue;

      const shouldSendEmail = (notifType === 'email' || notifType === 'both') && notificationEmail;
      const shouldSendSms = (notifType === 'sms' || notifType === 'both') && notificationPhone;

      // Build email list HTML
      const emailListHtml = emails.map((email: EmailWithDeadline) => {
        const deadline = new Date(email.response_deadline);
        const hoursOverdue = Math.round((now.getTime() - deadline.getTime()) / (1000 * 60 * 60));
        const destinatario = email.to_emails?.[0] || 'Desconocido';
        
        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; max-width: 250px;">
              <strong>${email.subject || 'Sin asunto'}</strong><br>
              <span style="color: #666; font-size: 13px;">Para: ${destinatario}</span>
            </td>
            <td style="padding: 12px; color: #dc2626; text-align: right;">
              Vencido hace ${hoursOverdue}h
            </td>
          </tr>
        `;
      }).join('');

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">⏰ Emails Pendientes de Respuesta</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Tienes ${emails.length} email(s) que necesitan respuesta</p>
          </div>
          
          <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${emailListHtml}
            </table>
            
            <div style="margin-top: 24px; text-align: center;">
              <a href="https://conceptocasa.lovable.app/crm" 
                 style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Ver en CRM
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 20px;">
              Este es un recordatorio automático del sistema de seguimiento de emails.
            </p>
          </div>
        </body>
        </html>
      `;

      // Send email
      if (shouldSendEmail) {
        try {
          const result = await resend.emails.send({
            from: "Concepto Casa <organiza@concepto.casa>",
            to: [notificationEmail],
            subject: `⏰ ${emails.length} email(s) pendientes de respuesta`,
            html: emailHtml,
          });

          if (!result.error) {
            notificationsSent++;
            console.log(`Email notification sent to ${notificationEmail}`);
            
            if (userId === emails[0]?.created_by) {
              emails.forEach((email: EmailWithDeadline) => emailsToMarkNotified.push(email.id));
            }
          } else {
            console.error(`Failed to send email to ${notificationEmail}:`, result.error);
          }
        } catch (err) {
          console.error(`Error sending email to ${notificationEmail}:`, err);
        }
      }

      // Send SMS
      if (shouldSendSms) {
        const smsMessage = `ConceptoCasa: Tienes ${emails.length} email(s) pendientes de respuesta. Ver CRM: https://conceptocasa.lovable.app/crm`;
        const smsResult = await sendSmsNotification(notificationPhone, smsMessage);
        if (smsResult) {
          smsSentCount++;
          console.log(`SMS notification sent to ${notificationPhone}`);
        }
        
        // Also mark as notified if email wasn't sent
        if (!shouldSendEmail && userId === emails[0]?.created_by) {
          emails.forEach((email: EmailWithDeadline) => emailsToMarkNotified.push(email.id));
        }
      }
    }

    // Mark emails as notified
    if (emailsToMarkNotified.length > 0) {
      const { error: updateError } = await supabase
        .from("email_messages")
        .update({ reminder_sent_at: now.toISOString() })
        .in("id", emailsToMarkNotified);

      if (updateError) {
        console.error("Error marking emails as notified:", updateError);
      } else {
        console.log(`Marked ${emailsToMarkNotified.length} emails as notified`);
      }
    }

    // Create system alerts for each overdue email
    for (const email of overdueEmails) {
      const destinatario = email.to_emails?.[0] || 'Desconocido';
      
      // Check if alert already exists
      const { data: existingAlert } = await supabase
        .from("system_alerts")
        .select("id")
        .eq("alert_type", "email_deadline")
        .eq("metadata->>email_id", email.id)
        .maybeSingle();

      if (!existingAlert) {
        await supabase.from("system_alerts").insert({
          alert_type: "email_deadline",
          title: "Email pendiente de respuesta",
          message: `El email "${email.subject || 'Sin asunto'}" enviado a ${destinatario} ha superado el plazo de respuesta.`,
          action_url: "/crm",
          priority: "high",
          metadata: { email_id: email.id, budget_id: email.budget_id },
        });
      }
    }

    console.log(`Process complete: ${notificationsSent} email notifications, ${smsSentCount} SMS sent, ${overdueEmails.length} alerts created`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        overdueEmails: overdueEmails.length,
        notificationsSent,
        smsSent: smsSentCount,
        alertsCreated: overdueEmails.length
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in check-email-deadlines:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
