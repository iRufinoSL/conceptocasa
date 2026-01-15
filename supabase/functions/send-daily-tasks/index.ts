import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Task {
  id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  task_status: string | null;
  budget_id: string | null;
  budget_name?: string | null;
  activity_name?: string | null;
  contacts?: { name: string; surname: string | null }[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-daily-tasks function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`Fetching pending tasks for date: ${todayStr}`);

    // Fetch tasks from budget_tasks table (new model)
    const { data: budgetTasksData, error: budgetTasksError } = await supabase
      .from('budget_tasks')
      .select(`
        id,
        name,
        description,
        target_date,
        start_date,
        start_time,
        end_time,
        status,
        budget_id,
        activity_id
      `)
      .eq('status', 'pendiente')
      .or(`target_date.eq.${todayStr},start_date.eq.${todayStr}`);

    if (budgetTasksError) {
      console.error('Error fetching budget_tasks:', budgetTasksError);
    }

    // Fetch tasks from budget_activity_resources (old model, resource_type = 'Tarea')
    const { data: resourceTasksData, error: resourceTasksError } = await supabase
      .from('budget_activity_resources')
      .select(`
        id,
        name,
        description,
        start_date,
        task_status,
        budget_id,
        activity_id
      `)
      .eq('resource_type', 'Tarea')
      .eq('task_status', 'pendiente')
      .eq('start_date', todayStr);

    if (resourceTasksError) {
      console.error('Error fetching resource tasks:', resourceTasksError);
    }

    // Combine tasks
    const allTasks: Task[] = [];

    // Process budget_tasks
    for (const task of budgetTasksData || []) {
      let budgetName = null;
      let activityName = null;
      let contacts: { name: string; surname: string | null }[] = [];

      if (task.budget_id) {
        const { data: budget } = await supabase
          .from('presupuestos')
          .select('nombre')
          .eq('id', task.budget_id)
          .single();
        budgetName = budget?.nombre;
      }

      if (task.activity_id) {
        const { data: activity } = await supabase
          .from('budget_activities')
          .select('name')
          .eq('id', task.activity_id)
          .single();
        activityName = activity?.name;
      }

      // Get contacts for this task
      const { data: taskContacts } = await supabase
        .from('budget_task_contacts')
        .select('contact:crm_contacts(name, surname)')
        .eq('task_id', task.id);
      
      if (taskContacts) {
        contacts = taskContacts.map((tc: any) => ({
          name: tc.contact?.name || '',
          surname: tc.contact?.surname || null
        }));
      }

      allTasks.push({
        ...task,
        task_status: null,
        budget_name: budgetName,
        activity_name: activityName,
        contacts
      });
    }

    // Process resource tasks
    for (const task of resourceTasksData || []) {
      let budgetName = null;
      let activityName = null;
      let contacts: { name: string; surname: string | null }[] = [];

      if (task.budget_id) {
        const { data: budget } = await supabase
          .from('presupuestos')
          .select('nombre')
          .eq('id', task.budget_id)
          .single();
        budgetName = budget?.nombre;
      }

      if (task.activity_id) {
        const { data: activity } = await supabase
          .from('budget_activities')
          .select('name')
          .eq('id', task.activity_id)
          .single();
        activityName = activity?.name;
      }

      // Get contacts for this resource
      const { data: resourceContacts } = await supabase
        .from('budget_resource_contacts')
        .select('contact:crm_contacts(name, surname)')
        .eq('resource_id', task.id);
      
      if (resourceContacts) {
        contacts = resourceContacts.map((rc: any) => ({
          name: rc.contact?.name || '',
          surname: rc.contact?.surname || null
        }));
      }

      allTasks.push({
        id: task.id,
        name: task.name,
        description: task.description,
        target_date: task.start_date,
        start_date: task.start_date,
        start_time: null,
        end_time: null,
        status: 'pendiente',
        task_status: task.task_status,
        budget_id: task.budget_id,
        budget_name: budgetName,
        activity_name: activityName,
        contacts
      });
    }

    console.log(`Found ${allTasks.length} pending tasks for today`);

    if (allTasks.length === 0) {
      console.log('No pending tasks for today, skipping email');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending tasks for today' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Sort tasks by time (tasks with time first)
    allTasks.sort((a, b) => {
      if (a.start_time && !b.start_time) return -1;
      if (!a.start_time && b.start_time) return 1;
      if (a.start_time && b.start_time) {
        return a.start_time.localeCompare(b.start_time);
      }
      return 0;
    });

    // Build HTML email
    const appUrl = "https://conceptocasa.lovable.app";
    const formattedDate = today.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Separate tasks with and without time
    const tasksWithTime = allTasks.filter(t => t.start_time);
    const tasksWithoutTime = allTasks.filter(t => !t.start_time);

    let tasksHtml = '';

    if (tasksWithTime.length > 0) {
      tasksHtml += `
        <h3 style="color: #1e3a5f; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
          🕐 Tareas con hora programada
        </h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Hora</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Tarea</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Presupuesto</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Contactos</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const task of tasksWithTime) {
        const timeRange = task.end_time 
          ? `${task.start_time?.slice(0, 5)} - ${task.end_time.slice(0, 5)}`
          : task.start_time?.slice(0, 5) || '';
        
        const contactsStr = task.contacts?.map(c => 
          c.surname ? `${c.name} ${c.surname}` : c.name
        ).join(', ') || '-';

        const taskUrl = task.budget_id 
          ? `${appUrl}/presupuestos/${task.budget_id}?tab=agenda&task=${task.id}`
          : `${appUrl}/agenda?task=${task.id}`;

        tasksHtml += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; font-weight: bold; color: #2563eb;">${timeRange}</td>
            <td style="padding: 10px;">
              <a href="${taskUrl}" style="color: #1e3a5f; text-decoration: none; font-weight: 500;">
                ${task.name}
              </a>
              ${task.description ? `<br><span style="color: #666; font-size: 12px;">${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}</span>` : ''}
            </td>
            <td style="padding: 10px;">${task.budget_name || '-'}</td>
            <td style="padding: 10px; color: #666;">${contactsStr}</td>
          </tr>
        `;
      }
      tasksHtml += '</tbody></table>';
    }

    if (tasksWithoutTime.length > 0) {
      tasksHtml += `
        <h3 style="color: #1e3a5f; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
          📋 Tareas del día
        </h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
      `;

      for (const task of tasksWithoutTime) {
        const contactsStr = task.contacts?.map(c => 
          c.surname ? `${c.name} ${c.surname}` : c.name
        ).join(', ');

        const taskUrl = task.budget_id 
          ? `${appUrl}/presupuestos/${task.budget_id}?tab=agenda&task=${task.id}`
          : `${appUrl}/agenda?task=${task.id}`;

        tasksHtml += `
          <li style="padding: 12px; margin-bottom: 8px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #2563eb;">
            <a href="${taskUrl}" style="color: #1e3a5f; text-decoration: none; font-weight: 500; font-size: 15px;">
              ${task.name}
            </a>
            ${task.description ? `<p style="margin: 4px 0 0 0; color: #666; font-size: 13px;">${task.description.substring(0, 150)}${task.description.length > 150 ? '...' : ''}</p>` : ''}
            <div style="margin-top: 6px; font-size: 12px; color: #888;">
              ${task.budget_name ? `<span>📁 ${task.budget_name}</span>` : ''}
              ${task.activity_name ? ` · <span>${task.activity_name}</span>` : ''}
              ${contactsStr ? ` · <span>👤 ${contactsStr}</span>` : ''}
            </div>
          </li>
        `;
      }
      tasksHtml += '</ul>';
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #1e3a5f; margin: 0 0 8px 0; font-size: 24px;">
              📋 Tareas Pendientes
            </h1>
            <p style="color: #666; margin: 0; font-size: 14px;">
              ${formattedDate}
            </p>
          </div>

          <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; color: #2563eb;">${allTasks.length}</span>
            <span style="color: #1e40af; margin-left: 8px;">tareas pendientes para hoy</span>
          </div>

          ${tasksHtml}

          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
            <a href="${appUrl}/agenda" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Ver Agenda Completa
            </a>
          </div>

          <p style="color: #999; font-size: 11px; text-align: center; margin-top: 24px;">
            Este email se envía automáticamente desde Concepto Casa.<br>
            <a href="${appUrl}" style="color: #2563eb;">conceptocasa.lovable.app</a>
          </p>
        </div>
      </body>
      </html>
    `;

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Concepto Casa <noreply@concepto.casa>",
      to: ["organiza@concepto.casa"],
      subject: `📋 Tareas pendientes para hoy (${allTasks.length}) - ${formattedDate}`,
      html: emailHtml,
    });

    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      return new Response(
        JSON.stringify({ error: emailResponse.error.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully:", emailResponse.data?.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tasksCount: allTasks.length,
        emailId: emailResponse.data?.id 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-daily-tasks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
