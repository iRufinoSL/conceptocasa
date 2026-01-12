import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/svix@1.15.0";

// No CORS headers - this is a server-to-server webhook endpoint
const jsonHeaders = {
  "Content-Type": "application/json",
};

interface ResendEmailData {
  email_id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  created_at: string;
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
  }>;
}

interface ResendEmailContent {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  created_at: string;
}

interface ResendAttachment {
  id: string;
  filename: string;
  content_type: string;
  download_url: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("process-inbound-email function called");
  
  // Reject browser preflight requests - this is a server-to-server webhook
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }
  
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  // Verify webhook signature from Resend using Svix
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const rawBody = await req.text();
  
  if (webhookSecret) {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("Missing Svix webhook headers");
      return new Response(
        JSON.stringify({ error: "Missing webhook signature headers" }),
        { status: 401, headers: jsonHeaders }
      );
    }
    
    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
      console.log("Webhook signature verified successfully");
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid webhook signature" }),
        { status: 401, headers: jsonHeaders }
      );
    }
  } else {
    console.warn("RESEND_WEBHOOK_SECRET not configured - skipping signature verification");
  }

  try {
    // Create Supabase client with service role for webhook
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: jsonHeaders }
      );
    }

    console.log("Raw request body (first 2000 chars):", rawBody.substring(0, 2000));
    
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
      console.log("Parsed payload type:", payload.type);
      console.log("Parsed payload keys:", Object.keys(payload));
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Check if this is a Resend webhook event
    if (payload.type && typeof payload.type === 'string') {
      const eventType = payload.type;
      console.log("Received Resend webhook event:", eventType);
      
      // Only process email.received events, ignore all others
      if (eventType !== 'email.received') {
        console.log("Ignoring non-inbound event:", eventType);
        return new Response(
          JSON.stringify({ success: true, message: `Ignored event: ${eventType}` }),
          { status: 200, headers: jsonHeaders }
        );
      }
    } else {
      console.log("No event type in payload, might be direct call");
      return new Response(
        JSON.stringify({ error: "Invalid webhook format - missing type field" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // For email.received, get email_id from payload.data
    const webhookData: ResendEmailData = payload.data;
    const emailId = webhookData.email_id;
    
    if (!emailId) {
      console.error("No email_id in webhook data");
      return new Response(
        JSON.stringify({ error: "Missing email_id in webhook data" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    console.log("Processing email_id:", emailId);
    console.log("Webhook data - from:", webhookData.from, "subject:", webhookData.subject);

    // Check for duplicate emails by external_id
    const { data: existingEmail } = await supabase
      .from("email_messages")
      .select("id")
      .eq("external_id", emailId)
      .maybeSingle();
    
    if (existingEmail) {
      console.log("Duplicate email detected, skipping. Email ID:", emailId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Duplicate email, skipped",
          email_id: existingEmail.id
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // Fetch full email content from Resend API - use /receiving/ endpoint for inbound emails
    console.log("Fetching email content from Resend API (receiving endpoint)...");
    const emailContentResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    let textContent: string | null = null;
    let htmlContent: string | null = null;

    if (emailContentResponse.ok) {
      const emailContent: ResendEmailContent = await emailContentResponse.json();
      console.log("Email content fetched successfully - text length:", emailContent.text?.length || 0, "html length:", emailContent.html?.length || 0);
      textContent = emailContent.text || null;
      htmlContent = emailContent.html || null;
    } else {
      const errorText = await emailContentResponse.text();
      console.error("Failed to fetch email content from receiving endpoint:", emailContentResponse.status, errorText);
      // Continue processing even if we can't get content
    }

    // Extract sender info
    const fromField = webhookData.from || "";
    let fromEmail = fromField;
    let fromName = "";
    
    if (typeof fromField === 'string' && fromField.includes("<")) {
      const match = fromField.match(/<(.+)>/);
      fromEmail = match?.[1] || fromField;
      fromName = fromField.split("<")[0].trim().replace(/"/g, "");
    }

    console.log("Parsed from email:", fromEmail);
    console.log("Parsed from name:", fromName);

    // Try to find existing contact by email
    const { data: existingContact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("email", fromEmail)
      .maybeSingle();

    let contactId = existingContact?.id;
    console.log("Contact ID:", contactId || "not found (unknown sender)");

    // Check if this is a reply to an existing ticket
    const subjectField = webhookData.subject || "(Sin asunto)";
    const ticketMatch = subjectField.match(/\[Ticket #(\d+)\]/);
    let ticketId: string | null = null;

    if (ticketMatch) {
      const ticketNumber = parseInt(ticketMatch[1]);
      console.log("Found ticket reference:", ticketNumber);
      
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("ticket_number", ticketNumber)
        .maybeSingle();

      if (ticket) {
        ticketId = ticket.id;
        console.log("Matched to ticket:", ticketId);
      }
    }

    // Create a new ticket if none exists
    if (!ticketId) {
      console.log("Creating new ticket from inbound email...");
      
      const { data: newTicket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          subject: subjectField,
          description: textContent || htmlContent || "Email received",
          status: "open",
          priority: "medium",
          category: "Email",
          contact_id: contactId
        })
        .select()
        .single();

      if (ticketError) {
        console.error("Error creating ticket:", ticketError);
      } else {
        ticketId = newTicket.id;
        console.log("Created new ticket:", ticketId, "Number:", newTicket.ticket_number);
      }
    }

    // Store the inbound email
    console.log("Storing email with content - text length:", textContent?.length || 0, "html length:", htmlContent?.length || 0);
    
    const { data: emailRecord, error: emailError } = await supabase
      .from("email_messages")
      .insert({
        direction: "inbound",
        from_email: fromEmail,
        from_name: fromName || null,
        to_emails: webhookData.to || ["organiza@concepto.casa"],
        cc_emails: webhookData.cc || null,
        subject: subjectField,
        body_text: textContent,
        body_html: htmlContent,
        status: "received",
        external_id: emailId,
        contact_id: contactId,
        ticket_id: ticketId,
        received_at: new Date().toISOString(),
        is_read: false,
        metadata: {
          resend_email_id: emailId,
          has_attachments: (webhookData.attachments?.length || 0) > 0,
          attachment_count: webhookData.attachments?.length || 0,
          unknown_sender: !contactId,
          content_fetched: textContent !== null || htmlContent !== null
        }
      })
      .select()
      .single();

    if (emailError) {
      console.error("Error storing email:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to store email" }),
        { status: 500, headers: jsonHeaders }
      );
    }

    console.log("Email stored:", emailRecord.id);

    // Process attachments if any
    const attachmentRecords: Array<{ id: string; file_name: string; file_path: string }> = [];
    
    if (webhookData.attachments && webhookData.attachments.length > 0) {
      console.log("Processing", webhookData.attachments.length, "attachments...");
      
      // Fetch attachment details from Resend API - use /receiving/ endpoint for inbound emails
      const attachmentsResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (attachmentsResponse.ok) {
        const attachmentsData = await attachmentsResponse.json();
        const attachments: ResendAttachment[] = attachmentsData.data || [];
        console.log("Fetched attachment details:", attachments.length);

        // Ensure bucket exists
        const bucketName = "email-attachments";
        const { data: existingBucket } = await supabase.storage.getBucket(bucketName);
        
        if (!existingBucket) {
          console.log("Creating email-attachments bucket...");
          const { error: bucketError } = await supabase.storage.createBucket(bucketName, {
            public: false,
            fileSizeLimit: 25 * 1024 * 1024, // 25MB limit
          });
          if (bucketError) {
            console.error("Error creating bucket:", bucketError);
          }
        }

        for (const attachment of attachments) {
          try {
            // Download attachment from Resend
            console.log("Downloading attachment:", attachment.filename, "from:", attachment.download_url);
            
            const fileResponse = await fetch(attachment.download_url, {
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
              },
            });

            if (!fileResponse.ok) {
              console.error("Failed to download attachment:", attachment.filename, fileResponse.status);
              continue;
            }

            const fileContent = await fileResponse.arrayBuffer();
            const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `${emailRecord.id}/${Date.now()}_${sanitizedFilename}`;
            
            // Upload to storage
            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(filePath, fileContent, {
                contentType: attachment.content_type || 'application/octet-stream',
                upsert: false,
              });
            
            if (uploadError) {
              console.error("Error uploading attachment:", attachment.filename, uploadError);
              continue;
            }
            
            console.log("Uploaded attachment:", filePath);
            
            // Store attachment metadata
            const { data: attachmentRecord, error: attachmentError } = await supabase
              .from("email_attachments")
              .insert({
                email_id: emailRecord.id,
                file_name: attachment.filename,
                file_path: filePath,
                file_type: attachment.content_type,
                file_size: fileContent.byteLength,
              })
              .select()
              .single();
            
            if (attachmentError) {
              console.error("Error storing attachment metadata:", attachmentError);
            } else {
              attachmentRecords.push({
                id: attachmentRecord.id,
                file_name: attachment.filename,
                file_path: filePath,
              });
            }
          } catch (attachError) {
            console.error("Error processing attachment:", attachment.filename, attachError);
          }
        }
        
        console.log("Processed", attachmentRecords.length, "attachments successfully");
      } else {
        console.error("Failed to fetch attachments list:", attachmentsResponse.status);
      }
    }

    // Create notifications for all admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "administrador");

    if (admins && admins.length > 0) {
      const notifications = admins.map(admin => ({
        user_id: admin.user_id,
        title: "Nuevo email recibido",
        message: `De: ${fromEmail}\nAsunto: ${subjectField}`,
        type: "email",
        email_id: emailRecord.id,
        ticket_id: ticketId,
        action_url: ticketId ? `/tickets/${ticketId}` : undefined
      }));

      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Error creating notifications:", notifError);
      } else {
        console.log("Created notifications for", admins.length, "admins");
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: emailRecord.id,
        ticket_id: ticketId,
        contact_id: contactId,
        attachments_saved: attachmentRecords.length,
        content_fetched: textContent !== null || htmlContent !== null
      }),
      { status: 200, headers: jsonHeaders }
    );

  } catch (error: any) {
    console.error("Error in process-inbound-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: jsonHeaders }
    );
  }
};

serve(handler);
