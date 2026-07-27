import type { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Prontidão da campanha: o que EXISTE e o que FALTA para publicar.
 *
 * A regra que orienta este endpoint: separar o que trava de verdade do que é
 * só recomendação. Misturar os dois produz uma lista de 20 alertas que ninguém
 * lê. Aqui, `bloqueadores` impede publicar; `avisos` deixa publicar com o
 * produto pior.
 *
 * Nada aqui altera dado nem chama a Meta — é leitura pura, segura de rodar a
 * cada passo do wizard.
 */

type Item = { chave: string; rotulo: string; ok: boolean; detalhe: string };

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "campaign.readiness" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const developmentId = new URL(request.url).searchParams.get("developmentId");
  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  // ── PRODUTO ────────────────────────────────────────────────────────────
  const produto: Item[] = [];
  let empreendimento: Record<string, unknown> | null = null;

  if (developmentId) {
    const [dev, materiais] = await Promise.all([
      admin.from("developments")
        .select("id,name,developer_name,neighborhood,city,total_units,private_area_min,private_area_max,price_min,delivery_date,typologies")
        .eq("id", developmentId).eq("organization_id", organizationId).maybeSingle(),
      admin.from("project_materials").select("material_type,title").eq("development_id", developmentId).eq("is_current", true),
    ]);
    empreendimento = (dev.data as Record<string, unknown>) ?? null;
    const mats = materiais.data ?? [];
    const tem = (tipos: string[]) => mats.some((m) => tipos.includes(String(m.material_type)));

    produto.push(
      { chave: "empreendimento", rotulo: "Empreendimento cadastrado", ok: Boolean(empreendimento), detalhe: empreendimento ? String(empreendimento.name) : "selecione um empreendimento" },
      { chave: "localizacao", rotulo: "Localização", ok: Boolean(empreendimento?.neighborhood), detalhe: [empreendimento?.neighborhood, empreendimento?.city].filter(Boolean).join(", ") || "bairro não informado" },
      { chave: "tipologias", rotulo: "Tipologias", ok: ((empreendimento?.typologies as string[]) ?? []).length > 0, detalhe: `${((empreendimento?.typologies as string[]) ?? []).length} cadastrada(s)` },
      { chave: "peca_visual", rotulo: "Apresentação ou book", ok: tem(["presentation", "book"]), detalhe: tem(["presentation", "book"]) ? "disponível" : "sem peça visual para o anúncio" },
      { chave: "midia", rotulo: "Imagem ou vídeo", ok: tem(["video", "floor_plan", "site_plan"]), detalhe: tem(["video"]) ? "vídeo disponível" : "sem mídia própria — o anúncio dependerá de peça externa" },
      { chave: "preco", rotulo: "Preço confirmado", ok: Boolean(empreendimento?.price_min), detalhe: empreendimento?.price_min ? "confirmado" : "não confirmado — as peças não citarão valor" },
      { chave: "entrega", rotulo: "Prazo de entrega", ok: Boolean(empreendimento?.delivery_date), detalhe: empreendimento?.delivery_date ? String(empreendimento.delivery_date) : "não informado — as peças não citarão data" },
    );
  } else {
    produto.push({ chave: "empreendimento", rotulo: "Empreendimento cadastrado", ok: false, detalhe: "selecione um empreendimento" });
  }

  // ── INTEGRAÇÃO ────────────────────────────────────────────────────────
  // Só a PRESENÇA da variável é verificada aqui. Validade é o
  // integrations:health que prova, com chamada real — este endpoint não pode
  // sair chamando a Graph API a cada passo do wizard.
  const env = process.env;
  const preenchida = (v?: string) => typeof v === "string" && v.trim().length > 0;
  const integracao: Item[] = [
    { chave: "meta_token", rotulo: "Token da Meta", ok: preenchida(env.META_ADS_ACCESS_TOKEN), detalhe: preenchida(env.META_ADS_ACCESS_TOKEN) ? "configurado (validade conferida por integrations:health)" : "ausente" },
    { chave: "meta_conta", rotulo: "Conta de anúncios", ok: preenchida(env.META_AD_ACCOUNT_ID), detalhe: preenchida(env.META_AD_ACCOUNT_ID) ? "configurada" : "META_AD_ACCOUNT_ID ausente" },
    { chave: "meta_pagina", rotulo: "Página do Facebook", ok: preenchida(env.META_PAGE_ID), detalhe: preenchida(env.META_PAGE_ID) ? "configurada" : "META_PAGE_ID ausente" },
    { chave: "meta_form", rotulo: "Formulário de leads", ok: preenchida(env.META_LEAD_FORM_ID), detalhe: preenchida(env.META_LEAD_FORM_ID) ? "configurado" : "META_LEAD_FORM_ID ausente" },
    { chave: "webhook", rotulo: "Verificação do webhook", ok: preenchida(env.META_WEBHOOK_VERIFY_TOKEN), detalhe: preenchida(env.META_WEBHOOK_VERIFY_TOKEN) ? "configurada" : "META_WEBHOOK_VERIFY_TOKEN ausente" },
    { chave: "capi", rotulo: "Conversions API",
      // O dataset é por organização (meta_conversion_configs), não do ambiente.
      // Daqui só dá para ver a metade global; declarar "pronto" sem a outra
      // metade seria prometer envio que não acontece.
      ok: preenchida(env.META_CONVERSIONS_ACCESS_TOKEN) && env.ATLAS_META_CAPI_ENABLED === "true",
      detalhe: preenchida(env.META_CONVERSIONS_ACCESS_TOKEN) && env.ATLAS_META_CAPI_ENABLED === "true"
        ? "token e chave prontos — falta o Dataset em Integrações › Meta"
        : "sem isto a Meta otimiza para quem preenche formulário, não para quem compra" },
  ];

  // ── CRM ───────────────────────────────────────────────────────────────
  const [corretores, jaChegaram] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("active", true).eq("commercial_role", "broker"),
    admin.from("lead_attribution_touches").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_external_id", "is", null),
  ]);
  const crm: Item[] = [
    { chave: "corretores", rotulo: "Corretor para receber as leads", ok: (corretores.count ?? 0) > 0, detalhe: `${corretores.count ?? 0} corretor(es) ativo(s)` },
    { chave: "atribuicao", rotulo: "Atribuição já comprovada", ok: (jaChegaram.count ?? 0) > 0, detalhe: (jaChegaram.count ?? 0) > 0 ? `${jaChegaram.count} lead(s) já chegaram com campanha, conjunto e anúncio` : "nenhuma lead com atribuição ainda" },
  ];

  // Bloqueadores: sem isto, publicar produz campanha que não entrega ou mente.
  const CHAVES_BLOQUEANTES = new Set(["empreendimento", "peca_visual", "meta_token", "meta_conta", "meta_pagina", "corretores"]);
  const todos = [...produto, ...integracao, ...crm];
  const bloqueadores = todos.filter((i) => !i.ok && CHAVES_BLOQUEANTES.has(i.chave));
  const avisos = todos.filter((i) => !i.ok && !CHAVES_BLOQUEANTES.has(i.chave));

  // Presença de variável NÃO é validade de credencial. Um token expirado ou de
  // outro Business Manager passa neste endpoint e falha na publicação — foi
  // exatamente o que aconteceu em 2026-07-26 (erro 190/465 com todas as
  // variáveis preenchidas). Por isso nenhum caminho aqui declara "pronta" sem
  // ressalva: a validade só é provada por `npm run integrations:health`.
  const credenciaisMetaPresentes = integracao
    .filter((i) => i.chave.startsWith("meta_") && i.chave !== "capi")
    .every((i) => i.ok);

  const situacao = bloqueadores.length > 0
    ? (bloqueadores.every((b) => b.chave.startsWith("meta_")) ? "aguardando_integracao" : "incompleta")
    : credenciaisMetaPresentes
      ? "pronta_pendente_validacao"
      : "aguardando_integracao";

  return apiSuccess({
    empreendimento: empreendimento ? { id: empreendimento.id, nome: empreendimento.name, incorporadora: empreendimento.developer_name } : null,
    situacao,
    // Rótulo em português para a interface não ter que traduzir estado.
    situacaoRotulo: {
      pronta_pendente_validacao: "Produto pronto — falta comprovar que as credenciais da Meta funcionam",
      aguardando_integracao: "Aguardando integração da Meta",
      incompleta: "Incompleta",
    }[situacao],
    // A interface deve mostrar isto junto do status, sempre.
    ressalva: situacao === "pronta_pendente_validacao"
      ? "As variáveis da Meta estão preenchidas, mas preenchido não é válido. Rode `npm run integrations:health` antes de publicar: um token expirado ou de outro Business Manager passa nesta checagem e falha na publicação."
      : null,
    grupos: { produto, integracao, crm },
    bloqueadores,
    avisos,
    resumo: { total: todos.length, ok: todos.filter((i) => i.ok).length, bloqueadores: bloqueadores.length, avisos: avisos.length },
  }, access.meta, { headers: rate.headers });
}
