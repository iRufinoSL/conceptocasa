import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate the caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify user and check admin role
  const token = authHeader.replace('Bearer ', '');
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  const isAdmin = roles?.some((r: { role: string }) => r.role === 'administrador');
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const table = url.searchParams.get("table") || "accounting_accounts";

  const allowed = [
    "accounting_accounts",
    "accounting_entries",
    "accounting_entry_lines",
    "accounting_documents",
    "accounting_ledgers",
    "invoices",
    "invoice_lines",
    "purchase_orders",
    "purchase_order_lines",
    "projects",
  ];

  if (!allowed.includes(table)) {
    return new Response(JSON.stringify({ error: "Table not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ledgerId = url.searchParams.get("ledger_id");
  const isValidUuid = ledgerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ledgerId);

  let query = supabase.from(table).select("*").order("created_at", { ascending: true }).limit(5000);

  if (isValidUuid && ["accounting_accounts", "accounting_entries", "accounting_entry_lines"].includes(table)) {
    query = query.eq("ledger_id", ledgerId);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!data || data.length === 0) {
    return new Response("No hay datos para exportar", { status: 404, headers: corsHeaders });
  }

  const fields = Object.keys(data[0]);
  const header = fields.join(",");
  const rows = data.map((r: Record<string, unknown>) =>
    fields
      .map((f) => {
        const v = r[f] ?? "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(",")
  );
  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${table}.csv`,
    },
  });
});
