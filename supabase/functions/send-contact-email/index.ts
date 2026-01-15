import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Allowed origins for CORS - restrict to specific domains
const ALLOWED_ORIGINS = [
  "https://concepto.casa",
  "https://www.concepto.casa",
  "https://build-buddy-resources.lovable.app"
];

// Check if origin is allowed, also allow lovable preview domains
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview domains
  if (origin.match(/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/)) return true;
  if (origin.match(/^https:\/\/[a-z0-9-]+\.lovable\.app$/)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface ContactEmailRequest {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  // Attachment fields
  attachmentPaths?: string[];
  attachmentNames?: string[];
  // Housing profile fields
  isHousingProfile?: boolean;
  numPlantas?: string;
  m2PorPlanta?: string;
  formaGeometrica?: string;
  tipoTejado?: string;
  numHabitacionesTotal?: string;
  numHabitacionesConBano?: string;
  numBanosTotal?: string;
  numHabitacionesConVestidor?: string;
  tipoSalon?: string;
  tipoCocina?: string;
  lavanderia?: string;
  despensa?: string;
  porcheCubierto?: string;
  patioDescubierto?: string;
  garaje?: string;
  tieneTerreno?: string;
  poblacionProvincia?: string;
  presupuestoGlobal?: string;
  estiloConstructivo?: string[];
  fechaIdealFinalizacion?: string;
}

// In-memory rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration: 5 requests per hour per IP
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!record || record.resetTime < now) {
    // New window
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
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

// Parse poblacion and provincia from combined field
function parsePoblacionProvincia(value: string): { poblacion: string; provincia: string } {
  // Expected format: "Poblacion, Provincia" or just "Poblacion"
  const parts = value.split(',').map(p => p.trim());
  return {
    poblacion: parts[0] || '',
    provincia: parts[1] || ''
  };
}

// Extract first name and surname from full name
function parseFullName(name: string): { firstName: string; surname: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], surname: '' };
  }
  return {
    firstName: parts[0],
    surname: parts.slice(1).join(' ')
  };
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const corsHeaders = {
    ...getCorsHeaders(origin),
    // Ensure caches don't mix responses across origins
    "Vary": "Origin",
    // Basic hardening headers
    "X-Content-Type-Options": "nosniff",
  };

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

  // Validate origin - reject requests from unauthorized origins
  if (!isOriginAllowed(origin)) {
    console.warn(`Rejected request from unauthorized origin: ${origin}`);
    return new Response(
      JSON.stringify({ error: "Origen no autorizado" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Enforce JSON requests
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Content-Type debe ser application/json" }),
        { status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client IP for rate limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               req.headers.get("x-real-ip") ||
               "anonymous";

    // Check rate limit (keyed by IP+origin to reduce false positives behind NAT)
    const rateLimitKey = `${ip}::${origin ?? ""}`;
    const rateLimit = checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return new Response(
        JSON.stringify({ error: "Has enviado demasiados mensajes. Por favor, inténtalo de nuevo más tarde." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "3600",
          },
        }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "JSON inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestData = body as ContactEmailRequest;
    const { name, email, phone, subject, message, isHousingProfile, attachmentPaths, attachmentNames } = requestData;

    console.log(
      "Received contact form submission from IP:",
      ip,
      "- Origin:",
      origin,
      "- Is Housing Profile:",
      isHousingProfile,
      "- Attachments:",
      attachmentPaths?.length || 0,
      "- Remaining requests:",
      rateLimit.remaining
    );

    // Validate required fields
    if (!name || !email || !phone || !message) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Faltan campos obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input lengths to prevent abuse
    if (name.length > 100 || email.length > 255 || phone.length > 50 || 
        (subject && subject.length > 200) || message.length > 10000) {
      console.error("Input too long");
      return new Response(
        JSON.stringify({ error: "Uno o más campos exceden la longitud máxima permitida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("Invalid email format");
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Escape all user inputs to prevent XSS/HTML injection
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone);
    const safeSubject = escapeHtml(subject || "Sin asunto");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

    // If this is a housing profile, create project, contact, and opportunity
    let projectId: string | null = null;
    let projectNumber: number | null = null;
    
    if (isHousingProfile) {
      console.log("Processing housing profile submission...");
      
      // Initialize Supabase client with service role
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error("Missing Supabase configuration");
        throw new Error("Configuración de base de datos no disponible");
      }
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Parse name and location
      const { firstName, surname } = parseFullName(name);
      const { poblacion, provincia } = parsePoblacionProvincia(requestData.poblacionProvincia || '');
      
      // Create project name: "Nombre_Población, Provincia"
      const projectName = `${firstName}${surname ? ' ' + surname : ''}_${poblacion}${provincia ? ', ' + provincia : ''}`;
      const projectLocation = poblacion + (provincia ? `, ${provincia}` : '');
      
      console.log("Creating project:", projectName);
      
      // 1. Create project with status "prospecto"
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          status: 'prospecto',
          location: projectLocation,
          project_type: 'Vivienda unifamiliar',
          source: 'housing_profile_form',
          description: `Proyecto creado automáticamente desde formulario de perfil de vivienda. Presupuesto indicado: ${requestData.presupuestoGlobal || 'No especificado'}`
        })
        .select('id, project_number')
        .single();
      
      if (projectError) {
        console.error("Error creating project:", projectError);
        throw new Error("Error al crear el proyecto");
      }
      
      projectId = projectData.id;
      projectNumber = projectData.project_number;
      console.log("Project created with ID:", projectId, "Number:", projectNumber);
      
      // 2. Create project profile with all form data
      const { error: profileError } = await supabase
        .from('project_profiles')
        .insert({
          project_id: projectId,
          contact_name: firstName,
          contact_surname: surname || null,
          contact_email: email,
          contact_phone: phone,
          num_plantas: requestData.numPlantas || null,
          m2_por_planta: requestData.m2PorPlanta || null,
          forma_geometrica: requestData.formaGeometrica || null,
          tipo_tejado: requestData.tipoTejado || null,
          num_habitaciones_total: requestData.numHabitacionesTotal || null,
          num_habitaciones_con_bano: requestData.numHabitacionesConBano || null,
          num_banos_total: requestData.numBanosTotal || null,
          num_habitaciones_con_vestidor: requestData.numHabitacionesConVestidor || null,
          tipo_salon: requestData.tipoSalon || null,
          tipo_cocina: requestData.tipoCocina || null,
          lavanderia: requestData.lavanderia || null,
          despensa: requestData.despensa || null,
          porche_cubierto: requestData.porcheCubierto || null,
          patio_descubierto: requestData.patioDescubierto || null,
          garaje: requestData.garaje || null,
          tiene_terreno: requestData.tieneTerreno || null,
          poblacion: poblacion || null,
          provincia: provincia || null,
          presupuesto_global: requestData.presupuestoGlobal || null,
          estilo_constructivo: requestData.estiloConstructivo || [],
          mensaje_adicional: requestData.message || null,
          fecha_ideal_finalizacion: requestData.fechaIdealFinalizacion || null
        });
      
      if (profileError) {
        console.error("Error creating project profile:", profileError);
        // Don't fail the whole request, just log it
      } else {
        console.log("Project profile created successfully");
      }
      
      // 3. Create or find CRM contact
      const { data: existingContact } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      
      let contactId: string;
      
      if (existingContact) {
        contactId = existingContact.id;
        console.log("Found existing contact:", contactId);
      } else {
        // Create new contact with status "Prospecto"
        const { data: newContact, error: contactError } = await supabase
          .from('crm_contacts')
          .insert({
            name: firstName,
            surname: surname || null,
            email: email,
            phone: phone,
            city: poblacion || null,
            province: provincia || null,
            contact_type: 'Particular',
            status: 'Prospecto'
          })
          .select('id')
          .single();
        
        if (contactError) {
          console.error("Error creating contact:", contactError);
        } else {
          contactId = newContact.id;
          console.log("Created new contact:", contactId);
        }
      }
      
      // 4. Create opportunity linked to contact with full housing profile
      if (contactId!) {
        const opportunityName = `${firstName}_${poblacion}`;
        
        // Build full housing profile description
        const profileDescription = `
**PERFIL DE VIVIENDA**

**Contacto:**
- Nombre: ${name}
- Email: ${email}
- Teléfono: ${phone}

**Ubicación:**
- Población: ${poblacion || 'No especificada'}
- Provincia: ${provincia || 'No especificada'}

**Características de la vivienda:**
- Número de plantas: ${requestData.numPlantas || 'No especificado'}
- M² por planta: ${requestData.m2PorPlanta || 'No especificado'}
- Forma geométrica: ${requestData.formaGeometrica || 'No especificada'}
- Tipo de tejado: ${requestData.tipoTejado || 'No especificado'}

**Distribución:**
- Habitaciones totales: ${requestData.numHabitacionesTotal || 'No especificado'}
- Habitaciones con baño: ${requestData.numHabitacionesConBano || 'No especificado'}
- Baños totales: ${requestData.numBanosTotal || 'No especificado'}
- Habitaciones con vestidor: ${requestData.numHabitacionesConVestidor || 'No especificado'}

**Espacios:**
- Tipo de salón: ${requestData.tipoSalon || 'No especificado'}
- Tipo de cocina: ${requestData.tipoCocina || 'No especificado'}
- Lavandería: ${requestData.lavanderia || 'No'}
- Despensa: ${requestData.despensa || 'No'}

**Exteriores:**
- Porche cubierto: ${requestData.porcheCubierto || 'No'}
- Patio descubierto: ${requestData.patioDescubierto || 'No'}
- Garaje: ${requestData.garaje || 'No'}
- Tiene terreno: ${requestData.tieneTerreno || 'No especificado'}

**Estilo constructivo:** ${Array.isArray(requestData.estiloConstructivo) ? requestData.estiloConstructivo.join(', ') : requestData.estiloConstructivo || 'No especificado'}

**Presupuesto global:** ${requestData.presupuestoGlobal || 'No especificado'}

**Fecha ideal de finalización:** ${requestData.fechaIdealFinalizacion || 'No especificada'}

**Mensaje adicional:**
${requestData.message || 'Sin mensaje adicional'}
        `.trim();
        
        const { error: opportunityError } = await supabase
          .from('crm_opportunities')
          .insert({
            name: opportunityName,
            contact_id: contactId,
            description: profileDescription,
            tags: ['Perfil de vivienda']
          });
        
        if (opportunityError) {
          console.error("Error creating opportunity:", opportunityError);
        } else {
          console.log("Opportunity created with housing profile:", opportunityName);
        }
        
        // 5. Link contact to project
        const { error: projectContactError } = await supabase
          .from('project_contacts')
          .insert({
            project_id: projectId,
            contact_id: contactId,
            contact_role: 'Cliente'
          });
        
        if (projectContactError) {
          console.error("Error linking contact to project:", projectContactError);
        }
      }
      
      // 6. Create system alert for dashboard
      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          alert_type: 'new_project_profile',
          title: 'Nuevo perfil de vivienda recibido',
          message: `${name} ha enviado un perfil de vivienda desde ${poblacion}`,
          related_id: projectId,
          related_type: 'project',
          action_url: `/proyectos?highlight=${projectId}`,
          is_read: false
        });
      
      if (alertError) {
        console.error("Error creating system alert:", alertError);
      } else {
        console.log("System alert created");
      }
      
      // 7. Send notification to admins with notification preferences
      const adminSenderEmail = "noreply@concepto.casa";
      const adminSenderName = "Concepto.Casa";
      
      try {
        // Fetch user_roles and then profiles with personal notification preferences
        const { data: adminRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'administrador');
        
        if (adminRoles && adminRoles.length > 0) {
          const adminUserIds = adminRoles.map(r => r.user_id);
          const { data: adminProfilesData } = await supabase
            .from('profiles')
            .select('id, email, full_name, personal_notification_email, personal_notification_phone, personal_notification_type')
            .in('id', adminUserIds);
          
          if (adminProfilesData) {
            for (const admin of adminProfilesData) {
              // Use personal notification preferences for immediate alerts
              const notifType = admin.personal_notification_type || 'email';
              const notifEmail = admin.personal_notification_email || admin.email;
              
              // Skip if notification_type is 'none' or only SMS/WhatsApp
              if (notifType === 'none' || notifType === 'sms' || notifType === 'whatsapp') {
                console.log(`Skipping email notification for admin ${admin.full_name} - preference is ${notifType}`);
                continue;
              }
              
              // Send email notification for 'email' or 'all' preferences
              if ((notifType === 'email' || notifType === 'all') && notifEmail) {
                console.log(`Sending housing profile notification to admin: ${notifEmail}`);
                try {
                  await resend.emails.send({
                    from: `${adminSenderName} <${adminSenderEmail}>`,
                    to: [notifEmail],
                    subject: `🏠 Nuevo Perfil de Vivienda: ${safeName} - ${poblacion || 'Sin ubicación'}`,
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">🏠 Nuevo Perfil de Vivienda Recibido</h2>
                        <p>Hola ${admin.full_name || 'Administrador'},</p>
                        <p>Se ha recibido un nuevo perfil de vivienda con los siguientes datos:</p>
                        
                        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                          <p><strong>Nombre:</strong> ${safeName}</p>
                          <p><strong>Email:</strong> ${safeEmail}</p>
                          <p><strong>Teléfono:</strong> ${safePhone}</p>
                          <p><strong>Ubicación:</strong> ${poblacion || 'No especificada'}, ${provincia || ''}</p>
                          <p><strong>Presupuesto:</strong> ${requestData.presupuestoGlobal || 'No especificado'}</p>
                        </div>
                        
                        <p>
                          <a href="https://conceptocasa.lovable.app/crm?tab=oportunidades" 
                             style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Ver en Oportunidades
                          </a>
                        </p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
                        <p style="color: #666; font-size: 12px;">
                          Este es un mensaje automático del sistema Concepto.Casa
                        </p>
                      </div>
                    `,
                  });
                  console.log(`Admin notification sent to ${notifEmail}`);
                } catch (notifError) {
                  console.error(`Error sending notification to ${notifEmail}:`, notifError);
                }
              }
            }
          }
        }
      } catch (notifFetchError) {
        console.error("Error fetching admin profiles for notifications:", notifFetchError);
      }
      
      // 7. Save attachment references to database if there are any
      if (attachmentPaths && attachmentPaths.length > 0) {
        console.log("Saving attachment references for project:", projectId);
        for (let i = 0; i < attachmentPaths.length; i++) {
          const { error: attachmentError } = await supabase
            .from('contact_form_attachments')
            .insert({
              project_id: projectId,
              file_path: attachmentPaths[i],
              file_name: attachmentNames?.[i] || attachmentPaths[i].split('/').pop() || 'unknown',
              file_type: attachmentPaths[i].split('.').pop() || null
            });
          
          if (attachmentError) {
            console.error("Error saving attachment reference:", attachmentError);
          }
        }
        console.log(`Saved ${attachmentPaths.length} attachment references`);
      }
    }

    // Send notification email to the company
    // Note: Using verified domain sender (noreply@concepto.casa) 
    // If domain not verified in Resend, use onboarding@resend.dev for testing
    const senderEmail = "noreply@concepto.casa";
    const senderName = "Concepto.Casa";
    
    console.log("Attempting to send notification email to organiza@concepto.casa");
    
    let notificationEmail;
    try {
      notificationEmail = await resend.emails.send({
        from: `${senderName} <${senderEmail}>`,
        to: ["organiza@concepto.casa"],
        subject: isHousingProfile 
          ? `🏠 Nuevo Perfil de Vivienda: ${safeName}${projectNumber ? ` (#${projectNumber})` : ''}`
          : `Nuevo contacto: ${safeSubject}`,
        html: `
          <h2>${isHousingProfile ? '🏠 Nuevo Perfil de Vivienda Recibido' : 'Nuevo mensaje de contacto'}</h2>
          ${isHousingProfile && projectNumber ? `<p><strong>Proyecto #${projectNumber}</strong></p>` : ''}
          <p><strong>Nombre:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Teléfono:</strong> ${safePhone}</p>
          ${!isHousingProfile ? `<p><strong>Asunto:</strong> ${safeSubject}</p>` : ''}
          <hr />
          <p><strong>Mensaje:</strong></p>
          <p>${safeMessage}</p>
          ${attachmentPaths && attachmentPaths.length > 0 ? `
          <hr />
          <p><strong>📎 Archivos adjuntos (${attachmentPaths.length}):</strong></p>
          <ul>
            ${attachmentNames?.map((name, i) => `<li>${escapeHtml(name)}</li>`).join('') || attachmentPaths.map(p => `<li>${escapeHtml(p.split('/').pop() || 'archivo')}</li>`).join('')}
          </ul>
          <p style="color: #666; font-size: 12px;">Los archivos están disponibles en el panel de administración.</p>
          ` : ''}
          ${isHousingProfile ? `
          <hr />
          <p style="color: #666; font-size: 12px;">
            Este perfil ha sido registrado automáticamente en el sistema. 
            Accede al panel de control para ver los detalles completos del proyecto.
          </p>
          ` : ''}
        `,
      });
      console.log("Notification email response:", JSON.stringify(notificationEmail));
    } catch (emailError: any) {
      console.error("Error sending notification email:", emailError.message || emailError);
      // Continue - don't fail the whole request if notification fails
    }

    console.log("Notification email sent:", notificationEmail);

    // Send confirmation email to the user
    console.log("Attempting to send confirmation email to:", email);
    
    let confirmationEmail;
    try {
      // Build housing profile HTML section if applicable
      let housingProfileHtml = '';
      if (isHousingProfile) {
        const styleLabels: Record<string, string> = {
          moderna: 'Moderna',
          clasica: 'Clásica',
          rustica: 'Rústica',
          madera: 'Madera',
          ecologica: 'Ecológica/Saludable',
          mediterranea: 'Mediterránea'
        };
        
        const estilos = requestData.estiloConstructivo?.map(e => styleLabels[e] || e).join(', ') || 'No especificado';
        const { poblacion, provincia } = parsePoblacionProvincia(requestData.poblacionProvincia || '');
        
        housingProfileHtml = `
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 16px; border-bottom: 2px solid #ddd; padding-bottom: 8px;">📋 Tu Perfil de Vivienda</h2>
            
            <h3 style="color: #555; margin-top: 16px;">📍 Ubicación</h3>
            <p style="margin: 4px 0;"><strong>Población:</strong> ${escapeHtml(poblacion || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Provincia:</strong> ${escapeHtml(provincia || 'No especificado')}</p>
            ${requestData.tieneTerreno ? `<p style="margin: 4px 0;"><strong>Dispone de terreno:</strong> ${escapeHtml(requestData.tieneTerreno)}</p>` : ''}
            
            <h3 style="color: #555; margin-top: 16px;">🏗️ Estructura</h3>
            <p style="margin: 4px 0;"><strong>Número de plantas:</strong> ${escapeHtml(requestData.numPlantas || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>M² por planta:</strong> ${escapeHtml(requestData.m2PorPlanta || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Forma geométrica:</strong> ${escapeHtml(requestData.formaGeometrica || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Tipo de tejado:</strong> ${escapeHtml(requestData.tipoTejado || 'No especificado')}</p>
            
            <h3 style="color: #555; margin-top: 16px;">🛏️ Distribución</h3>
            <p style="margin: 4px 0;"><strong>Total habitaciones:</strong> ${escapeHtml(requestData.numHabitacionesTotal || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Habitaciones con baño:</strong> ${escapeHtml(requestData.numHabitacionesConBano || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Habitaciones con vestidor:</strong> ${escapeHtml(requestData.numHabitacionesConVestidor || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Total baños:</strong> ${escapeHtml(requestData.numBanosTotal || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Tipo de salón:</strong> ${escapeHtml(requestData.tipoSalon || 'No especificado')}</p>
            <p style="margin: 4px 0;"><strong>Tipo de cocina:</strong> ${escapeHtml(requestData.tipoCocina || 'No especificado')}</p>
            ${requestData.lavanderia ? `<p style="margin: 4px 0;"><strong>Lavandería:</strong> ${escapeHtml(requestData.lavanderia)}</p>` : ''}
            ${requestData.despensa ? `<p style="margin: 4px 0;"><strong>Despensa:</strong> ${escapeHtml(requestData.despensa)}</p>` : ''}
            
            <h3 style="color: #555; margin-top: 16px;">🌳 Espacios Exteriores</h3>
            ${requestData.porcheCubierto ? `<p style="margin: 4px 0;"><strong>Porche cubierto:</strong> ${escapeHtml(requestData.porcheCubierto)}</p>` : ''}
            ${requestData.patioDescubierto ? `<p style="margin: 4px 0;"><strong>Patio descubierto:</strong> ${escapeHtml(requestData.patioDescubierto)}</p>` : ''}
            ${requestData.garaje ? `<p style="margin: 4px 0;"><strong>Garaje:</strong> ${escapeHtml(requestData.garaje)}</p>` : ''}
            
            <h3 style="color: #555; margin-top: 16px;">🎨 Estilo y Presupuesto</h3>
            <p style="margin: 4px 0;"><strong>Estilos preferidos:</strong> ${escapeHtml(estilos)}</p>
            <p style="margin: 4px 0;"><strong>Presupuesto global:</strong> ${escapeHtml(requestData.presupuestoGlobal || 'No especificado')}</p>
            ${requestData.fechaIdealFinalizacion ? `<p style="margin: 4px 0;"><strong>Fecha ideal finalización:</strong> ${escapeHtml(requestData.fechaIdealFinalizacion)}</p>` : ''}
            
            ${requestData.message ? `
            <h3 style="color: #555; margin-top: 16px;">💬 Mensaje Adicional</h3>
            <p style="margin: 4px 0;">${safeMessage}</p>
            ` : ''}
          </div>
        `;
      }
      
      confirmationEmail = await resend.emails.send({
        from: `${senderName} <${senderEmail}>`,
        to: [email],
        subject: isHousingProfile 
          ? `Perfil de vivienda de ${safeName}`
          : "Hemos recibido tu mensaje - Concepto.Casa",
        html: isHousingProfile 
          ? `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">¡Hola ${safeName}!</h1>
              <p style="font-size: 16px; color: #444; line-height: 1.6;">
                <strong>Hemos recibido correctamente este perfil de vivienda, lo empezamos a trabajar y en breve nos pondremos en contacto.</strong>
              </p>
              ${housingProfileHtml}
              <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
              <p style="color: #666;">Saludos cordiales,<br />El equipo de Concepto.Casa</p>
              <p style="color: #888; font-size: 12px;">
                Teléfono: +34 690 123 533<br />
                Email: organiza@concepto.casa<br />
                Web: www.concepto.casa
              </p>
            </div>
          `
          : `
            <h1>¡Gracias por contactarnos, ${safeName}!</h1>
            <p>Hemos recibido tu mensaje y nos pondremos en contacto contigo lo antes posible.</p>
            <hr />
            <p><strong>Tu mensaje:</strong></p>
            <p>${safeMessage}</p>
            <hr />
            <p>Saludos cordiales,<br />El equipo de Concepto.Casa</p>
            <p style="color: #666; font-size: 12px;">
              Teléfono: +34 690 123 533<br />
              Email: organiza@concepto.casa
            </p>
          `,
      });
      console.log("Confirmation email response:", JSON.stringify(confirmationEmail));
    } catch (emailError: any) {
      console.error("Error sending confirmation email:", emailError.message || emailError);
      // Continue - don't fail the whole request if confirmation fails
    }

    console.log("Confirmation email sent:", confirmationEmail);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Emails enviados correctamente",
        projectId: projectId,
        projectNumber: projectNumber
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: "Error al enviar el mensaje. Por favor, inténtalo de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
