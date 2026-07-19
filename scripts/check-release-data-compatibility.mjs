import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("Supabase URL e service role são obrigatórios para a auditoria somente leitura.");
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const surfaces = [
  {
    name: "leads",
    table: "leads",
    select: "id,name,phone,email,project,source,campaign,status,score_ia,classificacao_ia,temperature,assigned_user_id,created_at,organization_id,notes,next_action,next_contact,legacy_broker,import_batch_id,source_row,project_id,campaign_id,budget_min,budget_max,preferred_bedrooms,preferred_min_area,preferred_neighborhoods,payment_method,purchase_timeline,monthly_income,available_down_payment,fgts_balance,desired_monthly_payment,financing_required,financing_term_months,financial_restrictions,financial_notes",
  },
  {
    name: "tasks",
    table: "tasks",
    select: "id,title,description,status,user_id,lead_id,created_at,organization_id,priority,due_date",
  },
  {
    name: "projects",
    table: "crm_projects",
    select: "id,organization_id,name,developer_name,code,status,city,neighborhood,address,launch_date,delivery_date,created_at,updated_at",
  },
];

const profiles = await supabase
  .from("profiles")
  .select("id,organization_id,role,active")
  .eq("active", true)
  .not("organization_id", "is", null)
  .limit(1_000);

if (profiles.error) throw new Error(`Perfis indisponíveis: ${profiles.error.code || "unknown"}`);
if (!profiles.data?.length) throw new Error("Nenhum perfil ativo com organização foi encontrado.");

const organizationIds = [...new Set(profiles.data.map((row) => row.organization_id).filter(Boolean))];
if (!organizationIds.length) throw new Error("Nenhuma organização operacional pôde ser resolvida.");

const result = {
  ok: true,
  mode: "read-only",
  activeProfiles: profiles.data.length,
  organizationsWithActiveProfiles: organizationIds.length,
  surfaces: {},
};

for (const surface of surfaces) {
  let readableOrganizations = 0;
  let rows = 0;
  for (const organizationId of organizationIds) {
    const audit = await supabase
      .from(surface.table)
      .select(surface.select, { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (audit.error) throw new Error(`${surface.name} incompatível: ${audit.error.code || "unknown"}`);
    readableOrganizations += 1;
    rows += audit.count ?? 0;
  }
  result.surfaces[surface.name] = {
    source: `public.${surface.table}`,
    readableOrganizations,
    rows,
  };
}

if (process.env.ATLAS_TEST_EMAIL) {
  const authUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (!authUsers.error) {
    result.authenticatedSmokeAccount = authUsers.data.users.some(
      (user) => user.email?.toLocaleLowerCase("pt-BR") === process.env.ATLAS_TEST_EMAIL.toLocaleLowerCase("pt-BR"),
    ) ? "present" : "missing";
  }
}

console.log(JSON.stringify(result, null, 2));
