import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY no configurada" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify user is admin
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check admin role
  const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Solo administradores pueden sincronizar emails" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const sinceDate = body.since || "2026-02-01T00:00:00Z";

  console.log("Starting email sync since:", sinceDate);

  const results = { sent_synced: 0, received_synced: 0, sent_skipped: 0, received_skipped: 0, errors: [] as string[] };

  // ---- SYNC SENT EMAILS ----
  try {
    let hasMore = true;
    let afterCursor: string | undefined;
    let sentTotal = 0;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100" });
      if (afterCursor) params.set("after", afterCursor);

      const res = await fetch(`https://api.resend.com/emails?${params}`, {
        headers: { Authorization: `Bearer ${resendApiKey}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend list emails error:", res.status, errText);
        results.errors.push(`Error listando emails enviados: ${res.status}`);
        break;
      }

      const data = await res.json();
      const emails = data.data || [];
      hasMore = data.has_more === true;

      if (emails.length === 0) break;
      afterCursor = emails[emails.length - 1].id;

      for (const email of emails) {
        // Stop if email is older than sinceDate
        const emailDate = new Date(email.created_at);
        if (emailDate < new Date(sinceDate)) {
          hasMore = false;
          break;
        }

        sentTotal++;

        // Check if already exists
        const { data: existing } = await supabase
          .from("email_messages")
          .select("id")
          .eq("external_id", email.id)
          .maybeSingle();

        if (existing) {
          results.sent_skipped++;
          continue;
        }

        // Extract from info
        let fromEmail = email.from || "";
        let fromName = "";
        if (typeof fromEmail === "string" && fromEmail.includes("<")) {
          const match = fromEmail.match(/<(.+)>/);
          fromName = fromEmail.split("<")[0].trim().replace(/"/g, "");
          fromEmail = match?.[1] || fromEmail;
        }

        // Fetch full email content
        let bodyText: string | null = null;
        let bodyHtml: string | null = null;
        try {
          const contentRes = await fetch(`https://api.resend.com/emails/${email.id}`, {
            headers: { Authorization: `Bearer ${resendApiKey}` },
          });
          if (contentRes.ok) {
            const content = await contentRes.json();
            bodyText = content.text || null;
            bodyHtml = content.html || null;
          } else {
            await contentRes.text(); // consume
          }
        } catch (e) {
          console.error("Error fetching sent email content:", email.id, e);
        }

        // Try to find contact
        const toEmails = Array.isArray(email.to) ? email.to : [email.to];
        let contactId: string | null = null;
        if (toEmails.length > 0) {
          const { data: contact } = await supabase
            .from("crm_contacts")
            .select("id")
            .eq("email", toEmails[0])
            .maybeSingle();
          contactId = contact?.id || null;
        }

        const { error: insertError } = await supabase.from("email_messages").insert({
          direction: "outbound",
          from_email: fromEmail,
          from_name: fromName || null,
          to_emails: toEmails,
          cc_emails: email.cc || null,
          bcc_emails: email.bcc || null,
          subject: email.subject || "(Sin asunto)",
          body_text: bodyText,
          body_html: bodyHtml,
          status: "sent",
          external_id: email.id,
          contact_id: contactId,
          sent_at: email.created_at,
          received_at: null,
          is_read: true,
          metadata: { synced_from_resend: true, sync_date: new Date().toISOString() },
        });

        if (insertError) {
          console.error("Error inserting sent email:", insertError);
          results.errors.push(`Error insertando email enviado ${email.id}: ${insertError.message}`);
        } else {
          results.sent_synced++;
        }
      }

      console.log(`Sent emails processed: ${sentTotal}, synced: ${results.sent_synced}, skipped: ${results.sent_skipped}`);
    }
  } catch (e) {
    console.error("Error syncing sent emails:", e);
    results.errors.push(`Error general enviados: ${e.message}`);
  }

  // ---- SYNC RECEIVED EMAILS ----
  try {
    let hasMore = true;
    let afterCursor: string | undefined;
    let receivedTotal = 0;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100" });
      if (afterCursor) params.set("after", afterCursor);

      const res = await fetch(`https://api.resend.com/emails/receiving?${params}`, {
        headers: { Authorization: `Bearer ${resendApiKey}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend list receiving emails error:", res.status, errText);
        results.errors.push(`Error listando emails recibidos: ${res.status}`);
        break;
      }

      const data = await res.json();
      const emails = data.data || [];
      hasMore = data.has_more === true;

      if (emails.length === 0) break;
      afterCursor = emails[emails.length - 1].id;

      for (const email of emails) {
        const emailDate = new Date(email.created_at);
        if (emailDate < new Date(sinceDate)) {
          hasMore = false;
          break;
        }

        receivedTotal++;

        // Check if already exists
        const { data: existing } = await supabase
          .from("email_messages")
          .select("id")
          .or(`external_id.eq.${email.id},metadata->>resend_email_id.eq.${email.id}`)
          .maybeSingle();

        if (existing) {
          results.received_skipped++;
          continue;
        }

        // Ignore system emails
        const fromField = email.from || "";
        let fromEmail = fromField;
        let fromName = "";
        if (typeof fromField === "string" && fromField.includes("<")) {
          const match = fromField.match(/<(.+)>/);
          fromName = fromField.split("<")[0].trim().replace(/"/g, "");
          fromEmail = match?.[1] || fromField;
        }

        const systemDomains = ["concepto.casa", "resend.dev"];
        if (systemDomains.some((d) => fromEmail.toLowerCase().includes(d))) {
          results.received_skipped++;
          continue;
        }

        // Fetch full content
        let bodyText: string | null = null;
        let bodyHtml: string | null = null;
        try {
          const contentRes = await fetch(`https://api.resend.com/emails/receiving/${email.id}`, {
            headers: { Authorization: `Bearer ${resendApiKey}` },
          });
          if (contentRes.ok) {
            const content = await contentRes.json();
            bodyText = content.text || null;
            bodyHtml = content.html || null;
          } else {
            await contentRes.text();
          }
        } catch (e) {
          console.error("Error fetching received email content:", email.id, e);
        }

        // Find contact
        let contactId: string | null = null;
        const { data: contact } = await supabase
          .from("crm_contacts")
          .select("id")
          .eq("email", fromEmail)
          .maybeSingle();
        contactId = contact?.id || null;

        const subjectField = email.subject || "(Sin asunto)";

        // Create ticket
        let ticketId: string | null = null;
        const ticketMatch = subjectField.match(/\[Ticket #(\d+)\]/);
        if (ticketMatch) {
          const { data: ticket } = await supabase
            .from("tickets")
            .select("id")
            .eq("ticket_number", parseInt(ticketMatch[1]))
            .maybeSingle();
          ticketId = ticket?.id || null;
        }

        if (!ticketId) {
          const { data: newTicket } = await supabase
            .from("tickets")
            .insert({
              subject: subjectField,
              description: bodyText || bodyHtml || "Email received (sync)",
              status: "open",
              priority: "medium",
              category: "Email",
              contact_id: contactId,
            })
            .select("id")
            .single();
          ticketId = newTicket?.id || null;
        }

        const { error: insertError } = await supabase.from("email_messages").insert({
          direction: "inbound",
          from_email: fromEmail,
          from_name: fromName || null,
          to_emails: email.to || ["organiza@concepto.casa"],
          cc_emails: email.cc || null,
          subject: subjectField,
          body_text: bodyText,
          body_html: bodyHtml,
          status: "received",
          external_id: email.id,
          contact_id: contactId,
          ticket_id: ticketId,
          received_at: email.created_at,
          is_read: false,
          metadata: {
            resend_email_id: email.id,
            synced_from_resend: true,
            sync_date: new Date().toISOString(),
            unknown_sender: !contactId,
          },
        });

        if (insertError) {
          console.error("Error inserting received email:", insertError);
          results.errors.push(`Error insertando email recibido ${email.id}: ${insertError.message}`);
        } else {
          results.received_synced++;
        }
      }

      console.log(`Received emails processed: ${receivedTotal}, synced: ${results.received_synced}, skipped: ${results.received_skipped}`);
    }
  } catch (e) {
    console.error("Error syncing received emails:", e);
    results.errors.push(`Error general recibidos: ${e.message}`);
  }

  console.log("Sync complete:", JSON.stringify(results));

  return new Response(JSON.stringify({ success: true, ...results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
