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
    console.log("Starting pending emails reminder job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with their notification email preferences
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email, personal_notification_email")
      .not("personal_notification_email", "is", null);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    console.log(`Found ${profiles?.length || 0} users with notification email configured`);

    const usersWithPendingEmails: UserWithPendingEmails[] = [];

    // For each user, check if they have unread emails
    for (const profile of profiles || []) {
      // Count unread emails for this user
      const { count, error: countError } = await supabase
        .from("email_messages")
        .select("*", { count: "exact", head: true })
        .eq("direction", "inbound")
        .eq("is_read", false)
        .is("deleted_at", null);

      if (countError) {
        console.error(`Error counting emails for user ${profile.id}:`, countError);
        continue;
      }

      if (count && count > 0) {
        usersWithPendingEmails.push({
          user_id: profile.id,
          notification_email: profile.personal_notification_email,
          full_name: profile.full_name || "Usuario",
          unread_count: count,
        });
      }
    }

    console.log(`Found ${usersWithPendingEmails.length} users with pending emails`);

    // Send reminder emails
    const emailResults = [];
    for (const user of usersWithPendingEmails) {
      try {
        console.log(`Sending reminder to ${user.notification_email} (${user.unread_count} unread emails)`);

        const emailResponse = await resend.emails.send({
          from: "ConceptoCasa <avisos@conceptocasa.com>",
          to: [user.notification_email],
          subject: `📬 Tienes ${user.unread_count} email${user.unread_count > 1 ? "s" : ""} pendiente${user.unread_count > 1 ? "s" : ""} de abrir`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .header { text-align: center; margin-bottom: 24px; }
                .icon { font-size: 48px; margin-bottom: 16px; }
                h1 { color: #1a1a1a; font-size: 24px; margin: 0 0 8px 0; }
                .subtitle { color: #666; font-size: 14px; margin: 0; }
                .content { text-align: center; margin: 24px 0; }
                .count { font-size: 48px; font-weight: bold; color: #3b82f6; }
                .count-label { color: #666; font-size: 14px; }
                .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px; }
                .button:hover { background: #2563eb; }
                .footer { text-align: center; margin-top: 24px; color: #999; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="card">
                  <div class="header">
                    <div class="icon">📬</div>
                    <h1>¡Hola ${user.full_name}!</h1>
                    <p class="subtitle">Tienes emails pendientes de revisar</p>
                  </div>
                  <div class="content">
                    <div class="count">${user.unread_count}</div>
                    <div class="count-label">email${user.unread_count > 1 ? "s" : ""} sin leer</div>
                    <a href="https://conceptocasa.lovable.app/crm?tab=comunicaciones" class="button">
                      Ver Bandeja de Entrada
                    </a>
                  </div>
                </div>
                <div class="footer">
                  <p>Este es un recordatorio automático de ConceptoCasa.</p>
                  <p>Puedes configurar tus preferencias de notificación en tu perfil.</p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        emailResults.push({
          user_id: user.user_id,
          email: user.notification_email,
          success: true,
          response: emailResponse,
        });

        console.log(`Reminder sent successfully to ${user.notification_email}`);
      } catch (emailError: any) {
        console.error(`Error sending reminder to ${user.notification_email}:`, emailError);
        emailResults.push({
          user_id: user.user_id,
          email: user.notification_email,
          success: false,
          error: emailError.message,
        });
      }
    }

    const successCount = emailResults.filter((r) => r.success).length;
    const failCount = emailResults.filter((r) => !r.success).length;

    console.log(`Reminder job completed: ${successCount} sent, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${usersWithPendingEmails.length} users with pending emails`,
        sent: successCount,
        failed: failCount,
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
