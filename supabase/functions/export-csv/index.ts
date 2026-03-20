import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const table = url.searchParams.get("table") || "accounting_accounts";

  // Whitelist of allowed tables
  const allowed = ["accounting_accounts", "accounting_entries", "accounting_entry_lines", "accounting_documents", "accounting_ledgers"];
  if (!allowed.includes(table)) {
    return new Response(JSON.stringify({ error: "Table not allowed" }), { 
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    return new Response(JSON.stringify({ error }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  if (!data || data.length === 0) {
    return new Response("No data", { status: 404, headers: corsHeaders });
  }

  const fields = Object.keys(data[0]);
  const header = fields.join(",");
  const rows = data.map(r =>
    fields.map(f => {
      const v = r[f] ?? "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
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
