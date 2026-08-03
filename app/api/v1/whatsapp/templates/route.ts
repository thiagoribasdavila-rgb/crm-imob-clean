import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  descreverDestrave,
  validarTemplate,
  type Medida,
  type StatusNoBanco,
} from "@/lib/whatsapp/catalogo-de-templates";
import { lerTemplatesDaMeta } from "@/lib/whatsapp/templates-da-meta";

/**
 * A PORTA DE ENTRADA DO TEMPLATE DE WHATSAPP.
 *
 * ── O que não existia ───────────────────────────────────────────────────────
 *
 * Seis leitores no repositório exigem uma linha de `message_templates` com
 * `status='approved'`, e nenhum caminho do produto escrevia nessa tabela —
 * varredura de 02/08/2026: 26 referências, 0 escritores. Esta rota é o
 * primeiro escritor.
 *
 * ── A regra que ela não pode quebrar ───────────────────────────────────────
 *
 * `approved` só entra por leitura da Meta. O `POST` com `acao: "registrar"`
 * passa por `validarTemplate`, que aceita apenas `draft` e `pending`; o
 * `POST` com `acao: "importar"` grava o status que `traduzirStatusDaMeta`
 * devolveu a partir da palavra literal da Graph. Não há terceiro caminho.
 *
 * ── Por que `service_role` com filtro explícito ────────────────────────────
 *
 * A afirmação da tela é "não existe NENHUM template nesta organização" — uma
 * afirmação de inexistência não pode sair de leitura que a RLS possa recortar
 * em silêncio: lista vazia por falta de permissão e lista vazia por falta de
 * linha respondem 200 iguais. A cerca não virou decoração: `organization_id`
 * vem do contexto de acesso já verificado, jamais do corpo do pedido.
 *
 * ── `0` e `null` não são a mesma coisa ─────────────────────────────────────
 *
 * Toda contagem passa por `medir()`, que devolve `valor: null` quando a
 * leitura falha. Um `count ?? 0` aqui faria a tela dizer "0 leads esperando"
 * no dia em que o banco não respondesse — e ninguém abre chamado contra uma
 * tela que mostra zero.
 */

export const dynamic = "force-dynamic";

/** Quem responde por ligar o canal oficial é quem cadastra o template. */
const PAPEIS_QUE_OPERAM = ["admin", "director", "superintendent", "manager"] as const;

type Contagem = { count: number | null; error: unknown } | null;

/** Uma leitura que falha não pode derrubar as outras — nem virar zero. */
const protegido = async <T,>(promessa: PromiseLike<T>): Promise<T | null> => {
  try {
    return await promessa;
  } catch {
    return null;
  }
};

function medir(resposta: Contagem, comoFoiMedido: string, oQue: string): Medida {
  if (!resposta || resposta.error || typeof resposta.count !== "number") {
    return { valor: null, comoFoiMedido, motivoSemMedida: `não foi possível contar ${oQue} — a leitura falhou, e isto não é zero` };
  }
  return { valor: resposta.count, comoFoiMedido };
}

type LinhaLocal = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: unknown;
  status: string;
  external_template_id: string | null;
  updated_at: string;
};

const CAMPOS = "id,name,language,category,body,variables,status,external_template_id,updated_at";

async function montarPainel(organizacao: string, incluirMeta: boolean) {
  const admin = getSupabaseAdmin();
  const naOrganizacao = (tabela: string) =>
    admin.from(tabela).select("id", { count: "exact", head: true }).eq("organization_id", organizacao);

  const [locais, semPrimeiroContato, perdidas, jornadas, entregas, daMeta] = await Promise.all([
    protegido(
      admin
        .from("message_templates")
        .select(CAMPOS)
        .eq("organization_id", organizacao)
        .eq("channel", "whatsapp")
        .order("status")
        .order("name")
        .limit(200),
    ),
    protegido(naOrganizacao("leads").is("first_contacted_at", null)),
    protegido(naOrganizacao("leads").eq("status", "perdido")),
    protegido(naOrganizacao("ai_sales_journeys")),
    protegido(naOrganizacao("nightly_broker_handoffs")),
    incluirMeta ? lerTemplatesDaMeta() : Promise.resolve(null),
  ]);

  const leituraLocalFalhou = !locais || Boolean((locais as { error?: unknown }).error);
  const registrados = (leituraLocalFalhou ? [] : (((locais as { data?: LinhaLocal[] }).data ?? []) as LinhaLocal[])).map((linha) => ({
    ...linha,
    variables: Array.isArray(linha.variables) ? linha.variables : [],
  }));

  const destrave = descreverDestrave(
    {
      semPrimeiroContato: medir(semPrimeiroContato as Contagem, "leads com first_contacted_at nulo nesta organização", "as leads sem primeiro contato"),
      perdidas: medir(perdidas as Contagem, "leads com status='perdido' nesta organização", "as leads perdidas"),
      jornadas: medir(jornadas as Contagem, "ai_sales_journeys nesta organização", "as jornadas de venda"),
      entregasMatinais: medir(entregas as Contagem, "nightly_broker_handoffs nesta organização", "as entregas matinais"),
    },
    registrados.some((t) => t.status === "approved"),
  );

  return {
    geradoEm: new Date().toISOString(),
    organizacao,
    /**
     * `null` quando a leitura local falhou. A tela precisa poder dizer "não
     * consegui olhar" em vez de desenhar uma lista vazia — que seria
     * indistinguível de "não há template cadastrado".
     */
    registrados: leituraLocalFalhou ? null : registrados,
    motivoSemLista: leituraLocalFalhou ? "não foi possível ler message_templates — isto não quer dizer que a tabela está vazia" : undefined,
    aprovados: leituraLocalFalhou ? null : registrados.filter((t) => t.status === "approved").length,
    destrave,
    meta: daMeta,
  };
}

export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 20, windowMs: 60_000, scope: "whatsapp.templates.ler" });
  if (!limite.ok) return limite.response;

  const acesso = await requireAccessContext(request, { roles: [...PAPEIS_QUE_OPERAM] });
  if (!acesso.ok) return acesso.response;

  const consultarMeta = new URL(request.url).searchParams.get("meta") !== "0";
  const painel = await montarPainel(acesso.access.profile.organizationId, consultarMeta);
  return apiSuccess(painel, acesso.meta, { headers: limite.headers });
}

/**
 * Confere o que voltou da escrita.
 *
 * No PostgREST, `update` que não casa com nenhuma linha responde 200 sem erro —
 * "não deu erro" nunca foi "gravou". Por isso toda escrita daqui pede a linha
 * de volta e compara os campos que definem a identidade do template. Se a linha
 * não voltar, ou voltar com nome/idioma/status diferentes do pedido, a rota
 * responde falha em vez de "pronto".
 */
function conferir(
  gravado: { name?: string; language?: string; status?: string } | null,
  esperado: { name: string; language: string; status: string },
): string | null {
  if (!gravado) return "o banco não devolveu a linha gravada";
  if (gravado.name !== esperado.name) return `o banco gravou o nome '${gravado.name}' e o pedido era '${esperado.name}'`;
  if (gravado.language !== esperado.language) return `o banco gravou o idioma '${gravado.language}' e o pedido era '${esperado.language}'`;
  if (gravado.status !== esperado.status) return `o banco gravou a situação '${gravado.status}' e o pedido era '${esperado.status}'`;
  return null;
}

/**
 * A forma mínima que o banco aceita — a mesma para o cadastro manual e para a
 * importação, de propósito. Dois caminhos de escrita com formas diferentes é
 * como duas verdades sobre o mesmo template nascem.
 */
type LinhaGravavel = {
  name: string;
  language: string;
  category: string;
  body: string;
  variables: string[];
  status: StatusNoBanco;
  external_template_id?: string | null;
};

async function gravar(organizacao: string, template: LinhaGravavel) {
  const admin = getSupabaseAdmin();
  const linha = {
    organization_id: organizacao,
    channel: "whatsapp" as const,
    name: template.name,
    language: template.language,
    category: template.category,
    body: template.body,
    // Array SEMPRE. `/api/v1/integrations/whatsapp` decide elegibilidade com
    // `Array.isArray(variables) && variables.length > 0`; um objeto aqui faria
    // template COM parâmetros passar como se não tivesse nenhum.
    variables: template.variables,
    status: template.status,
    external_template_id: template.external_template_id ?? null,
    updated_at: new Date().toISOString(),
  };
  // UNIQUE (organization_id, channel, name, language) — o mesmo template
  // cadastrado duas vezes é atualização, não linha nova.
  const { data, error } = await admin
    .from("message_templates")
    .upsert(linha, { onConflict: "organization_id,channel,name,language" })
    .select(CAMPOS)
    .maybeSingle();
  return { data: data as LinhaLocal | null, error };
}

export async function POST(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 12, windowMs: 60_000, scope: "whatsapp.templates.escrever" });
  if (!limite.ok) return limite.response;

  const acesso = await requireAccessContext(request, { roles: [...PAPEIS_QUE_OPERAM] });
  if (!acesso.ok) return acesso.response;

  const organizacao = acesso.access.profile.organizationId;
  const corpo = (await request.json().catch(() => null)) as { acao?: string; template?: Record<string, unknown>; nomes?: unknown } | null;
  const acao = String(corpo?.acao ?? "").trim();

  /* ── Cadastro manual: o caminho que não existia ─────────────────────────── */
  if (acao === "registrar") {
    const veredito = validarTemplate({
      nome: String(corpo?.template?.nome ?? ""),
      idioma: String(corpo?.template?.idioma ?? ""),
      categoria: String(corpo?.template?.categoria ?? ""),
      corpo: String(corpo?.template?.corpo ?? ""),
      situacao: String(corpo?.template?.situacao ?? ""),
    });
    if (!veredito.ok) {
      return apiError("TEMPLATE_RECUSADO", veredito.recusas.map((r) => r.motivo).join(" "), acesso.meta, {
        status: 400,
        details: veredito.recusas,
      });
    }
    const { data, error } = await gravar(organizacao, veredito.template);
    if (error) {
      return apiError("TEMPLATE_NAO_GRAVOU", `O banco recusou a gravação: ${String((error as { message?: string }).message ?? "sem detalhe")}.`, acesso.meta, { status: 502 });
    }
    const divergencia = conferir(data, { name: veredito.template.name, language: veredito.template.language, status: veredito.template.status });
    if (divergencia) {
      return apiError("TEMPLATE_NAO_CONFERE", `A gravação respondeu sem erro, mas ${divergencia}. Nada foi dado como cadastrado.`, acesso.meta, { status: 502 });
    }
    const painel = await montarPainel(organizacao, false);
    return apiSuccess({ gravado: data, painel }, acesso.meta, { status: 201, headers: limite.headers });
  }

  /* ── Importar da Meta: o dono não redigita o que ela já tem ─────────────── */
  if (acao === "importar") {
    const daMeta = await lerTemplatesDaMeta();
    if (daMeta.alcance !== "lido") {
      return apiError("META_FORA_DE_ALCANCE", daMeta.recado, acesso.meta, { status: 502, details: daMeta });
    }
    const pedidos = Array.isArray(corpo?.nomes) ? (corpo.nomes as unknown[]).map((n) => String(n)) : null;
    const escolhidos = pedidos && pedidos.length ? daMeta.templates.filter((t) => pedidos.includes(t.name)) : daMeta.templates;
    if (!escolhidos.length) {
      return apiError(
        "META_SEM_TEMPLATE",
        `A conta ${daMeta.contaDaMeta.id} da Meta não tem nenhum template que possa ser importado. Isto não é falha do CRM: o template nasce no Business Manager.`,
        acesso.meta,
        { status: 409, details: { descartados: daMeta.descartados, trilha: daMeta.trilha } },
      );
    }

    const importados: Array<{ nome: string; situacao: string; statusDaMeta: string }> = [];
    const falhas: Array<{ nome: string; motivo: string }> = [];
    for (const template of escolhidos) {
      const { data, error } = await gravar(organizacao, template);
      if (error) {
        falhas.push({ nome: template.name, motivo: String((error as { message?: string }).message ?? "o banco recusou") });
        continue;
      }
      const divergencia = conferir(data, { name: template.name, language: template.language, status: template.status });
      if (divergencia) {
        falhas.push({ nome: template.name, motivo: divergencia });
        continue;
      }
      importados.push({ nome: template.name, situacao: template.status, statusDaMeta: template.statusLiteralDaMeta });
    }
    if (!importados.length) {
      return apiError("IMPORTACAO_NAO_GRAVOU", "Nenhum template foi gravado. As tentativas responderam sem sucesso confirmado.", acesso.meta, { status: 502, details: falhas });
    }
    const painel = await montarPainel(organizacao, false);
    return apiSuccess({ importados, falhas, contaDaMeta: daMeta.contaDaMeta, painel }, acesso.meta, { status: 200, headers: limite.headers });
  }

  /* ── Sincronizar: reperguntar à Meta o veredito dos que já estão aqui ───── */
  if (acao === "sincronizar") {
    const daMeta = await lerTemplatesDaMeta();
    if (daMeta.alcance !== "lido") {
      return apiError("META_FORA_DE_ALCANCE", daMeta.recado, acesso.meta, { status: 502, details: daMeta });
    }
    const admin = getSupabaseAdmin();
    const { data: locais, error: erroLocal } = await admin
      .from("message_templates")
      .select(CAMPOS)
      .eq("organization_id", organizacao)
      .eq("channel", "whatsapp")
      .limit(200);
    if (erroLocal) {
      return apiError("LEITURA_LOCAL_FALHOU", "Não foi possível ler os templates já cadastrados — a sincronização não roda às cegas.", acesso.meta, { status: 502 });
    }

    const mudancas: Array<{ nome: string; de: string; para: string; statusDaMeta: string }> = [];
    const falhas: Array<{ nome: string; motivo: string }> = [];
    for (const local of (locais ?? []) as LinhaLocal[]) {
      const naMeta = daMeta.templates.find((t) => t.name === local.name && t.language === local.language);
      // Ausente na Meta NÃO vira `rejected` nem `archived` por conta própria:
      // a Meta pagina, e uma lista incompleta transformaria "não vi" em
      // "não existe". Quem some da Meta é reportado, não reescrito.
      if (!naMeta) continue;
      if (naMeta.status === local.status && (naMeta.external_template_id ?? null) === (local.external_template_id ?? null)) continue;
      const { data, error } = await gravar(organizacao, naMeta);
      if (error) {
        falhas.push({ nome: local.name, motivo: String((error as { message?: string }).message ?? "o banco recusou") });
        continue;
      }
      const divergencia = conferir(data, { name: naMeta.name, language: naMeta.language, status: naMeta.status });
      if (divergencia) {
        falhas.push({ nome: local.name, motivo: divergencia });
        continue;
      }
      mudancas.push({ nome: local.name, de: local.status, para: naMeta.status, statusDaMeta: naMeta.statusLiteralDaMeta });
    }

    const ausentesNaMeta = ((locais ?? []) as LinhaLocal[])
      .filter((l) => !daMeta.templates.some((t) => t.name === l.name && t.language === l.language))
      .map((l) => ({ nome: l.name, idioma: l.language, situacaoAqui: l.status }));

    const painel = await montarPainel(organizacao, false);
    return apiSuccess({ mudancas, falhas, ausentesNaMeta, contaDaMeta: daMeta.contaDaMeta, painel }, acesso.meta, { headers: limite.headers });
  }

  return apiError("ACAO_DESCONHECIDA", "Ações aceitas: registrar, importar, sincronizar.", acesso.meta, { status: 400 });
}
