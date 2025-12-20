import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendCredentialsRequest {
  userEmail: string;
  userName: string;
  tempPassword: string;
  loginUrl: string;
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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .rpc('has_role', { _role: 'administrador', _user_id: user.id });

    if (roleError || !roleData) {
      console.error("Role check failed:", roleError);
      return new Response(
        JSON.stringify({ error: "No tienes permisos de administrador" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { userEmail, userName, tempPassword, loginUrl }: SendCredentialsRequest = await req.json();

    // Validate required fields
    if (!userEmail || !userName || !tempPassword || !loginUrl) {
      return new Response(
        JSON.stringify({ error: "Faltan campos obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Escape user inputs
    const safeName = escapeHtml(userName);
    const safeEmail = escapeHtml(userEmail);
    const safeLoginUrl = escapeHtml(loginUrl);

    console.log(`Sending credentials email to: ${userEmail}`);

    // Send credentials email
    const emailResponse = await resend.emails.send({
      from: "Concepto.Casa <onboarding@resend.dev>",
      to: [userEmail],
      subject: "Bienvenido/a a Concepto.Casa - Tus credenciales de acceso",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">¡Bienvenido/a a Concepto.Casa!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px;">Hola <strong>${safeName}</strong>,</p>
            
            <p style="font-size: 16px;">Se ha creado una cuenta para ti en nuestra plataforma. A continuación encontrarás tus credenciales de acceso:</p>
            
            <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>📧 Email:</strong></p>
              <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; margin: 0 0 15px 0;">${safeEmail}</p>
              
              <p style="margin: 0 0 10px 0;"><strong>🔐 Contraseña temporal:</strong></p>
              <p style="background: #fef3c7; padding: 10px; border-radius: 4px; font-family: monospace; margin: 0; border: 1px solid #f59e0b;">${escapeHtml(tempPassword)}</p>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404;">
                <strong>⚠️ Importante:</strong> Por seguridad, te recomendamos cambiar tu contraseña después de iniciar sesión por primera vez.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${safeLoginUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Iniciar Sesión
              </a>
            </div>
            
            <p style="font-size: 14px; color: #6b7280;">Si no puedes hacer clic en el botón, copia y pega este enlace en tu navegador:</p>
            <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">${safeLoginUrl}</p>
          </div>
          
          <div style="background: #1f2937; padding: 20px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="color: #9ca3af; margin: 0; font-size: 14px;">
              Saludos cordiales,<br />
              <strong style="color: white;">El equipo de Concepto.Casa</strong>
            </p>
            <p style="color: #6b7280; margin: 10px 0 0 0; font-size: 12px;">
              Este email fue enviado automáticamente. Por favor, no respondas a este mensaje.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Credentials email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Email enviado correctamente" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-user-credentials function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al enviar el email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
