import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate a random 6-digit OTP code
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize phone number to E.164 format
function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, assume Spain (+34)
  if (!cleaned.startsWith('+')) {
    // If it starts with 00, replace with +
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    } else {
      cleaned = '+34' + cleaned;
    }
  }
  
  return cleaned;
}

interface Send2FARequest {
  userId: string;
  phoneNumber: string;
}

interface Verify2FARequest {
  userId: string;
  code: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const birdApiKey = Deno.env.get("BIRD_API_KEY");

    if (!birdApiKey) {
      console.error("BIRD_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "SMS service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    if (action === 'send' && req.method === 'POST') {
      // SEND OTP CODE
      const { userId, phoneNumber }: Send2FARequest = await req.json();

      if (!userId || !phoneNumber) {
        return new Response(
          JSON.stringify({ error: "Missing userId or phoneNumber" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedPhone = normalizePhone(phoneNumber);
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      console.log(`[2FA] Generating OTP for user ${userId}, phone ${normalizedPhone.substring(0, 6)}...`);

      // Delete any existing unused OTP codes for this user
      await supabase
        .from('auth_otp_codes')
        .delete()
        .eq('user_id', userId)
        .is('verified_at', null);

      // Store the new OTP code
      const { error: insertError } = await supabase
        .from('auth_otp_codes')
        .insert({
          user_id: userId,
          phone_number: normalizedPhone,
          code: otpCode,
          expires_at: expiresAt.toISOString()
        });

      if (insertError) {
        console.error("[2FA] Error storing OTP code:", insertError);
        return new Response(
          JSON.stringify({ error: "Error generating verification code" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get company settings for sender phone
      const { data: settings } = await supabase
        .from('company_settings')
        .select('sms_sender_phone')
        .single();

      const senderPhone = settings?.sms_sender_phone || '+34600000000';

      // Send SMS via Bird API
      console.log(`[2FA] Sending SMS to ${normalizedPhone.substring(0, 6)}...`);

      const smsResponse = await fetch('https://rest.messagebird.com/messages', {
        method: 'POST',
        headers: {
          'Authorization': `AccessKey ${birdApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          originator: senderPhone.replace(/[^\d]/g, '').substring(0, 11), // Max 11 chars for originator
          recipients: [normalizedPhone.replace('+', '')],
          body: `Tu código de verificación de Concepto.Casa es: ${otpCode}. Válido por 5 minutos.`
        })
      });

      if (!smsResponse.ok) {
        const errorBody = await smsResponse.text();
        console.error(`[2FA] Bird API error: ${smsResponse.status} - ${errorBody}`);
        
        // Still return success to not reveal if phone is valid
        // The code is stored, user can try again
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Verification code sent",
            expiresIn: 300 // 5 minutes in seconds
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const smsResult = await smsResponse.json();
      console.log("[2FA] SMS sent successfully:", smsResult.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Verification code sent",
          expiresIn: 300
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === 'verify' && req.method === 'POST') {
      // VERIFY OTP CODE
      const { userId, code }: Verify2FARequest = await req.json();

      if (!userId || !code) {
        return new Response(
          JSON.stringify({ error: "Missing userId or code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[2FA] Verifying code for user ${userId}`);

      // Get the latest valid OTP for this user
      const { data: otpRecord, error: fetchError } = await supabase
        .from('auth_otp_codes')
        .select('*')
        .eq('user_id', userId)
        .is('verified_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !otpRecord) {
        console.log("[2FA] No valid OTP found for user");
        return new Response(
          JSON.stringify({ success: false, error: "Código expirado o inválido. Solicita uno nuevo." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check attempts (max 5)
      if (otpRecord.attempts >= 5) {
        // Delete the OTP to force new request
        await supabase
          .from('auth_otp_codes')
          .delete()
          .eq('id', otpRecord.id);

        return new Response(
          JSON.stringify({ success: false, error: "Demasiados intentos. Solicita un nuevo código." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Increment attempts
      await supabase
        .from('auth_otp_codes')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id);

      // Verify the code
      if (otpRecord.code !== code) {
        console.log("[2FA] Invalid code provided");
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Código incorrecto", 
            attemptsRemaining: 4 - otpRecord.attempts 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as verified
      await supabase
        .from('auth_otp_codes')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', otpRecord.id);

      console.log("[2FA] Code verified successfully");

      return new Response(
        JSON.stringify({ success: true, message: "Code verified successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use /send or /verify" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("[2FA] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
