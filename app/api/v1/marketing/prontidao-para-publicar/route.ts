/**
 * A MEDIÇÃO da prontidão de PUBLICAÇÃO. Só leitura, dos dois lados.
 *
 * ── Fronteira, dita uma vez e valendo para o arquivo inteiro ────────────────
 *
 * Nada aqui cria, edita, ativa, pausa ou gasta. Toda conversa com a Meta é GET;
 * toda conversa com o banco é SELECT. O botão que gasta continua sendo do dono,
 * em /approvals, depois de aprovar — esta rota só diz o que falta para ele
 * apertá-lo sem descobrir o problema DEPOIS.
 *
 * ── Onde a decisão mora, e por que não é aqui ───────────────────────────────
 *
 * Esta rota mede; `lib/meta/marketing/prontidao-para-publicar.ts` decide. A
 * separação não é gosto: o módulo é puro e o contrato o EXECUTA, então a
 * precedência ("não medido não é zero", "0 divergências exige amostra") é
 * provada rodando, não procurando strings. Enquanto a conversão de resposta em
 * medida morava dentro de rotas, um `Number(null) === 0` passou despercebido
 * num painel escrito para impedir exatamente isso.
 *
 * ── Toda leitura que falha vira `null`, nunca `0` ───────────────────────────
 *
 * Cada bloco abaixo tem um caminho de erro explícito, e nenhum deles devolve
 * contagem. É a regra que faz este painel valer alguma coisa: no dia em que o
 * token expirar, a tela precisa dizer "não consegui olhar" — e não desenhar
 * quinze zeros calmos com cara de tudo certo.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { metaGraphVersion } from "@/lib/meta/graph";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { contasAlcancaveis, type ContaDeAnuncio } from "@/app/api/v1/marketing/ad-accounts/route";
import {
  CATALOGO_DE_PUBLICACAO,
  EXPLICACAO_DO_CRITERIO,
  EXPLICACAO_DO_ESTADO,
  EXPLICACAO_DO_GERAL,
  TITULO_DO_GRUPO,
  medirDivergencias,
  medirLista,
  medirVariaveis,
  resumirProntidaoParaPublicar,
  type Medida,
} from "@/lib/meta/marketing/prontidao-para-publicar";

export const dynamic = "force-dynamic";

/** Janela de evidência de conversão, em dias. Igual à do módulo irmão de propósito. */
const JANELA_DIAS = 7;

/**
 * TTL generoso: prontidão de publicação muda quando alguém mexe no Gerenciador
 * de Anúncios ou cadastra uma fonte — evento manual e raro. Sem cache, cada
 * abertura da tela custaria uma dezena de idas à Graph.
 *
 * `isCacheable` só aceita leitura que deu certo. Falha nunca envelhece como se
 * fosse medida: a próxima tentativa vai à rede.
 */
const TTL_MS = 5 * 60_000;

type LeituraDaMeta = {
  /** `null` = a listagem falhou. Vazio = respondeu e não há conta. */
  contas: ContaDeAnuncio[] | null;
  /** Ids de campanha por conta alcançável. `null` = não deu para varrer. */
  campanhasPorConta: Record<string, string[]> | null;
  /** Páginas usadas pelos anúncios ATIVOS da conta configurada. */
  paginasEmUso: string[] | null;
  /** Quantos anúncios ativos foram de fato inspecionados — a amostra da comparação. */
  anunciosInspecionados: number | null;
  /** Peças na biblioteca da conta (imagens + vídeos). */
  midiaNaBiblioteca: string[] | null;
};

async function graph(caminho: string, campos: string, extra: Record<string, string | number>, token: string) {
  const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/${caminho}`);
  url.searchParams.set("fields", campos);
  for (const [chave, valor] of Object.entries(extra)) url.searchParams.set(chave, String(valor));
  url.searchParams.set("access_token", token);
  try {
    const resposta = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resposta.ok) return null;
    return Array.isArray(corpo.data) ? (corpo.data as Array<Record<string, unknown>>) : [];
  } catch {
    // Timeout e rede fora caem aqui, e caem como `null` — que o módulo puro
    // traduz em "não medido". Devolver `[]` seria afirmar ausência sem ter olhado.
    return null;
  }
}

async function lerMeta(contaConfigurada: string | null): Promise<LeituraDaMeta> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) {
    return { contas: null, campanhasPorConta: null, paginasEmUso: null, anunciosInspecionados: null, midiaNaBiblioteca: null };
  }

  const contas = await contasAlcancaveis();

  // As campanhas de TODAS as contas alcançáveis, porque a pergunta que importa
  // não é "a campanha está na conta configurada?" e sim "ela está em ALGUMA
  // conta que este token alcança?". Já aconteceu de o gasto estar numa conta e
  // a lead vir de outra — perguntar só pela configurada esconderia metade disso.
  let campanhasPorConta: Record<string, string[]> | null = null;
  if (contas) {
    campanhasPorConta = {};
    for (const conta of contas) {
      const linhas = await graph(`${conta.id}/campaigns`, "id", { limit: 200 }, token);
      // Uma conta que não respondeu invalida a varredura inteira: com uma lista
      // parcial eu concluiria "a campanha não está em lugar nenhum" quando ela
      // pode estar justamente na conta que falhou.
      if (linhas === null) { campanhasPorConta = null; break; }
      campanhasPorConta[conta.id] = linhas.map((c) => String(c.id));
    }
  }

  let paginasEmUso: string[] | null = null;
  let anunciosInspecionados: number | null = null;
  let midiaNaBiblioteca: string[] | null = null;

  if (contaConfigurada) {
    const anuncios = await graph(
      `${contaConfigurada}/ads`,
      "id,effective_status,creative{object_story_spec,asset_feed_spec,object_type,effective_object_story_id}",
      { limit: 100, effective_status: '["ACTIVE"]' },
      token,
    );
    if (anuncios !== null) {
      anunciosInspecionados = anuncios.length;
      // O creative INTEIRO, varrido em qualquer profundidade. Dependendo de como
      // o anúncio foi montado (Advantage+, catálogo, criativo dinâmico) o
      // `page_id` não está em `object_story_spec.link_data` — a primeira versão
      // deste tipo de varredura procurava num caminho só e concluiu "0 páginas"
      // com 19 anúncios ativos usando uma. Mesma técnica de `prontidao-derivada`.
      const encontradas = new Set<string>();
      for (const anuncio of anuncios) {
        const texto = JSON.stringify(anuncio.creative ?? {});
        for (const achado of texto.matchAll(/"page_id":"?(\d+)"?/g)) encontradas.add(achado[1]);
      }
      paginasEmUso = [...encontradas];
    }

    const [imagens, videos] = await Promise.all([
      graph(`${contaConfigurada}/adimages`, "hash,status", { limit: 100 }, token),
      graph(`${contaConfigurada}/advideos`, "id,status", { limit: 100 }, token),
    ]);
    // Se QUALQUER metade falhar, a soma é desconhecida. Somar só a metade que
    // respondeu produziria "3 peças" onde há 28 — um número menor que a verdade
    // e com toda a aparência de contagem.
    midiaNaBiblioteca =
      imagens === null || videos === null
        ? null
        : [...imagens.map((i) => String(i.hash ?? i.id)), ...videos.map((v) => String(v.id))];
  }

  return { contas, campanhasPorConta, paginasEmUso, anunciosInspecionados, midiaNaBiblioteca };
}

export async function GET(request: NextRequest) {
  const limitado = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "marketing.prontidao-publicar" });
  if (!limitado.ok) return limitado.response;
  const acesso = await requireAccessContext(request);
  if (!acesso.ok) return acesso.response;

  // Saber por que a verba não sobe é conversa de quem responde pela verba.
  const papel = acesso.access.profile.commercialRole
    || (acesso.access.profile.role === "admin" ? "director" : acesso.access.profile.role);
  if (!["director", "superintendent", "manager"].includes(String(papel))) {
    return apiError("FORBIDDEN", "A prontidão de publicação pertence à liderança.", acesso.meta, { status: 403 });
  }

  const organizationId = acesso.access.organization.id;
  const admin = getSupabaseAdmin();
  const env = process.env as Record<string, string | undefined>;
  const contaConfigurada = String(env.META_AD_ACCOUNT_ID ?? "").trim() || null;
  const paginaConfigurada = String(env.META_PAGE_ID ?? "").trim() || null;
  const formularioConfigurado = String(env.META_LEAD_FORM_ID ?? "").trim() || null;

  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();

  const meta = await cachedMetaRead<LeituraDaMeta>(
    `publicar:${contaConfigurada ?? "sem-conta"}`,
    () => lerMeta(contaConfigurada),
    { ttlMs: TTL_MS, isCacheable: (v) => v.contas !== null && v.campanhasPorConta !== null },
  );

  const [fontes, campanhasDaLead, pecasNoCrm, configs, eventos, propostas, aprovadas] = await Promise.all([
    admin.from("meta_lead_sources").select("page_id,form_id,active,development_id").eq("organization_id", organizationId),
    admin.from("lead_attribution_touches").select("campaign_external_id").eq("organization_id", organizationId).not("campaign_external_id", "is", null),
    admin.from("creative_assets").select("id").eq("organization_id", organizationId).not("asset_url", "is", null),
    admin.from("meta_conversion_configs").select("mode,enabled").eq("organization_id", organizationId).eq("enabled", true),
    admin.from("meta_conversion_events").select("status").eq("organization_id", organizationId).gte("created_at", desde),
    admin.from("approval_requests").select("payload").eq("organization_id", organizationId).eq("request_type", "meta_campaign").eq("status", "pending"),
    admin.from("approval_requests").select("id").eq("organization_id", organizationId).eq("request_type", "meta_campaign").eq("status", "approved"),
  ]);

  /* Erro do PostgREST vira `undefined`, e `undefined` vira "não medido" no
     adaptador. `data ?? []` seria a escrita natural aqui e transformaria
     "permissão negada" em "não há nenhum". */
  const ok = <T,>(r: { data: T[] | null; error: unknown }): T[] | undefined => (r.error ? undefined : r.data ?? undefined);

  const linhasDeFonte = ok(fontes);
  const paginasConhecidas = linhasDeFonte ? new Set(linhasDeFonte.map((f) => String(f.page_id))) : null;

  const toques = ok(campanhasDaLead);
  const campanhasQueTrouxeramLead = toques ? [...new Set(toques.map((t) => String(t.campaign_external_id)))] : null;

  const contasAlcancadas = meta.contas?.filter((c) => c.id === contaConfigurada) ?? null;

  // As campanhas que este token consegue enxergar, somadas. É a régua contra a
  // qual as campanhas que trouxeram lead são conferidas.
  const campanhasVisiveis = meta.campanhasPorConta
    ? new Set(Object.values(meta.campanhasPorConta).flat())
    : null;
  const campanhasForaDeCasa =
    campanhasQueTrouxeramLead && campanhasVisiveis
      ? campanhasQueTrouxeramLead.filter((id) => !campanhasVisiveis.has(id))
      : null;

  const paginasDesconhecidas =
    meta.paginasEmUso && paginasConhecidas
      ? meta.paginasEmUso.filter((p) => !paginasConhecidas.has(p))
      : null;

  const fontesDoFormulario = linhasDeFonte && formularioConfigurado
    ? linhasDeFonte.filter((f) => String(f.form_id) === formularioConfigurado && f.active === true && f.development_id)
    : undefined;

  const linhasDeConfig = ok(configs);
  const presasAoTeste = linhasDeConfig ? linhasDeConfig.filter((c) => String(c.mode) === "test").map(() => "test") : null;

  const linhasDeEvento = ok(eventos);
  const entregues = linhasDeEvento?.filter((e) => String(e.status) === "delivered");
  const mortos = linhasDeEvento ? linhasDeEvento.filter((e) => String(e.status) === "dead_letter").map((e) => String(e.status)) : null;

  const pendentes = ok(propostas);
  const contasAlcancaveisIds = meta.contas ? new Set(meta.contas.map((c) => c.id)) : null;
  const pendentesForaDeCasa =
    pendentes && contasAlcancaveisIds
      ? pendentes
          .map((p) => {
            const plano = (p.payload as Record<string, unknown> | null)?.plan as Record<string, unknown> | undefined;
            return String(plano?.accountId ?? "");
          })
          .filter((conta) => conta.length > 0 && !contasAlcancaveisIds.has(conta))
      : null;

  const medidas: Record<string, Medida> = {
    conta_configurada: medirVariaveis(["META_AD_ACCOUNT_ID"], env, "presença de META_AD_ACCOUNT_ID no servidor"),
    conta_alcancavel: medirLista(
      contasAlcancadas,
      `a conta ${contaConfigurada ?? "—"} na listagem viva de /me/adaccounts`,
      "as contas que este token alcança",
    ),
    conta_da_lead_confere: medirDivergencias(
      campanhasForaDeCasa,
      campanhasQueTrouxeramLead?.length ?? null,
      `campanhas de lead_attribution_touches contra as campanhas de ${meta.contas?.length ?? 0} conta(s) alcançável(is)`,
      "campanhas que já trouxeram lead",
    ),
    pagina_configurada: medirVariaveis(["META_PAGE_ID"], env, "presença de META_PAGE_ID no servidor"),
    pagina_dos_anuncios_reconhecida: medirDivergencias(
      paginasDesconhecidas,
      meta.paginasEmUso?.length ?? null,
      // A Página configurada entra na frase de propósito: o caso medido é
      // justamente `META_PAGE_ID` apontar para a Página que o CRM conhece
      // enquanto os anúncios ativos assinam OUTRA. Sem os dois números lado a
      // lado, o leitor conclui que a configuração está certa e para de procurar.
      `páginas dos ${meta.anunciosInspecionados ?? 0} anúncio(s) ATIVO(s) contra meta_lead_sources` +
        (paginaConfigurada ? ` (META_PAGE_ID = ${paginaConfigurada})` : ""),
      "páginas em uso por anúncio ativo",
    ),
    formulario_configurado: medirVariaveis(["META_LEAD_FORM_ID"], env, "presença de META_LEAD_FORM_ID no servidor"),
    formulario_ligado_ao_crm: medirLista(
      fontesDoFormulario,
      `fontes ativas com development_id para o formulário ${formularioConfigurado ?? "—"}`,
      "as fontes cadastradas deste formulário",
    ),
    midia_na_biblioteca_da_meta: medirLista(
      meta.midiaNaBiblioteca,
      `adimages + advideos de ${contaConfigurada ?? "—"}`,
      "as peças da biblioteca da conta",
    ),
    midia_referenciavel_pelo_crm: medirLista(
      ok(pecasNoCrm),
      "creative_assets com asset_url preenchido",
      "as peças registradas no CRM",
    ),
    dataset_configurado: medirLista(linhasDeConfig, "meta_conversion_configs com enabled = true", "as configurações de conversão"),
    dataset_recebendo: medirLista(entregues, `meta_conversion_events com status delivered nos últimos ${JANELA_DIAS} dias`, "os eventos entregues"),
    dataset_sem_evento_morto: medirDivergencias(
      mortos,
      linhasDeEvento?.length ?? null,
      `meta_conversion_events dos últimos ${JANELA_DIAS} dias`,
      "eventos de conversão na janela",
    ),
    dataset_fora_do_modo_de_teste: medirDivergencias(
      presasAoTeste,
      linhasDeConfig?.length ?? null,
      "mode das configurações habilitadas",
      "configurações de conversão habilitadas",
    ),
    verba_e_objetivo_aprovados: medirLista(ok(aprovadas), "approval_requests meta_campaign com status approved", "as propostas aprovadas"),
    proposta_aponta_para_conta_alcancavel: medirDivergencias(
      pendentesForaDeCasa,
      pendentes?.length ?? null,
      "payload.plan.accountId das propostas pendentes contra a listagem viva de contas",
      "propostas pendentes",
    ),
  };

  const veredito = resumirProntidaoParaPublicar(medidas);

  return apiSuccess(
    {
      ...veredito,
      janelaDias: JANELA_DIAS,
      // O dicionário viaja junto para a tela não manter uma segunda cópia das
      // explicações. Duas cópias divergem, e a que diverge é sempre a da tela.
      dicionario: {
        estados: EXPLICACAO_DO_ESTADO,
        geral: EXPLICACAO_DO_GERAL,
        criterios: EXPLICACAO_DO_CRITERIO,
        grupos: TITULO_DO_GRUPO,
      },
      grupos: [...new Set(CATALOGO_DE_PUBLICACAO.map((i) => i.grupo))],
    },
    acesso.meta,
    { headers: limitado.headers },
  );
}
