import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * QUEM RECEBE AS LEADS DE CADA FORMULÁRIO.
 *
 * ── Por que esta rota nasceu ────────────────────────────────────────────────
 *
 * `meta_lead_sources.default_owner_id` aceita UM dono, e ele é o degrau 1 da
 * cascata — passa na frente do elenco por empreendimento e do rodízio da fila
 * de atendimento. Medido no banco vivo em 03/08/2026: OITO fontes ativas
 * apontando para o mesmo perfil, que sozinho segura 485 das 613 leads da base.
 *
 * O motor já sabe rodiziar por fonte (`lib/distribution/rodizio-da-fonte.ts`,
 * ligado no mesmo dia) e a tabela `source_round_robin` existe. Faltava por onde
 * configurar — e recurso ligado sem tela é a mesma classe de defeito que esta
 * entrega inteira perseguiu, só que criada por quem consertou as outras quatro.
 *
 * ── O QUE ESTA ROTA DEVOLVE, E POR QUÊ ─────────────────────────────────────
 *
 * O dono único de cada fonte vem junto, de propósito. Sem ele a tela mostraria
 * o rodízio vazio e diria "ninguém configurado", quando a verdade é "TUDO vai
 * para uma pessoa só" — que é o oposto, e é a informação que faz alguém agir.
 */

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.rodizio-por-fonte" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;

  const [fontes, rodizio, perfis, eventos] = await Promise.all([
    admin.from("meta_lead_sources").select("id,name,active,default_owner_id").eq("organization_id", org).eq("active", true).limit(200),
    admin.from("source_round_robin").select("source_id,profile_id,posicao,active").eq("organization_id", org),
    admin.from("profiles").select("id,full_name,name,commercial_role,role,active").eq("organization_id", org).eq("active", true),
    // Volume por fonte: é o que separa o formulário que traz lead do que só
    // existe no catálogo. Sem isso a tela lista 17 fontes iguais e a pessoa
    // configura a errada.
    admin.from("meta_lead_events").select("source_id,lead_id").eq("organization_id", org).limit(5000),
  ]);

  if (fontes.error || rodizio.error || perfis.error) {
    // Lista vazia por falha de leitura viraria "nenhuma fonte configurada", e a
    // tela diria que está tudo certo sobre uma operação que ninguém conseguiu
    // olhar.
    return apiError("RODIZIO_LEITURA_FALHOU", "Não foi possível ler o rodízio por formulário. A lista NÃO está vazia — ela não pôde ser lida.", identity.meta, { status: 503 });
  }

  const ehCorretor = (p: Record<string, unknown>) => {
    const c = String(p.commercial_role || "").toLowerCase();
    if (c) return c === "broker";
    return String(p.role || "").toUpperCase() === "CORRETOR";
  };
  const nome = (p: Record<string, unknown>) => String(p.full_name || p.name || p.id).slice(0, 60);
  const porPerfil = new Map((perfis.data ?? []).map((p) => [String(p.id), p]));

  const volumePorFonte = new Map<string, number>();
  for (const evento of eventos.error ? [] : (eventos.data ?? [])) {
    const fonte = String(evento.source_id || "");
    if (fonte) volumePorFonte.set(fonte, (volumePorFonte.get(fonte) ?? 0) + 1);
  }

  const membrosPorFonte = new Map<string, Array<{ profileId: string; nome: string; posicao: number }>>();
  for (const linha of rodizio.data ?? []) {
    if (linha.active === false) continue;
    const fonte = String(linha.source_id);
    const lista = membrosPorFonte.get(fonte) ?? [];
    lista.push({
      profileId: String(linha.profile_id),
      nome: nome(porPerfil.get(String(linha.profile_id)) ?? { id: linha.profile_id }),
      posicao: Number(linha.posicao ?? 0),
    });
    membrosPorFonte.set(fonte, lista);
  }

  const listadas = (fontes.data ?? []).map((fonte) => {
    const id = String(fonte.id);
    const dono = fonte.default_owner_id ? porPerfil.get(String(fonte.default_owner_id)) : null;
    const membros = (membrosPorFonte.get(id) ?? []).sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR"));
    return {
      id,
      nome: String(fonte.name || id).slice(0, 90),
      leads: volumePorFonte.get(id) ?? 0,
      // O dono único é a informação que faz alguém agir: rodízio vazio + dono
      // único preenchido significa "tudo vai para uma pessoa", não "nada
      // configurado".
      donoUnicoId: fonte.default_owner_id ? String(fonte.default_owner_id) : null,
      donoUnicoNome: dono ? nome(dono) : null,
      membros,
      /** O rodízio só passa a valer quando tem alguém — antes disso o dono único decide. */
      rodizioAtivo: membros.length > 0,
    };
  }).sort((a, b) => b.leads - a.leads || a.nome.localeCompare(b.nome, "pt-BR"));

  return apiSuccess({
    fontes: listadas,
    corretores: (perfis.data ?? []).filter(ehCorretor).map((p) => ({ id: String(p.id), nome: nome(p) })),
    /** Quantas fontes entregam tudo a uma pessoa só. É o número que resume o risco. */
    fontesComDonoUnico: listadas.filter((f) => !f.rodizioAtivo && f.donoUnicoId).length,
    significadoDeVazio: "Fonte sem rodízio segue o dono único do formulário. Sem dono único E sem rodízio, a lead cai na cascata normal (elenco, fila de atendimento, gerente).",
  }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "crm.rodizio-por-fonte.escrita" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;
  if (!leLiderancaInteira(identity.access.profile)) {
    return apiError("RODIZIO_SEM_PERMISSAO", "Definir quem recebe as leads de um formulário é decisão de liderança.", identity.meta, { status: 403 });
  }

  let corpo: unknown;
  try { corpo = await request.json(); } catch {
    return apiError("RODIZIO_CORPO_INVALIDO", "Corpo inválido: esperado JSON.", identity.meta, { status: 400 });
  }
  const { fonteId, profileId, ativo } = (corpo ?? {}) as Record<string, unknown>;

  if (typeof fonteId !== "string" || !/^[0-9a-f-]{36}$/i.test(fonteId)) {
    return apiError("RODIZIO_FONTE_INVALIDA", "`fonteId` deve ser o uuid do formulário.", identity.meta, { status: 400 });
  }
  if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId)) {
    return apiError("RODIZIO_PERFIL_INVALIDO", "`profileId` deve ser o uuid do perfil do corretor.", identity.meta, { status: 400 });
  }
  const querAtivo = ativo === undefined ? true : Boolean(ativo);

  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;

  // A fonte precisa ser DESTA organização — um uuid válido de outra empresa
  // entraria no rodízio e a distribuição passaria a considerá-lo.
  const { data: fonte, error: erroDaFonte } = await admin
    .from("meta_lead_sources").select("id,organization_id").eq("id", fonteId).maybeSingle();
  if (erroDaFonte) return apiError("RODIZIO_FONTE_ILEGIVEL", "Não foi possível validar o formulário informado.", identity.meta, { status: 503 });
  if (!fonte || String(fonte.organization_id) !== org) {
    return apiError("RODIZIO_FONTE_DE_FORA", "Formulário não encontrado nesta organização.", identity.meta, { status: 404 });
  }

  const { data: perfil, error: erroDoPerfil } = await admin
    .from("profiles").select("id,organization_id,active").eq("id", profileId).maybeSingle();
  if (erroDoPerfil) return apiError("RODIZIO_PERFIL_ILEGIVEL", "Não foi possível validar o perfil informado.", identity.meta, { status: 503 });
  if (!perfil || String(perfil.organization_id) !== org) {
    return apiError("RODIZIO_PERFIL_DE_FORA", "Perfil não encontrado nesta organização.", identity.meta, { status: 404 });
  }

  /**
   * ── A POSIÇÃO É ÚNICA POR FORMULÁRIO ─────────────────────────────────────
   *
   * `source_round_robin_posicao` é UNIQUE em (source_id, posicao) — descoberto
   * pela prova contra o banco vivo, não pela leitura do schema. A primeira
   * versão desta rota fixava `posicao = 1` ao TIRAR alguém, e isso colidia com
   * quem já ocupava o lugar 1: a saída devolvia 503 e o corretor continuava no
   * rodízio.
   *
   * Quem sai PRESERVA o lugar. Além de não colidir, é o comportamento certo:
   * quem volta encontra a mesma posição, e a ordem do rodízio não se
   * reembaralha a cada entrada e saída.
   *
   * Quem entra vai para o FIM — `posicao` desempata quem está empatado em leads
   * recebidas, então entrar por último não penaliza ninguém, e entrar na frente
   * furaria a fila de quem já estava.
   */
  const { data: existentes, error: erroDaOrdem } = await admin
    .from("source_round_robin").select("profile_id,posicao,active")
    .eq("organization_id", org).eq("source_id", fonteId);
  if (erroDaOrdem) {
    return apiError("RODIZIO_ORDEM_ILEGIVEL", "Não foi possível ler a ordem atual do rodízio.", identity.meta, { status: 503 });
  }
  const linhaAtual = (existentes ?? []).find((r) => String(r.profile_id) === profileId);
  const posicao = linhaAtual
    ? Number(linhaAtual.posicao ?? 1)
    : (existentes ?? []).reduce((max, r) => Math.max(max, Number(r.posicao ?? 0)), 0) + 1;

  const { data, error } = await admin
    .from("source_round_robin")
    .upsert({
      organization_id: org, source_id: fonteId, profile_id: profileId,
      posicao, active: querAtivo, updated_at: new Date().toISOString(),
    }, { onConflict: "source_id,profile_id" })
    .select("source_id,profile_id,posicao,active")
    .maybeSingle();
  if (error) {
    // A causa vai no corpo: "não foi possível gravar" mandou-me investigar por
    // vinte minutos o que a mensagem do Postgres dizia em uma linha.
    return apiError(
      "RODIZIO_ESCRITA_FALHOU",
      `Não foi possível gravar o rodízio agora (${String(error.message ?? "sem detalhe").slice(0, 160)}).`,
      identity.meta,
      { status: 503 },
    );
  }

  return apiSuccess({
    membro: data,
    // Um perfil inativo pode entrar de propósito (montar antes de ativar), mas
    // quem monta precisa saber que ele não recebe enquanto isso.
    aviso: perfil.active === false
      ? "Este perfil está INATIVO: fica no rodízio, mas não recebe enquanto não for ativado."
      : null,
  }, identity.meta);
}
