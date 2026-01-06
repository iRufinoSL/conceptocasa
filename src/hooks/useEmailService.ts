import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  body_html?: string;
  body_text?: string;
  from_name?: string;
  cc?: string[];
  bcc?: string[];
  contact_id?: string;
  ticket_id?: string;
  create_ticket?: boolean;
  ticket_subject?: string;
  ticket_priority?: string;
  ticket_category?: string;
}

interface SendEmailResult {
  success: boolean;
  message_id?: string;
  email_id?: string;
  ticket_id?: string;
  error?: string;
}

export function useEmailService() {
  const [sending, setSending] = useState(false);

  const sendEmail = async (params: SendEmailParams): Promise<SendEmailResult> => {
    setSending(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: params
      });

      if (error) {
        console.error("Error sending email:", error);
        toast.error("Error al enviar email: " + error.message);
        return { success: false, error: error.message };
      }

      if (data.error) {
        console.error("Email service error:", data.error);
        toast.error("Error al enviar email: " + data.error);
        return { success: false, error: data.error };
      }

      toast.success("Email enviado correctamente");
      return {
        success: true,
        message_id: data.message_id,
        email_id: data.email_id,
        ticket_id: data.ticket_id
      };

    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error("Error al enviar email");
      return { success: false, error: error.message };
    } finally {
      setSending(false);
    }
  };

  return {
    sendEmail,
    sending
  };
}
