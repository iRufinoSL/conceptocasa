import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://concepto.casa',
  'https://www.concepto.casa',
  'https://conceptocasa.lovable.app',
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview domains
  if (origin.match(/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/)) return true;
  if (origin.match(/^https:\/\/[a-z0-9-]+\.lovable\.app$/)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

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

interface UserWithTasks {
  userId: string;
  email: string;
  fullName: string | null;
  tasks: Task[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-daily-tasks function called");

  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests for triggering the email
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Authentication check - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log("Unauthorized: No valid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create client with user's auth token to verify their identity
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.log("Unauthorized: Invalid token", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'administrador')
      .single();

    if (roleError || !roleData) {
      console.log("Forbidden: User does not have admin role", roleError);
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin role required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("User authorized as admin, proceeding with email send");
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`Fetching pending tasks for date: ${todayStr} and overdue`);

    // Fetch all users with notification preferences
    const { data: usersWithNotifications, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, full_name, notification_email, notification_type, personal_notification_email, personal_notification_phone, personal_notification_type')
      .or('notification_email.not.is.null,personal_notification_email.not.is.null,personal_notification_phone.not.is.null');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return new Response(
        JSON.stringify({ error: "Error fetching users" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!usersWithNotifications || usersWithNotifications.length === 0) {
      console.log('No users with notification preferences configured');
      return new Response(
        JSON.stringify({ success: true, message: 'No users configured for notifications' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Bird API key for SMS
    const birdApiKey = Deno.env.get('BIRD_API_KEY');
    const birdWorkspaceId = Deno.env.get('BIRD_WORKSPACE_ID');
    const birdChannelId = Deno.env.get('BIRD_CHANNEL_ID');

    // Helper to send SMS via Bird Channels API
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

    console.log(`Found ${usersWithNotifications.length} users with notifications enabled`);

    // Fetch tasks from budget_tasks table - pending and (today or overdue)
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
        activity_id,
        created_by
      `)
      .eq('status', 'pendiente')
      .or(`target_date.lte.${todayStr},start_date.lte.${todayStr}`);

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
      .lte('start_date', todayStr);

    if (resourceTasksError) {
      console.error('Error fetching resource tasks:', resourceTasksError);
    }

    // Fetch CRM managements (tasks/objectives from CRM)
    const { data: crmManagementsData, error: crmManagementsError } = await supabase
      .from('crm_managements')
      .select(`
        id,
        title,
        description,
        target_date,
        start_time,
        end_time,
        status,
        management_type,
        created_by
      `)
      .eq('status', 'Pendiente')
      .lte('target_date', todayStr);

    if (crmManagementsError) {
      console.error('Error fetching CRM managements:', crmManagementsError);
    }

    // Process all tasks
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

    // Process CRM managements as tasks
    for (const mgmt of crmManagementsData || []) {
      // Get contacts linked to this management
      const { data: mgmtContacts } = await supabase
        .from('crm_management_contacts')
        .select('contact:crm_contacts(name, surname)')
        .eq('management_id', mgmt.id);
      
      const contacts = mgmtContacts?.map((mc: any) => ({
        name: mc.contact?.name || '',
        surname: mc.contact?.surname || null
      })) || [];

      allTasks.push({
        id: mgmt.id,
        name: mgmt.title,
        description: mgmt.description,
        target_date: mgmt.target_date,
        start_date: mgmt.target_date,
        start_time: mgmt.start_time,
        end_time: mgmt.end_time,
        status: mgmt.status,
        task_status: null,
        budget_id: null,
        budget_name: null,
        activity_name: mgmt.management_type,
        contacts
      });
    }

    console.log(`Found ${allTasks.length} total pending tasks for today or overdue`);

    if (allTasks.length === 0) {
      console.log('No pending tasks, skipping emails');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending tasks' }),
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

    // Send email to each user with notifications enabled
    const appUrl = "https://conceptocasa.lovable.app";
    const formattedDate = today.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let emailsSent = 0;
    let emailsFailed = 0;
    let smsSent = 0;
    let smsFailed = 0;

    for (const userProfile of usersWithNotifications) {
      const notificationEmail = userProfile.personal_notification_email || userProfile.notification_email;
      const notificationPhone = userProfile.personal_notification_phone;
      const notifType = userProfile.personal_notification_type || userProfile.notification_type || 'email';
      
      // Skip if notifications disabled
      if (notifType === 'none') continue;
      // Need at least one channel configured
      if (!notificationEmail && !notificationPhone) continue;

      // For now, send all tasks to all users with notifications
      // In the future, could filter by user's access to budgets
      const userTasks = allTasks;

      if (userTasks.length === 0) continue;

      // Separate tasks with and without time
      const tasksWithTime = userTasks.filter(t => t.start_time);
      const tasksWithoutTime = userTasks.filter(t => !t.start_time);

      // Separate today's tasks from overdue
      const todayTasks = userTasks.filter(t => {
        const taskDate = t.target_date || t.start_date;
        return taskDate === todayStr;
      });
      const overdueTasks = userTasks.filter(t => {
        const taskDate = t.target_date || t.start_date;
        return taskDate && taskDate < todayStr;
      });

      let tasksHtml = '';

      // Overdue tasks section
      if (overdueTasks.length > 0) {
        tasksHtml += `
          <h3 style="color: #dc2626; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #fecaca; padding-bottom: 8px;">
            ⚠️ Tareas vencidas (${overdueTasks.length})
          </h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
        `;

        for (const task of overdueTasks) {
          const taskDate = task.target_date || task.start_date;
          const contactsStr = task.contacts?.map(c => 
            c.surname ? `${c.name} ${c.surname}` : c.name
          ).join(', ');

          const taskUrl = task.budget_id 
            ? `${appUrl}/presupuestos/${task.budget_id}?tab=agenda&task=${task.id}`
            : `${appUrl}/agenda?task=${task.id}`;

          tasksHtml += `
            <li style="padding: 12px; margin-bottom: 8px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626;">
              <a href="${taskUrl}" style="color: #991b1b; text-decoration: none; font-weight: 500; font-size: 15px;">
                ${task.name}
              </a>
              <p style="margin: 4px 0 0 0; color: #b91c1c; font-size: 12px;">
                📅 Vencida: ${taskDate ? new Date(taskDate).toLocaleDateString('es-ES') : 'Sin fecha'}
              </p>
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

      // Today's tasks with time
      const todayWithTime = tasksWithTime.filter(t => {
        const taskDate = t.target_date || t.start_date;
        return taskDate === todayStr;
      });

      if (todayWithTime.length > 0) {
        tasksHtml += `
          <h3 style="color: #1e3a5f; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
            🕐 Tareas de hoy con hora programada
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

        for (const task of todayWithTime) {
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

      // Today's tasks without time
      const todayWithoutTime = tasksWithoutTime.filter(t => {
        const taskDate = t.target_date || t.start_date;
        return taskDate === todayStr;
      });

      if (todayWithoutTime.length > 0) {
        tasksHtml += `
          <h3 style="color: #1e3a5f; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
            📋 Tareas del día
          </h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
        `;

        for (const task of todayWithoutTime) {
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

      const greeting = userProfile.full_name ? `Hola ${userProfile.full_name.split(' ')[0]},` : 'Hola,';

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

            <p style="color: #333; font-size: 15px; margin-bottom: 16px;">
              ${greeting}
            </p>
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
              Tienes <strong>${userTasks.length}</strong> tareas pendientes${overdueTasks.length > 0 ? `, incluyendo <strong style="color: #dc2626;">${overdueTasks.length} vencidas</strong>` : ''}.
            </p>

            <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; justify-content: center; gap: 24px;">
              <div style="text-align: center;">
                <span style="font-size: 28px; font-weight: bold; color: #2563eb;">${todayTasks.length}</span>
                <span style="color: #1e40af; display: block; font-size: 12px;">para hoy</span>
              </div>
              ${overdueTasks.length > 0 ? `
              <div style="text-align: center;">
                <span style="font-size: 28px; font-weight: bold; color: #dc2626;">${overdueTasks.length}</span>
                <span style="color: #991b1b; display: block; font-size: 12px;">vencidas</span>
              </div>
              ` : ''}
            </div>

            ${tasksHtml}

            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <a href="${appUrl}/agenda" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                Ver Agenda Completa
              </a>
            </div>

            <p style="color: #999; font-size: 11px; text-align: center; margin-top: 24px;">
              Este email se envía automáticamente desde Concepto Casa.<br>
              Recibes este email porque tienes activadas las notificaciones en tu perfil.<br>
              <a href="${appUrl}" style="color: #2563eb;">conceptocasa.lovable.app</a>
            </p>
          </div>
        </body>
        </html>
      `;

      const shouldSendEmail = (notifType === 'email' || notifType === 'both') && notificationEmail;
      const shouldSendSms = (notifType === 'sms' || notifType === 'both') && notificationPhone;

      // Send email
      if (shouldSendEmail) {
        try {
          const subjectOverdue = overdueTasks.length > 0 ? ` (⚠️ ${overdueTasks.length} vencidas)` : '';
          const emailResponse = await resend.emails.send({
            from: "Concepto Casa <noreply@concepto.casa>",
            to: [notificationEmail],
            subject: `📋 Tareas pendientes (${userTasks.length})${subjectOverdue} - ${formattedDate}`,
            html: emailHtml,
          });

          if (emailResponse.error) {
            console.error(`Error sending email to ${notificationEmail}:`, emailResponse.error);
            emailsFailed++;
          } else {
            console.log(`Email sent to ${notificationEmail}:`, emailResponse.data?.id);
            emailsSent++;
          }
        } catch (emailError) {
          console.error(`Error sending email to ${notificationEmail}:`, emailError);
          emailsFailed++;
        }
      }

      // Send SMS
      if (shouldSendSms) {
        const overdueText = overdueTasks.length > 0 ? ` (${overdueTasks.length} vencidas)` : '';
        // Build a deep link: if there's an overdue task in a budget, link to it; otherwise link to agenda
        const firstTask = overdueTasks[0] || todayTasks[0];
        const taskDeepLink = firstTask?.budget_id 
          ? `${appUrl}/presupuestos/${firstTask.budget_id}?tab=agenda&task=${firstTask.id}`
          : `${appUrl}/agenda`;
        const smsMessage = `ConceptoCasa: ${userTasks.length} tareas pendientes${overdueText}. Ver: ${taskDeepLink}`;
        
        const smsResult = await sendSmsNotification(notificationPhone, smsMessage);
        if (smsResult) {
          smsSent++;
        } else {
          smsFailed++;
        }
      }
    }

    console.log(`Emails sent: ${emailsSent}, failed: ${emailsFailed}. SMS sent: ${smsSent}, failed: ${smsFailed}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tasksCount: allTasks.length,
        emailsSent,
        emailsFailed,
        smsSent,
        smsFailed
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-daily-tasks:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
